import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

interface User {
  username: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
  
    useEffect(() => {
      checkAuthState();
    }, []);
  
    const checkAuthState = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }
  
        const response = await fetch('/api/auth/state', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
  
        if (response.ok) {
          const data = await response.json();
          setUser({ username: data.username });
        } else {
          localStorage.removeItem('token');
        }
      } catch (error) {
        console.error('Auth state check failed:', error);
        localStorage.removeItem('token');
      }
      setLoading(false);
    };
  
    const login = async (username: string, password: string) => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
  
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        localStorage.setItem('token', data.token);
        setUser({ username });
        navigate('/servers');
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An error occurred' };
      }
    };
  
    const register = async (username: string, password: string) => {
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
  
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        localStorage.setItem('token', data.token);
        setUser({ username });
        navigate('/servers');
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An error occurred' };
      }
    };
  
    const logout = () => {
      localStorage.removeItem('token');
      setUser(null);
      navigate('/login');
    };
  
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      );
    }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

export const AuthPage: React.FC<{ mode: 'login' | 'register' }> = ({ mode }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await (mode === 'login' ? login(username, password) : register(username, password));
    if (!result.success && result.error) {
      setError(result.error);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-700">
            {mode === 'login' ? 'Sign in to Argon' : 'Create your account'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="px-2 py-1.5 rounded-md bg-red-50 border border-red-100">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-gray-600 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700
                         focus:outline-none focus:ring-0 focus:border-gray-400 transition-colors duration-200"
                placeholder="info@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700
                           focus:outline-none focus:ring-0 focus:border-gray-400 transition-colors duration-200"
                  placeholder="*********"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-xs font-medium text-gray-700 py-1.5 px-2 rounded-md border border-gray-200 
                     hover:bg-gray-50 shadow-xs focus:outline-none focus:ring-0 focus:border-gray-400
                     transition-colors duration-200 flex items-center justify-center"
          >
            {isLoading ? (
              <div className="w-3.5 h-3.5 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <Link to="/register" className="text-gray-700 hover:text-gray-900">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link to="/login" className="text-gray-700 hover:text-gray-900">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};