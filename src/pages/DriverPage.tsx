import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Flag,
  Home,
  PauseCircle,
  PlayCircle,
  Wrench,
  CheckCircle2,
  Clock,
  Truck,
  UserCheck,
  Layers,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DriverShift } from '../types';
import {
  startDriverShiftApi,
  confirmChecklistApi,
  startRouteApi,
  endRouteApi,
  arriveBaseApi,
  startRefillApi,
  endRefillApi,
  startBreakdownApi,
  endBreakdownApi,
} from '../lib/api';

function formatElapsed(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function formatClock(iso?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDurationMinutes(mins?: number | null): string {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m (${mins} min)` : `${m} min`;
}

export const DriverPage: React.FC = () => {
  const { state } = useAppContext();
  const { user, lockedWorkGroupId } = useAuth();

  // Initial setup form state
  const [selectedGroupId, setSelectedGroupId] = useState<string>(lockedWorkGroupId || state.activeWorkGroupId || '');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(user?.employeeId || '');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [showAllRolesInGroup, setShowAllRolesInGroup] = useState(false);

  // Active shift tracking
  const [activeShift, setActiveShift] = useState<DriverShift | null>(null);
  const [completedShiftSummary, setCompletedShiftSummary] = useState<DriverShift | null>(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistItems, setChecklistItems] = useState({
    brakesTires: false,
    lightsSignals: false,
    fluidsLeaks: false,
    docsSafety: false,
  });
  const [breakdownNote, setBreakdownNote] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  // 1-second live chronometer tick
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep selectedGroupId synced with locked group or default group
  useEffect(() => {
    if (lockedWorkGroupId) {
      setSelectedGroupId(lockedWorkGroupId);
    } else if (!selectedGroupId && state.workGroups.length > 0) {
      setSelectedGroupId(state.activeWorkGroupId || state.workGroups[0].id);
    }
  }, [lockedWorkGroupId, state.activeWorkGroupId, state.workGroups, selectedGroupId]);

  // Preselect employeeId if linked to user
  useEffect(() => {
    if (user?.employeeId && !selectedDriverId) {
      setSelectedDriverId(user.employeeId);
    }
  }, [user?.employeeId, selectedDriverId]);

  // Automatically restore any open (not EN_BASE) shift for this user from Firestore realtime state
  useEffect(() => {
    if (!user) return;
    const openShift = state.driverShifts.find(
      s => s.status !== 'EN_BASE' && (s.createdByUserId === user.id || (user.employeeId && s.driverId === user.employeeId))
    );
    if (openShift) {
      setActiveShift(openShift);
      if (!openShift.checklistConfirmed) {
        setShowChecklistModal(true);
      }
    }
  }, [state.driverShifts, user]);

  // Filtered employees for selected work group
  const groupEmployees = useMemo(() => {
    if (!selectedGroupId) return [];
    const selectedGroup = state.workGroups.find(wg => wg.id === selectedGroupId);
    const groupNameLower = selectedGroup?.name?.trim().toLowerCase();

    const inGroup = state.employees.filter(e => {
      if (e.workGroupId === selectedGroupId) return true;
      if (!e.workGroupId && e.workGroup && groupNameLower && e.workGroup.trim().toLowerCase() === groupNameLower) {
        return true;
      }
      return false;
    });

    if (showAllRolesInGroup) return inGroup;
    const driversOnly = inGroup.filter(e => (e.role || '').toLowerCase().includes('conductor'));
    return driversOnly.length > 0 ? driversOnly : inGroup;
  }, [state.employees, state.workGroups, selectedGroupId, showAllRolesInGroup]);

  const groupVehicles = useMemo(() => {
    if (!selectedGroupId) return [];
    return state.vehicles.filter(v => v.workGroupId === selectedGroupId && v.status === 'Operativo');
  }, [state.vehicles, selectedGroupId]);

  const selectedDriver = useMemo(
    () => state.employees.find(e => e.id === selectedDriverId) || null,
    [state.employees, selectedDriverId]
  );

  const selectedGroup = useMemo(
    () => state.workGroups.find(g => g.id === selectedGroupId) || null,
    [state.workGroups, selectedGroupId]
  );

  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayCompletedShifts = useMemo(() => {
    return state.driverShifts.filter(s => s.date === todayStr && s.status === 'EN_BASE');
  }, [state.driverShifts, todayStr]);

  // Live timer calculations for active shift
  const liveTimers = useMemo(() => {
    if (!activeShift) return null;
    const t1 = new Date(activeShift.t1StartShiftAt).getTime();
    const t2 = activeShift.t2StartRouteAt ? new Date(activeShift.t2StartRouteAt).getTime() : null;
    const t3 = activeShift.t3EndRouteAt ? new Date(activeShift.t3EndRouteAt).getTime() : null;
    const t4 = activeShift.t4ArriveBaseAt ? new Date(activeShift.t4ArriveBaseAt).getTime() : null;

    const totalOperationMs = (t4 || nowMs) - t1;

    // Active refill timer
    const openRefill = activeShift.isPausedForRefill
      ? activeShift.refillEvents.find(ev => ev.id === activeShift.activeRefillId)
      : null;
    const currentRefillMs = openRefill ? nowMs - new Date(openRefill.startAt).getTime() : 0;

    // Active mechanical breakdown timer
    const openBreakdown = activeShift.isInBreakdown
      ? activeShift.breakdownEvents.find(ev => ev.id === activeShift.activeBreakdownId)
      : null;
    const currentBreakdownMs = openBreakdown ? nowMs - new Date(openBreakdown.startAt).getTime() : 0;

    // Route execution elapsed timer (freezes visually while paused for refill!)
    let routeExecElapsedMs = 0;
    if (t2) {
      const endRef = t3 || (openRefill ? new Date(openRefill.startAt).getTime() : nowMs);
      const closedRefillDuringRouteMs = activeShift.refillEvents.reduce((acc, ev) => {
        if (!ev.endAt) return acc;
        const s = Math.max(new Date(ev.startAt).getTime(), t2);
        const e = Math.min(new Date(ev.endAt).getTime(), t3 || nowMs);
        return e > s ? acc + (e - s) : acc;
      }, 0);
      routeExecElapsedMs = Math.max(0, endRef - t2 - closedRefillDuringRouteMs);
    }

    return {
      totalOperationMs,
      routeExecElapsedMs,
      currentRefillMs,
      currentBreakdownMs,
    };
  }, [activeShift, nowMs]);

  // ── Action Handlers ─────────────────────────────────────────────────────────
  const handleStartShift = async () => {
    setErrorMsg('');
    if (!selectedGroupId) {
      setErrorMsg('Seleccione su Grupo Operativo.');
      return;
    }
    if (!selectedDriver) {
      setErrorMsg('Seleccione su Nombre de Conductor.');
      return;
    }
    const cleanVehicleNumber = vehicleNumber.trim();
    if (!cleanVehicleNumber) {
      setErrorMsg('Ingrese o seleccione el Número de Móvil / Vehículo.');
      return;
    }

    setBusyAction('start');
    try {
      const { shift } = await startDriverShiftApi({
        workGroupId: selectedGroupId,
        workGroupName: selectedGroup?.name || '',
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
        vehicleNumber: cleanVehicleNumber,
        vehicleId: selectedVehicleId || '',
      });
      setCompletedShiftSummary(null);
      setActiveShift(shift);
      setChecklistItems({ brakesTires: false, lightsSignals: false, fluidsLeaks: false, docsSafety: false });
      setShowChecklistModal(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al iniciar turno.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmChecklist = async () => {
    if (!activeShift) return;
    setBusyAction('checklist');
    setErrorMsg('');
    try {
      const { shift } = await confirmChecklistApi(activeShift.id);
      setActiveShift(shift);
      setShowChecklistModal(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al confirmar checklist.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartRoute = async () => {
    if (!activeShift) return;
    setBusyAction('start-route');
    setErrorMsg('');
    try {
      const { shift } = await startRouteApi(activeShift.id);
      setActiveShift(shift);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo iniciar la ruta.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleEndRoute = async () => {
    if (!activeShift) return;
    setBusyAction('end-route');
    setErrorMsg('');
    try {
      const { shift } = await endRouteApi(activeShift.id);
      setActiveShift(shift);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo finalizar la ruta.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleArriveBase = async () => {
    if (!activeShift) return;
    setBusyAction('arrive-base');
    setErrorMsg('');
    try {
      const { shift } = await arriveBaseApi(activeShift.id);
      setActiveShift(null);
      setCompletedShiftSummary(shift);
      setVehicleNumber('');
      setSelectedVehicleId('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo registrar llegada a base.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleRefill = async () => {
    if (!activeShift) return;
    setBusyAction('refill');
    setErrorMsg('');
    try {
      const { shift } = activeShift.isPausedForRefill
        ? await endRefillApi(activeShift.id)
        : await startRefillApi(activeShift.id);
      setActiveShift(shift);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar estado de relleno/descargue.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleBreakdown = async () => {
    if (!activeShift) return;
    setBusyAction('breakdown');
    setErrorMsg('');
    try {
      const { shift } = activeShift.isInBreakdown
        ? await endBreakdownApi(activeShift.id)
        : await startBreakdownApi(activeShift.id, breakdownNote);
      setActiveShift(shift);
      if (!activeShift.isInBreakdown) setBreakdownNote('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar estado de avería mecánica.');
    } finally {
      setBusyAction(null);
    }
  };

  const allChecklistChecked =
    checklistItems.brakesTires &&
    checklistItems.lightsSignals &&
    checklistItems.fluidsLeaks &&
    checklistItems.docsSafety;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Top Hero / Operational Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Módulo Conductores · Control de Tiempos Operativos
            </p>
            <h2 className="text-xl sm:text-2xl font-bold mt-1">
              {activeShift ? `Jornada en Curso — Móvil ${activeShift.vehicleNumber}` : 'Registro de Jornada Operativa'}
            </h2>
            {activeShift && (
              <p className="text-sm text-slate-300 mt-1">
                {activeShift.driverName} · Grupo {activeShift.workGroupName || 'Operativo'}
              </p>
            )}
          </div>

          {activeShift && liveTimers && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-left sm:text-right shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Tiempo Total de Operación
              </span>
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                {formatElapsed(liveTimers.totalOperationMs)}
              </span>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP A: INITIAL DRIVER FLOW (When no shift is active)
      ═══════════════════════════════════════════════════════════════════════ */}
      {!activeShift && !completedShiftSummary && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">1. Configuración Inicial del Turno</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Confirme su grupo operativo, nombre y número de móvil antes de iniciar el turno.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Grupo Operativo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-emerald-600" />
                Grupo Operativo
              </label>
              <select
                value={selectedGroupId}
                disabled={Boolean(lockedWorkGroupId)}
                onChange={e => {
                  setSelectedGroupId(e.target.value);
                  setSelectedDriverId('');
                  setSelectedVehicleId('');
                }}
                className="w-full h-12 border border-slate-300 rounded-xl px-3.5 text-base font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
              >
                <option value="">Seleccione grupo...</option>
                {state.workGroups.map(wg => (
                  <option key={wg.id} value={wg.id}>
                    {wg.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Nombre del Conductor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  Nombre del Conductor
                </label>
                <button
                  type="button"
                  onClick={() => setShowAllRolesInGroup(v => !v)}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  {showAllRolesInGroup ? 'Solo conductores' : 'Ver todo el grupo'}
                </button>
              </div>
              <select
                value={selectedDriverId}
                onChange={e => setSelectedDriverId(e.target.value)}
                disabled={!selectedGroupId}
                className="w-full h-12 border border-slate-300 rounded-xl px-3.5 text-base font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
              >
                <option value="">Seleccione su nombre...</option>
                {groupEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Número de Móvil / Vehículo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-emerald-600" />
                Número de Móvil / Vehículo
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={e => {
                  const val = e.target.value;
                  setVehicleNumber(val);
                  const matched = groupVehicles.find(v => v.internalNumber.toLowerCase() === val.trim().toLowerCase());
                  setSelectedVehicleId(matched ? matched.id : '');
                }}
                placeholder="Ej. 104"
                className="w-full h-12 border border-slate-300 rounded-xl px-3.5 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Quick-pick vehicle chips for touch ergonomics */}
          {groupVehicles.length > 0 && (
            <div>
              <span className="block text-xs font-semibold text-slate-500 mb-2">
                Selección rápida de móvil operativo ({selectedGroup?.name}):
              </span>
              <div className="flex flex-wrap gap-2">
                {groupVehicles.map(v => {
                  const isPicked = vehicleNumber.trim().toLowerCase() === v.internalNumber.toLowerCase();
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVehicleNumber(v.internalNumber);
                        setSelectedVehicleId(v.id);
                      }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                        isPicked
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Móvil {v.internalNumber} · {v.plate}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Primary Action: Botón 1 - Inicio de Turno */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleStartShift}
              disabled={busyAction === 'start' || !selectedGroupId || !selectedDriverId || !vehicleNumber.trim()}
              className="w-full min-h-[60px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl text-lg font-bold flex items-center justify-center gap-3 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Play className="h-6 w-6" />
              {busyAction === 'start' ? 'Registrando Inicio de Turno...' : '1. Inicio de Turno (T1)'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP B & C: ACTIVE SHIFT CHRONOLOGY + ADDITIONAL CONTROLS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeShift && liveTimers && (
        <div className="space-y-5">
          {/* Active Pause / Breakdown Alert Banners */}
          {activeShift.isPausedForRefill && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PauseCircle className="h-7 w-7 text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-950 text-base">
                    Cronómetro Operativo en PAUSA — En Relleno / Descargue
                  </h4>
                  <p className="text-xs text-amber-800">
                    Presione "Fin de Descargue" cuando termine para reanudar el flujo operativo normal.
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-900 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-300 text-center">
                {formatElapsed(liveTimers.currentRefillMs)}
              </div>
            </div>
          )}

          {activeShift.isInBreakdown && (
            <div className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Wrench className="h-7 w-7 text-rose-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-rose-950 text-base">
                    Avería Mecánica Reportada — Vehículo Inoperativo
                  </h4>
                  <p className="text-xs text-rose-800">
                    El tiempo de inoperatividad se está registrando. Reporte "Fin de Avería" cuando el móvil quede operativo.
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-900 bg-rose-100 px-3 py-1.5 rounded-xl border border-rose-300 text-center">
                {formatElapsed(liveTimers.currentBreakdownMs)}
              </div>
            </div>
          )}

          {!activeShift.checklistConfirmed && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-blue-950 text-sm">Checklist Preoperacional Pendiente</h4>
                  <p className="text-xs text-blue-800">Debe confirmar el checklist preoperacional del vehículo antes de iniciar ruta.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChecklistModal(true)}
                className="min-h-[44px] px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shrink-0"
              >
                Abrir Checklist
              </button>
            </div>
          )}

          {/* Timeline Strip (T1 -> T2 -> T3 -> T4) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-700 uppercase block">T1 · Inicio Turno</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                  {formatClock(activeShift.t1StartShiftAt)}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${activeShift.t2StartRouteAt ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">T2 · Inicio Ruta</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                  {formatClock(activeShift.t2StartRouteAt)}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${activeShift.t3EndRouteAt ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">T3 · Fin Ruta</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                  {formatClock(activeShift.t3EndRouteAt)}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${activeShift.t4ArriveBaseAt ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">T4 · Llegada Base</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                  {formatClock(activeShift.t4ArriveBaseAt)}
                </span>
              </div>
            </div>

            {activeShift.t2StartRouteAt && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-600 font-medium">
                  Cronómetro Ejecución de Ruta {activeShift.isPausedForRefill ? '(EN PAUSA)' : ''}:
                </span>
                <span className="font-mono font-bold tabular-nums text-lg text-slate-900">
                  {activeShift.t3EndRouteAt
                    ? formatDurationMinutes(activeShift.routeExecutionMins)
                    : formatElapsed(liveTimers.routeExecElapsedMs)}
                </span>
              </div>
            )}
          </div>

          {/* 4 Sequential Main Buttons */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">
              Secuencia Principal de Jornada
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Button 1: Already Done */}
              <button
                type="button"
                disabled
                className="min-h-[60px] px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 font-bold text-base flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  1. Inicio de Turno (T1)
                </span>
                <span className="font-mono text-sm tabular-nums">{formatClock(activeShift.t1StartShiftAt)}</span>
              </button>

              {/* Button 2: Inicio de Ruta (T2) */}
              <button
                type="button"
                onClick={handleStartRoute}
                disabled={
                  activeShift.status !== 'EN_TURNO' ||
                  !activeShift.checklistConfirmed ||
                  activeShift.isPausedForRefill ||
                  busyAction === 'start-route'
                }
                className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-base flex items-center justify-between transition-all ${
                  activeShift.t2StartRouteAt
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : activeShift.status === 'EN_TURNO' && activeShift.checklistConfirmed && !activeShift.isPausedForRefill
                      ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-md'
                      : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {activeShift.t2StartRouteAt ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Play className="h-5 w-5" />}
                  {busyAction === 'start-route' ? 'Registrando...' : '2. Inicio de Ruta (T2)'}
                </span>
                {activeShift.t2StartRouteAt && (
                  <span className="font-mono text-sm tabular-nums">{formatClock(activeShift.t2StartRouteAt)}</span>
                )}
              </button>

              {/* Button 3: Fin de Ruta (T3) */}
              <button
                type="button"
                onClick={handleEndRoute}
                disabled={
                  activeShift.status !== 'EN_RUTA' ||
                  activeShift.isPausedForRefill ||
                  busyAction === 'end-route'
                }
                className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-base flex items-center justify-between transition-all ${
                  activeShift.t3EndRouteAt
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : activeShift.status === 'EN_RUTA' && !activeShift.isPausedForRefill
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-md'
                      : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {activeShift.t3EndRouteAt ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Flag className="h-5 w-5" />}
                  {busyAction === 'end-route' ? 'Calculando...' : '3. Fin de Ruta (T3)'}
                </span>
                {activeShift.t3EndRouteAt && (
                  <span className="font-mono text-sm tabular-nums">{formatClock(activeShift.t3EndRouteAt)}</span>
                )}
              </button>

              {/* Button 4: Llegada a Base (T4) */}
              <button
                type="button"
                onClick={handleArriveBase}
                disabled={
                  activeShift.status !== 'FIN_RUTA' ||
                  activeShift.isPausedForRefill ||
                  activeShift.isInBreakdown ||
                  busyAction === 'arrive-base'
                }
                className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-base flex items-center justify-between transition-all ${
                  activeShift.status === 'FIN_RUTA' && !activeShift.isPausedForRefill && !activeShift.isInBreakdown
                    ? 'bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white shadow-md'
                    : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Home className="h-5 w-5" />
                  {busyAction === 'arrive-base' ? 'Cerrando Jornada...' : '4. Llegada a Base (T4)'}
                </span>
              </button>
            </div>

            {activeShift.routeExecutionMins !== null && activeShift.routeExecutionMins !== undefined && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap justify-between items-center text-sm">
                <span className="font-semibold text-emerald-900">Tiempo Total de Ejecución de Ruta (T3 - T2):</span>
                <span className="font-bold font-mono tabular-nums text-emerald-800">
                  {formatDurationMinutes(activeShift.routeExecutionMins)}
                  {activeShift.routeExecutionNetMins !== activeShift.routeExecutionMins &&
                    ` · Neto: ${formatDurationMinutes(activeShift.routeExecutionNetMins)}`}
                </span>
              </div>
            )}
          </div>

          {/* C. Independent Novelty / Pause Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Control 5: Tiempo de Relleno / Descargue */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-base">5. Tiempo de Relleno / Descargue</h4>
                  <span className="text-xs font-mono font-bold text-amber-700 tabular-nums">
                    Acum: {activeShift.refillTotalMins} min
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Pausa el punto de ejecución actual al iniciar relleno y lo reanuda al finalizar el descargue.
                </p>
              </div>

              {activeShift.refillEvents.length > 0 && (
                <div className="space-y-1.5 max-h-28 overflow-y-auto text-xs border-t border-slate-100 pt-2">
                  {activeShift.refillEvents.map((ev, idx) => (
                    <div key={ev.id} className="flex justify-between text-slate-600 font-mono tabular-nums">
                      <span>Descargue #{idx + 1}: {formatClock(ev.startAt)} → {ev.endAt ? formatClock(ev.endAt) : 'En curso'}</span>
                      <span className="font-bold">{ev.durationMins !== null ? `${ev.durationMins} min` : 'Activo'}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleToggleRefill}
                disabled={busyAction === 'refill'}
                className={`w-full min-h-[56px] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                  activeShift.isPausedForRefill
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                }`}
              >
                {activeShift.isPausedForRefill ? (
                  <>
                    <PlayCircle className="h-5 w-5" />
                    Fin de Descargue (Reanudar)
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-5 w-5" />
                    Inicio de Relleno (Pausar)
                  </>
                )}
              </button>
            </div>

            {/* Control 6: Avería Mecánica */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-base">6. Avería Mecánica</h4>
                  <span className="text-xs font-mono font-bold text-rose-700 tabular-nums">
                    Inop: {activeShift.mechanicalBreakdownTotalMins} min
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Registra el tiempo total de inoperatividad del móvil por falla mecánica.
                </p>
              </div>

              {!activeShift.isInBreakdown && (
                <input
                  type="text"
                  value={breakdownNote}
                  onChange={e => setBreakdownNote(e.target.value)}
                  placeholder="Detalle opcional de la falla (ej. Llanta / Frenos)"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500"
                />
              )}

              {activeShift.breakdownEvents.length > 0 && (
                <div className="space-y-1.5 max-h-28 overflow-y-auto text-xs border-t border-slate-100 pt-2">
                  {activeShift.breakdownEvents.map((ev, idx) => (
                    <div key={ev.id} className="flex justify-between text-slate-600 font-mono tabular-nums">
                      <span>Avería #{idx + 1}: {formatClock(ev.startAt)} → {ev.endAt ? formatClock(ev.endAt) : 'Activa'}</span>
                      <span className="font-bold">{ev.durationMins !== null ? `${ev.durationMins} min` : 'Activa'}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleToggleBreakdown}
                disabled={busyAction === 'breakdown'}
                className={`w-full min-h-[56px] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                  activeShift.isInBreakdown
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                }`}
              >
                {activeShift.isInBreakdown ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Fin de Avería / Vehículo Operativo
                  </>
                ) : (
                  <>
                    <Wrench className="h-5 w-5" />
                    Reportar Avería Mecánica
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          COMPLETED SHIFT SUMMARY CARD
      ═══════════════════════════════════════════════════════════════════════ */}
      {completedShiftSummary && !activeShift && (
        <div className="bg-white border-2 border-emerald-500 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Jornada Finalizada en Base</h3>
                <p className="text-sm text-slate-500">
                  {completedShiftSummary.driverName} · Móvil {completedShiftSummary.vehicleNumber} · Grupo {completedShiftSummary.workGroupName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompletedShiftSummary(null)}
              className="min-h-[44px] px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Iniciar Nuevo Turno
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Desplazamiento Ida (T2 - T1)</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                {formatDurationMinutes(completedShiftSummary.initialTransitMins)}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase block">Ejecución Ruta (T3 - T2)</span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-900 mt-1 block">
                {formatDurationMinutes(completedShiftSummary.routeExecutionMins)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Desplazamiento Retorno (T4 - T3)</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                {formatDurationMinutes(completedShiftSummary.returnTransitMins)}
              </span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 uppercase block">Tiempo en Relleno / Descargue</span>
              <span className="text-base font-bold font-mono tabular-nums text-amber-900 mt-1 block">
                {formatDurationMinutes(completedShiftSummary.refillTotalMins)}
              </span>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[11px] font-semibold text-rose-800 uppercase block">Inoperatividad Mecánica</span>
              <span className="text-base font-bold font-mono tabular-nums text-rose-900 mt-1 block">
                {formatDurationMinutes(completedShiftSummary.mechanicalBreakdownTotalMins)}
              </span>
            </div>
            <div className="p-3 bg-slate-900 text-white rounded-xl">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase block">Tiempo Total Operación (T4 - T1)</span>
              <span className="text-base font-bold font-mono tabular-nums mt-1 block">
                {formatDurationMinutes(completedShiftSummary.totalOperationMins)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Today's Completed Shifts Log */}
      {todayCompletedShifts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            Jornadas Finalizadas Hoy ({todayCompletedShifts.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {todayCompletedShifts.map(s => (
              <div key={s.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-bold text-slate-900">Móvil {s.vehicleNumber}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-700">{s.driverName}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-xs font-mono text-slate-500">
                    {formatClock(s.t1StartShiftAt)} → {formatClock(s.t4ArriveBaseAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-mono tabular-nums">
                  <span className="text-emerald-700 font-bold">Ruta: {s.routeExecutionMins ?? 0}m</span>
                  <span className="text-amber-700 font-semibold">Relleno: {s.refillTotalMins}m</span>
                  <span className="text-rose-700 font-semibold">Avería: {s.mechanicalBreakdownTotalMins}m</span>
                  <span className="text-slate-900 font-bold">Total: {s.totalOperationMins ?? 0}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandatory Preoperational Checklist Modal */}
      {showChecklistModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-amber-500 text-slate-950 p-5 flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 shrink-0" />
              <div>
                <h3 className="font-bold text-lg leading-tight">Recordatorio Obligatorio</h3>
                <p className="text-xs font-semibold opacity-90">Checklist Preoperacional del Vehículo</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Antes de iniciar marcha con el <strong>Móvil {activeShift.vehicleNumber}</strong>, realice y verifique el{' '}
                <strong>Checklist Preoperacional</strong> completo:
              </p>

              <div className="space-y-2.5">
                {[
                  { key: 'brakesTires', label: 'Frenos, dirección y presión/estado de llantas' },
                  { key: 'lightsSignals', label: 'Luces, direccionales, pito y reversa' },
                  { key: 'fluidsLeaks', label: 'Niveles de aceite, refrigerante y ausencia de fugas' },
                  { key: 'docsSafety', label: 'Documentos del vehículo y equipo de seguridad/EPP' },
                ].map(item => {
                  const k = item.key as keyof typeof checklistItems;
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer min-h-[48px]"
                    >
                      <input
                        type="checkbox"
                        checked={checklistItems[k]}
                        onChange={e => setChecklistItems(prev => ({ ...prev, [k]: e.target.checked }))}
                        className="h-5 w-5 text-emerald-600 rounded border-slate-300"
                      />
                      <span className="text-sm font-medium text-slate-800">{item.label}</span>
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleConfirmChecklist}
                disabled={!allChecklistChecked || busyAction === 'checklist'}
                className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busyAction === 'checklist' ? 'Confirmando...' : 'Checklist Preoperacional Realizado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
