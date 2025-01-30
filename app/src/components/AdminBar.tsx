import { Link, useLocation } from 'react-router-dom';
import { ServerIcon, HardDriveIcon, BoxIcon, LayoutDashboardIcon } from 'lucide-react';

const AdminBar = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const tabs = [
    { name: 'Overview', path: '/admin', icon: LayoutDashboardIcon },
    { name: 'Servers', path: '/admin/servers', icon: ServerIcon },
    { name: 'Nodes', path: '/admin/nodes', icon: HardDriveIcon },
    { name: 'Units', path: '/admin/units', icon: BoxIcon }
  ];

  return (
    <div className="w-full h-14 border-b border-gray-200 p-3">
      <div className="max-w-6xl mx-auto">
        <div className="flex space-x-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentPath === tab.path;
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex items-center space-x-2 text-xs font-medium px-4 py-2 rounded-md transition-all duration-200 ${
                  isActive
                    ? 'bg-white shadow-xs border border-gray-200 text-gray-800 shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminBar;