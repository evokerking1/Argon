// Daemon: src/routes/servers.ts

import express, { Router } from 'express';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Writable } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppState, ServerState } from '../index';
import { Exec, ExecCreateOptions } from 'dockerode';
import { Duplex } from 'stream';

// Types that represent what we expect from the panel
interface ServerConfig {
  dockerImage: string;
  variables: Array<{
    name: string;
    description?: string;
    defaultValue: string;
    currentValue?: string;
    rules: string;
  }>;
  startupCommand: string;
  configFiles: Array<{
    path: string;
    content: string;
  }>;
  install: {
    dockerImage: string;
    entrypoint: string;
    script: string;
  };
}

interface CreateServerRequest {
  name: string;
  memoryLimit: number;
  cpuLimit: number;
  allocation: {
    bindAddress: string;
    port: number;
  };
  temporaryInternalId: string;
}

// Helper functions for server management
async function fetchServerConfig(appUrl: string, serverId: string, temporaryId: string): Promise<ServerConfig> {
  const url = `${appUrl}/api/servers/${temporaryId}/config`;
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200) {
        return response.data;
      }
    } catch (error) {
      console.error(`Failed to fetch server configuration (attempt ${attempt}/${maxRetries}):`, error.message);
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch server configuration after ${maxRetries} attempts: ${lastError?.message}`);
}

async function writeConfigFiles(volumePath: string, configFiles: ServerConfig['configFiles']): Promise<void> {
  for (const file of configFiles) {
    // Sanitize path to prevent directory traversal
    const safePath = path.normalize(file.path).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(volumePath, safePath);
    
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Write file
    try {
      await fs.writeFile(fullPath, file.content, 'utf8');
      console.log(`Created config file: ${safePath}`);
    } catch (error) {
      console.error(`Failed to write config file ${safePath}:`, error);
      throw new Error(`Failed to write config file ${safePath}`);
    }
  }
}

// Process variables in startup commands and scripts
function processVariables(input: string, variables: ServerConfig['variables']): string {
  let result = input;
  
  for (const variable of variables) {
    const placeholder = `%${variable.name.toLowerCase().replace(/ /g, '_')}%`;
    const value = variable.currentValue ?? variable.defaultValue;
    
    if (!validateVariableValue(value, variable.rules)) {
      throw new Error(`Variable ${variable.name} value doesn't match rules: ${variable.rules}`);
    }
    
    result = result.replace(placeholder, value);
  }
  
  return result;
}

function validateVariableValue(value: string, rules: string): boolean {
  const ruleList = rules.split('|');
  
  for (const rule of ruleList) {
    switch (true) {
      case rule === 'nullable':
        if (value === '') return true;
        break;
      case rule === 'string':
        break;
      case rule.startsWith('max:'):
        const max = parseInt(rule.slice(4), 10);
        if (!isNaN(max) && value.length > max) return false;
        break;
    }
  }
  
  return true;
}

async function pullDockerImage(docker: any, image: string): Promise<void> {
  try {
    console.log(`Pulling Docker image: ${image}`);
    await new Promise((resolve, reject) => {
      docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err);
        
        docker.modem.followProgress(stream, (err: any, output: any) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });
  } catch (error) {
    console.error(`Failed to pull Docker image ${image}:`, error);
    throw new Error(`Failed to pull Docker image ${image}`);
  }
}

function sanitizeVolumeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// Add this helper at the top with other functions
function logEvent(serverId: string, message: string, error?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [Server ${serverId}] ${message}`;
  console.log(logMessage);
  if (error) {
    console.error(`${logMessage} Error:`, error);
  }
}

export async function runInstallation(
  appState: AppState, 
  serverId: string,
  serverConfig: ServerConfig
): Promise<void> {
  const { docker, config, wsServer } = appState;
  const safeServerId = sanitizeVolumeName(serverId);
  const volumePath = path.resolve(`${config.volumesDirectory}/${safeServerId}`);

  logEvent(serverId, 'Starting installation process');
  
  try {
    // Pull images with logging
    logEvent(serverId, 'Pulling required Docker images');
    await Promise.all([
      pullDockerImage(docker, serverConfig.install.dockerImage)
        .then(() => logEvent(serverId, `Successfully pulled install image: ${serverConfig.install.dockerImage}`)),
      pullDockerImage(docker, serverConfig.dockerImage)
        .then(() => logEvent(serverId, `Successfully pulled server image: ${serverConfig.dockerImage}`))
    ]);

    // Volume setup logging
    logEvent(serverId, `Creating volume directory at: ${volumePath}`);
    await fs.mkdir(volumePath, { recursive: true });

    // Config files logging
    if (serverConfig.configFiles.length > 0) {
      logEvent(serverId, `Writing ${serverConfig.configFiles.length} configuration files`);
      await writeConfigFiles(volumePath, serverConfig.configFiles);
    }

    const installContainerName = `${safeServerId}_install`;
    logEvent(serverId, `Creating installation container: ${installContainerName}`);

    const processedScript = processVariables(serverConfig.install.script, serverConfig.variables);
    logEvent(serverId, 'Writing installation script');
    
    const scriptContent = `#!/bin/bash
set -ex  # Enable debug mode and exit on error
echo "Starting installation script..."
cd /mnt/server
pwd
ls -la
${processedScript}
echo "Installation script completed"
`;
    
    await fs.writeFile(path.join(volumePath, 'install.sh'), scriptContent, { mode: 0o755 });
    logEvent(serverId, 'Script content written to disk with executable permissions');

    // Create container with the script execution as the command
    const container = await docker.createContainer({
      name: installContainerName,
      Image: serverConfig.install.dockerImage,
      HostConfig: {
        Binds: [`${volumePath}:/mnt/server`],
        AutoRemove: true
      },
      WorkingDir: '/mnt/server',
      Entrypoint: ["/bin/bash"],
      Cmd: ["./install.sh"],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      OpenStdin: false
    });

    logEvent(serverId, 'Starting installation container');

    // Attach to container to get output
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });

    let output = '';

    // Create output handling streams
    const stdout = new Writable({
      write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const message = chunk.toString().trim();
        if (message) {
          output += message + '\n';
          logEvent(serverId, `Installation output: ${message}`);
          
          wsServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                event: 'console_output',
                serverId,
                data: message
              }));
            }
          });
        }
        callback();
      }
    });

    const stderr = new Writable({
      write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const message = chunk.toString().trim();
        if (message) {
          output += message + '\n';
          logEvent(serverId, `Installation error: ${message}`);
        }
        callback();
      }
    });

    docker.modem.demuxStream(stream, stdout, stderr);

    // Start the container
    await container.start();

    // Wait for container to finish
    const result = await container.wait();

    // Check exit code
    if (result.StatusCode !== 0) {
      throw new Error(`Installation failed with exit code ${result.StatusCode}. Output: ${output}`);
    }

    logEvent(serverId, 'Installation completed successfully');

  } catch (error) {
    logEvent(serverId, 'Installation failed', error);
    throw error;
  } finally {
    try {
      const container = docker.getContainer(`${safeServerId}_install`);
      logEvent(serverId, 'Cleaning up installation container');
      await container.remove({ force: true }).catch(() => {
        // Ignore removal errors as the container might already be removed
      });
    } catch (cleanupError) {
      logEvent(serverId, 'Failed to remove installation container', cleanupError);
    }
  }
}

// Create the actual game server container
async function createGameContainer(
  appState: AppState,
  serverId: string,
  config: ServerConfig,
  memoryLimit: number,
  cpuLimit: number,
  allocation: { bindAddress: string; port: number }
): Promise<string> {
  const { docker } = appState;
  const safeServerId = sanitizeVolumeName(serverId);
  const volumePath = path.resolve(`${appState.config.volumesDirectory}/${safeServerId}`);
  
  const processedCommand = processVariables(config.startupCommand, config.variables);
  
  const container = await docker.createContainer({
    name: safeServerId,
    Image: config.dockerImage,
    Cmd: ['/bin/bash', '-c', processedCommand],
    WorkingDir: '/home/container',
    HostConfig: {
      Memory: memoryLimit,
      MemorySwap: memoryLimit,
      CpuShares: cpuLimit,
      Binds: [`${volumePath}:/home/container`],
      PortBindings: {
        [`${allocation.port}/tcp`]: [{ HostIp: allocation.bindAddress, HostPort: allocation.port.toString() }],
        [`${allocation.port}/udp`]: [{ HostIp: allocation.bindAddress, HostPort: allocation.port.toString() }]
      }
    },
    ExposedPorts: {
      [`${allocation.port}/tcp`]: {},
      [`${allocation.port}/udp`]: {}
    }
  });

  return container.id;
}

// Configure the router
export function configureServersRouter(appState: AppState): Router {
  const router = Router();

  // Create server
  router.post('/', async (req, res) => {
    try {
      const { name, memoryLimit, cpuLimit, allocation, temporaryInternalId } = req.body as CreateServerRequest;
      const serverId = uuidv4();
      
      // Get server configuration from panel
      const serverConfig = await fetchServerConfig(appState.config.appUrl, serverId, temporaryInternalId);
      
      // Create initial database entry
      await appState.db.run(
        `INSERT INTO servers (
          id, docker_id, name, state, memory_limit, cpu_limit, image,
          variables, startup_command, install_script, allocation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          serverId,
          null,
          name,
          ServerState.Installing,
          memoryLimit,
          cpuLimit,
          serverConfig.dockerImage,
          JSON.stringify(serverConfig.variables),
          serverConfig.startupCommand,
          JSON.stringify(serverConfig.install),
          JSON.stringify(allocation)
        ]
      );
      
      // Begin installation process
      runInstallation(appState, serverId, serverConfig)
        .then(async () => {
          // Create the game container after successful installation
          const dockerId = await createGameContainer(
            appState,
            serverId,
            serverConfig,
            memoryLimit,
            cpuLimit,
            allocation
          );

          // Add this missing update statement:
          await appState.db.run(
            'UPDATE servers SET docker_id = ?, state = ? WHERE id = ?',
            [dockerId, ServerState.Installed, serverId]
          );

          await appState.db.run(
            'UPDATE servers SET state = ? WHERE id = ?',
            [ServerState.Installed, serverId]
          );
        })
        .catch(async (error) => {
          console.error('Installation failed:', error);
          await appState.db.run(
            'UPDATE servers SET state = ? WHERE id = ?',
            [ServerState.InstallFailed, serverId]
          );
        });
      
      res.status(201).json({
        id: serverId,
        name,
        state: ServerState.Installing
      });
      
    } catch (error) {
      console.error('Failed to create server:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all servers
  router.get('/', async (req, res) => {
    try {
      const servers = await appState.db.all('SELECT * FROM servers');
      res.json(servers);
    } catch (error) {
      console.error('Failed to get servers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get specific server
  router.get('/:id', async (req, res) => {
    try {
      const server = await appState.db.get(
        'SELECT * FROM servers WHERE id = ?',
        [req.params.id]
      );
      
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      
      res.json(server);
    } catch (error) {
      console.error('Failed to get server:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete server
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const safeId = sanitizeVolumeName(id);
      const server = await appState.db.get(
        'SELECT docker_id FROM servers WHERE id = ?',
        [id]
      );

      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      if (server.docker_id) {
        try {
          const container = appState.docker.getContainer(server.docker_id);
          await container.remove({ force: true, v: true });
        } catch (error) {
          console.error('Failed to remove container:', error);
        }
      }

      const volumePath = `${appState.config.volumesDirectory}/${safeId}`;
      await fs.rm(volumePath, { recursive: true, force: true });

      await appState.db.run('DELETE FROM servers WHERE id = ?', [id]);

      res.json({ message: 'Server deleted successfully' });
    } catch (error) {
      console.error('Failed to delete server:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reinstall server
  router.post('/:id/reinstall', async (req, res) => {
    try {
      const { id } = req.params;
      const serverConfig = await fetchServerConfig(appState.config.appUrl,id, id);

      const server = await appState.db.get(
        'SELECT docker_id FROM servers WHERE id = ?',
        [id]
      );

      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      if (server.docker_id) {
        try {
          const container = appState.docker.getContainer(server.docker_id);
          await container.remove({ force: true });
        } catch (error) {
          console.error('Failed to remove container:', error);
        }
      }

      await appState.db.run(
        'UPDATE servers SET state = ?, docker_id = NULL WHERE id = ?',
        [ServerState.Installing, id]
      );

      await runInstallation(appState, id, serverConfig);

      await appState.db.run(
        'UPDATE servers SET state = ? WHERE id = ?',
        [ServerState.Installed, id]
      );

      res.json({ message: 'Server reinstallation completed' });
    } catch (error) {
      console.error('Failed to reinstall server:', error);
      await appState.db.run(
        'UPDATE servers SET state = ? WHERE id = ?',
        [ServerState.Errored, req.params.id]  // Fixed: use req.params.id instead of id
      ).catch(err => console.error('Failed to update error state:', err));
      
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}