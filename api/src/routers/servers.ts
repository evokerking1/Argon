// Panel: src/routers/servers.ts
import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '../permissions';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { db } from '../db';
import { Permissions } from '../permissions';
import { authMiddleware, checkPermission } from '../middleware/auth';

const router = Router();

// Types
interface DaemonServerConfig {
  dockerImage: string;
  variables: Array<{
    name: string;
    description?: string;
    defaultValue: string;
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

// Validation schemas
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  nodeId: z.string().uuid(),
  allocationId: z.string().uuid(),
  memoryMiB: z.number().int().min(128),
  diskMiB: z.number().int().min(1024),
  cpuPercent: z.number().min(1).max(100),
  unitId: z.string().uuid(),
  userId: z.string().uuid()
});

// Helper Functions
async function makeDaemonRequest(
  method: 'get' | 'post' | 'delete',
  node: { fqdn: string; port: number; connectionKey: string },
  path: string,
  data?: any
) {
  try {
    const url = `http://${node.fqdn}:${node.port}${path}`;
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'X-API-Key': node.connectionKey
      },
      timeout: 10000
    });
    return response.data;
  } catch (error: any) {
    console.error(`Daemon request failed: ${error.message}`);
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error('Failed to communicate with daemon');
  }
}

async function updateServerState(serverId: string, state: string) {
  await db.servers.update(
    { id: serverId },
    { state }
  );
}

async function checkServerAccess(req: any, serverId: string) {
  const server = await db.servers.findUnique(
    { id: serverId },
    { 
      node: true, 
      allocation: true  // Include allocation info
    }
  );

  if (!server) {
    throw new Error('Server not found');
  }

  console.log(JSON.stringify(server, null, 2));

  const isAdmin = hasPermission(req.user.permissions, Permissions.ADMIN);
  if (!isAdmin && server.userId !== req.user.id) {
    throw new Error('Access denied');
  }

  // Get allocation details if exists
  let allocationDetails = null;
  if (server.allocationId) {
    allocationDetails = await db.allocations.findUnique({ id: server.allocationId });
  }

  // Fetch current status from daemon
  try {
    const status = await makeDaemonRequest(
      'get',
      server.node!,
      `/api/v1/servers/${server.internalId}`
    );
    await updateServerState(server.id, status.state);
    return { 
      ...server, 
      status,
      allocation: allocationDetails  // Add allocation details to response
    };
  } catch (error) {
    return { 
      ...server, 
      status: { state: 'unknown' },
      allocation: allocationDetails  // Add allocation details to response
    };
  }
}

// PUBLIC ROUTES

