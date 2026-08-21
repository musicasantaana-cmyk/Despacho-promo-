/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { TrackingPage } from './pages/TrackingPage';
import { ReportsPage } from './pages/ReportsPage';
import { authenticateAppUser } from './lib/firebase';

export default function App() {
  const [currentView, setCurrentView] = useState('tracking');
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('PROMO_USER_SESSION');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.username) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading session', e);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    
    try {
      const result = await authenticateAppUser(username, password);
      if (result.success) {
        const sessionData = { username: result.username, loggedAt: Date.now() };
        localStorage.setItem('PROMO_USER_SESSION', JSON.stringify(sessionData));
        setUser(sessionData);
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

  const handleLogout = () => {
    localStorage.removeItem('PROMO_USER_SESSION');
    setUser(null);
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

  return (
    <AppProvider>
      <Layout currentView={currentView} onViewChange={setCurrentView} onLogout={handleLogout}>
        {currentView === 'admin' && <AdminPage />}
        {currentView === 'assign' && <AssignmentPage />}
        {currentView === 'tracking' && <TrackingPage />}
        {currentView === 'reports' && <ReportsPage />}
      </Layout>
    </AppProvider>
  );
}

