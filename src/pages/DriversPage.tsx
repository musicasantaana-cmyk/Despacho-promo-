import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Flag,
  CheckCircle2,
  Home,
  AlertTriangle,
  ClipboardCheck,
  Clock,
  Truck,
  User,
  Layers,
  RotateCcw,
  Download,
  History,
  Navigation,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DriverShift } from '../types';
import { exportToCsv } from '../utils/exportCsv';

function formatTimeHHMMSS(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDurationMs(ms?: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function formatDurationReadable(ms?: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const totalMins = Math.round(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins} min`;
  return `${hrs} h ${mins} min`;
}

const PREOP_CHECKLIST_ITEMS = [
  'Revisión de llantas, presión y espárragos',
  'Verificación de frenos de servicio y parqueo',
  'Luces principales, direccionales y alarma de reversa',
  'Niveles de aceite, refrigerante y combustible',
  'Documentación del vehículo y kit de carretera',
];

export const DriversPage: React.FC = () => {
  const {
    state,
    startDriverShift,
    confirmDriverChecklist,
    markDriverRouteStart,
    markDriverRouteEnd,
    markDriverBaseArrival,
  } = useAppContext();
  const { user, isSupervisor, isConductor, lockedWorkGroupId } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'field' | 'history'>('field');

  // Flow A: Initial Driver Setup
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    if (lockedWorkGroupId) return lockedWorkGroupId;
    if (user?.workGroupId) return user.workGroupId;
    return state.activeWorkGroupId || '';
  });
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [showAllRolesInGroup, setShowAllRolesInGroup] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Active Shift tracking (persisted across reloads)
  const shiftStorageKey = `PROMO_ACTIVE_DRIVER_SHIFT_${user?.username || 'default'}`;
  const [activeShiftId, setActiveShiftId] = useState<string | null>(() => {
    return localStorage.getItem(shiftStorageKey);
  });

  // Mandatory Pre-Operational Checklist Modal
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // History filter (for non-conductor roles)
  const [historyDate, setHistoryDate] = useState<string>(new Date().toLocaleDateString('en-CA'));

  // Live 1s clock for running timers
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync default group if workGroups load or supervisor lock applies
  useEffect(() => {
    if (isSupervisor && lockedWorkGroupId) {
      setSelectedGroupId(lockedWorkGroupId);
      return;
    }
    if (!selectedGroupId) {
      if (user?.workGroupId && state.workGroups.some((g) => g.id === user.workGroupId)) {
        setSelectedGroupId(user.workGroupId);
      } else if (state.activeWorkGroupId) {
        setSelectedGroupId(state.activeWorkGroupId);
      } else if (state.workGroups.length > 0) {
        setSelectedGroupId(state.workGroups[0].id);
      }
    }
  }, [isSupervisor, lockedWorkGroupId, user?.workGroupId, state.activeWorkGroupId, state.workGroups, selectedGroupId]);

  // Active Shift from Firestore realtime state
  const activeShift: DriverShift | null = useMemo(() => {
    if (!activeShiftId) return null;
    return state.driverShifts.find((s) => s.id === activeShiftId) || null;
  }, [state.driverShifts, activeShiftId]);

  // Keep active shift synced into setup inputs when resuming
  useEffect(() => {
    if (activeShift) {
      setSelectedGroupId(activeShift.workGroupId);
      setSelectedDriverId(activeShift.driverId);
      setVehicleNumber(activeShift.vehicleNumber);
      setSelectedVehicleId(activeShift.vehicleId || null);
      if (activeShift.status === 'en_turno' && !activeShift.checklistConfirmed) {
        setShowChecklistModal(true);
      }
    }
  }, [activeShift?.id, activeShift?.status, activeShift?.checklistConfirmed]);

  // Filtered drivers by selected group
  const groupDrivers = useMemo(() => {
    if (!selectedGroupId) return [];
    const selectedGroup = state.workGroups.find((g) => g.id === selectedGroupId);
    const groupNameLower = selectedGroup?.name?.trim().toLowerCase() || '';

    const inGroup = state.employees.filter((e) => {
      if (e.workGroupId) return e.workGroupId === selectedGroupId;
      return groupNameLower !== '' && (e.workGroup || '').trim().toLowerCase() === groupNameLower;
    });

    if (showAllRolesInGroup) {
      return [...inGroup].sort((a, b) => a.name.localeCompare(b.name));
    }

    const driversOnly = inGroup.filter((e) => (e.role || '').toLowerCase().includes('conductor'));
    return (driversOnly.length > 0 ? driversOnly : inGroup).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.employees, state.workGroups, selectedGroupId, showAllRolesInGroup]);

  // Group operational vehicles for quick-tap convenience
  const groupVehicles = useMemo(() => {
    if (!selectedGroupId) return [];
    return state.vehicles
      .filter((v) => v.workGroupId === selectedGroupId && v.status === 'Operativo')
      .sort((a, b) => (a.internalNumber || '').localeCompare(b.internalNumber || ''));
  }, [state.vehicles, selectedGroupId]);

  const handleGroupChange = (newGroupId: string) => {
    if (isSupervisor || activeShift) return;
    setSelectedGroupId(newGroupId);
    setSelectedDriverId('');
    setVehicleNumber('');
    setSelectedVehicleId(null);
  };

  const handleSelectQuickVehicle = (vehId: string, internalNum: string) => {
    if (activeShift) return;
    setSelectedVehicleId(vehId);
    setVehicleNumber(internalNum);
  };

  const handleVehicleInputChange = (val: string) => {
    if (activeShift) return;
    setVehicleNumber(val);
    const matched = groupVehicles.find(
      (v) => v.internalNumber.trim().toLowerCase() === val.trim().toLowerCase()
    );
    setSelectedVehicleId(matched ? matched.id : null);
  };

  // ── Button 1: Inicio de Turno (T1 + Mandatory Checklist Modal) ─────────────
  const handleStartShift = async () => {
    setActionError('');
    const group = state.workGroups.find((g) => g.id === selectedGroupId);
    const driver = groupDrivers.find((d) => d.id === selectedDriverId);

    if (!group || !driver || !vehicleNumber.trim()) {
      setActionError('Seleccione Grupo Operativo, Nombre del Conductor y Número de Móvil.');
      return;
    }

    setActionLoading(true);
    try {
      const created = await startDriverShift({
        workGroupId: group.id,
        workGroupName: group.name,
        driverId: driver.id,
        driverName: driver.name,
        vehicleNumber: vehicleNumber.trim(),
        vehicleId: selectedVehicleId,
      });
      if (created) {
        localStorage.setItem(shiftStorageKey, created.id);
        setActiveShiftId(created.id);
        setCheckedItems({});
        setShowChecklistModal(true);
      }
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo registrar el inicio de turno.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmChecklist = async () => {
    if (!activeShift) return;
    setActionLoading(true);
    try {
      await confirmDriverChecklist(activeShift.id);
      setShowChecklistModal(false);
    } catch (err: any) {
      setActionError(err?.message || 'Error al confirmar el checklist.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Button 2: Inicio de Ruta (T2) ──────────────────────────────────────────
  const handleRouteStart = async () => {
    if (!activeShift) return;
    setActionError('');
    setActionLoading(true);
    try {
      await markDriverRouteStart(activeShift.id);
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo registrar el inicio de ruta.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Button 3: Fin de Ruta (T3 & Route Execution Calc T3 - T2) ──────────────
  const handleRouteEnd = async () => {
    if (!activeShift) return;
    setActionError('');
    setActionLoading(true);
    try {
      await markDriverRouteEnd(activeShift.id);
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo registrar el fin de ruta.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Button 4: Llegada a Base (T4 & Total Operation Calc T4 - T1) ───────────
  const handleBaseArrival = async () => {
    if (!activeShift) return;
    setActionError('');
    setActionLoading(true);
    try {
      await markDriverBaseArrival(activeShift.id);
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo registrar la llegada a base.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetForNewShift = () => {
    localStorage.removeItem(shiftStorageKey);
    setActiveShiftId(null);
    setVehicleNumber('');
    setSelectedVehicleId(null);
    setActionError('');
    if (!isConductor) {
      setSelectedDriverId('');
    }
  };

  // ── Calculated Live Durations ──────────────────────────────────────────────
  const t1Ms = activeShift?.t1InicioTurno ? new Date(activeShift.t1InicioTurno).getTime() : null;
  const t2Ms = activeShift?.t2InicioRuta ? new Date(activeShift.t2InicioRuta).getTime() : null;
  const t3Ms = activeShift?.t3FinRuta ? new Date(activeShift.t3FinRuta).getTime() : null;
  const t4Ms = activeShift?.t4LlegadaBase ? new Date(activeShift.t4LlegadaBase).getTime() : null;

  const prepDisplacementMs = t1Ms && t2Ms ? Math.max(0, t2Ms - t1Ms) : t1Ms && !t2Ms ? Math.max(0, nowMs - t1Ms) : null;
  const routeExecMs =
    activeShift?.routeExecutionMs !== null && activeShift?.routeExecutionMs !== undefined
      ? activeShift.routeExecutionMs
      : t2Ms && t3Ms
      ? Math.max(0, t3Ms - t2Ms)
      : t2Ms && !t3Ms
      ? Math.max(0, nowMs - t2Ms)
      : null;
  const returnDisplacementMs = t3Ms && t4Ms ? Math.max(0, t4Ms - t3Ms) : t3Ms && !t4Ms ? Math.max(0, nowMs - t3Ms) : null;
  const totalOperationMs =
    activeShift?.totalOperationMs !== null && activeShift?.totalOperationMs !== undefined
      ? activeShift.totalOperationMs
      : t1Ms && t4Ms
      ? Math.max(0, t4Ms - t1Ms)
      : t1Ms
      ? Math.max(0, nowMs - t1Ms)
      : null;

  const isSetupComplete = Boolean(selectedGroupId && selectedDriverId && vehicleNumber.trim());

  const canPressT1 = !activeShift && isSetupComplete && !actionLoading;
  const canPressT2 = Boolean(activeShift && activeShift.status === 'en_turno' && activeShift.checklistConfirmed && !actionLoading);
  const canPressT3 = Boolean(activeShift && activeShift.status === 'en_ruta' && !actionLoading);
  const canPressT4 = Boolean(activeShift && activeShift.status === 'ruta_finalizada' && !actionLoading);

  // Shifts list for today / history
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayDriverShifts = useMemo(() => {
    return state.driverShifts.filter((s) => {
      if (s.date !== todayStr) return false;
      if (isConductor && user?.username) {
        return s.createdByUsername === user.username;
      }
      return true;
    });
  }, [state.driverShifts, todayStr, isConductor, user?.username]);

  const historyShifts = useMemo(() => {
    return state.driverShifts.filter((s) => {
      if (historyDate && s.date !== historyDate) return false;
      if (!isSupervisor && state.activeWorkGroupId && s.workGroupId !== state.activeWorkGroupId) {
        return false;
      }
      return true;
    });
  }, [state.driverShifts, historyDate, isSupervisor, state.activeWorkGroupId]);

  const handleExportShiftsCsv = () => {
    const rows = historyShifts.map((s) => {
      const t1 = new Date(s.t1InicioTurno).getTime();
      const t2 = s.t2InicioRuta ? new Date(s.t2InicioRuta).getTime() : null;
      const t3 = s.t3FinRuta ? new Date(s.t3FinRuta).getTime() : null;
      const t4 = s.t4LlegadaBase ? new Date(s.t4LlegadaBase).getTime() : null;
      return {
        Fecha: s.date,
        Grupo: s.workGroupName,
        Conductor: s.driverName,
        Movil: s.vehicleNumber,
        'T1 Inicio Turno': formatTimeHHMMSS(s.t1InicioTurno),
        'T2 Inicio Ruta': formatTimeHHMMSS(s.t2InicioRuta),
        'T3 Fin Ruta': formatTimeHHMMSS(s.t3FinRuta),
        'T4 Llegada Base': formatTimeHHMMSS(s.t4LlegadaBase),
        'Desplazamiento Ida (min)': t1 && t2 ? Math.round((t2 - t1) / 60000) : '',
        'Ejecucion Ruta T3-T2 (min)':
          s.routeExecutionMs !== null && s.routeExecutionMs !== undefined
            ? Math.round(s.routeExecutionMs / 60000)
            : '',
        'Retorno Base (min)': t3 && t4 ? Math.round((t4 - t3) / 60000) : '',
        'Operacion Total T4-T1 (min)':
          s.totalOperationMs !== null && s.totalOperationMs !== undefined
            ? Math.round(s.totalOperationMs / 60000)
            : '',
        Checklist: s.checklistConfirmed ? 'Confirmado' : 'Pendiente',
        Estado: s.status,
      };
    });
    exportToCsv(`tiempos_conductores_${historyDate || 'todos'}.csv`, rows);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Sub-navigation for Admin / Gestión / Supervisor */}
      {!isConductor && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveSubTab('field')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                activeSubTab === 'field'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Navigation className="w-4 h-4" />
              Control en Campo
            </button>
            <button
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                activeSubTab === 'history'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="w-4 h-4" />
              Historial de Jornadas ({state.driverShifts.length})
            </button>
          </div>
        </div>
      )}

      {(activeSubTab === 'field' || isConductor) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT / MAIN COLUMN: Setup + 4 Sequential Buttons */}
          <div className="lg:col-span-7 space-y-5">
            {/* Step A: Flujo Inicial del Conductor */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Control de Tiempos Operativos
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure su grupo, nombre y número de móvil para registrar la jornada.
                  </p>
                </div>
                {activeShift && (
                  <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                    {activeShift.status === 'completado' ? 'Jornada Finalizada' : 'Jornada Activa'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Grupo Operativo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    1. Grupo Operativo
                  </label>
                  <div className="relative">
                    <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      disabled={isSupervisor || !!activeShift}
                      value={selectedGroupId}
                      onChange={(e) => handleGroupChange(e.target.value)}
                      className="w-full min-h-[48px] pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75"
                    >
                      <option value="">Seleccione grupo...</option>
                      {state.workGroups.map((wg) => (
                        <option key={wg.id} value={wg.id}>
                          {wg.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Nombre del Conductor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      2. Conductor
                    </label>
                    {!activeShift && selectedGroupId && (
                      <button
                        type="button"
                        onClick={() => setShowAllRolesInGroup((prev) => !prev)}
                        className="text-[11px] font-medium text-emerald-700 hover:underline"
                      >
                        {showAllRolesInGroup ? 'Solo conductores' : 'Ver todo el grupo'}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      disabled={!selectedGroupId || !!activeShift}
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full min-h-[48px] pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75"
                    >
                      <option value="">
                        {selectedGroupId ? 'Seleccione su nombre...' : 'Elija grupo primero'}
                      </option>
                      {groupDrivers.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Número de Móvil / Vehículo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    3. Número de Móvil
                  </label>
                  <div className="relative">
                    <Truck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      disabled={!!activeShift}
                      value={vehicleNumber}
                      onChange={(e) => handleVehicleInputChange(e.target.value)}
                      placeholder="Ej. 104 o M-12"
                      className="w-full min-h-[48px] pl-9 pr-3 py-2.5 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75"
                    />
                  </div>
                </div>
              </div>

              {/* Quick-tap vehicle chips for mobile ergonomics */}
              {!activeShift && groupVehicles.length > 0 && (
                <div className="pt-1">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
                    Selección rápida de móvil del grupo:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {groupVehicles.slice(0, 12).map((v) => {
                      const isPicked =
                        vehicleNumber.trim().toLowerCase() ===
                        (v.internalNumber || v.plate).trim().toLowerCase();
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleSelectQuickVehicle(v.id, v.internalNumber || v.plate)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                            isPicked
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {v.internalNumber || v.plate}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}
            </section>

            {/* Step B: Secuencia Principal de Tiempos (4 Botones Secuenciales) */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Secuencia de Jornada
                </h3>
                <span className="font-mono tabular-nums text-sm font-bold text-slate-700">
                  {new Date(nowMs).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Botón 1: Inicio de Turno (T1) */}
                <button
                  type="button"
                  disabled={!canPressT1}
                  onClick={handleStartShift}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                    activeShift?.t1InicioTurno
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : canPressT1
                      ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white shadow-sm'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold opacity-85">Paso 1 · T1</div>
                    <div className="text-base font-bold">Inicio de Turno</div>
                    {activeShift?.t1InicioTurno && (
                      <div className="text-xs font-mono tabular-nums mt-0.5">
                        Registrado: {formatTimeHHMMSS(activeShift.t1InicioTurno)}
                      </div>
                    )}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                    {activeShift?.t1InicioTurno ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-700" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Botón 2: Inicio de Ruta (T2) */}
                <button
                  type="button"
                  disabled={!canPressT2}
                  onClick={handleRouteStart}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                    activeShift?.t2InicioRuta
                      ? 'bg-blue-50 border-blue-300 text-blue-950'
                      : canPressT2
                      ? 'bg-blue-600 hover:bg-blue-700 border-blue-700 text-white shadow-sm'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold opacity-85">Paso 2 · T2</div>
                    <div className="text-base font-bold">Inicio de Ruta</div>
                    {activeShift?.t2InicioRuta && (
                      <div className="text-xs font-mono tabular-nums mt-0.5">
                        Registrado: {formatTimeHHMMSS(activeShift.t2InicioRuta)}
                      </div>
                    )}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                    {activeShift?.t2InicioRuta ? (
                      <CheckCircle2 className="w-6 h-6 text-blue-700" />
                    ) : (
                      <Navigation className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Botón 3: Fin de Ruta (T3) */}
                <button
                  type="button"
                  disabled={!canPressT3}
                  onClick={handleRouteEnd}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                    activeShift?.t3FinRuta
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : canPressT3
                      ? 'bg-amber-600 hover:bg-amber-700 border-amber-700 text-white shadow-sm'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold opacity-85">Paso 3 · T3</div>
                    <div className="text-base font-bold">Fin de Ruta</div>
                    {activeShift?.t3FinRuta && (
                      <div className="text-xs font-mono tabular-nums mt-0.5">
                        Registrado: {formatTimeHHMMSS(activeShift.t3FinRuta)}
                      </div>
                    )}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                    {activeShift?.t3FinRuta ? (
                      <CheckCircle2 className="w-6 h-6 text-amber-700" />
                    ) : (
                      <Flag className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Botón 4: Llegada a Base (T4) */}
                <button
                  type="button"
                  disabled={!canPressT4}
                  onClick={handleBaseArrival}
                  className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                    activeShift?.t4LlegadaBase
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : canPressT4
                      ? 'bg-slate-900 hover:bg-slate-800 border-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold opacity-85">Paso 4 · T4</div>
                    <div className="text-base font-bold">Llegada a Base</div>
                    {activeShift?.t4LlegadaBase && (
                      <div className="text-xs font-mono tabular-nums mt-0.5">
                        Registrado: {formatTimeHHMMSS(activeShift.t4LlegadaBase)}
                      </div>
                    )}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    {activeShift?.t4LlegadaBase ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <Home className="w-5 h-5" />
                    )}
                  </div>
                </button>
              </div>

              {/* Reminder banner if checklist wasn't confirmed yet */}
              {activeShift && !activeShift.checklistConfirmed && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Debe confirmar el Checklist Preoperacional antes de iniciar ruta.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChecklistModal(true)}
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
                  >
                    Abrir Checklist
                  </button>
                </div>
              )}

              {/* Reset CTA once journey is completed */}
              {activeShift?.status === 'completado' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetForNewShift}
                    className="w-full min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Iniciar Nueva Jornada
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN: Automatic Time Calculations & Timeline */}
          <div className="lg:col-span-5 space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cálculos Automáticos de Jornada
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeShift
                    ? `${activeShift.workGroupName} · ${activeShift.driverName} · Móvil ${activeShift.vehicleNumber}`
                    : 'Inicie turno para visualizar los tiempos en vivo'}
                </p>
              </div>

              {/* Primary Calculated KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-600">
                    Tiempo Total de Ejecución de Ruta (T3 − T2)
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                      {formatDurationMs(routeExecMs)}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {formatDurationReadable(routeExecMs)}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 text-white">
                  <div className="text-xs font-semibold text-slate-300">
                    Tiempo Total de Operación (T4 − T1)
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="font-mono tabular-nums text-2xl font-bold text-white">
                      {formatDurationMs(totalOperationMs)}
                    </span>
                    <span className="text-xs font-medium text-emerald-400">
                      {formatDurationReadable(totalOperationMs)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Incluye desplazamiento ida + ejecución de ruta + retorno a base.
                  </p>
                </div>
              </div>

              {/* Segment Breakdown */}
              <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2 text-sm">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">1. Inicio de Turno (T1)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatTimeHHMMSS(activeShift?.t1InicioTurno)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Desplazamiento Base → Ruta (T2 − T1)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {formatDurationMs(prepDisplacementMs)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">2. Inicio de Ruta (T2)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatTimeHHMMSS(activeShift?.t2InicioRuta)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">3. Fin de Ruta (T3)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatTimeHHMMSS(activeShift?.t3FinRuta)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Retorno Ruta → Base (T4 − T3)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {formatDurationMs(returnDisplacementMs)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">4. Llegada a Base (T4)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatTimeHHMMSS(activeShift?.t4LlegadaBase)}
                  </span>
                </div>
              </div>
            </section>

            {/* Compact Today's Shifts List */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {isConductor ? 'Mis Jornadas de Hoy' : 'Jornadas Registradas Hoy'}
                </h3>
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {todayDriverShifts.length} reg.
                </span>
              </div>
              {todayDriverShifts.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Aún no hay jornadas registradas el día de hoy.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {todayDriverShifts.slice(0, 6).map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        if (s.id !== activeShiftId && s.status !== 'completado') {
                          localStorage.setItem(shiftStorageKey, s.id);
                          setActiveShiftId(s.id);
                        }
                      }}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 px-2 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {s.driverName} · Móvil {s.vehicleNumber}
                        </div>
                        <div className="text-slate-500 font-mono tabular-nums">
                          {s.workGroupName} · T1 {formatTimeHHMMSS(s.t1InicioTurno)}
                          {s.t4LlegadaBase ? ` → T4 ${formatTimeHHMMSS(s.t4LlegadaBase)}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        {s.totalOperationMs !== null && s.totalOperationMs !== undefined ? (
                          <span className="font-bold text-emerald-700">
                            {formatDurationReadable(s.totalOperationMs)}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold">En curso</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* HISTORY TAB (Admin / Gestión / Supervisor only) */}
      {!isConductor && activeSubTab === 'history' && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Historial de Tiempos de Conductores
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Registros cronológicos de inicio de turno (T1), ruta (T2-T3) y llegada a base (T4).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                onClick={handleExportShiftsCsv}
                disabled={historyShifts.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Exportar CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Conductor</th>
                  <th className="px-4 py-3">Móvil</th>
                  <th className="px-4 py-3">T1 Turno</th>
                  <th className="px-4 py-3">T2 Inicio Ruta</th>
                  <th className="px-4 py-3">T3 Fin Ruta</th>
                  <th className="px-4 py-3">T4 Base</th>
                  <th className="px-4 py-3 text-right">Ejecución (T3−T2)</th>
                  <th className="px-4 py-3 text-right">Operación (T4−T1)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyShifts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      No existen registros de conductores para la fecha seleccionada.
                    </td>
                  </tr>
                ) : (
                  historyShifts.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-700">{s.date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{s.workGroupName}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.driverName}</td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{s.vehicleNumber}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs">{formatTimeHHMMSS(s.t1InicioTurno)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs">{formatTimeHHMMSS(s.t2InicioRuta)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs">{formatTimeHHMMSS(s.t3FinRuta)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs">{formatTimeHHMMSS(s.t4LlegadaBase)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatDurationReadable(s.routeExecutionMs)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatDurationReadable(s.totalOperationMs)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MANDATORY PRE-OPERATIONAL CHECKLIST MODAL (Triggered on Botón 1 - Inicio de Turno) */}
      {showChecklistModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-5 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Checklist Preoperacional Obligatorio
                </h3>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                  Turno iniciado a las{' '}
                  <span className="font-mono font-bold">
                    {formatTimeHHMMSS(activeShift.t1InicioTurno)}
                  </span>
                  . Recuerde realizar el <strong>Checklist preoperacional del vehículo</strong> antes de iniciar marcha.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="text-xs font-semibold text-slate-600">
                Verificación sugerida para Móvil {activeShift.vehicleNumber}:
              </div>
              <div className="space-y-2">
                {PREOP_CHECKLIST_ITEMS.map((item, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedItems[idx]}
                      onChange={(e) =>
                        setCheckedItems((prev) => ({ ...prev, [idx]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-emerald-600 rounded shrink-0"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmChecklist}
                className="w-full min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Confirmando...' : 'He realizado / Recordado el Checklist — Continuar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
