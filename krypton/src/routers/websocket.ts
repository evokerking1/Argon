import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import axios from 'axios';
import { AppState } from '../index';
import Docker, { Container } from 'dockerode';
import { Duplex } from 'stream';
import chalk from 'chalk';

enum LogType {
  INFO = 'info',
  SUCCESS = 'success', 
  ERROR = 'error',
  WARNING = 'warning',
  DAEMON = 'daemon'
}

interface ConsoleSession {
  socket: WebSocket;
  exec?: Docker.Exec;
  stream?: Duplex;
  serverId: string;
  internalId: string;
  userId: string;
  container: Container;
  authenticated: boolean;
  logStream?: NodeJS.ReadableStream;
}

interface ValidateResponse {
  validated: boolean;
  server: {
    id: string;
    name: string;
    internalId: string;
    node: {
      id: string;
      name: string;
      fqdn: string;
      port: number;
    }
  }
}

interface ContainerStatsResponse {
  memory_stats: {
    usage: number;
    limit: number;
  };
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
    };
    system_cpu_usage: number;
    online_cpus: number;
  };
  precpu_stats: {
    cpu_usage: {
      total_usage: number;
    };
    system_cpu_usage: number;
  };
  networks?: {
    eth0?: {
      rx_bytes: number;
      tx_bytes: number;
    };
  };
}

export class WebSocketManager {
  private appState: AppState;
  private sessions = new Map<WebSocket, ConsoleSession>();
  private logBuffers = new Map<string, string[]>();
  private readonly MAX_LOGS = 100;
  private readonly INITIAL_LOGS = 10;

  constructor(appState: AppState) {
    this.appState = appState;
    this.configureWebSocketRouter();
  }

  private formatLogMessage(type: LogType, message: string): string {
    switch (type) {
      case LogType.INFO:
        return chalk.hex('90a2b9')(message);
      case LogType.SUCCESS:
        return chalk.green(message);
      case LogType.ERROR:
        return chalk.red(message);
      case LogType.WARNING:
        return chalk.yellow(message);
      case LogType.DAEMON:
        return chalk.yellow(`[Krypton Daemon]`) + ' ' + message;
      default:
        return message;
    }
  }

  private addLogToBuffer(internalId: string, log: string) {
    if (!this.logBuffers.has(internalId)) {
      this.logBuffers.set(internalId, []);
    }
    const buffer = this.logBuffers.get(internalId)!;
    buffer.push(log);
    if (buffer.length > this.MAX_LOGS) {
      buffer.shift();
    }
  }

  private broadcastToServer(internalId: string, log: string, type: LogType = LogType.INFO) {
    const formattedLog = this.formatLogMessage(type, log);
    this.addLogToBuffer(internalId, formattedLog);
    
    for (const [socket, session] of this.sessions.entries()) {
      if (session.internalId === internalId && session.authenticated) {
        try {
          socket.send(JSON.stringify({
            event: 'console_output',
            data: { message: formattedLog }
          }));
        } catch (error) {
          console.error('Failed to broadcast log:', error);
        }
      }
    }
  }

