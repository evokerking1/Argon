import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, lazy } from 'react';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import { AuthProvider, ProtectedRoute, AuthPage } from './pages/[auth]/Auth';

const Servers = lazy(() => import('./pages/Servers'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

// Admin endpoints
const AdminNodes = lazy(() => import('./pages/[admin]/Nodes'));
const AdminServers = lazy(() => import('./pages/[admin]/Servers'));
const AdminUnits = lazy(() => import('./pages/[admin]/Units'));

// Servers
const ServerConsole = lazy(() => import('./pages/[server]/Console'));

function App() {
  const location = useLocation();
  
  const noSidebarRoutes = ['/login', '/register', '/404'];
  const shouldHaveSidebar = !noSidebarRoutes.includes(location.pathname);

  const pageVariants = {
    initial: { 
      opacity: 0,
      scale: 0.98
    },
    animate: { 
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 20
      }
    },
    exit: { 
      opacity: 0,
      scale: 0.96,
      transition: {
        duration: 0.2
      }
    }
  };

  return (
    <AuthProvider>
      <div className="bg-gray-50">
        {shouldHaveSidebar &&
        <Navbar />
        }
        <div className={`
          ${shouldHaveSidebar ? 'pl-56' : ''} 
          min-h-screen transition-all duration-200 ease-in-out
        `}>
          <Suspense fallback={<LoadingSpinner />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                <Routes location={location}>
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/register" element={<AuthPage mode="register" />} />
                  <Route
                    path="/servers"
                    element={
                      <ProtectedRoute>
                        <Servers />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/" element={<Navigate to="/servers" />} />
                  <Route path="*" element={<NotFound />} />

                  <Route path="/admin/nodes" element={<AdminNodes />} />
                  <Route path="/admin/servers" element={<AdminServers />} />
                  <Route path="/admin/units" element={<AdminUnits />} />

                  <Route
  path="/servers/:id/console"
  element={
    <ProtectedRoute>
      <ServerConsole />
    </ProtectedRoute>
  }
/>
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;