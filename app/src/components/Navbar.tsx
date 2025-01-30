import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  ServerIcon as ServerOutline,
  Cog6ToothIcon as CogOutline,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { 
  ServerIcon as ServerSolid,
  Cog6ToothIcon as CogSolid,
} from '@heroicons/react/24/solid';
import { useAuth } from '../pages/[auth]/Auth';

const UserAvatar: React.FC<{ username: string }> = ({ username }) => {
  const initial = username.charAt(0).toUpperCase();
  
  return (
    <div className="h-6 w-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
      <span className="text-xs font-medium text-gray-600">{initial}</span>
    </div>
  );
};

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isServerCategoryOpen, setIsServerCategoryOpen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
  };

  const toggleServerCategory = () => {
    setIsServerCategoryOpen(!isServerCategoryOpen);
  };

  const isServerPage = location.pathname.startsWith('/servers/') && location.pathname.split('/').length > 3;

  return (
    <>
      <div 
        className={`fixed inset-y-0 left-0 w-56 bg-gradient-to-b from-gray-100/50 to-gray-100 border-r border-gray-200 z-30 transform transition-transform duration-300 ease-in-out`}
      >
        {/* Logo section */}
        <div className="h-14 flex items-center justify-center px-4 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">
            {/* We would have text here. But let's put the Argon logo for now */}
            <img src="https://i.imgur.com/GpRi4xT.png" alt="Argon Logo" className="h-5" />
          </span>
        </div>

        {/* Navigation */}
        <nav className="px-2 mt-4 space-y-0.5">
          <Link
            to="/servers"
            className={`group flex items-center h-[32px] px-2 text-xs font-medium rounded-md transition-colors duration-200 ease-in-out border shadow-xs ${
              location.pathname === '/servers'
                ? 'bg-white text-gray-700 border-gray-200'
                : 'text-gray-600 hover:text-gray-700 hover:bg-gray-100 border-transparent shadow-transparent'
            }`}
          >
            {location.pathname === '/servers' ? (
              <ServerSolid className="mr-2 h-3.5 w-3.5 text-gray-500" />
            ) : (
              <ServerOutline className="mr-2 h-3.5 w-3.5 text-gray-400 transition group-hover:text-gray-500 stroke-[1.5]" />
            )}
            Servers
          </Link>

          <Link
            to="/admin"
            className={`group flex items-center h-[32px] px-2 text-xs font-medium rounded-md transition-colors duration-200 ease-in-out border shadow-xs ${
              location.pathname === '/admin'
                ? 'bg-white text-gray-700 border-gray-200'
                : 'text-gray-600 hover:text-gray-700 hover:bg-gray-100 border-transparent shadow-transparent'
            }`}
          >
            {location.pathname === '/admin' ? (
              <CogSolid className="mr-2 h-3.5 w-3.5 text-gray-500" />
            ) : (
              <CogOutline className="mr-2 h-3.5 w-3.5 text-gray-400 transition group-hover:text-gray-500 stroke-[1.5]" />
            )}
            Admin
          </Link>

          {isServerPage && (
            <div>
              <div className="border-t mb-2 mt-4 border-gray-200" />
              <button
                onClick={toggleServerCategory}
                className="group flex items-center h-[32px] px-2 text-[10px] uppercase tracking-widest font-medium rounded-md transition-colors duration-200 ease-in-out border shadow-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 border-transparent shadow-transparent"
              >
                {isServerCategoryOpen ? (
                  <ChevronDownIcon className="mr-2 h-3.5 w-3.5 text-gray-400 transition group-hover:text-gray-500" />
                ) : (
                  <ChevronRightIcon className="mr-2 h-3.5 w-3.5 text-gray-400 transition group-hover:text-gray-500" />
                )}
                Server
              </button>
              <div className={`pl-4 border-l-1 border-gray-200 transition-all duration-300 ease-in-out ${isServerCategoryOpen ? 'max-h-screen' : 'max-h-0 overflow-hidden'}`}>
                <Link
                  to={`${location.pathname.replace(/\/(console|files)$/, '')}/console`}
                  className={`group flex items-center h-[32px] px-2 text-xs font-medium rounded-md transition-colors duration-200 ease-in-out border shadow-xs ${
                    location.pathname.endsWith('/console')
                      ? 'bg-white text-gray-700 border-gray-200'
                      : 'text-gray-600 hover:text-gray-700 hover:bg-gray-100 border-transparent shadow-transparent'
                  }`}
                >
                  Console
                </Link>
                <Link
                  to={`${location.pathname.replace(/\/(console|files)$/, '')}/files`}
                  className={`group flex items-center h-[32px] px-2 text-xs font-medium rounded-md transition-colors duration-200 ease-in-out border shadow-xs ${
                    location.pathname.endsWith('/files')
                      ? 'bg-white text-gray-700 border-gray-200'
                      : 'text-gray-600 hover:text-gray-700 hover:bg-gray-100 border-transparent shadow-transparent'
                  }`}
                >
                  Files
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* User section with dropdown */}
        <div className="absolute bottom-0 w-full border-t border-gray-200">
          <div 
            ref={buttonRef}
            className="relative px-3 py-3 flex items-center cursor-pointer hover:bg-gray-100 transition-colors duration-200"
            onClick={toggleDropdown}
          >
            <UserAvatar username={user?.username || ''} />
            <div className="ml-2">
              <p className="text-xs font-medium text-gray-700">{user?.username}</p>
            </div>

            {/* Dropdown Menu */}
            <div 
              ref={dropdownRef}
              className={`absolute bottom-full left-2 right-2 mb-1 bg-white rounded-md shadow-xs border border-gray-200 overflow-hidden transform transition-all duration-200 ease-in-out origin-bottom ${
                isDropdownOpen 
                  ? 'opacity-100 scale-y-100 translate-y-0' 
                  : 'opacity-0 scale-y-95 translate-y-1 pointer-events-none'
              }`}
            >
              <div className="py-1">
                <button className="w-full px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 flex items-center">
                  <UserCircleIcon className="mr-2 h-3.5 w-3.5" />
                  Profile
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 flex items-center"
                >
                  <ArrowLeftOnRectangleIcon className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}