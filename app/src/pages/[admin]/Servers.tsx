import React, { useState, useEffect } from 'react';
import { ChevronRightIcon, PlusIcon, TrashIcon, PencilIcon, ArrowLeftIcon } from 'lucide-react';
import AdminBar from '../../components/AdminBar';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Node {
  id: string;
  name: string;
  fqdn: string;
  port: number;
  isOnline: boolean;
  lastChecked: Date;
  createdAt: Date;
  updatedAt: Date;
  allocations?: Allocation[];
}

interface Unit {
  id: string;
  name: string;
  shortName: string;
  description: string;
  dockerImage: string;
  defaultStartupCommand: string;
  configFiles: Record<string, string>;
  environmentVariables: Record<string, string>;
  installScript: string[];
  startup: {
    command: string;
    parameters: string[];
  };
  recommendedRequirements?: {
    memoryMiB: number;
    diskMiB: number;
    cpuPercent: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: string;
  username: string;
  permissions: string[];
}

interface Allocation {
  id: string;
  nodeId: string;
  port: number;
  bindAddress: string;
  alias?: string;
  notes?: string;
  assigned: boolean;
  serverId?: string;
}

interface Server {
  id: string;
  name: string;
  internalId: string;
  nodeId: string;
  unitId: string;
  userId: string;
  allocationId: string;
  memoryMiB: number;
  diskMiB: number;
  cpuPercent: number;
  state: string;
  createdAt: Date;
  updatedAt: Date;
  node?: Node;
  unit?: Unit;
  user?: User;
}

interface FormData {
  name: string;
  nodeId: string;
  unitId: string;
  userId: string;
  allocationId: string;
  memoryMiB: number;
  diskMiB: number;
  cpuPercent: number;
}

type View = 'list' | 'create' | 'view' | 'edit';

const AdminServersPage = () => {
  // Core state
  const [servers, setServers] = useState<Server[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    nodeId: '',
    unitId: '',
    userId: '',
    allocationId: '',
    memoryMiB: 1024,
    diskMiB: 10240,
    cpuPercent: 100
  });
  const [formError, setFormError] = useState<string | null>(null);
  