  private async validateToken(internalId: string, token: string): Promise<ValidateResponse | null> {
    try {
      const response = await axios.get(`${this.appState.config.appUrl}/api/servers/${internalId}/validate`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Token validation failed:', error);
      return null;
    }
  }

  private async findMainProcess(container: Container): Promise<number | null> {
    try {
      const exec = await container.exec({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['ps', '-o', 'pid,ppid,cmd', '--no-headers'],
      });

      const output = await new Promise<string>((resolve, reject) => {
        exec.start({ hijack: true }, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('No stream available'));
          let data = '';
          stream.on('data', chunk => data += chunk.toString());
          stream.on('end', () => resolve(data));
        });
      });

      const processes = output.trim().split('\n')
        .map(line => {
          const [pid, ppid, ...cmdParts] = line.trim().split(/\s+/);
          return { 
            pid: parseInt(pid), 
            ppid: parseInt(ppid), 
            cmd: cmdParts.join(' ') 
          };
        });

      return processes.find(p => 
        (p.ppid === 0 || p.ppid === 1) && 
        !p.cmd.startsWith('/bin/sh') && 
        !p.cmd.startsWith('sh -c')
      )?.pid || null;
    } catch (error) {
      console.error('Failed to find main process:', error);
      return null;
    }
  }

  private calculateCPUPercent(stats: ContainerStatsResponse): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus;
    
    return (systemDelta > 0 && cpuDelta > 0) 
      ? (cpuDelta / systemDelta) * cpuCount * 100
      : 0;
  }

  private async attachLogs(session: ConsoleSession) {
    try {
      // Cleanup any existing log stream
      if (session.logStream) {
        (session.logStream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
      }

      const containerRef = new Docker().getContainer(session.container.id);
      containerRef.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 0
      }, (err, logStream) => {
        if (err || !logStream) {
          this.broadcastToServer(session.internalId, `Log stream error: ${err?.message || 'No stream available'}`, LogType.ERROR);
          return;
        }

        session.logStream = logStream;

        logStream.on('data', (chunk: Buffer) => {
          try {
            const headerLength = 8;
            const logType = chunk.readUInt8(0);
            const contentLength = chunk.readUInt32BE(4);
            
            const content = chunk.slice(headerLength, headerLength + contentLength).toString('utf8').trim();
            
            if (content) {
              const type = logType === 1 ? LogType.INFO : LogType.ERROR;
              this.broadcastToServer(session.internalId, content, type);
            }
          } catch (parseError) {
            console.error('Failed to parse log chunk:', parseError);
          }
        });

        logStream.on('error', (error: Error) => {
          this.broadcastToServer(session.internalId, `Log stream error: ${error.message}`, LogType.ERROR);
        });
      });
    } catch (error) {
      this.broadcastToServer(session.internalId, `Failed to attach logs: ${error}`, LogType.ERROR);
    }
  }

  private async startResourceMonitoring(session: ConsoleSession) {
    const interval = setInterval(async () => {
      try {
        const containerInfo = await session.container.inspect();
        const state = containerInfo.State.Status;

        if (state === 'running') {
          const stats = await session.container.stats({ stream: false }) as ContainerStatsResponse;
          session.socket.send(JSON.stringify({
            event: 'stats',
            data: {
              state,
              cpu_percent: this.calculateCPUPercent(stats),
              memory: {
                used: stats.memory_stats.usage,
                limit: stats.memory_stats.limit,
                percent: (stats.memory_stats.usage / stats.memory_stats.limit) * 100
              },
              network: stats.networks?.eth0 ?? { rx_bytes: 0, tx_bytes: 0 }
            }
          }));
        } else {
          session.socket.send(JSON.stringify({
            event: 'stats',
            data: { state }
          }));
        }
      } catch (error) {
        console.error('Failed to get container stats:', error);
      }
    }, 2000);

    session.socket.on('close', () => clearInterval(interval));
  }

  private async setupContainerSession(socket: WebSocket, internalId: string, validation: ValidateResponse) {
    try {
      const server = await this.appState.db.get(
        'SELECT docker_id FROM servers WHERE id = ?',
        [internalId]
      );

      if (!server?.docker_id) {
        throw new Error('Server not found or no container assigned');
      }

      const container = this.appState.docker.getContainer(server.docker_id);
      const session: ConsoleSession = {
        socket,
        serverId: validation.server.id,
        internalId: validation.server.internalId,
        userId: validation.server.id,
        container,
        authenticated: true
      };
      this.sessions.set(socket, session);

      const containerInfo = await container.inspect();
      
      socket.send(JSON.stringify({
        event: 'auth_success',
        data: {
          logs: [],
          state: containerInfo.State.Status
        }
      }));

      // Attach logs and start monitoring
      await this.attachLogs(session);
      await this.startResourceMonitoring(session);

      return session;
    } catch (error) {
      console.error('Failed to set up session:', error);
      socket.close(1011, 'Failed to initialize session');
      return null;
    }
  }

  private configureWebSocketRouter() {
    this.appState.wsServer.on('connection', async (socket: WebSocket, request: any) => {
      const { query } = parseUrl(request.url!, true);
      const internalId = query.server as string;
      const token = query.token as string;

      if (!internalId || !token) {
        socket.close(1008, 'Missing server ID or token');
        return;
      }

      const validation = await this.validateToken(internalId, token);
      if (!validation?.validated) {
        socket.close(1008, 'Invalid token or access denied');
        return;
      }

      const session = await this.setupContainerSession(socket, internalId, validation);
      if (!session) return;

      socket.on('message', async (message: string) => {
        try {
          const parsed = JSON.parse(message);
          
          switch (parsed.event) {
            case 'send_command':
              await this.handleSendCommand(session, parsed.data);
              break;

            case 'power_action':
              await this.handlePowerAction(session, parsed.data.action);
              break;
          }
        } catch (error) {
          console.error('Failed to process message:', error);
          socket.send(JSON.stringify({
            event: 'error',
            data: { message: 'Failed to process command' }
          }));
        }
      });

      socket.on('close', () => {
        if (session.stream) {
          session.stream.end();
        }
        if (session.logStream && typeof (session.logStream as any).destroy === 'function') {
          (session.logStream as any).destroy();
        }
        this.sessions.delete(socket);
      });
    });
  }

  private async handleSendCommand(session: ConsoleSession, command: string) {
    try {
      const containerInfo = await session.container.inspect();
      if (containerInfo.State.Status !== 'running') {
        session.socket.send(JSON.stringify({
          event: 'error',
          data: { message: 'Cannot send command - server is not running' }
        }));
        return;
      }

      // Create command execution stream if not exists
      if (!session.stream || session.stream.destroyed) {
        const exec = await session.container.exec({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: ['sh'],
          User: 'container'
        });

        session.exec = exec;
        session.stream = await exec.start({
          hijack: true,
          stdin: true
        }) as Duplex;

        const mainPid = await this.findMainProcess(session.container);
        if (mainPid) {
          session.stream.write(`exec 1>/proc/${mainPid}/fd/1 2>/proc/${mainPid}/fd/2\n`);
        }
      }

      // Send command
      session.stream.write(command + '\n');
    } catch (error) {
      console.error('Failed to send command:', error);
      session.socket.send(JSON.stringify({
        event: 'error',
        data: { message: 'Failed to send command' }
      }));
    }
  }

  private async handlePowerAction(session: ConsoleSession, action: string) {
    try {
      this.broadcastToServer(session.internalId, `Performing a ${action} action on server...`, LogType.DAEMON);

      switch (action) {
        case 'start':
          await session.container.start();
          await this.attachLogs(session);
          break;

        case 'stop':
          await session.container.stop();
          break;

        case 'restart':
          await session.container.restart();
          await this.attachLogs(session);
          break;
      }

      const containerInfo = await session.container.inspect();
      const state = containerInfo.State.Status;
      const error = containerInfo.State.Error || '';

      session.socket.send(JSON.stringify({
        event: 'power_status',
        data: {
          status: state === 'running' ? `${chalk.yellow('[Krypton Daemon]')} The power state was successfully changed!` : `${chalk.yellow('[Krypton Daemon]')} Failed to change power state. If you are booting the server, this means the initial startup command failed/exited or is not valid.`,
          action,
          state,
          error
        }
      }));

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.broadcastToServer(session.internalId, `Failed to ${action} server: ${errorMsg}`, LogType.ERROR);
      console.error(`Server ${action} failed:`, error);
      
      session.socket.send(JSON.stringify({
        event: 'error',
        data: { message: errorMsg }
      }));
    }
  }
}

export function configureWebSocketRouter(appState: AppState) {
  return new WebSocketManager(appState);
}