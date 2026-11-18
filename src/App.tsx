/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { TrackingPage } from './pages/TrackingPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersAdminPage } from './pages/UsersAdminPage';
import { DriverPage } from './pages/DriverPage';

function AppContent() {
  const { user, loading, login, logout, isAdmin, isConductor } = useAuth();
  const [currentView, setCurrentView] = useState('tracking');

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Enforce role-based default & permitted view
  useEffect(() => {
    if (!user) return;
    if (user.role === 'conductor') {
      setCurrentView('driver');
    } else if (currentView === 'users' && user.role !== 'admin') {
      setCurrentView('tracking');
    } else if (currentView === 'driver' && user.role !== 'conductor') {
      // keep driver view allowed for admin/gestion/supervisor if explicitly selected
    }
  }, [user, currentView]);

  const handleViewChange = (nextView: string) => {
    if (!user) return;
    if (user.role === 'conductor') {
      setCurrentView('driver');
      return;
    }
    if (nextView === 'users' && user.role !== 'admin') {
      return;
    }
    setCurrentView(nextView);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        setUsername('');
        setPassword('');
      } else {
        setLoginError(result.error || 'Usuario o contraseña incorrectos.');
      }
    } catch (error: any) {
      console.error(error);
      setLoginError('Error de autenticación: ' + (error.message || 'Error desconocido'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentView('tracking');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-700 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Promoambiental</h1>
          <p className="text-sm text-slate-400 mb-6">Sistema Central de Despacho. Inicie sesión para continuar.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Usuario (ej: wefd)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
            {loginError && <p className="text-red-400 text-xs text-left">{loginError}</p>}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {isLoggingIn ? 'Iniciando...' : 'Ingresar al Sistema'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const effectiveView = isConductor ? 'driver' : currentView;

  return (
    <AppProvider>
      <Layout currentView={effectiveView} onViewChange={handleViewChange} onLogout={handleLogout}>
        {isConductor ? (
          <DriverPage />
        ) : (
          <>
            {effectiveView === 'admin' && <AdminPage />}
            {effectiveView === 'assign' && <AssignmentPage />}
            {effectiveView === 'tracking' && <TrackingPage />}
            {effectiveView === 'reports' && <ReportsPage />}
            {effectiveView === 'driver' && <DriverPage />}
            {effectiveView === 'users' && isAdmin && <UsersAdminPage />}
          </>
        )}
      </Layout>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