  // Search state
  const [userSearch, setUserSearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.username.toLowerCase().includes(userSearch.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [userSearch, users]);

  useEffect(() => {
    const filtered = units.filter(unit => 
      unit.name.toLowerCase().includes(unitSearch.toLowerCase()) ||
      unit.shortName.toLowerCase().includes(unitSearch.toLowerCase())
    );
    setFilteredUnits(filtered);
  }, [unitSearch, units]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [serversRes, nodesRes, unitsRes, usersRes] = await Promise.all([
        fetch('/api/servers?include[node]=true&include[unit]=true&include[user]=true', { headers }),
        fetch('/api/nodes', { headers }),
        fetch('/api/units', { headers }),
        fetch('/api/users', { headers })
      ]);
      
      if (!serversRes.ok) throw new Error('Failed to fetch servers');
      if (!nodesRes.ok) throw new Error('Failed to fetch nodes');
      if (!unitsRes.ok) throw new Error('Failed to fetch units');
      if (!usersRes.ok) throw new Error('Failed to fetch users');
      
      const [serversData, nodesData, unitsData, usersData] = await Promise.all([
        serversRes.json(),
        nodesRes.json(),
        unitsRes.json(),
        usersRes.json()
      ]);

      setServers(serversData);
      setNodes(nodesData);
      setUnits(unitsData);
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create server');
      }

      await fetchData();
      setView('list');
      setFormData({
        name: '',
        nodeId: '',
        unitId: '',
        userId: '',
        allocationId: '',
        memoryMiB: 1024,
        diskMiB: 10240,
        cpuPercent: 100
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create server');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;
    setFormError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/servers/${selectedServer.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update server');
      }

      await fetchData();
      setView('list');
      setSelectedServer(null);
      setFormData({
        name: '',
        nodeId: '',
        unitId: '',
        userId: '',
        allocationId: '',
        memoryMiB: 1024,
        diskMiB: 10240,
        cpuPercent: 100
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update server');
    }
  };

  const handleDelete = async (serverId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete server');
      }

      await fetchData();
      if (selectedServer?.id === serverId) {
        setView('list');
        setSelectedServer(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete server');
    }
  };

  const renderForm = (type: 'create' | 'edit') => (
    <form onSubmit={type === 'create' ? handleCreate : handleEdit} className="space-y-4 max-w-lg">
      {formError && (
        <div className="bg-red-50 border border-red-100 rounded-md p-3">
          <p className="text-xs text-red-600">{formError}</p>
        </div>
      )}
      
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
          placeholder="my-server"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          Node
        </label>
        <select
          value={formData.nodeId}
          onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
          required
        >
          <option value="">Select a node</option>
          {nodes.map(node => (
            <option key={node.id} value={node.id}>
              {node.name} ({node.fqdn})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          Unit
        </label>
        <input
          type="text"
          value={unitSearch}
          onChange={(e) => setUnitSearch(e.target.value)}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 mb-2"
          placeholder="Search units..."
        />
        <select
          value={formData.unitId}
          onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
          required
        >
          <option value="">Select a unit</option>
          {filteredUnits.map(unit => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.shortName})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          User
        </label>
        <input
          type="text"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 mb-2"
          placeholder="Search users..."
        />
        <select
          value={formData.userId}
          onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
          className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
          required
        >
          <option value="">Select a user</option>
          {filteredUsers.map(user => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>
      </div>

      {formData.nodeId && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            Port Allocation
          </label>
          <select
            value={formData.allocationId}
            onChange={(e) => setFormData({ ...formData, allocationId: e.target.value })}
            className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
            required
          >
            <option value="">Select a port allocation</option>
            {nodes
              .find(n => n.id === formData.nodeId)
              ?.allocations
              ?.filter(a => !a.assigned)
              .map(allocation => (
                <option key={allocation.id} value={allocation.id}>
                  {allocation.bindAddress}:{allocation.port}
                  {allocation.alias && ` (${allocation.alias})`}
                </option>
              ))
            }
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            Memory (MiB)
          </label>
          <input
            type="number"
            value={formData.memoryMiB}
            onChange={(e) => setFormData({ ...formData, memoryMiB: parseInt(e.target.value) })}
            className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
            min={128}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            Disk (MiB)
          </label>
          <input
            type="number"
            value={formData.diskMiB}
            onChange={(e) => setFormData({ ...formData, diskMiB: parseInt(e.target.value) })}
            className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
            min={1024}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            CPU (%)
          </label>
          <input
            type="number"
            value={formData.cpuPercent}
            onChange={(e) => setFormData({ ...formData, cpuPercent: parseInt(e.target.value) })}
            className="block w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
            min={25}
            max={400}
            required
          />
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button
          type="submit"
          className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
        >
          {type === 'create' ? 'Create Server' : 'Update Server'}
        </button>
        <button
          type="button"
          onClick={() => {
            setView(type === 'edit' ? 'view' : 'list');
            if (type === 'create') setSelectedServer(null);
            setFormData({
              name: '',
              nodeId: '',
              unitId: '',
              userId: '',
              allocationId: '',
              memoryMiB: 1024,
              diskMiB: 10240,
              cpuPercent: 100
            });
          }}
          className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  const renderServerView = () => {
    if (!selectedServer) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                setView('list');
                setSelectedServer(null);
              }}
              className="flex items-center text-gray-600 hover:bg-gray-100 p-2 cursor-pointer rounded-md transition hover:text-gray-900"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedServer.name}</h2>
              <p className="text-xs text-gray-500">{selectedServer.internalId}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setFormData({
                  name: selectedServer.name,
                  nodeId: selectedServer.nodeId,
                  unitId: selectedServer.unitId,
                  userId: selectedServer.userId,
                  allocationId: selectedServer.allocationId,
                  memoryMiB: selectedServer.memoryMiB,
                  diskMiB: selectedServer.diskMiB,
                  cpuPercent: selectedServer.cpuPercent
                });
                setView('edit');
              }}
              className="flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
            >
              <PencilIcon className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </button>
            <button
              onClick={() => handleDelete(selectedServer.id)}
              className="flex items-center px-3 py-2 text-xs font-medium text-red-600 bg-white border border-gray-200 rounded-md hover:bg-red-50"
            >
              <TrashIcon className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md shadow-xs">
          <div className="px-6 py-4">
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500">Server ID</div>
                <div className="text-sm font-mono mt-1">{selectedServer.id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Name</div>
                <div className="text-sm mt-1">{selectedServer.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Internal ID</div>
                <div className="text-sm mt-1">{selectedServer.internalId}</div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-900 mb-3">Resources</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Memory</div>
                    <div className="text-sm mt-1">{selectedServer.memoryMiB} MiB</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Disk</div>
                    <div className="text-sm mt-1">{selectedServer.diskMiB} MiB</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">CPU</div>
                    <div className="text-sm mt-1">{selectedServer.cpuPercent}%</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-900 mb-3">Relationships</div>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-500">Node</div>
                    <div className="text-sm mt-1">
                      {selectedServer.node?.name} ({selectedServer.node?.fqdn})
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Unit</div>
                    <div className="text-sm mt-1">
                      {selectedServer.unit?.name} ({selectedServer.unit?.shortName})
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">User</div>
                    <div className="text-sm mt-1">
                      {selectedServer.user?.username}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500">Created At</div>
                <div className="text-sm mt-1">
                  {new Date(selectedServer.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Updated At</div>
                <div className="text-sm mt-1">
                  {new Date(selectedServer.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminBar />
        <div className="p-6">
          <div className="text-red-600 text-xs">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminBar />
      <div className="p-6">
        <div className="transition-all duration-200 ease-in-out">
          {view === 'list' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Servers</h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage all servers running on your nodes.
                  </p>
                </div>
                <button
                  onClick={() => setView('create')}
                  className="flex items-center px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
                >
                  <PlusIcon className="w-3.5 h-3.5 mr-1.5" />
                  Create Server
                </button>
              </div>

              <div className="space-y-2">
                {servers.map((server) => (
                  <div
                    key={server.id}
                    className="bg-white border border-gray-200 rounded-md shadow-xs cursor-pointer hover:border-gray-300"
                    onClick={() => {
                      setSelectedServer(server);
                      setView('view');
                    }}
                  >
                    <div className="px-6 h-20 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div 
                            className={`h-2 w-2 rounded-full ${
                              server.state === 'running' ? 'bg-green-400' : 'bg-gray-300'
                            }`}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {server.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {server.user?.username} • {server.unit?.shortName}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="flex space-x-4">
                          <span className="text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{server.cpuPercent}%</span> CPU
                          </span>
                          <span className="text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{server.memoryMiB} MiB</span> RAM
                          </span>
                          <span className="text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{server.diskMiB} MiB</span> Disk
                          </span>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                ))}

                {servers.length === 0 && (
                  <div className="text-center py-6 bg-white rounded-md border border-gray-200">
                    <p className="text-xs text-gray-500">No servers found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'create' && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    setView('list');
                    setSelectedServer(null);
                  }}
                  className="flex items-center text-gray-600 hover:bg-gray-100 p-2 cursor-pointer rounded-md transition hover:text-gray-900"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Create Server</h1>
                </div>
              </div>
              {renderForm('create')}
            </div>
          )}

          {view === 'edit' && renderForm('edit')}
          {view === 'view' && renderServerView()}
        </div>
      </div>
    </div>
  );
};

export default AdminServersPage;