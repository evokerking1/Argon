import { useState, useEffect } from 'react';
import { ServerIcon, HardDriveIcon, BoxIcon } from 'lucide-react';
import AdminBar from '../components/AdminBar';

const AdminPage = () => {
  const [stats, setStats] = useState({
    servers: { total: 0, online: 0, offline: 0 },
    units: { total: 0 },
    nodes: { total: 0, online: 0, offline: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch servers
        const serversRes = await fetch('/api/servers', { headers });
        const servers = await serversRes.json();
        
        // Fetch units
        const unitsRes = await fetch('/api/units', { headers });
        const units = await unitsRes.json();

        // Calculate stats
        setStats({
          servers: {
            total: servers.length,
            online: servers.filter((s: any) => s.status?.state === 'running').length,
            offline: servers.filter((s: any) => s.status?.state !== 'running').length
          },
          units: {
            total: units.length
          },
          nodes: {
            total: new Set(servers.map((s: any) => s.node?.id)).size,
            online: new Set(servers.filter((s: any) => s.node?.isOnline).map((s: any) => s.node?.id)).size,
            offline: new Set(servers.filter((s: any) => !s.node?.isOnline).map((s: any) => s.node?.id)).size
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminBar />
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      </div>
    );
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

  const statCards = [
    {
      title: 'Servers',
      icon: ServerIcon,
      stats: [
        { label: 'Total', value: stats.servers.total },
        { label: 'Online', value: stats.servers.online },
        { label: 'Offline', value: stats.servers.offline }
      ]
    },
    {
      title: 'Nodes',
      icon: HardDriveIcon,
      stats: [
        { label: 'Total', value: stats.nodes.total },
        { label: 'Online', value: stats.nodes.online },
        { label: 'Offline', value: stats.nodes.offline }
      ]
    },
    {
      title: 'Units',
      icon: BoxIcon,
      stats: [
        { label: 'Total', value: stats.units.total }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminBar />
      <div className="p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Admin Overview</h1>
            <p className="text-xs text-gray-500 mt-1">
              Monitor and manage your Argon panel.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div 
                  key={card.title} 
                  className="bg-white border border-gray-200 rounded-md shadow-xs p-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <h2 className="text-sm font-medium text-gray-900">{card.title}</h2>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {card.stats.map((stat) => (
                        <div key={stat.label} className="space-y-1">
                          <p className="text-2xl font-semibold text-gray-900">
                            {stat.value}
                          </p>
                          <p className="text-xs text-gray-500">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;