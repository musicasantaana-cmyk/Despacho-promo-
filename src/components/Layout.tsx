import React, { useState, useEffect, useRef } from 'react';
import {
  Truck,
  Map,
  Activity,
  BarChart2,
  Settings,
  Cloud,
  X,
  Menu,
  Clock,
  Radio,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  LogOut,
  Lock,
  Pin,
  PinOff,
  ChevronRight,
  ArrowLeft,
  Home,
  LayoutGrid,
  Monitor,
  Tablet,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { SyncStatusModal } from './SyncStatusModal';
import { PromoambientalLogo, PromoEmblem } from './PromoambientalLogo';
import { UserRole } from '../types';
import { DeviceInfo } from '../hooks/useDeviceType';

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
    <div className="hidden lg:flex items-center text-slate-700 font-mono text-sm bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 tabular-nums">
      <Clock className="h-4 w-4 mr-2 text-amber-500" />
      {time.toLocaleTimeString()}
    </div>
  );
};

export interface LayoutContentActions {
  openSyncModal: () => void;
  openSettings: () => void;
  scrollToTop: () => void;
}

interface LayoutProps {
  children?: React.ReactNode;
  renderContent?: (actions: LayoutContentActions) => React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  onGoBack?: () => void;
  onGoHome?: () => void;
  canGoBack?: boolean;
  device: DeviceInfo;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  renderContent,
  currentView,
  onViewChange,
  onGoBack,
  onGoHome,
  canGoBack = false,
  device,
  onLogout,
}) => {
  const { state, syncStatus, setBackupEmail, triggerManualBackup, setActiveWorkGroup } = useAppContext();
  const { user, canManageUsers, canAccessSystemConfig, isConductor, lockedWorkGroupId } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [emailInput, setEmailInput] = useState(state.backupEmail || '');
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  const isTouchLayout = device.isMobile || device.isTablet;
  const isSidebarExpanded = isDrawerOpen || (device.isDesktop && (isSidebarPinned || isSidebarHovered));

  useEffect(() => {
    setEmailInput(state.backupEmail || '');
  }, [state.backupEmail]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  const handleSaveSettings = () => {
    if (!canAccessSystemConfig) return;
    setBackupEmail(emailInput);
    setShowSettings(false);
  };

  const handleLogout = () => {
    setIsDrawerOpen(false);
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
    ? [{ id: 'driver', label: 'Conductores', shortLabel: 'Jornada', icon: Smartphone }]
    : [
        { id: 'home', label: 'Menú Principal', shortLabel: 'Menú', icon: Home },
        { id: 'admin', label: 'Administración', shortLabel: 'Admin', icon: Truck },
        { id: 'assign', label: 'Asignación', shortLabel: 'Asignar', icon: Map },
        { id: 'tracking', label: 'Seguimiento', shortLabel: 'Seguir', icon: Activity },
        { id: 'reports', label: 'Reportes', shortLabel: 'Reportes', icon: BarChart2 },
        { id: 'driver', label: 'Conductores', shortLabel: 'Conductor', icon: Smartphone },
        ...(canManageUsers
          ? [{ id: 'users', label: 'Usuarios', shortLabel: 'Usuarios', icon: ShieldCheck }]
          : []),
      ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setIsDrawerOpen(false);
  };

  const handleBackAction = () => {
    if (onGoBack) {
      onGoBack();
    } else if (!isConductor && currentView !== 'home') {
      onViewChange('home');
    } else {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleHomeAction = () => {
    if (onGoHome) {
      onGoHome();
    } else if (!isConductor) {
      onViewChange('home');
    } else {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsDrawerOpen(false);
  };

  const lockedGroupName = lockedWorkGroupId
    ? state.workGroups.find(wg => wg.id === lockedWorkGroupId)?.name || lockedWorkGroupId
    : null;

  const currentNavItem = navItems.find(i => i.id === currentView);
  const currentViewLabel = currentNavItem?.label || (currentView === 'home' ? 'Menú Principal' : 'Operación');

  const DeviceIcon = device.isMobile ? Smartphone : device.isTablet ? Tablet : Monitor;

  const contentActions: LayoutContentActions = {
    openSyncModal: () => setShowSyncModal(true),
    openSettings: () => setShowSettings(true),
    scrollToTop: () => contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
  };

  const showBackButtonInHeader = isTouchLayout && (canGoBack || (!isConductor && currentView !== 'home'));
  const showHomeButtonInHeader = isTouchLayout && !isConductor && currentView !== 'home';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Touch / Mobile / Tablet Drawer Overlay */}
      {isDrawerOpen && (
        <div
          className={`fixed inset-0 bg-slate-900/50 z-50 transition-opacity ${device.isDesktop ? 'hidden' : ''}`}
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Navigation Sidebar (Desktop auto-expanding rail / Touch slide-over drawer) */}
      <aside
        onMouseEnter={() => {
          if (device.isDesktop) setIsSidebarHovered(true);
        }}
        onMouseLeave={() => {
          if (device.isDesktop) setIsSidebarHovered(false);
        }}
        onFocus={() => {
          if (device.isDesktop) setIsSidebarHovered(true);
        }}
        onBlur={e => {
          if (device.isDesktop && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsSidebarHovered(false);
          }
        }}
        className={`fixed inset-y-0 left-0 z-50 bg-slate-900 border-r border-slate-800 flex flex-col transition-[width,transform,box-shadow] duration-200 ease-out ${
          device.isDesktop
            ? `translate-x-0 ${
                isSidebarPinned
                  ? 'relative w-64'
                  : isSidebarHovered
                    ? 'w-64 shadow-2xl'
                    : 'w-16'
              }`
            : `${isDrawerOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full w-72'}`
        }`}
      >
        {/* Brand Header + Pin / Close Toggle */}
        <div
          className={`border-b border-slate-800 flex items-center ${
            isSidebarExpanded ? 'p-4 justify-between' : 'py-4 px-2 justify-center'
          }`}
        >
          {isSidebarExpanded ? (
            <>
              <div className="min-w-0">
                <PromoambientalLogo variant="full" theme="dark" size="sm" />
              </div>
              {device.isDesktop ? (
                <button
                  type="button"
                  onClick={() => setIsSidebarPinned(p => !p)}
                  title={isSidebarPinned ? 'Activar auto-despliegue al pasar el cursor' : 'Fijar menú lateral abierto'}
                  className={`flex p-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
                    isSidebarPinned
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {isSidebarPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Cerrar menú"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsSidebarPinned(true)}
              title="Desplegar y fijar menú de módulos"
              className="flex flex-col items-center gap-1 group"
            >
              <PromoEmblem size={34} />
              <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </button>
          )}
        </div>

        {/* User Identity Card */}
        {user && isSidebarExpanded && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.fullName || user.username}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">@{user.username}</p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-emerald-300">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <DeviceIcon className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>{device.deviceLabel} · {device.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</span>
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

        {user && !isSidebarExpanded && (
          <div
            title={`${user.fullName || user.username} (@${user.username}) · ${ROLE_LABELS[user.role]}${lockedGroupName ? ` · Grupo ${lockedGroupName}` : ''}`}
            className="mx-auto mt-3 h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-300 uppercase shrink-0"
          >
            {(user.fullName || user.username).slice(0, 2)}
          </div>
        )}

        <nav className={`flex-1 py-4 space-y-1.5 overflow-y-auto ${isSidebarExpanded ? 'px-3' : 'px-2'}`}>
          {navItems.map(item => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                title={!isSidebarExpanded ? item.label : undefined}
                className={`w-full flex items-center rounded-lg transition-colors duration-150 whitespace-nowrap ${
                  isTouchLayout ? 'min-h-[44px]' : ''
                } ${
                  isSidebarExpanded ? 'space-x-3 px-3.5 py-2.5 justify-start' : 'px-0 py-2.5 justify-center'
                } ${
                  isActive
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-amber-300' : ''}`} />
                {isSidebarExpanded && <span className="truncate text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Touch Group Filter & Bottom Controls */}
        <div className={`border-t border-slate-800 space-y-2 ${isSidebarExpanded ? 'p-3' : 'p-2'}`}>
          {!isConductor && state.workGroups.length > 0 && isSidebarExpanded && isTouchLayout && (
            <div className="flex flex-col space-y-1 mb-2 bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <label className="text-[11px] font-semibold text-slate-400">
                Grupo Operativo Actual
              </label>
              {lockedWorkGroupId ? (
                <div className="flex items-center gap-2 bg-slate-900 text-amber-300 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-bold">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lockedGroupName}</span>
                </div>
              ) : (
                <select
                  value={state.activeWorkGroupId || ''}
                  onChange={e => setActiveWorkGroup(e.target.value || null)}
                  className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 w-full min-h-[40px]"
                >
                  <option value="">Todos los grupos</option>
                  {state.workGroups.map(wg => (
                    <option key={wg.id} value={wg.id}>
                      {wg.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {!isConductor && (
            isSidebarExpanded ? (
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setShowSyncModal(true);
                }}
                className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2.5 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <div className={`h-2 w-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs font-semibold text-slate-200">
                      {syncStatus.isOnline ? `Nube Activa (${syncStatus.latencyInterval}s)` : 'Modo Local'}
                    </span>
                  </div>
                  <Radio className="h-3.5 w-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {syncStatus.deviceId} · v{syncStatus.serverVersion}
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSyncModal(true)}
                title={syncStatus.isOnline ? `Nube Activa (${syncStatus.latencyInterval}s)` : 'Modo Local'}
                className="w-full flex items-center justify-center py-2.5 rounded-lg bg-slate-800/70 text-emerald-400 hover:bg-slate-800 transition-colors"
              >
                <Radio className={`h-4 w-4 ${syncStatus.isOnline ? 'text-emerald-400' : 'text-red-400'}`} />
              </button>
            )
          )}

          {canAccessSystemConfig && (
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setShowSettings(true);
              }}
              title={!isSidebarExpanded ? 'Configuración' : undefined}
              className={`w-full flex items-center rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap ${
                isTouchLayout ? 'min-h-[44px]' : ''
              } ${
                isSidebarExpanded ? 'space-x-3 px-3.5 py-2 justify-start' : 'py-2.5 justify-center'
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {isSidebarExpanded && <span>Configuración</span>}
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            title={!isSidebarExpanded ? 'Cerrar Sesión' : undefined}
            className={`w-full flex items-center rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors whitespace-nowrap ${
              isTouchLayout ? 'min-h-[44px]' : ''
            } ${
              isSidebarExpanded ? 'space-x-3 px-3.5 py-2 justify-start' : 'py-2.5 justify-center'
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {isSidebarExpanded && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 flex flex-col overflow-hidden transition-[padding] duration-200 ${
          device.isDesktop && !isSidebarPinned ? 'pl-16' : ''
        }`}
      >
        <header
          className={`bg-white border-b border-slate-200 flex items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 shrink-0 ${
            device.isMobile ? 'h-[52px]' : device.isTablet ? 'h-14' : 'h-16'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {isTouchLayout && (
              <>
                {showBackButtonInHeader && (
                  <button
                    type="button"
                    onClick={handleBackAction}
                    aria-label="Regresar"
                    title="Atrás"
                    className="min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 text-xs font-semibold transition-all shrink-0 whitespace-nowrap"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Atrás</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  aria-label="Abrir menú de módulos"
                  title="Menú de módulos"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-xl shrink-0"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </>
            )}

            <div className="flex items-center space-x-2.5 min-w-0">
              {isTouchLayout && (
                <div className="hidden sm:block shrink-0">
                  <PromoEmblem size={32} />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base lg:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-1.5 truncate">
                  <span className="truncate">
                    {device.isMobile ? currentViewLabel : 'Promoambiental Distrito'}
                  </span>
                  {!device.isMobile && (
                    <span className="text-slate-400 text-xs lg:text-sm font-normal truncate">
                      / {currentViewLabel}
                    </span>
                  )}
                </h1>
                {device.isDesktop && (
                  <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest mt-0.5 truncate">
                    S.A.S. ESP · Sistema Central de Despacho y Operaciones
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-sm text-slate-500 shrink-0">
            {showHomeButtonInHeader && (
              <button
                type="button"
                onClick={handleHomeAction}
                title="Regresar al Menú Principal"
                className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Home className="h-4 w-4 shrink-0" />
                <span>{device.isMobile ? 'Menú' : 'Menú Principal'}</span>
              </button>
            )}

            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap"
              title={`Dispositivo detectado: ${device.deviceLabel} (${device.viewportWidth}x${device.viewportHeight})`}
            >
              <DeviceIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{device.deviceLabel}</span>
            </div>

            <DigitalClock />

            {!isConductor && (
              <button
                type="button"
                onClick={() => setShowSyncModal(true)}
                title="Abrir diagnóstico y protocolo de sincronización"
                className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all min-h-[38px] whitespace-nowrap shrink-0 ${
                  syncStatus.isOnline
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="hidden md:inline">
                  {syncStatus.isOnline ? `Sync: ${syncStatus.latencyInterval}s` : 'Local'}
                </span>
                <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {!isConductor && state.workGroups.length > 0 && device.isDesktop && (
              <div className="hidden md:flex items-center bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
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
                    {state.workGroups.map(wg => (
                      <option key={wg.id} value={wg.id}>
                        {wg.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {canAccessSystemConfig && state.backupEmail && device.isDesktop && (
              <div className="hidden xl:flex items-center space-x-1.5 text-xs text-slate-500">
                <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                <span>Backup: {state.lastBackupDate ? new Date(state.lastBackupDate).toLocaleTimeString() : 'Auto'}</span>
              </div>
            )}
          </div>
        </header>

        <div
          ref={contentScrollRef}
          className={`flex-1 overflow-y-auto overscroll-y-contain touch-pan-y p-3 sm:p-4 md:p-6 ${
            isTouchLayout ? 'pb-20' : ''
          }`}
        >
          {renderContent ? renderContent(contentActions) : children}
        </div>
      </main>

      {/* Adaptive Touch Navigation Bar (Celular & Tablet) */}
      {isTouchLayout && (
        <nav
          aria-label="Navegación rápida del dispositivo"
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        >
          {device.isMobile ? (
            isConductor ? (
              <div className="grid grid-cols-3 items-center h-14 px-2">
                <button
                  type="button"
                  onClick={handleBackAction}
                  className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-700 hover:text-emerald-700 active:scale-95 transition-all whitespace-nowrap"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Atrás</span>
                </button>
                <button
                  type="button"
                  onClick={handleHomeAction}
                  className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-emerald-700 font-semibold active:scale-95 transition-all whitespace-nowrap"
                >
                  <Home className="h-5 w-5" />
                  <span className="text-[11px]">Inicio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-700 hover:text-emerald-700 active:scale-95 transition-all whitespace-nowrap"
                >
                  <Menu className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Opciones</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 items-center h-14 px-1">
                <button
                  type="button"
                  onClick={handleBackAction}
                  disabled={!canGoBack && currentView === 'home'}
                  className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all whitespace-nowrap ${
                    !canGoBack && currentView === 'home'
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-700 hover:text-emerald-700'
                  }`}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Atrás</span>
                </button>

                <button
                  type="button"
                  onClick={handleHomeAction}
                  className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all whitespace-nowrap ${
                    currentView === 'home' ? 'text-emerald-700 font-bold' : 'text-slate-700 hover:text-emerald-700'
                  }`}
                >
                  <Home className="h-5 w-5" />
                  <span className="text-[11px]">Menú</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNav('tracking')}
                  className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all whitespace-nowrap ${
                    currentView === 'tracking' ? 'text-emerald-700 font-bold' : 'text-slate-700 hover:text-emerald-700'
                  }`}
                >
                  <Activity className="h-5 w-5" />
                  <span className="text-[11px]">Seguimiento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-700 hover:text-emerald-700 active:scale-95 transition-all whitespace-nowrap"
                >
                  <LayoutGrid className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Módulos</span>
                </button>
              </div>
            )
          ) : (
            /* Tablet Quick Navigation Bar */
            <div className="flex items-center justify-between gap-2 h-14 px-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleBackAction}
                  disabled={!canGoBack && (isConductor || currentView === 'home')}
                  className={`min-h-[42px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    !canGoBack && (isConductor || currentView === 'home')
                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  <span>Atrás</span>
                </button>

                {!isConductor && (
                  <button
                    type="button"
                    onClick={handleHomeAction}
                    className={`min-h-[42px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      currentView === 'home'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    <Home className="h-4 w-4 shrink-0" />
                    <span>Menú Principal</span>
                  </button>
                )}
              </div>

              {!isConductor && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  {navItems
                    .filter(item => item.id !== 'home')
                    .map(item => {
                      const isActive = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNav(item.id)}
                          className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-slate-900 text-white font-semibold'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.shortLabel}</span>
                        </button>
                      );
                    })}
                </div>
              )}

              {isConductor && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleHomeAction}
                    className="min-h-[42px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Home className="h-4 w-4 shrink-0" />
                    <span>Inicio Turno</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="min-h-[42px] px-3 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Menu className="h-4 w-4 shrink-0" />
                    <span>Opciones</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      )}

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
                  onChange={e => setEmailInput(e.target.value)}
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
                  onClick={() => {
                    setShowSettings(false);
                    setShowSyncModal(true);
                  }}
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