router.get('/:internalId/config', async (req, res) => {
  try {
    const server = await db.servers.findFirst({
      where: { internalId: req.params.internalId },
      include: { unit: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const config: DaemonServerConfig = {
      dockerImage: server.unit!.dockerImage,
      variables: server.unit!.environmentVariables.map(v => ({
        name: v.name,
        description: v.description,
        defaultValue: v.defaultValue,
        rules: v.rules
        // currentValue will be added by the daemon based on user settings
      })),
      startupCommand: server.unit!.defaultStartupCommand,
      configFiles: server.unit!.configFiles,
      install: {
        dockerImage: server.unit!.installScript.dockerImage,
        entrypoint: server.unit!.installScript.entrypoint || 'bash',
        script: server.unit!.installScript.script || '# No installation script provided'
      }
    };

    console.log('Server config:', JSON.stringify(config, null, 2));

    res.json(config);
  } catch (error) {
    console.error('Failed to fetch server config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:internalId/validate', authMiddleware, async (req: any, res) => {
  try {
    const server = await db.servers.findFirst({
      where: { internalId: req.params.internalId },
      include: {
        node: true,
        user: true
      }
    });

    if (!server?.node) {
      return res.status(404).json({ error: 'Server or node not found' });
    }

    // Check if user has access
    const isAdmin = hasPermission(req.user.permissions, Permissions.ADMIN);
    const hasAccess = isAdmin || server.userId === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      validated: true,
      server: {
        id: server.id,
        name: server.name,
        internalId: server.internalId,
        node: {
          id: server.node.id,
          name: server.node.name,
          fqdn: server.node.fqdn,
          port: server.node.port
        }
      }
    });
  } catch (error) {
    console.error('Failed to validate server access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.use(authMiddleware);

// ADMIN ROUTES
router.post('/', checkPermission(Permissions.ADMIN_SERVERS_CREATE), async (req: any, res) => {
  try {
    const data = createServerSchema.parse(req.body);
    let temporaryInternalId;

    // Generate a temporary internalId for the server
    temporaryInternalId = 'TEMPORARY_ARGON_ID_' + randomUUID();

    // Verify node exists and is online
    const node = await db.nodes.findUnique({ id: data.nodeId });
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    if (!node.isOnline) {
      return res.status(400).json({ error: 'Node is offline' });
    }

    // Verify allocation exists and is available
    const allocation = await db.allocations.findUnique({ id: data.allocationId });
    if (!allocation) {
      return res.status(404).json({ error: 'Allocation not found' });
    }
    if (allocation.assigned) {
      return res.status(400).json({ error: 'Allocation is already in use' });
    }
    if (allocation.nodeId !== data.nodeId) {
      return res.status(400).json({ error: 'Allocation does not belong to selected node' });
    }

    // Verify unit exists
    const unit = await db.units.findUnique({ id: data.unitId });
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    // Mark allocation as assigned
    await db.allocations.update(
      { id: allocation.id },
      { assigned: true }
    );

    // Create server in the database with a temporary state
    const server = await db.servers.create({
      ...data,
      // Temp internalId until we get it from the daemon
      internalId: temporaryInternalId,
      state: 'creating'
    });

    try {
      const daemonResponse = await makeDaemonRequest('post', node, '/api/v1/servers', {
        name: data.name,
        memoryLimit: data.memoryMiB * 1024 * 1024,
        cpuLimit: Math.floor(data.cpuPercent * 1024 / 100),
        allocation: {
          bindAddress: allocation.bindAddress,
          port: allocation.port
        },
        temporaryInternalId
      });

      // Update server with the internalId returned from the daemon
      await db.servers.update(
        { id: server.id },
        { internalId: daemonResponse.id, state: 'installing' }
      );

      res.status(201).json(server);
    } catch (error) {
      // Cleanup on failure
      await db.allocations.update(
        { id: allocation.id },
        { assigned: false }
      );
      await db.servers.delete({ id: server.id });
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Failed to create server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', checkPermission(Permissions.ADMIN_SERVERS_DELETE), async (req: any, res) => {
  try {
    const server = await db.servers.findUnique(
      { id: req.params.id },
      { include: { node: true, allocation: true } }
    );

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await updateServerState(server.id, 'deleting');

    try {
      await makeDaemonRequest(
        'delete',
        server.node!,
        `/api/v1/servers/${server.internalId}`
      );
    } catch (error) {
      console.error('Failed to delete server on daemon:', error);
      // Continue with database deletion even if daemon delete fails
    }

    // Free up the allocation
    if (server.allocation) {
      await db.allocations.update(
        { id: server.allocation.id },
        { assigned: false }
      );
    }

    await db.servers.delete({ id: server.id });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// USER ROUTES
router.get('/', checkPermission(Permissions.SERVERS_VIEW), async (req: any, res) => {
  try {
    const isAdmin = hasPermission(req.user.permissions, Permissions.ADMIN);
    const where = isAdmin ? undefined : { userId: req.user.id };

    const servers = await db.servers.findMany({
      where,
      include: {
        unit: true,
        node: true,
        user: true,
        allocation: true
      }
    });

    // Fetch status from daemons for each server
    const serversWithStatus = await Promise.all(
      servers.map(async (server) => {
        try {
          console.log('Checking server:', server.internalId);
          const status = await makeDaemonRequest(
            'get',
            server.node!,
            `/api/v1/servers/${server.internalId}`
          );
          await updateServerState(server.id, status.state);
          return { ...server, status };
        } catch (error) {
          return { ...server, status: { state: 'unknown' } };
        }
      })
    );

    res.json(serversWithStatus);
  } catch (error) {
    console.error('Failed to fetch servers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', checkPermission(Permissions.SERVERS_VIEW), async (req: any, res) => {
  try {
    const server = await checkServerAccess(req, req.params.id);
    res.json(server);
  } catch (error: any) {
    if (error.message === 'Server not found') {
      return res.status(404).json({ error: 'Server not found' });
    }
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Failed to fetch server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/power/:action', checkPermission(Permissions.SERVERS_MANAGE), async (req: any, res) => {
  try {
    const { action } = req.params;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid power action' });
    }

    const server = await checkServerAccess(req, req.params.id);

    const pendingState = action === 'start' ? 'starting' : 
                        action === 'stop' ? 'stopping' : 
                        'restarting';
    await updateServerState(server.id, pendingState);

    await makeDaemonRequest(
      'post',
      server.node!,
      `/api/v1/servers/${server.internalId}/power/${action}`
    );

    // Get updated state from daemon
    try {
      const status = await makeDaemonRequest(
        'get',
        server.node!,
        `/api/v1/servers/${server.internalId}`
      );
      await updateServerState(server.id, status.state);
    } catch (error) {
      console.error('Failed to get updated server state:', error);
    }

    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Server not found') {
      return res.status(404).json({ error: 'Server not found' });
    }
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Failed to execute power action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reinstall', checkPermission(Permissions.SERVERS_MANAGE), async (req: any, res) => {
  try {
    const server = await checkServerAccess(req, req.params.id);

    await updateServerState(server.id, 'reinstalling');

    await makeDaemonRequest(
      'post',
      server.node!,
      `/api/v1/servers/${server.internalId}/reinstall`
    );

    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Server not found') {
      return res.status(404).json({ error: 'Server not found' });
    }
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Failed to reinstall server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;