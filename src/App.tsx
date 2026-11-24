/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { TrackingPage } from './pages/TrackingPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersAdminPage } from './pages/UsersAdminPage';
import { DriverPage } from './pages/DriverPage';
import { HomeMenuPage } from './pages/HomeMenuPage';
import { detectDeviceSnapshot, useDeviceType } from './hooks/useDeviceType';
import { UserRole } from './types';

const ALLOWED_VIEWS = new Set(['home', 'admin', 'assign', 'tracking', 'reports', 'driver', 'users']);

function sanitizeViewForRole(view: string | undefined, role: UserRole, isTouchDevice: boolean): string {
  if (role === 'conductor') return 'driver';
  if (!view || !ALLOWED_VIEWS.has(view)) {
    return isTouchDevice ? 'home' : 'tracking';
  }
  if (view === 'users' && role !== 'admin') {
    return isTouchDevice ? 'home' : 'tracking';
  }
  return view;
}

function AppContent() {
  const { user, loading, login, logout, isAdmin, isConductor } = useAuth();
  const device = useDeviceType();

  const [currentView, setCurrentView] = useState<string>(() =>
    detectDeviceSnapshot().isTouchDevice ? 'home' : 'tracking'
  );
  const [viewHistory, setViewHistory] = useState<string[]>([]);

  const currentViewRef = useRef(currentView);
  const viewHistoryRef = useRef(viewHistory);
  const userRef = useRef(user);
  const deviceRef = useRef(device);
  const initializedUserIdRef = useRef<string | null>(null);

  currentViewRef.current = currentView;
  viewHistoryRef.current = viewHistory;
  userRef.current = user;
  deviceRef.current = device;

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Initialize initial view & browser history entry when authenticated user loads
  useEffect(() => {
    if (!user) {
      initializedUserIdRef.current = null;
      return;
    }

    if (initializedUserIdRef.current !== user.id) {
      initializedUserIdRef.current = user.id;
      const hashView =
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
      const initialView = sanitizeViewForRole(
        hashView || (deviceRef.current.isTouchDevice ? 'home' : 'tracking'),
        user.role,
        deviceRef.current.isTouchDevice
      );
      setCurrentView(initialView);
      setViewHistory([]);

      if (typeof window !== 'undefined') {
        window.history.replaceState({ promoView: initialView, promoDepth: 0 }, '', `#${initialView}`);
        if (user.role === 'conductor' && deviceRef.current.isTouchDevice) {
          window.history.pushState({ promoView: 'driver', promoDepth: 1 }, '', '#driver');
        }
      }
      return;
    }

    // Keep role permissions enforced on currentView changes
    const safeView = sanitizeViewForRole(currentView, user.role, device.isTouchDevice);
    if (safeView !== currentView) {
      setCurrentView(safeView);
    }
  }, [user, currentView, device.isTouchDevice]);

  // Listen to device/browser Back navigation (popstate) for mobile & tablet back button/gestures
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const activeUser = userRef.current;
      if (!activeUser) return;

      const stateView = (event.state as { promoView?: string } | null)?.promoView;

      if (activeUser.role === 'conductor') {
        setCurrentView('driver');
        if (deviceRef.current.isTouchDevice && stateView !== 'driver') {
          window.history.pushState({ promoView: 'driver', promoDepth: 1 }, '', '#driver');
        }
        return;
      }

      const targetView = sanitizeViewForRole(
        stateView || (deviceRef.current.isTouchDevice ? 'home' : currentViewRef.current),
        activeUser.role,
        deviceRef.current.isTouchDevice
      );

      setCurrentView(targetView);
      setViewHistory(prev => {
        if (prev.length === 0) return prev;
        return prev.slice(0, -1);
      });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleViewChange = useCallback(
    (nextView: string) => {
      const activeUser = userRef.current;
      if (!activeUser) return;

      const safeNext = sanitizeViewForRole(nextView, activeUser.role, deviceRef.current.isTouchDevice);
      if (safeNext === currentViewRef.current) return;

      const nextHistory = [...viewHistoryRef.current, currentViewRef.current];
      setViewHistory(nextHistory);
      setCurrentView(safeNext);

      if (typeof window !== 'undefined') {
        window.history.pushState(
          { promoView: safeNext, promoDepth: nextHistory.length },
          '',
          `#${safeNext}`
        );
      }
    },
    []
  );

  const handleGoBack = useCallback(() => {
    const activeUser = userRef.current;
    if (!activeUser) return;

    if (viewHistoryRef.current.length > 0 && typeof window !== 'undefined') {
      window.history.back();
      return;
    }

    if (activeUser.role !== 'conductor' && currentViewRef.current !== 'home') {
      handleViewChange('home');
    }
  }, [handleViewChange]);

  const handleGoHome = useCallback(() => {
    const activeUser = userRef.current;
    if (!activeUser) return;

    if (activeUser.role === 'conductor') {
      handleViewChange('driver');
      return;
    }

    if (currentViewRef.current !== 'home') {
      handleViewChange('home');
    }
  }, [handleViewChange]);

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
    initializedUserIdRef.current = null;
    setViewHistory([]);
    const fallbackView = deviceRef.current.isTouchDevice ? 'home' : 'tracking';
    setCurrentView(fallbackView);
    if (typeof window !== 'undefined') {
      window.history.replaceState({ promoView: fallbackView, promoDepth: 0 }, '', '#');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const DeviceIcon = device.isMobile ? Smartphone : device.isTablet ? Tablet : Monitor;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
        <div
          className={`bg-slate-800 rounded-2xl w-full shadow-2xl border border-slate-700 text-center ${
            device.isMobile ? 'p-6 max-w-sm' : device.isTablet ? 'p-8 max-w-md' : 'p-8 max-w-sm'
          }`}
        >
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-1.5">Promoambiental</h1>
          <p className="text-sm text-slate-400 mb-3">
            Sistema Central de Despacho. Inicie sesión para continuar.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-6">
            <DeviceIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span>Vista adaptada para {device.deviceLabel}</span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Usuario (ej: wefd)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full min-h-[46px] bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full min-h-[46px] bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
            {loginError && <p className="text-red-400 text-xs text-left">{loginError}</p>}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full min-h-[48px] bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {isLoggingIn ? 'Iniciando...' : 'Ingresar al Sistema'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const effectiveView = isConductor ? 'driver' : currentView;
  const canGoBack = viewHistory.length > 0 || (!isConductor && effectiveView !== 'home');

  return (
    <AppProvider>
      <Layout
        currentView={effectiveView}
        onViewChange={handleViewChange}
        onGoBack={handleGoBack}
        onGoHome={handleGoHome}
        canGoBack={canGoBack}
        device={device}
        onLogout={handleLogout}
        renderContent={actions =>
          isConductor ? (
            <DriverPage />
          ) : (
            <>
              {effectiveView === 'home' && (
                <HomeMenuPage
                  device={device}
                  onNavigate={handleViewChange}
                  onOpenSync={actions.openSyncModal}
                  onOpenSettings={actions.openSettings}
                  onLogout={handleLogout}
                />
              )}
              {effectiveView === 'admin' && <AdminPage />}
              {effectiveView === 'assign' && <AssignmentPage />}
              {effectiveView === 'tracking' && <TrackingPage />}
              {effectiveView === 'reports' && <ReportsPage />}
              {effectiveView === 'driver' && <DriverPage />}
              {effectiveView === 'users' && isAdmin && <UsersAdminPage />}
            </>
          )
        }
      />
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
