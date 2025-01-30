import { useAuth } from './[auth]/Auth';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, ServerIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

interface Node {
  id: string;
  fqdn: string;
  port: number;
  isOnline: boolean;
}

interface ServerStatus {
  state: string;
  status: any;
}

interface Server {
  id: string;
  name: string;
  internalId: string;
  state: string;
  cpuPercent: number;
  memoryMiB: number;
  node: Node;
  status: ServerStatus;
  userId: string;
}

export default function Home() {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/servers', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch servers');
        }
        
        const data = await response.json();
        setServers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    fetchServers();
  }, []);

  const stats = {
    total: servers.length,
    online: servers.filter(s => s.status?.status?.state === 'running').length,
    offline: servers.filter(s => s.status?.status?.state !== 'running').length
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-600 text-sm">Failed to load servers: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-3xl space-y-5">
        {/* Welcome Section */}
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-semibold text-gray-800">
              Welcome back, {user?.username}!
            </h1>
            <span className="text-xl" role="img" aria-label="wave">
              👋
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Manage your servers, account and other features from your dashboard.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-md border border-gray-200 shadow-xs">
            <div className="flex items-center h-[42px]">
              <div className="flex-shrink-0 pl-3">
                <ServerIcon className="h-4 w-4 text-gray-400" strokeWidth="2" />
              </div>
              <div className="flex-1 flex items-center justify-center">
                <span className="text-xs font-medium text-gray-600 tracking-wide">{stats.total} SERVERS</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-md border border-gray-200 shadow-xs">
            <div className="flex items-center justify-center h-[42px] px-3 space-x-4">
              <div className="flex items-center space-x-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400"></div>
                <span className="text-xs font-medium text-gray-600 tracking-wide">{stats.online} ONLINE</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-300"></div>
                <span className="text-xs font-medium text-gray-600 tracking-wide">{stats.offline} OFFLINE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Servers Section */}
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-gray-700">My servers</h2>
          <div className="space-y-1.5">
            {servers.map((server) => (
              <Link
                key={server.id}
                to={`/servers/${server.id}/console`}
                className="block bg-white rounded-md border border-gray-200 shadow-xs hover:border-gray-300 transition-colors duration-200"
              >
                <div className="px-3 h-[52px] flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className={`h-1.5 w-1.5 rounded-full ${
                        server.status?.status?.state === 'running' ? 'bg-green-400' : 'bg-gray-300'
                      }`}></div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">
                        {server.name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {server.node?.fqdn}:{server.node?.port}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="flex space-x-3">
                      <div className="text-[11px] text-gray-500">
                        <span className="font-medium text-gray-900">{server.cpuPercent}%</span> CPU limit
                      </div>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-medium text-gray-900">{(server.memoryMiB / 1024).toFixed(2)} GiB</span> Memory limit
                      </div>
                    </div>
                    <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}

            {servers.length === 0 && (
              <div className="text-center py-8 bg-white rounded-md border border-gray-200">
                <p className="text-xs text-gray-500">No servers found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}