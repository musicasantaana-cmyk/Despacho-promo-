import React from 'react';
import {
  Truck,
  Map,
  Activity,
  BarChart2,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Monitor,
  Tablet,
  Lock,
  Radio,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DeviceInfo } from '../hooks/useDeviceType';
import { UserRole } from '../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  gestion: 'Admin. Gestión',
  supervisor: 'Supervisor',
  conductor: 'Conductor',
};

interface HomeMenuPageProps {
  device: DeviceInfo;
  onNavigate: (view: string) => void;
  onOpenSync?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const HomeMenuPage: React.FC<HomeMenuPageProps> = ({
  device,
  onNavigate,
  onOpenSync,
  onOpenSettings,
  onLogout,
}) => {
  const { state, syncStatus, setActiveWorkGroup } = useAppContext();
  const { user, canManageUsers, canAccessSystemConfig, isConductor, lockedWorkGroupId } = useAuth();

  const lockedGroupName = lockedWorkGroupId
    ? state.workGroups.find(wg => wg.id === lockedWorkGroupId)?.name || lockedWorkGroupId
    : null;

  const DeviceIcon =
    device.isMobile ? Smartphone : device.isTablet ? Tablet : Monitor;

  const modules = isConductor
    ? [
        {
          id: 'driver',
          title: 'Módulo de Conductores',
          description: 'Registro de jornada operativa, checklist, descargas y novedades.',
          icon: Smartphone,
          accent: 'bg-emerald-50 text-emerald-700',
        },
      ]
    : [
        {
          id: 'tracking',
          title: 'Seguimiento en Vivo',
          description: 'Monitoreo de asignaciones, tiempos en ruta y novedades activas.',
          icon: Activity,
          accent: 'bg-emerald-50 text-emerald-700',
        },
        {
          id: 'reports',
          title: 'Reportes y Tablero',
          description: 'Tablero en vivo, asistencia, flota, turnos y exportación.',
          icon: BarChart2,
          accent: 'bg-amber-50 text-amber-700',
        },
        {
          id: 'assign',
          title: 'Asignación de Rutas',
          description: 'Programar recorridos diarios, vehículos y cuadrillas.',
          icon: Map,
          accent: 'bg-sky-50 text-sky-700',
        },
        {
          id: 'admin',
          title: 'Administración',
          description: 'Gestión de empleados, vehículos, rutas, fichas PDF y grupos.',
          icon: Truck,
          accent: 'bg-slate-100 text-slate-700',
        },
        {
          id: 'driver',
          title: 'Vista Conductores',
          description: 'Consola móvil de tiempos operativos, checklist y novedades.',
          icon: Smartphone,
          accent: 'bg-teal-50 text-teal-700',
        },
        ...(canManageUsers
          ? [
              {
                id: 'users',
                title: 'Usuarios y Roles',
                description: 'Cuentas de acceso, permisos y asignación de grupos.',
                icon: ShieldCheck,
                accent: 'bg-indigo-50 text-indigo-700',
              },
            ]
          : []),
      ];

  const gridClass = device.isMobile
    ? 'grid-cols-1 gap-3'
    : device.isTablet
      ? 'grid-cols-2 gap-4'
      : 'grid-cols-3 gap-4';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header & Adaptive Device Summary */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <DeviceIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Modo {device.deviceLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{device.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{device.viewportWidth}px</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
              Menú Principal
            </h2>
            {user && (
              <p className="text-sm text-slate-600 mt-0.5 truncate">
                {user.fullName || user.username} · {ROLE_LABELS[user.role]}
              </p>
            )}
          </div>

          {!isConductor && state.workGroups.length > 0 && (
            <div className="sm:w-64 shrink-0">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Grupo Operativo
              </label>
              {lockedWorkGroupId ? (
                <div className="min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm font-semibold text-slate-800">
                  <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="truncate">{lockedGroupName}</span>
                </div>
              ) : (
                <select
                  value={state.activeWorkGroupId || ''}
                  onChange={e => setActiveWorkGroup(e.target.value || null)}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
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
        </div>
      </section>

      {/* Module Navigation Grid */}
      <section aria-label="Módulos del sistema">
        <div className={`grid ${gridClass}`}>
          {modules.map(mod => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onNavigate(mod.id)}
                className="group w-full min-h-[88px] text-left bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <div
                  className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${mod.accent}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                    {mod.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 line-clamp-2 mt-0.5">
                    {mod.description}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Quick System Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {!isConductor && onOpenSync && (
          <button
            type="button"
            onClick={onOpenSync}
            className="min-h-[48px] px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-sm font-medium text-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 truncate">
              <Radio
                className={`h-4 w-4 shrink-0 ${syncStatus.isOnline ? 'text-emerald-600' : 'text-red-500'}`}
              />
              <span className="truncate">
                {syncStatus.isOnline ? 'Estado de Sincronización' : 'Modo Local'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        )}

        {canAccessSystemConfig && onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[48px] px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-sm font-medium text-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 truncate">
              <Settings className="h-4 w-4 text-slate-600 shrink-0" />
              <span className="truncate">Configuración del Sistema</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        )}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[48px] px-4 py-3 bg-white border border-slate-200 hover:border-red-300 hover:text-red-600 rounded-xl flex items-center justify-between text-sm font-medium text-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 truncate">
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="truncate">Cerrar Sesión</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        )}
      </section>
    </div>
  );
};
