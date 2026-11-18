import React, { useState, useEffect } from 'react';
import { Truck, Map, Activity, BarChart2, Settings, Cloud, X, Menu, Clock, Radio, RefreshCw, Smartphone, ShieldCheck, LogOut, Lock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { SyncStatusModal } from './SyncStatusModal';
import { PromoambientalLogo, PromoEmblem } from './PromoambientalLogo';
import { UserRole } from '../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  gestion: 'Admin. Gestión',
  supervisor: 'Supervisor',
  conductor: 'Conductor',
};

const DigitalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden md:flex items-center text-slate-700 font-mono text-sm bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 tabular-nums">
      <Clock className="h-4 w-4 mr-2 text-amber-500" />
      {time.toLocaleTimeString()}
    </div>
  );
};

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onViewChange, onLogout }) => {
  const { state, syncStatus, setBackupEmail, triggerManualBackup, setActiveWorkGroup } = useAppContext();
  const { user, canManageUsers, canAccessSystemConfig, isConductor, lockedWorkGroupId } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [emailInput, setEmailInput] = useState(state.backupEmail || '');

  useEffect(() => {
    setEmailInput(state.backupEmail || '');
  }, [state.backupEmail]);

  const handleSaveSettings = () => {
    if (!canAccessSystemConfig) return;
    setBackupEmail(emailInput);
    setShowSettings(false);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('PROMO_USER_SESSION');
      window.location.reload();
    }
  };

  const handleExportBackup = () => {
    if (!canAccessSystemConfig) return;
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PROMOAMBIENTAL_backup_${new Date().getTime()}.json`;
    link.click();
    triggerManualBackup();
  };

  const navItems = isConductor
    ? [{ id: 'driver', label: 'Conductores', icon: Smartphone }]
    : [
        { id: 'admin', label: 'Administración', icon: Truck },
        { id: 'assign', label: 'Asignación', icon: Map },
        { id: 'tracking', label: 'Seguimiento', icon: Activity },
        { id: 'reports', label: 'Reportes', icon: BarChart2 },
        { id: 'driver', label: 'Conductores', icon: Smartphone },
        ...(canManageUsers ? [{ id: 'users', label: 'Usuarios', icon: ShieldCheck }] : []),
      ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setIsMobileMenuOpen(false);
  };

  const lockedGroupName = lockedWorkGroupId
    ? state.workGroups.find(wg => wg.id === lockedWorkGroupId)?.name || lockedWorkGroupId
    : null;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-slate-800">
          <PromoambientalLogo variant="full" theme="dark" size="md" />
        </div>

        {/* User Identity Card */}
        {user && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.fullName || user.username}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">@{user.username}</p>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            {lockedGroupName && (
              <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold">
                <Lock className="h-3 w-3 shrink-0" />
                <span className="truncate">Grupo: {lockedGroupName}</span>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 py-5 px-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-150 ${
                currentView === item.id
                  ? 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <item.icon className={`h-5 w-5 ${currentView === item.id ? 'text-amber-300' : ''}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Mobile Group Filter & Sync status card in sidebar */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          {/* Mobile Group Filter */}
          {!isConductor && state.workGroups.length > 0 && (
            <div className="md:hidden flex flex-col space-y-1 mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Grupo Operativo Actual
              </label>
              {lockedWorkGroupId ? (
                <div className="flex items-center gap-2 bg-slate-900 text-amber-300 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lockedGroupName}</span>
                </div>
              ) : (
                <select
                  value={state.activeWorkGroupId || ''}
                  onChange={e => setActiveWorkGroup(e.target.value || null)}
                  className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 w-full"
                >
                  <option value="">Todos los grupos</option>
                  {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
                </select>
              )}
            </div>
          )}

          {!isConductor && (
            <button
              onClick={() => setShowSyncModal(true)}
              className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-3 text-left transition-all group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${syncStatus.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  <span className="text-xs font-semibold text-slate-200">
                    {syncStatus.isOnline ? `Nube Activa (${syncStatus.latencyInterval}s)` : 'Modo Local'}
                  </span>
                </div>
                <Radio className="h-3.5 w-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {syncStatus.deviceId} • v{syncStatus.serverVersion}
              </div>
            </button>
          )}

          {canAccessSystemConfig && (
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Settings className="h-4 w-4" />
              <span>Configuración</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-2 mt-1 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="md:hidden">
                <PromoEmblem size={34} />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-black text-slate-900 tracking-tight flex items-center flex-wrap">
                  <span>Promoambiental Distrito</span>
                  <span className="text-slate-400 text-xs md:text-sm font-normal ml-2">/ {navItems.find((i) => i.id === currentView)?.label}</span>
                </h1>
                <p className="hidden md:block text-[10px] text-emerald-700 font-bold uppercase tracking-widest mt-0.5">
                  S.A.S. ESP • Sistema Central de Despacho y Operaciones
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-sm text-slate-500">
            <DigitalClock />

            {/* Sync Badge Button in Header */}
            {!isConductor && (
              <button
                onClick={() => setShowSyncModal(true)}
                title="Abrir diagnóstico y protocolo de sincronización"
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  syncStatus.isOnline
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`} />
                <span className="hidden sm:inline">
                  {syncStatus.isOnline ? `Sync: ${syncStatus.latencyInterval}s` : 'Desconectado'}
                </span>
                <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {!isConductor && state.workGroups.length > 0 && (
              <div className="hidden sm:flex items-center bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Grupo:</span>
                {lockedWorkGroupId ? (
                  <span className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                    <span>{lockedGroupName}</span>
                  </span>
                ) : (
                  <select
                    value={state.activeWorkGroupId || ''}
                    onChange={e => setActiveWorkGroup(e.target.value || null)}
                    className="bg-transparent text-slate-800 font-medium outline-none text-sm w-36 truncate"
                  >
                    <option value="">Todos los grupos</option>
                    {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
                  </select>
                )}
              </div>
            )}

            {canAccessSystemConfig && state.backupEmail && (
              <div className="hidden xl:flex items-center space-x-1.5 text-xs text-slate-500">
                <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                <span>Backup: {state.lastBackupDate ? new Date(state.lastBackupDate).toLocaleTimeString() : 'Auto'}</span>
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-y-contain touch-pan-y p-4 md:p-8">{children}</div>
      </main>

      {/* Sync Status & Protocol Modal */}
      {!isConductor && <SyncStatusModal isOpen={showSyncModal} onClose={() => setShowSyncModal(false)} />}

      {/* Settings Modal (Admin Only) */}
      {canAccessSystemConfig && showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="font-semibold text-lg">Configuración de Sistema</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Correo para copia de seguridad
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="admin@empresa.com"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowSettings(false);
                    handleNav('users');
                  }}
                  className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Abrir Panel de Administración de Usuarios
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col space-y-3">
                <button
                  onClick={() => { setShowSettings(false); setShowSyncModal(true); }}
                  className="w-full py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors font-medium text-sm text-center flex items-center justify-center gap-2"
                >
                  <Radio className="h-4 w-4" />
                  Estado de Sincronización
                </button>
                <button
                  onClick={handleExportBackup}
                  className="w-full py-2 px-4 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm text-center"
                >
                  Descargar Copia Manual (JSON)
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

