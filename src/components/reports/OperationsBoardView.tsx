import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Layers,
  PauseCircle,
  ShieldAlert,
  Truck,
  Volume2,
  VolumeX,
  Wrench,
  X,
  FileSpreadsheet,
  Search,
  Edit3,
  PlusCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Assignment, BreakdownAuditLog, BreakdownEvent, DriverShift, DriverShiftStatus } from '../../types';
import {
  acknowledgeBreakdownApi,
  addManualShiftEventApi,
  endBreakdownApi,
  updateShiftTimesApi,
} from '../../lib/api';
import { exportToCsv } from '../../utils/exportCsv';
import {
  computeShiftTimeBreakdown,
  getRouteAlertFromTimestamps,
  formatMsAsHoursMins,
  RouteAlertLevel,
} from '../../utils/shiftTimeMetrics';

interface SupportVehicleEntry {
  shiftId: string;
  vehicleNumber: string;
  driverName: string;
  status: DriverShiftStatus;
  routeCode: string;
  isPausedForRefill: boolean;
  isInBreakdown: boolean;
  hasUnacknowledgedAlarm: boolean;
  routeAlertLevel: RouteAlertLevel;
  routeElapsedMs: number;
  shift: DriverShift;
}

interface BoardCardItem {
  key: string;
  source: 'shift' | 'assignment';
  vehicleNumber: string;
  routeId?: string;
  routeCode: string;
  routeName: string;
  groupId: string;
  groupName: string;
  status: DriverShiftStatus;
  driverName: string;
  isPausedForRefill: boolean;
  isInBreakdown: boolean;
  isSupportShift: boolean;
  isPausedForSupport: boolean;
  parentRouteCode?: string;
  hasUnacknowledgedAlarm: boolean;
  routeAlertLevel: RouteAlertLevel;
  routeElapsedMs: number;
  supportingVehicles: SupportVehicleEntry[];
  shift?: DriverShift;
  assignment?: Assignment;
  assignmentTime?: string;
  isPendingAssignment?: boolean;
}

function higherAlertLevel(a: RouteAlertLevel, b: RouteAlertLevel): RouteAlertLevel {
  if (a === 'critical' || b === 'critical') return 'critical';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'none';
}

interface PendingAlarmItem {
  shift: DriverShift;
  breakdown: BreakdownEvent;
  groupName: string;
  routeCode: string;
}

const PHASE_LANES: {
  status: DriverShiftStatus;
  label: string;
  headerBg: string;
  headerText: string;
  countBg: string;
}[] = [
  {
    status: 'EN_TURNO',
    label: 'Iniciaron Turno',
    headerBg: 'bg-emerald-50 border-emerald-200',
    headerText: 'text-emerald-900',
    countBg: 'bg-emerald-600 text-white',
  },
  {
    status: 'EN_RUTA',
    label: 'Iniciaron Ruta',
    headerBg: 'bg-blue-50 border-blue-200',
    headerText: 'text-blue-900',
    countBg: 'bg-blue-600 text-white',
  },
  {
    status: 'FIN_RUTA',
    label: 'Finalizaron Ruta',
    headerBg: 'bg-amber-50 border-amber-200',
    headerText: 'text-amber-900',
    countBg: 'bg-amber-600 text-white',
  },
  {
    status: 'EN_BASE',
    label: 'Finalizaron Turno',
    headerBg: 'bg-slate-100 border-slate-300',
    headerText: 'text-slate-800',
    countBg: 'bg-slate-700 text-white',
  },
];

function formatClock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateTimeForBoardDate(dateStr: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${baseDate}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function playAlertBeep() {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 660, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      gain.gain.setValueAtTime(0.14, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.14);
    });
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export const OperationsBoardView: React.FC = () => {
  const { state, syncNow, updateAssignmentResources, addIncident } = useAppContext();
  const { user, lockedWorkGroupId } = useAuth();
  const canEditBoard = Boolean(user && ['admin', 'gestion', 'supervisor'].includes(user.role));

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditShowAllDates, setAuditShowAllDates] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BoardCardItem | null>(null);
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [ackNotes, setAckNotes] = useState('');
  const [ackBusy, setAckBusy] = useState(false);
  const [ackError, setAckError] = useState('');
  const [resolveReporterName, setResolveReporterName] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveBusyId, setResolveBusyId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState('');

  // Controller / Supervisor Time Editing & Manual Novelty Forms inside Card Modal
  const [boardModalTab, setBoardModalTab] = useState<'none' | 'edit-times' | 'add-event'>('none');
  const [editTargetShiftId, setEditTargetShiftId] = useState<string>('');
  const [editT1, setEditT1] = useState('');
  const [editT2, setEditT2] = useState('');
  const [editT3, setEditT3] = useState('');
  const [editT4, setEditT4] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccessMsg, setEditSuccessMsg] = useState('');

  const [manualEventType, setManualEventType] = useState<'breakdown' | 'refill'>('breakdown');
  const [manualStartAt, setManualStartAt] = useState('');
  const [manualEndAt, setManualEndAt] = useState('');
  const [manualIsOngoing, setManualIsOngoing] = useState(false);
  const [manualReporter, setManualReporter] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState('');

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [exportEndDate, setExportEndDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [exportScope, setExportScope] = useState<'complete' | 'shifts' | 'audit'>('complete');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'xls' | 'ods' | 'csv'>('xlsx');
  const [exportError, setExportError] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const lastBeepedAlarmIdRef = useRef<string | null>(null);

  // Groups visible on the board: locked to supervisor's group, or all groups for controller
  const visibleGroups = useMemo(() => {
    if (lockedWorkGroupId) {
      return state.workGroups.filter(wg => wg.id === lockedWorkGroupId);
    }
    return state.workGroups;
  }, [state.workGroups, lockedWorkGroupId]);

  // Helper to resolve route id/code/name from shift or matching assignment on date
  const resolveRouteForShift = (shift: DriverShift): { id: string; code: string; name: string } => {
    if (shift.routeCode || shift.routeId) {
      const r = shift.routeId
        ? state.routes.find(rt => rt.id === shift.routeId)
        : state.routes.find(rt => shift.routeCode && rt.code.toLowerCase() === shift.routeCode.toLowerCase());
      return {
        id: shift.routeId || r?.id || '',
        code: shift.routeCode || r?.code || 'S/R',
        name: shift.routeName || r?.name || '',
      };
    }
    const matchingVehicle = state.vehicles.find(
      v =>
        (shift.vehicleId && v.id === shift.vehicleId) ||
        (v.internalNumber.toLowerCase() === shift.vehicleNumber.toLowerCase() &&
          (!v.workGroupId || v.workGroupId === shift.workGroupId))
    );
    const matchingAssignment = state.assignments.find(a => {
      if (a.date.slice(0, 10) !== shift.date) return false;
      if (a.workGroupId && a.workGroupId !== shift.workGroupId) return false;
      if (a.status === 'Cancelado') return false;
      if (matchingVehicle && a.vehicleId === matchingVehicle.id) return true;
      if (shift.driverId && (a.employeeIds || []).includes(shift.driverId)) return true;
      return false;
    });
    if (matchingAssignment) {
      const r = state.routes.find(rt => rt.id === matchingAssignment.routeId);
      if (r) return { id: r.id, code: r.code, name: r.name };
    }
    return { id: '', code: 'S/R', name: '' };
  };

  // Build normalized vehicle/route cards per group and status
  const boardCards = useMemo<BoardCardItem[]>(() => {
    const items: BoardCardItem[] = [];
    const seenGroupVehicleKeys = new Set<string>();
    const seenVehicleIds = new Set<string>();

    const shiftsForDate = state.driverShifts.filter(s => {
      if (s.date !== selectedDate) return false;
      if (lockedWorkGroupId && s.workGroupId !== lockedWorkGroupId) return false;
      return true;
    });

    const primaryShifts = shiftsForDate.filter(s => !s.isSupportShift);
    const supportShifts = shiftsForDate.filter(s => Boolean(s.isSupportShift));

    // 1. Primary shifts (if paused for Apoyo, they keep their current route card in BLUE with Pause icon)
    primaryShifts.forEach(shift => {
      const group = state.workGroups.find(wg => wg.id === shift.workGroupId);
      const groupName = shift.workGroupName || group?.name || 'Grupo';
      const routeInfo = resolveRouteForShift(shift);
      const hasUnacknowledgedAlarm = (shift.breakdownEvents || []).some(ev => !ev.acknowledgedAt);
      const breakdown = computeShiftTimeBreakdown(shift, nowMs);

      seenGroupVehicleKeys.add(`${shift.workGroupId}::${shift.vehicleNumber.trim().toLowerCase()}`);
      if (shift.vehicleId) seenVehicleIds.add(`${shift.workGroupId}::${shift.vehicleId}`);

      items.push({
        key: `shift_${shift.id}`,
        source: 'shift',
        vehicleNumber: shift.vehicleNumber,
        routeId: routeInfo.id || undefined,
        routeCode: routeInfo.code,
        routeName: routeInfo.name,
        groupId: shift.workGroupId,
        groupName,
        status: shift.status,
        driverName: shift.driverName,
        isPausedForRefill: shift.isPausedForRefill,
        isInBreakdown: shift.isInBreakdown,
        isSupportShift: false,
        isPausedForSupport: Boolean(shift.isPausedForSupport),
        parentRouteCode: shift.parentRouteCode || undefined,
        hasUnacknowledgedAlarm,
        routeAlertLevel: breakdown.activeAlertLevel,
        routeElapsedMs: breakdown.routeElapsedMs,
        supportingVehicles: [],
        shift,
      });
    });

    // 2. Dispatch assignments for selectedDate (including Pendiente) when no primary DriverShift exists yet
    state.assignments.forEach(a => {
      if (a.date.slice(0, 10) !== selectedDate) return;
      if (lockedWorkGroupId && a.workGroupId !== lockedWorkGroupId) return;
      if (a.status === 'Cancelado') return;

      let mappedStatus: DriverShiftStatus = 'EN_TURNO';
      if (a.status === 'Inicio de Ruta' || a.status === 'Relleno') mappedStatus = 'EN_RUTA';
      else if (a.status === 'Fin de Ruta') mappedStatus = 'FIN_RUTA';
      else if (a.status === 'Base') mappedStatus = 'EN_BASE';

      const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
      const vehicleNumber = vehicle?.internalNumber || vehicle?.plate || 'N/A';
      const groupId = a.workGroupId || vehicle?.workGroupId || '';
      const dedupKey = `${groupId}::${vehicleNumber.trim().toLowerCase()}`;
      if (seenGroupVehicleKeys.has(dedupKey) || (a.vehicleId && seenVehicleIds.has(`${groupId}::${a.vehicleId}`))) return;

      const group = state.workGroups.find(wg => wg.id === groupId);
      const route = state.routes.find(r => r.id === a.routeId);
      const driver = state.employees.find(e => (a.employeeIds || []).includes(e.id));
      const historyMap: Record<string, string> = {};
      (a.statusHistory || []).forEach(h => {
        if (!historyMap[h.status]) historyMap[h.status] = h.timestamp;
      });
      const routeStartIso = a.inicioRutaAt || historyMap['Inicio de Ruta'] || null;
      const routeEndIso =
        a.finRutaAt ||
        historyMap['Fin de Ruta'] ||
        (a.status === 'Base' ? a.llegadaBaseAt || historyMap['Base'] || null : null);
      const routeAlert = getRouteAlertFromTimestamps(routeStartIso, routeEndIso, nowMs);

      items.push({
        key: `asig_${a.id}`,
        source: 'assignment',
        vehicleNumber,
        routeId: route?.id,
        routeCode: route?.code || 'S/R',
        routeName: route?.name || '',
        groupId,
        groupName: group?.name || 'Grupo',
        status: mappedStatus,
        driverName: driver?.name || 'Despacho asignado',
        isPausedForRefill: a.status === 'Relleno',
        isInBreakdown: false,
        isSupportShift: false,
        isPausedForSupport: false,
        hasUnacknowledgedAlarm: false,
        routeAlertLevel: routeAlert.activeLevel,
        routeElapsedMs: routeAlert.elapsedMs,
        supportingVehicles: [],
        assignment: a,
        assignmentTime: a.inicioRutaAt || a.salidaBaseAt || a.createdAt || a.date,
        isPendingAssignment: a.status === 'Pendiente',
      });
    });

    // 3. Support shifts ("Apoyo"):
    //    - If the supported route already has a vehicle performing it on the board, SUM this vehicle onto that route card.
    //    - Otherwise, CREATE the micro-card for the supported route in its target group/lane.
    supportShifts.forEach(shift => {
      const routeInfo = resolveRouteForShift(shift);
      const catalogRoute = state.routes.find(
        r =>
          (routeInfo.id && r.id === routeInfo.id) ||
          (routeInfo.code !== 'S/R' && r.code.toLowerCase() === routeInfo.code.toLowerCase())
      );
      const targetGroupId = catalogRoute?.workGroupId || shift.workGroupId;
      const targetGroup = state.workGroups.find(wg => wg.id === targetGroupId);
      const targetGroupName = targetGroup?.name || shift.workGroupName || 'Grupo';
      const hasUnacknowledgedAlarm = (shift.breakdownEvents || []).some(ev => !ev.acknowledgedAt);
      const breakdown = computeShiftTimeBreakdown(shift, nowMs);

      const matchesRoute = (c: BoardCardItem) => {
        if (routeInfo.id && c.routeId && c.routeId === routeInfo.id) return true;
        if (
          routeInfo.code !== 'S/R' &&
          c.routeCode.toLowerCase() === routeInfo.code.toLowerCase() &&
          c.groupId === targetGroupId
        ) {
          return true;
        }
        return false;
      };

      // Prefer attaching to an active (non-EN_BASE, non-paused) card on that route;
      // if this support shift is finished (EN_BASE), attach to any matching card if one exists.
      const targetCard =
        items.find(c => !c.isPausedForSupport && c.status !== 'EN_BASE' && matchesRoute(c)) ||
        (shift.status === 'EN_BASE' ? items.find(c => !c.isPausedForSupport && matchesRoute(c)) : undefined);

      if (targetCard) {
        targetCard.supportingVehicles.push({
          shiftId: shift.id,
          vehicleNumber: shift.vehicleNumber,
          driverName: shift.driverName,
          status: shift.status,
          routeCode: routeInfo.code,
          isPausedForRefill: shift.isPausedForRefill,
          isInBreakdown: shift.isInBreakdown,
          hasUnacknowledgedAlarm,
          routeAlertLevel: breakdown.activeAlertLevel,
          routeElapsedMs: breakdown.routeElapsedMs,
          shift,
        });
        if (shift.isPausedForRefill) targetCard.isPausedForRefill = true;
        if (shift.isInBreakdown) targetCard.isInBreakdown = true;
        if (hasUnacknowledgedAlarm) targetCard.hasUnacknowledgedAlarm = true;
        targetCard.routeAlertLevel = higherAlertLevel(targetCard.routeAlertLevel, breakdown.activeAlertLevel);
        if (breakdown.activeAlertLevel !== 'none' && breakdown.routeElapsedMs > targetCard.routeElapsedMs) {
          targetCard.routeElapsedMs = breakdown.routeElapsedMs;
        }
      } else {
        items.push({
          key: `shift_${shift.id}`,
          source: 'shift',
          vehicleNumber: shift.vehicleNumber,
          routeId: routeInfo.id || catalogRoute?.id || undefined,
          routeCode: routeInfo.code,
          routeName: routeInfo.name || catalogRoute?.name || '',
          groupId: targetGroupId,
          groupName: targetGroupName,
          status: shift.status,
          driverName: shift.driverName,
          isPausedForRefill: shift.isPausedForRefill,
          isInBreakdown: shift.isInBreakdown,
          isSupportShift: true,
          isPausedForSupport: false,
          parentRouteCode: shift.parentRouteCode || undefined,
          hasUnacknowledgedAlarm,
          routeAlertLevel: breakdown.activeAlertLevel,
          routeElapsedMs: breakdown.routeElapsedMs,
          supportingVehicles: [],
          shift,
        });
      }
    });

    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      c =>
        c.vehicleNumber.toLowerCase().includes(q) ||
        c.routeCode.toLowerCase().includes(q) ||
        c.groupName.toLowerCase().includes(q) ||
        c.driverName.toLowerCase().includes(q) ||
        c.supportingVehicles.some(
          sv => sv.vehicleNumber.toLowerCase().includes(q) || sv.driverName.toLowerCase().includes(q)
        )
    );
  }, [state.driverShifts, state.assignments, state.vehicles, state.routes, state.workGroups, state.employees, selectedDate, lockedWorkGroupId, searchQuery, nowMs]);

  const liveSelectedCard = useMemo<BoardCardItem | null>(() => {
    if (!selectedCard) return null;
    return boardCards.find(c => c.key === selectedCard.key) || selectedCard;
  }, [selectedCard, boardCards]);

  const statusTotals = useMemo(() => {
    const activeSupportsCount = boardCards.reduce(
      (sum, c) =>
        sum +
        (c.isSupportShift && c.status !== 'EN_BASE' ? 1 : 0) +
        c.supportingVehicles.filter(sv => sv.status !== 'EN_BASE').length,
      0
    );
    return {
      TOTAL: boardCards.length,
      EN_TURNO: boardCards.filter(c => c.status === 'EN_TURNO').length,
      EN_RUTA: boardCards.filter(c => c.status === 'EN_RUTA').length,
      FIN_RUTA: boardCards.filter(c => c.status === 'FIN_RUTA').length,
      EN_BASE: boardCards.filter(c => c.status === 'EN_BASE').length,
      REFILLS: boardCards.filter(c => c.isPausedForRefill).length,
      BREAKDOWNS: boardCards.filter(c => c.isInBreakdown).length,
      SUPPORTS: activeSupportsCount,
      ALERT_WARNING: boardCards.filter(c => c.routeAlertLevel === 'warning').length,
      ALERT_CRITICAL: boardCards.filter(c => c.routeAlertLevel === 'critical').length,
    };
  }, [boardCards]);

  const routeAlertCards = useMemo(() => {
    return boardCards
      .filter(c => c.routeAlertLevel !== 'none')
      .sort((a, b) => {
        if (a.routeAlertLevel !== b.routeAlertLevel) {
          return a.routeAlertLevel === 'critical' ? -1 : 1;
        }
        return b.routeElapsedMs - a.routeElapsedMs;
      });
  }, [boardCards]);

  // Unacknowledged Mechanical Breakdown Alarms across visible shifts
  const pendingAlarms = useMemo<PendingAlarmItem[]>(() => {
    const queue: PendingAlarmItem[] = [];
    state.driverShifts.forEach(shift => {
      if (lockedWorkGroupId && shift.workGroupId !== lockedWorkGroupId) return;
      const group = state.workGroups.find(wg => wg.id === shift.workGroupId);
      const groupName = shift.workGroupName || group?.name || 'Grupo';
      const routeInfo = resolveRouteForShift(shift);
      (shift.breakdownEvents || []).forEach(ev => {
        if (!ev.acknowledgedAt) {
          queue.push({
            shift,
            breakdown: ev,
            groupName,
            routeCode: routeInfo.code,
          });
        }
      });
    });
    queue.sort((a, b) => new Date(a.breakdown.startAt).getTime() - new Date(b.breakdown.startAt).getTime());
    return queue;
  }, [state.driverShifts, state.workGroups, state.routes, state.assignments, state.vehicles, lockedWorkGroupId]);

  const activeAlarm = pendingAlarms[0] || null;

  // Trigger audio chime once when a new unacknowledged alarm becomes active
  useEffect(() => {
    if (!activeAlarm) {
      lastBeepedAlarmIdRef.current = null;
      return;
    }
    if (lastBeepedAlarmIdRef.current !== activeAlarm.breakdown.id) {
      lastBeepedAlarmIdRef.current = activeAlarm.breakdown.id;
      setAckNotes('');
      setAckError('');
      if (!alarmMuted) {
        playAlertBeep();
      }
    }
  }, [activeAlarm, alarmMuted]);

  const handleAcknowledgeAlarm = async () => {
    if (!activeAlarm || ackBusy) return;
    setAckBusy(true);
    setAckError('');
    try {
      await acknowledgeBreakdownApi(activeAlarm.shift.id, activeAlarm.breakdown.id, ackNotes.trim());
      setAckNotes('');
      await syncNow();
    } catch (err: any) {
      setAckError(err?.message || 'No se pudo aceptar la novedad. Intente de nuevo.');
    } finally {
      setAckBusy(false);
    }
  };

  const loadEditFieldsFromShift = (shiftObj: DriverShift) => {
    setEditTargetShiftId(shiftObj.id);
    setEditT1(toLocalDateTimeInput(shiftObj.t1StartShiftAt));
    setEditT2(toLocalDateTimeInput(shiftObj.t2StartRouteAt));
    setEditT3(toLocalDateTimeInput(shiftObj.t3EndRouteAt));
    setEditT4(toLocalDateTimeInput(shiftObj.t4ArriveBaseAt));
    setEditWeight(
      shiftObj.weightTons !== null && shiftObj.weightTons !== undefined
        ? String(shiftObj.weightTons)
        : ''
    );
  };

  const openCardDetail = (card: BoardCardItem) => {
    setResolveReporterName('');
    setResolveNotes('');
    setResolveError('');
    setBoardModalTab('none');
    setEditError('');
    setEditSuccessMsg('');
    setManualError('');
    setSelectedCard(card);
    if (card.shift) {
      loadEditFieldsFromShift(card.shift);
    } else if (card.assignment) {
      const a = card.assignment;
      const hMap: Record<string, string> = {};
      (a.statusHistory || []).forEach(h => {
        if (!hMap[h.status]) hMap[h.status] = h.timestamp;
      });
      setEditTargetShiftId('');
      setEditT1(toLocalDateTimeInput(a.salidaBaseAt || hMap['Salida de Base'] || a.createdAt || a.date));
      setEditT2(toLocalDateTimeInput(a.inicioRutaAt || hMap['Inicio de Ruta']));
      setEditT3(toLocalDateTimeInput(a.finRutaAt || hMap['Fin de Ruta']));
      setEditT4(toLocalDateTimeInput(a.llegadaBaseAt || hMap['Base']));
      setEditWeight(a.weightTons !== undefined ? String(a.weightTons) : '');
    }
  };

  const openEditTimesTab = () => {
    if (!liveSelectedCard) return;
    setEditError('');
    setEditSuccessMsg('');
    setManualError('');
    if (liveSelectedCard.shift) {
      loadEditFieldsFromShift(liveSelectedCard.shift);
    } else if (liveSelectedCard.assignment) {
      const a = liveSelectedCard.assignment;
      const hMap: Record<string, string> = {};
      (a.statusHistory || []).forEach(h => {
        if (!hMap[h.status]) hMap[h.status] = h.timestamp;
      });
      setEditT1(toLocalDateTimeInput(a.salidaBaseAt || hMap['Salida de Base'] || a.createdAt || a.date));
      setEditT2(toLocalDateTimeInput(a.inicioRutaAt || hMap['Inicio de Ruta']));
      setEditT3(toLocalDateTimeInput(a.finRutaAt || hMap['Fin de Ruta']));
      setEditT4(toLocalDateTimeInput(a.llegadaBaseAt || hMap['Base']));
      setEditWeight(a.weightTons !== undefined ? String(a.weightTons) : '');
    }
    setBoardModalTab(prev => (prev === 'edit-times' ? 'none' : 'edit-times'));
  };

  const openManualEventTab = () => {
    if (!liveSelectedCard) return;
    setManualError('');
    setEditError('');
    setEditSuccessMsg('');
    setManualEventType('breakdown');
    const nowDef = defaultDateTimeForBoardDate(selectedDate);
    setManualStartAt(nowDef);
    setManualEndAt(nowDef);
    setManualIsOngoing(false);
    setManualReporter(user?.fullName || user?.username || '');
    setManualNotes('');
    if (liveSelectedCard.shift) {
      setEditTargetShiftId(liveSelectedCard.shift.id);
    }
    setBoardModalTab(prev => (prev === 'add-event' ? 'none' : 'add-event'));
  };

  const handleSaveEditedTimes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSelectedCard || editBusy) return;
    setEditError('');
    setEditSuccessMsg('');

    const parseLocalInput = (
      val: string,
      label: string,
      required: boolean
    ): { ok: true; iso: string | null; error?: string } | { ok: false; iso?: string | null; error: string } => {
      const trimmed = val.trim();
      if (!trimmed) {
        if (required) return { ok: false, error: `${label} es obligatorio.` };
        return { ok: true, iso: null };
      }
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: `Fecha/hora inválida en ${label}.` };
      }
      return { ok: true, iso: d.toISOString() };
    };

    const p1 = parseLocalInput(editT1, 'T1 Inicio Turno', true);
    if (!p1.ok) { setEditError(p1.error); return; }
    const p2 = parseLocalInput(editT2, 'T2 Inicio Ruta', false);
    if (!p2.ok) { setEditError(p2.error); return; }
    const p3 = parseLocalInput(editT3, 'T3 Fin Ruta', false);
    if (!p3.ok) { setEditError(p3.error); return; }
    const p4 = parseLocalInput(editT4, 'T4 Llegada Base', false);
    if (!p4.ok) { setEditError(p4.error); return; }

    const availableShifts: DriverShift[] = [
      ...(liveSelectedCard.shift ? [liveSelectedCard.shift] : []),
      ...liveSelectedCard.supportingVehicles.map(sv => sv.shift),
    ];
    const targetShift =
      availableShifts.find(s => s.id === editTargetShiftId) || liveSelectedCard.shift || null;

    setEditBusy(true);
    try {
      if (targetShift) {
        let weightPayload: number | null | undefined = undefined;
        if (editWeight.trim() === '') {
          weightPayload = null;
        } else {
          const w = Number(editWeight.replace(',', '.').trim());
          if (!Number.isFinite(w) || w < 0 || w > 500) {
            setEditError('El peso debe estar entre 0 y 500 toneladas.');
            setEditBusy(false);
            return;
          }
          weightPayload = Math.round(w * 100) / 100;
        }

        const { shift: updatedShift } = await updateShiftTimesApi(targetShift.id, {
          t1StartShiftAt: p1.iso!,
          t2StartRouteAt: p2.iso,
          t3EndRouteAt: p3.iso,
          t4ArriveBaseAt: p4.iso,
          weightTons: weightPayload,
        });
        setSelectedCard(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            shift: prev.shift?.id === updatedShift.id ? updatedShift : prev.shift,
            status: prev.shift?.id === updatedShift.id ? updatedShift.status : prev.status,
            supportingVehicles: prev.supportingVehicles.map(sv =>
              sv.shiftId === updatedShift.id ? { ...sv, shift: updatedShift, status: updatedShift.status } : sv
            ),
          };
        });
        setEditSuccessMsg('Tiempos actualizados y métricas recalculadas correctamente.');
        setBoardModalTab('none');
        await syncNow();
      } else if (liveSelectedCard.assignment) {
        const statusTimestamps: Record<string, string> = {};
        if (p1.iso) statusTimestamps['Salida de Base'] = p1.iso;
        if (p2.iso) statusTimestamps['Inicio de Ruta'] = p2.iso;
        if (p3.iso) statusTimestamps['Fin de Ruta'] = p3.iso;
        if (p4.iso) statusTimestamps['Base'] = p4.iso;
        await updateAssignmentResources(liveSelectedCard.assignment.id, { statusTimestamps });
        setEditSuccessMsg('Tiempos de despacho actualizados.');
        setBoardModalTab('none');
      }
    } catch (err: any) {
      setEditError(err?.message || 'No se pudieron actualizar los tiempos.');
    } finally {
      setEditBusy(false);
    }
  };

  const handleSaveManualEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSelectedCard || manualBusy) return;
    setManualError('');
    setEditSuccessMsg('');

    if (!manualStartAt.trim()) {
      setManualError('Ingrese la fecha y hora de inicio.');
      return;
    }
    const startDate = new Date(manualStartAt);
    if (Number.isNaN(startDate.getTime())) {
      setManualError('Fecha/hora de inicio inválida.');
      return;
    }

    let endIso: string | null = null;
    if (!manualIsOngoing) {
      if (!manualEndAt.trim()) {
        setManualError('Ingrese la hora de fin o marque "Evento en curso".');
        return;
      }
      const endDate = new Date(manualEndAt);
      if (Number.isNaN(endDate.getTime())) {
        setManualError('Fecha/hora de finalización inválida.');
        return;
      }
      if (endDate.getTime() < startDate.getTime()) {
        setManualError('La hora de finalización no puede ser anterior a la de inicio.');
        return;
      }
      endIso = endDate.toISOString();
    }

    const availableShifts: DriverShift[] = [
      ...(liveSelectedCard.shift ? [liveSelectedCard.shift] : []),
      ...liveSelectedCard.supportingVehicles.map(sv => sv.shift),
    ];
    const targetShift =
      availableShifts.find(s => s.id === editTargetShiftId) || liveSelectedCard.shift || null;

    setManualBusy(true);
    try {
      if (targetShift) {
        const { shift: updatedShift } = await addManualShiftEventApi(targetShift.id, {
          type: manualEventType,
          startAt: startDate.toISOString(),
          endAt: endIso,
          notes: manualNotes.trim(),
          reportedByName: manualReporter.trim() || user?.fullName || user?.username || '',
        });
        setSelectedCard(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            shift: prev.shift?.id === updatedShift.id ? updatedShift : prev.shift,
            isInBreakdown:
              prev.shift?.id === updatedShift.id
                ? updatedShift.isInBreakdown
                : prev.isInBreakdown || updatedShift.isInBreakdown,
            isPausedForRefill:
              prev.shift?.id === updatedShift.id
                ? updatedShift.isPausedForRefill
                : prev.isPausedForRefill || updatedShift.isPausedForRefill,
            supportingVehicles: prev.supportingVehicles.map(sv =>
              sv.shiftId === updatedShift.id
                ? {
                    ...sv,
                    shift: updatedShift,
                    isInBreakdown: updatedShift.isInBreakdown,
                    isPausedForRefill: updatedShift.isPausedForRefill,
                  }
                : sv
            ),
          };
        });
        setEditSuccessMsg(
          manualEventType === 'breakdown'
            ? 'Reporte de avería mecánica registrado correctamente.'
            : 'Reporte de relleno/descargue registrado correctamente.'
        );
        setBoardModalTab('none');
        await syncNow();
      } else if (liveSelectedCard.assignment) {
        if (!endIso) {
          setManualError('Para despachos sin jornada de conductor, indique hora de fin.');
          setManualBusy(false);
          return;
        }
        await addIncident(liveSelectedCard.assignment.id, {
          type: manualEventType === 'breakdown' ? 'Mecánico' : 'Otro',
          description:
            manualEventType === 'breakdown'
              ? `Avería Mecánica${manualNotes.trim() ? `: ${manualNotes.trim()}` : ''}${manualReporter.trim() ? ` (Reportó: ${manualReporter.trim()})` : ''}`
              : `Relleno / Descargue${manualNotes.trim() ? `: ${manualNotes.trim()}` : ''}`,
          startTime: startDate.toISOString(),
          endTime: endIso,
        });
        setEditSuccessMsg('Novedad registrada en el despacho correctamente.');
        setBoardModalTab('none');
      }
    } catch (err: any) {
      setManualError(err?.message || 'No se pudo registrar la novedad.');
    } finally {
      setManualBusy(false);
    }
  };

  const handleFinalizeBreakdown = async (shiftId: string, breakdownId: string) => {
    const cleanReporter = resolveReporterName.trim();
    if (!cleanReporter) {
      setResolveError('Ingrese el nombre de quien reportó la novedad.');
      return;
    }
    setResolveBusyId(breakdownId);
    setResolveError('');
    try {
      const { shift: updatedShift } = await endBreakdownApi(shiftId, {
        breakdownId,
        resolvedReportedBy: cleanReporter,
        resolutionNotes: resolveNotes.trim(),
        requireReporter: true,
      });
      setSelectedCard(prev => {
        if (!prev) return prev;
        const nextPrimaryShift = prev.shift?.id === updatedShift.id ? updatedShift : prev.shift;
        const nextSupporting = prev.supportingVehicles.map(sv =>
          sv.shiftId === updatedShift.id
            ? {
                ...sv,
                shift: updatedShift,
                isInBreakdown: updatedShift.isInBreakdown,
              }
            : sv
        );
        const anyBreakdown =
          Boolean(nextPrimaryShift?.isInBreakdown) || nextSupporting.some(sv => sv.isInBreakdown);
        return {
          ...prev,
          shift: nextPrimaryShift,
          supportingVehicles: nextSupporting,
          isInBreakdown: anyBreakdown,
        };
      });
      setResolveReporterName('');
      setResolveNotes('');
      await syncNow();
    } catch (err: any) {
      setResolveError(err?.message || 'No se pudo finalizar el reporte de avería.');
    } finally {
      setResolveBusyId(null);
    }
  };

  // Filtered audit logs
  const filteredAuditLogs = useMemo<BreakdownAuditLog[]>(() => {
    return state.breakdownAuditLogs
      .filter(log => {
        if (lockedWorkGroupId && log.workGroupId !== lockedWorkGroupId) return false;
        if (!auditShowAllDates && log.date !== selectedDate) return false;
        return true;
      })
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }, [state.breakdownAuditLogs, lockedWorkGroupId, auditShowAllDates, selectedDate]);

  const handleExportAuditCsv = () => {
    const rows = filteredAuditLogs.map(log => ({
      Fecha: log.date,
      Grupo: log.workGroupName || log.workGroupId,
      Movil: log.vehicleNumber,
      Ruta: log.routeCode || 'S/R',
      Conductor: log.driverName,
      Quien_Reporto_Novedad: log.resolvedReportedBy || log.reportedByName || log.driverName,
      Tipo_Novedad: log.incidentType,
      Detalle: log.notes || '',
      Hora_Reporte: formatClock(log.reportedAt),
      Estado: log.status,
      Hora_Aceptacion: formatClock(log.acknowledgedAt),
      Usuario_Acepto: log.acknowledgedByFullName || log.acknowledgedByUsername || '',
      Username_Acepto: log.acknowledgedByUsername || '',
      Rol_Usuario: log.acknowledgedByRole || '',
      Observacion_Aceptacion: log.acknowledgementNotes || '',
      Hora_Cierre: formatClock(log.resolvedAt),
      Duracion_Min: log.durationMins ?? '',
      Observacion_Cierre: log.resolutionNotes || '',
    }));
    const suffix = auditShowAllDates ? 'historico' : selectedDate;
    exportToCsv(`auditoria_novedades_${suffix}.csv`, rows);
  };

  // Filtered records for Board Range Export Modal
  const exportPreviewCounts = useMemo(() => {
    const shiftsCount = state.driverShifts.filter(s => {
      if (lockedWorkGroupId && s.workGroupId !== lockedWorkGroupId) return false;
      if (exportStartDate && s.date < exportStartDate) return false;
      if (exportEndDate && s.date > exportEndDate) return false;
      return true;
    }).length;
    const auditsCount = state.breakdownAuditLogs.filter(log => {
      if (lockedWorkGroupId && log.workGroupId !== lockedWorkGroupId) return false;
      if (exportStartDate && log.date < exportStartDate) return false;
      if (exportEndDate && log.date > exportEndDate) return false;
      return true;
    }).length;
    return { shiftsCount, auditsCount };
  }, [state.driverShifts, state.breakdownAuditLogs, lockedWorkGroupId, exportStartDate, exportEndDate]);

  const handleDownloadRangeExport = () => {
    setExportError('');
    if (!exportStartDate || !exportEndDate) {
      setExportError('Seleccione la fecha de inicio y la fecha de fin.');
      return;
    }
    if (exportStartDate > exportEndDate) {
      setExportError('La fecha de inicio no puede ser mayor que la fecha de fin.');
      return;
    }

    const matchingShifts = state.driverShifts
      .filter(s => {
        if (lockedWorkGroupId && s.workGroupId !== lockedWorkGroupId) return false;
        return s.date >= exportStartDate && s.date <= exportEndDate;
      })
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.t1StartShiftAt.localeCompare(b.t1StartShiftAt)));

    const refNow = Date.now();
    let sumTotalTransit = 0;
    let sumRouteGross = 0;
    let sumRouteDeducted = 0;
    let sumRouteNet = 0;
    let sumRefills = 0;
    let sumBreakdowns = 0;
    let countWarning8h = 0;
    let countCritical10h = 0;

    let sumWeightTons = 0;

    const shiftRows = matchingShifts.map(s => {
      const routeInfo = resolveRouteForShift(s);
      const groupName = s.workGroupName || state.workGroups.find(wg => wg.id === s.workGroupId)?.name || s.workGroupId;
      const tb = computeShiftTimeBreakdown(s, refNow);

      if (tb.totalTransitMins !== null) sumTotalTransit += tb.totalTransitMins;
      if (tb.routeGrossMins !== null) sumRouteGross += tb.routeGrossMins;
      sumRouteDeducted += tb.routeDeductedMins;
      if (tb.routeNetMins !== null) sumRouteNet += tb.routeNetMins;
      sumRefills += tb.totalRefillMins;
      sumBreakdowns += tb.totalBreakdownMins;
      if (typeof s.weightTons === 'number' && !Number.isNaN(s.weightTons)) {
        sumWeightTons += s.weightTons;
      }
      if (tb.overallAlertLevel === 'critical') countCritical10h += 1;
      else if (tb.overallAlertLevel === 'warning') countWarning8h += 1;

      const alertLabel =
        tb.overallAlertLevel === 'critical'
          ? 'CRÍTICA (+10h)'
          : tb.overallAlertLevel === 'warning'
            ? 'ALERTA (+8h)'
            : 'Normal';

      return {
        Fecha: s.date,
        Grupo: groupName,
        Movil: s.vehicleNumber,
        Conductor: s.driverName,
        Ruta: routeInfo.code,
        Nombre_Ruta: routeInfo.name,
        Tipo_Jornada: s.isSupportShift ? `Apoyo (de ${s.parentRouteCode || 'Principal'})` : 'Principal',
        Estado: s.status,
        Peso_Recogido_Ton: s.weightTons !== null && s.weightTons !== undefined ? s.weightTons : '',
        Pausada_Por_Apoyo: s.isPausedForSupport ? 'SI' : 'NO',
        Tiempo_Apoyo_Min: tb.totalSupportMins,
        Eventos_Apoyo: s.supportEvents?.length || 0,
        T1_Inicio_Turno: formatClock(s.t1StartShiftAt),
        T2_Inicio_Ruta: formatClock(s.t2StartRouteAt),
        T3_Fin_Ruta: formatClock(s.t3EndRouteAt),
        T4_Llegada_Base: formatClock(s.t4ArriveBaseAt),
        Desplazamiento_Ida_Min: tb.initialTransitMins ?? '',
        Desplazamiento_Retorno_Min: tb.returnTransitMins ?? '',
        Tiempo_Total_Desplazamiento_Min: tb.totalTransitMins ?? '',
        Ejecucion_Ruta_Bruta_Min: tb.routeGrossMins ?? '',
        Descuento_Averias_Rellenos_Min: tb.routeDeductedMins,
        Ejecucion_Ruta_Neta_Min: tb.routeNetMins ?? '',
        Tiempo_Relleno_Min: tb.totalRefillMins,
        Eventos_Relleno: s.refillEvents?.length || 0,
        Tiempo_Averia_Min: tb.totalBreakdownMins,
        Eventos_Averia: s.breakdownEvents?.length || 0,
        Alerta_Duracion_Ruta: alertLabel,
        Total_Operacion_Bruta_Min: tb.totalOperationMins ?? '',
        Total_Operacion_Neta_Min: tb.totalOperationNetMins ?? '',
      };
    });

    const summaryRows = [
      { Indicador: 'Rango de Fechas', Valor: `${exportStartDate} a ${exportEndDate}` },
      { Indicador: 'Total Jornadas / Rutas', Valor: matchingShifts.length },
      { Indicador: 'Peso Total Recogido [Ton]', Valor: Math.round(sumWeightTons * 100) / 100 },
      { Indicador: 'Tiempo Total Desplazamiento (Ida + Retorno) [min]', Valor: sumTotalTransit },
      { Indicador: 'Tiempo Ruta Bruto [min]', Valor: sumRouteGross },
      { Indicador: 'Tiempo Descontado en Ruta (Averías + Rellenos) [min]', Valor: sumRouteDeducted },
      { Indicador: 'Tiempo Total Neto en Ruta [min]', Valor: sumRouteNet },
      { Indicador: 'Tiempo Total Rellenos [min]', Valor: sumRefills },
      { Indicador: 'Tiempo Total Averías [min]', Valor: sumBreakdowns },
      { Indicador: 'Rutas con Alerta (> 8h)', Valor: countWarning8h },
      { Indicador: 'Rutas con Alerta Crítica (> 10h)', Valor: countCritical10h },
    ];

    const auditRows = state.breakdownAuditLogs
      .filter(log => {
        if (lockedWorkGroupId && log.workGroupId !== lockedWorkGroupId) return false;
        return log.date >= exportStartDate && log.date <= exportEndDate;
      })
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
      .map(log => ({
        Fecha: log.date,
        Grupo: log.workGroupName || log.workGroupId,
        Movil: log.vehicleNumber,
        Ruta: log.routeCode || 'S/R',
        Conductor: log.driverName,
        Quien_Reporto_Novedad: log.resolvedReportedBy || log.reportedByName || log.driverName,
        Tipo_Novedad: log.incidentType,
        Detalle: log.notes || '',
        Hora_Reporte: formatClock(log.reportedAt),
        Estado: log.status,
        Hora_Aceptacion: formatClock(log.acknowledgedAt),
        Usuario_Acepto: log.acknowledgedByFullName || log.acknowledgedByUsername || '',
        Username_Acepto: log.acknowledgedByUsername || '',
        Rol_Usuario: log.acknowledgedByRole || '',
        Observacion_Aceptacion: log.acknowledgementNotes || '',
        Hora_Cierre: formatClock(log.resolvedAt),
        Duracion_Min: log.durationMins ?? '',
        Observacion_Cierre: log.resolutionNotes || '',
      }));

    if (exportScope === 'shifts' && shiftRows.length === 0) {
      setExportError('No hay registros de operación en el rango de fechas seleccionado.');
      return;
    }
    if (exportScope === 'audit' && auditRows.length === 0) {
      setExportError('No hay registros de auditoría en el rango de fechas seleccionado.');
      return;
    }
    if (exportScope === 'complete' && shiftRows.length === 0 && auditRows.length === 0) {
      setExportError('No hay datos de operación ni de auditoría en el rango de fechas seleccionado.');
      return;
    }

    const baseName = `tablero_operativo_${exportStartDate}_a_${exportEndDate}`;

    if (exportFormat === 'csv') {
      if ((exportScope === 'complete' || exportScope === 'shifts') && shiftRows.length > 0) {
        exportToCsv(`${baseName}_operacion.csv`, shiftRows);
      }
      if ((exportScope === 'complete' || exportScope === 'audit') && auditRows.length > 0) {
        exportToCsv(`${baseName}_auditoria.csv`, auditRows);
      }
      setShowExportModal(false);
      return;
    }

    const wb = XLSX.utils.book_new();
    const buildSheet = (rows: Record<string, any>[], emptyHeaders: string[]) => {
      const ws =
        rows.length > 0
          ? XLSX.utils.json_to_sheet(rows)
          : XLSX.utils.aoa_to_sheet([emptyHeaders]);
      const keys = rows.length > 0 ? Object.keys(rows[0]) : emptyHeaders;
      ws['!cols'] = keys.map(k => ({ wch: Math.max(14, k.length + 3) }));
      return ws;
    };

    if (exportScope === 'complete' || exportScope === 'shifts') {
      XLSX.utils.book_append_sheet(
        wb,
        buildSheet(shiftRows, ['Fecha', 'Grupo', 'Movil', 'Conductor', 'Ruta', 'Tipo_Jornada', 'Estado']),
        'Operacion y Apoyos'
      );
      XLSX.utils.book_append_sheet(
        wb,
        buildSheet(summaryRows, ['Indicador', 'Valor']),
        'Resumen General'
      );
    }
    if (exportScope === 'complete' || exportScope === 'audit') {
      XLSX.utils.book_append_sheet(
        wb,
        buildSheet(auditRows, ['Fecha', 'Grupo', 'Movil', 'Ruta', 'Conductor', 'Tipo_Novedad', 'Estado']),
        'Auditoria Novedades'
      );
    }

    XLSX.writeFile(wb, `${baseName}.${exportFormat}`, { bookType: exportFormat });
    setShowExportModal(false);
  };

  return (
    <div className="space-y-2.5">
      {/* Ultra-Compact Control Strip & Inline Fleet Counters */}
      <div className="bg-slate-900 text-white rounded-xl px-3.5 py-2.5 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold tracking-tight">Tablero Operativo en Vivo</h2>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({statusTotals.TOTAL} móviles)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
              <span className="text-emerald-400 font-bold">Turno: {statusTotals.EN_TURNO}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-blue-400 font-bold">Ruta: {statusTotals.EN_RUTA}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-amber-400 font-bold">Fin Ruta: {statusTotals.FIN_RUTA}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-300 font-bold">Fin Turno: {statusTotals.EN_BASE}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-purple-300 font-bold">Relleno: {statusTotals.REFILLS}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-rose-400 font-bold">Avería: {statusTotals.BREAKDOWNS}</span>
              {statusTotals.SUPPORTS > 0 && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-orange-400 font-bold">Apoyo: {statusTotals.SUPPORTS}</span>
                </>
              )}
              {statusTotals.ALERT_WARNING > 0 && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-amber-300 font-bold">+8h: {statusTotals.ALERT_WARNING}</span>
                </>
              )}
              {statusTotals.ALERT_CRITICAL > 0 && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-rose-400 font-extrabold">+10h: {statusTotals.ALERT_CRITICAL}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Móvil / ruta..."
                className="w-32 sm:w-40 bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-2 py-1 text-xs text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none font-mono"
              />
            </div>

            <button
              type="button"
              onClick={() => setAlarmMuted(m => !m)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
              title={alarmMuted ? 'Activar alerta sonora' : 'Silenciar alerta sonora'}
            >
              {alarmMuted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
              <span className="hidden xl:inline">{alarmMuted ? 'Silenciada' : 'Sonido'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setExportStartDate(selectedDate);
                setExportEndDate(selectedDate);
                setExportError('');
                setShowExportModal(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              title="Exportar datos del tablero en hoja de cálculo o CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAuditModal(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Auditoría ({filteredAuditLogs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Route Duration Alert Strip (>8h / >10h) */}
      {routeAlertCards.length > 0 && (
        <div
          className={`rounded-xl px-3 py-1.5 border flex flex-wrap items-center gap-2 text-xs ${
            statusTotals.ALERT_CRITICAL > 0
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <span className="font-extrabold flex items-center gap-1.5 shrink-0">
            <AlertTriangle
              className={`h-3.5 w-3.5 ${
                statusTotals.ALERT_CRITICAL > 0 ? 'text-rose-600' : 'text-amber-600'
              }`}
            />
            Alertas de Duración en Ruta:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {routeAlertCards.map(card => (
              <button
                key={`alert_${card.key}`}
                type="button"
                onClick={() => openCardDetail(card)}
                className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border transition-colors ${
                  card.routeAlertLevel === 'critical'
                    ? 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700'
                    : 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                }`}
              >
                {card.routeAlertLevel === 'critical' ? 'CRÍTICA +10h' : 'ALERTA +8h'} · M.{card.vehicleNumber} ({formatMsAsHoursMins(card.routeElapsedMs)})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* High-Density Group Columns Control Board (~80+ simultaneous vehicles) */}
      {visibleGroups.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
          No hay grupos operativos configurados para mostrar en el tablero.
        </div>
      ) : (
        <div
          className={
            visibleGroups.length === 1
              ? 'w-full'
              : 'grid grid-flow-col auto-cols-[minmax(228px,1fr)] gap-2 overflow-x-auto pb-1'
          }
        >
          {visibleGroups.map(group => {
            const groupCards = boardCards.filter(c => c.groupId === group.id);
            const refillCards = groupCards.filter(c => c.isPausedForRefill);
            const breakdownCards = groupCards.filter(c => c.isInBreakdown);
            const activeBreakdownsCount = breakdownCards.length;

            const specialLanes = [
              {
                key: 'EN_RELLENO',
                label: 'En Relleno',
                cards: refillCards,
                headerBg: 'bg-purple-50 border-purple-200',
                headerText: 'text-purple-900',
                countBg: 'bg-purple-600 text-white',
              },
              {
                key: 'CON_AVERIA',
                label: 'Con Avería',
                cards: breakdownCards,
                headerBg: 'bg-rose-50 border-rose-200',
                headerText: 'text-rose-900',
                countBg: 'bg-rose-600 text-white',
              },
            ];

            return (
              <div
                key={group.id}
                className="bg-slate-50 border border-slate-200 rounded-xl flex flex-col overflow-hidden"
              >
                {/* Compact Column Group Header */}
                <div className="bg-white border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Layers className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <h3 className="font-bold text-xs text-slate-900 truncate">{group.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 font-mono tabular-nums">
                    {refillCards.length > 0 && (
                      <span className="text-[10px] font-bold text-purple-700">
                        {refillCards.length} rel. ·
                      </span>
                    )}
                    {activeBreakdownsCount > 0 && (
                      <span className="text-[10px] font-bold text-rose-700">
                        {activeBreakdownsCount} av. ·
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-slate-700">
                      {groupCards.length}
                    </span>
                  </div>
                </div>

                {/* 4 Shift Phases + 2 Novelty Counters (En Relleno / Con Avería) inside Group Column */}
                <div className={`p-1.5 ${visibleGroups.length === 1 ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2' : 'space-y-1.5'}`}>
                  {PHASE_LANES.map(lane => {
                    const laneCards = groupCards.filter(c => c.status === lane.status);
                    const isEmpty = laneCards.length === 0;
                    return (
                      <div key={lane.status} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className={`px-2 py-1 flex items-center justify-between ${isEmpty ? 'opacity-70' : 'border-b'} ${lane.headerBg}`}>
                          <span className={`text-[10px] font-bold tracking-tight truncate ${lane.headerText}`}>
                            {lane.label}
                          </span>
                          <span className={`text-[10px] font-bold font-mono tabular-nums px-1.5 rounded ${lane.countBg}`}>
                            {laneCards.length}
                          </span>
                        </div>

                        {!isEmpty && (
                          <div className="p-1">
                            <div
                              className={
                                visibleGroups.length === 1
                                  ? 'grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1'
                                  : 'grid grid-cols-3 gap-1'
                              }
                            >
                              {laneCards.map(card => {
                                const supportVehiclesList = card.supportingVehicles.map(v => `M.${v.vehicleNumber}`).join(', ');
                                return (
                                  <button
                                    key={card.key}
                                    type="button"
                                    onClick={() => openCardDetail(card)}
                                    title={`Móvil ${card.vehicleNumber}${
                                      card.isPausedForSupport
                                        ? ' · PAUSADA POR APOYO'
                                        : card.isSupportShift
                                          ? ' · EN APOYO'
                                          : ''
                                    }${
                                      card.routeAlertLevel === 'critical'
                                        ? ` · ALERTA CRÍTICA +10h (${formatMsAsHoursMins(card.routeElapsedMs)})`
                                        : card.routeAlertLevel === 'warning'
                                          ? ` · ALERTA +8h (${formatMsAsHoursMins(card.routeElapsedMs)})`
                                          : ''
                                    } · ${card.routeCode !== 'S/R' ? `Ruta ${card.routeCode}` : 'Sin ruta'} · ${card.groupName} · ${card.driverName}${
                                      supportVehiclesList ? ` · Apoyando: ${supportVehiclesList}` : ''
                                    }`}
                                    className={`text-left rounded px-1 py-1 border transition-colors min-w-0 ${
                                      card.isPausedForSupport
                                        ? 'bg-blue-100 border-blue-500 hover:bg-blue-200'
                                        : card.isInBreakdown || card.hasUnacknowledgedAlarm
                                          ? 'bg-rose-50 border-rose-300 hover:bg-rose-100'
                                          : card.routeAlertLevel === 'critical'
                                            ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-400 hover:bg-rose-100'
                                            : card.isPausedForRefill
                                              ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                              : card.routeAlertLevel === 'warning'
                                                ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300 hover:bg-amber-100'
                                                : card.supportingVehicles.length > 0
                                                  ? 'bg-emerald-50/70 border-orange-400 hover:bg-orange-50'
                                                  : card.isSupportShift
                                                    ? 'bg-orange-50 border-orange-300 hover:bg-orange-100'
                                                    : 'bg-slate-50 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-0.5 leading-none">
                                      <span
                                        className={`text-[10px] font-extrabold font-mono tabular-nums tracking-tight truncate ${
                                          card.isPausedForSupport ? 'text-blue-950' : 'text-slate-900'
                                        }`}
                                      >
                                        M.{card.vehicleNumber}
                                      </span>
                                      <span className="flex items-center gap-0.5 shrink-0">
                                        {card.routeAlertLevel === 'critical' && (
                                          <span className="text-[8px] font-extrabold font-mono text-rose-700 leading-none">
                                            10h!
                                          </span>
                                        )}
                                        {card.routeAlertLevel === 'warning' && (
                                          <span className="text-[8px] font-extrabold font-mono text-amber-700 leading-none">
                                            8h!
                                          </span>
                                        )}
                                        {card.supportingVehicles.length > 0 && (
                                          <span className="text-[9px] font-extrabold font-mono text-orange-700 leading-none">
                                            +{card.supportingVehicles.length}
                                          </span>
                                        )}
                                        {card.isPausedForSupport && (
                                          <PauseCircle className="h-2.5 w-2.5 text-blue-700 shrink-0" />
                                        )}
                                        {(card.isInBreakdown || card.hasUnacknowledgedAlarm) && (
                                          <AlertTriangle className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                                        )}
                                        {!card.isPausedForSupport && !card.isInBreakdown && card.isPausedForRefill && (
                                          <PauseCircle className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                                        )}
                                      </span>
                                    </div>
                                    <div
                                      className={`text-[9px] font-medium leading-tight truncate mt-0.5 ${
                                        card.isPausedForSupport
                                          ? 'text-blue-800 font-bold'
                                          : card.supportingVehicles.length > 0 || card.isSupportShift
                                            ? 'text-orange-700 font-bold'
                                            : 'text-slate-500'
                                      }`}
                                    >
                                      {card.isPausedForSupport
                                        ? `${card.routeCode !== 'S/R' ? card.routeCode : 'S/R'} · Pausa`
                                        : card.supportingVehicles.length > 0
                                          ? `${card.routeCode !== 'S/R' ? card.routeCode : 'S/R'} · +${card.supportingVehicles.map(v => `M.${v.vehicleNumber}`).join(',')}`
                                          : card.isPendingAssignment
                                            ? `${card.routeCode !== 'S/R' ? card.routeCode : 'S/R'} · Asignada`
                                            : `${card.isSupportShift ? 'Apoyo ' : ''}${card.routeCode !== 'S/R' ? card.routeCode : 'S/R'} · ${card.groupName}`}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {specialLanes.map(lane => {
                    const isEmpty = lane.cards.length === 0;
                    return (
                      <div key={lane.key} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className={`px-2 py-1 flex items-center justify-between ${isEmpty ? 'opacity-70' : 'border-b'} ${lane.headerBg}`}>
                          <span className={`text-[10px] font-bold tracking-tight truncate ${lane.headerText}`}>
                            {lane.label}
                          </span>
                          <span className={`text-[10px] font-bold font-mono tabular-nums px-1.5 rounded ${lane.countBg}`}>
                            {lane.cards.length}
                          </span>
                        </div>

                        {!isEmpty && (
                          <div className="p-1">
                            <div
                              className={
                                visibleGroups.length === 1
                                  ? 'grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1'
                                  : 'grid grid-cols-3 gap-1'
                              }
                            >
                              {lane.cards.map(card => {
                                const matchingSupport =
                                  lane.key === 'CON_AVERIA'
                                    ? card.supportingVehicles.find(sv => sv.isInBreakdown)
                                    : card.supportingVehicles.find(sv => sv.isPausedForRefill);
                                const displayVehicle =
                                  lane.key === 'CON_AVERIA'
                                    ? (card.shift?.isInBreakdown ? card.vehicleNumber : matchingSupport?.vehicleNumber || card.vehicleNumber)
                                    : (card.shift?.isPausedForRefill ? card.vehicleNumber : matchingSupport?.vehicleNumber || card.vehicleNumber);
                                return (
                                  <button
                                    key={`${lane.key}_${card.key}`}
                                    type="button"
                                    onClick={() => openCardDetail(card)}
                                    title={`Móvil ${displayVehicle} · ${card.routeCode !== 'S/R' ? `Ruta ${card.routeCode}` : 'Sin ruta'} · ${card.groupName} · ${card.driverName}`}
                                    className={`text-left rounded px-1 py-1 border transition-colors min-w-0 ${
                                      lane.key === 'CON_AVERIA'
                                        ? 'bg-rose-50 border-rose-300 hover:bg-rose-100'
                                        : 'bg-purple-50 border-purple-300 hover:bg-purple-100'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-0.5 leading-none">
                                      <span className="text-[10px] font-extrabold font-mono tabular-nums tracking-tight text-slate-900 truncate">
                                        M.{displayVehicle}
                                      </span>
                                      {lane.key === 'CON_AVERIA' ? (
                                        <AlertTriangle className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                                      ) : (
                                        <PauseCircle className="h-2.5 w-2.5 text-purple-600 shrink-0" />
                                      )}
                                    </div>
                                    <div className="text-[9px] font-medium leading-tight text-slate-500 truncate mt-0.5">
                                      {card.routeCode !== 'S/R' ? card.routeCode : 'S/R'} · {card.groupName}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vehicle Shift Quick-Detail Modal */}
      {liveSelectedCard && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base font-mono">Móvil {liveSelectedCard.vehicleNumber}</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Grupo {liveSelectedCard.groupName} ·{' '}
                  {liveSelectedCard.routeCode !== 'S/R'
                    ? `Ruta ${liveSelectedCard.routeCode}${liveSelectedCard.routeName ? ` (${liveSelectedCard.routeName})` : ''}`
                    : 'Sin ruta asociada'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm overflow-y-auto">
              <div className="flex justify-between">
                <span className="text-slate-500">Conductor:</span>
                <span className="font-bold text-slate-900">{liveSelectedCard.driverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estado Actual:</span>
                <span className="font-bold text-slate-900">
                  {liveSelectedCard.isPendingAssignment
                    ? 'Asignada (Pendiente inicio de turno)'
                    : PHASE_LANES.find(p => p.status === liveSelectedCard.status)?.label}
                  {liveSelectedCard.isSupportShift ? ' (Apoyo)' : ''}
                  {liveSelectedCard.isPausedForSupport ? ' (Pausada por Apoyo)' : ''}
                </span>
              </div>
              {((liveSelectedCard.shift?.weightTons !== null && liveSelectedCard.shift?.weightTons !== undefined) ||
                (liveSelectedCard.assignment?.weightTons !== undefined && liveSelectedCard.assignment.weightTons > 0)) && (
                <div className="flex justify-between items-center bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-purple-800 font-bold">Peso Recogido en Ruta:</span>
                  <span className="font-mono font-extrabold text-purple-950">
                    {(liveSelectedCard.shift?.weightTons ?? liveSelectedCard.assignment?.weightTons ?? 0).toFixed(2)} Ton
                  </span>
                </div>
              )}
              {liveSelectedCard.isSupportShift && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-900 font-semibold">
                  Ruta de Apoyo · Ruta principal en pausa: {liveSelectedCard.parentRouteCode || 'Turno principal'}
                </div>
              )}
              {liveSelectedCard.isPausedForSupport && (
                <div className="bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-900 font-semibold flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 text-blue-700 shrink-0" />
                  <span>Jornada pausada temporalmente mientras el móvil ejecuta una ruta de apoyo.</span>
                </div>
              )}
              {liveSelectedCard.supportingVehicles.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1.5">
                  <span className="text-[11px] font-bold text-orange-800 uppercase block">
                    Vehículos en Apoyo Sumados ({liveSelectedCard.supportingVehicles.length})
                  </span>
                  {liveSelectedCard.supportingVehicles.map(sv => (
                    <div
                      key={sv.shiftId}
                      className="flex items-center justify-between text-xs bg-white border border-orange-200 rounded-lg px-2.5 py-1.5"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900">Móvil {sv.vehicleNumber}</span>
                        <span className="text-slate-500 ml-1.5">· {sv.driverName}</span>
                      </div>
                      <span className="font-bold text-orange-700 text-[11px]">{sv.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {liveSelectedCard.routeAlertLevel !== 'none' && (
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-bold border flex items-center justify-between gap-2 ${
                    liveSelectedCard.routeAlertLevel === 'critical'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle
                      className={`h-4 w-4 shrink-0 ${
                        liveSelectedCard.routeAlertLevel === 'critical' ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    />
                    {liveSelectedCard.routeAlertLevel === 'critical'
                      ? 'ALERTA CRÍTICA: Ruta supera 10 horas desde inicio'
                      : 'ALERTA: Ruta supera 8 horas desde inicio'}
                  </span>
                  <span className="font-mono shrink-0">{formatMsAsHoursMins(liveSelectedCard.routeElapsedMs)}</span>
                </div>
              )}

              {liveSelectedCard.shift ? (
                <>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">T1 Inicio Turno</span>
                      <span className="font-mono font-bold text-slate-900">{formatClock(liveSelectedCard.shift.t1StartShiftAt)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">T2 Inicio Ruta</span>
                      <span className="font-mono font-bold text-slate-900">{formatClock(liveSelectedCard.shift.t2StartRouteAt)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">T3 Fin Ruta</span>
                      <span className="font-mono font-bold text-slate-900">{formatClock(liveSelectedCard.shift.t3EndRouteAt)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">T4 Llegada Base</span>
                      <span className="font-mono font-bold text-slate-900">{formatClock(liveSelectedCard.shift.t4ArriveBaseAt)}</span>
                    </div>
                  </div>
                  {(() => {
                    const tb = computeShiftTimeBreakdown(liveSelectedCard.shift!, nowMs);
                    return (
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg">
                          <span className="text-blue-700 font-semibold block">Desplaz. Total</span>
                          <span className="font-mono font-extrabold text-blue-950">
                            {tb.totalTransitMins !== null ? `${tb.totalTransitMins} min` : '—'}
                          </span>
                          <span className="text-[10px] text-blue-700 block font-mono">
                            ({tb.initialTransitMins ?? '—'}+{tb.returnTransitMins ?? '—'})
                          </span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                          <span className="text-emerald-700 font-semibold block">Ruta Neta</span>
                          <span className="font-mono font-extrabold text-emerald-950">
                            {tb.routeNetMins !== null ? `${tb.routeNetMins} min` : '—'}
                          </span>
                          <span className="text-[10px] text-emerald-700 block font-mono">
                            {tb.routeDeductedMins > 0 ? `Desc: -${tb.routeDeductedMins}m` : `Bruto: ${tb.routeGrossMins ?? '—'}m`}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg">
                          <span className="text-slate-600 font-semibold block">Rel. / Avería</span>
                          <span className="font-mono font-extrabold text-slate-900">
                            {tb.totalRefillMins}m / {tb.totalBreakdownMins}m
                          </span>
                          <span className="text-[10px] text-slate-500 block">Totales turno</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  Registro originado desde despacho/asignación ({liveSelectedCard.assignmentTime ? formatClock(liveSelectedCard.assignmentTime) : 'Hoy'}).
                </p>
              )}

              {/* Controller / Supervisor Console Controls: Edit Times & Add Breakdown/Refill */}
              {canEditBoard && (!lockedWorkGroupId || liveSelectedCard.groupId === lockedWorkGroupId) && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={openEditTimesTab}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                        boardModalTab === 'edit-times'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Modificar Tiempos
                    </button>
                    <button
                      type="button"
                      onClick={openManualEventTab}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                        boardModalTab === 'add-event'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Agregar Avería / Relleno
                    </button>
                  </div>

                  {editSuccessMsg && (
                    <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{editSuccessMsg}</span>
                    </div>
                  )}

                  {boardModalTab === 'edit-times' && (
                    <form
                      onSubmit={handleSaveEditedTimes}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 uppercase tracking-wide">
                          Corrección de Tiempos Operativos
                        </span>
                        <button
                          type="button"
                          onClick={() => setBoardModalTab('none')}
                          className="text-slate-400 hover:text-slate-700 font-semibold"
                        >
                          Cerrar
                        </button>
                      </div>

                      {liveSelectedCard.shift && liveSelectedCard.supportingVehicles.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Vehículo / Turno</label>
                          <select
                            value={editTargetShiftId}
                            onChange={e => {
                              const id = e.target.value;
                              const allShifts = [liveSelectedCard.shift!, ...liveSelectedCard.supportingVehicles.map(sv => sv.shift)];
                              const found = allShifts.find(s => s.id === id);
                              if (found) loadEditFieldsFromShift(found);
                            }}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                          >
                            <option value={liveSelectedCard.shift.id}>
                              Principal: Móvil {liveSelectedCard.shift.vehicleNumber} ({liveSelectedCard.routeCode})
                            </option>
                            {liveSelectedCard.supportingVehicles.map(sv => (
                              <option key={sv.shiftId} value={sv.shiftId}>
                                Apoyo: Móvil {sv.vehicleNumber} ({sv.routeCode})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            {liveSelectedCard.shift ? 'T1 Inicio Turno *' : 'Salida de Base *'}
                          </label>
                          <input
                            type="datetime-local"
                            required
                            value={editT1}
                            onChange={e => setEditT1(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[11px] font-bold text-slate-600">
                              {liveSelectedCard.shift ? 'T2 Inicio Ruta' : 'Inicio de Ruta'}
                            </label>
                            {editT2 && (
                              <button type="button" onClick={() => setEditT2('')} className="text-[10px] text-rose-600 hover:underline">
                                Limpiar
                              </button>
                            )}
                          </div>
                          <input
                            type="datetime-local"
                            value={editT2}
                            onChange={e => setEditT2(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[11px] font-bold text-slate-600">
                              {liveSelectedCard.shift ? 'T3 Fin Ruta' : 'Fin de Ruta'}
                            </label>
                            {editT3 && (
                              <button type="button" onClick={() => setEditT3('')} className="text-[10px] text-rose-600 hover:underline">
                                Limpiar
                              </button>
                            )}
                          </div>
                          <input
                            type="datetime-local"
                            value={editT3}
                            onChange={e => setEditT3(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[11px] font-bold text-slate-600">
                              {liveSelectedCard.shift ? 'T4 Llegada Base' : 'Llegada a Base'}
                            </label>
                            {editT4 && (
                              <button type="button" onClick={() => setEditT4('')} className="text-[10px] text-rose-600 hover:underline">
                                Limpiar
                              </button>
                            )}
                          </div>
                          <input
                            type="datetime-local"
                            value={editT4}
                            onChange={e => setEditT4(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      {liveSelectedCard.shift && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Peso Recogido (Toneladas) — Opcional
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="500"
                            value={editWeight}
                            onChange={e => setEditWeight(e.target.value)}
                            placeholder="Ej. 10.50"
                            className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                      )}

                      {editError && (
                        <div className="text-[11px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 rounded-lg px-2.5 py-1.5">
                          {editError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setBoardModalTab('none')}
                          className="min-h-[38px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={editBusy}
                          className="min-h-[38px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {editBusy ? 'Guardando...' : 'Guardar Tiempos'}
                        </button>
                      </div>
                    </form>
                  )}

                  {boardModalTab === 'add-event' && (
                    <form
                      onSubmit={handleSaveManualEvent}
                      className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-950 uppercase tracking-wide">
                          Registrar Reporte de Novedad
                        </span>
                        <button
                          type="button"
                          onClick={() => setBoardModalTab('none')}
                          className="text-slate-500 hover:text-slate-800 font-semibold"
                        >
                          Cerrar
                        </button>
                      </div>

                      {liveSelectedCard.shift && liveSelectedCard.supportingVehicles.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Vehículo / Turno</label>
                          <select
                            value={editTargetShiftId}
                            onChange={e => setEditTargetShiftId(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                          >
                            <option value={liveSelectedCard.shift.id}>
                              Principal: Móvil {liveSelectedCard.shift.vehicleNumber} ({liveSelectedCard.routeCode})
                            </option>
                            {liveSelectedCard.supportingVehicles.map(sv => (
                              <option key={sv.shiftId} value={sv.shiftId}>
                                Apoyo: Móvil {sv.vehicleNumber} ({sv.routeCode})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setManualEventType('breakdown')}
                          className={`py-2 px-2.5 rounded-lg font-bold border flex items-center justify-center gap-1.5 ${
                            manualEventType === 'breakdown'
                              ? 'bg-rose-600 text-white border-rose-700'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          Avería Mecánica
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualEventType('refill')}
                          className={`py-2 px-2.5 rounded-lg font-bold border flex items-center justify-center gap-1.5 ${
                            manualEventType === 'refill'
                              ? 'bg-purple-600 text-white border-purple-700'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          Relleno / Descargue
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Hora Inicio *</label>
                          <input
                            type="datetime-local"
                            required
                            value={manualStartAt}
                            onChange={e => setManualStartAt(e.target.value)}
                            className="w-full border border-slate-300 bg-white rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Hora Fin {manualIsOngoing ? '(En curso)' : '*'}
                          </label>
                          <input
                            type="datetime-local"
                            disabled={manualIsOngoing}
                            required={!manualIsOngoing}
                            value={manualEndAt}
                            onChange={e => setManualEndAt(e.target.value)}
                            className="w-full border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      {liveSelectedCard.shift && (
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualIsOngoing}
                            onChange={e => setManualIsOngoing(e.target.checked)}
                            className="rounded border-slate-300 text-amber-600"
                          />
                          Dejar evento abierto / en curso actualmente (sin hora de fin)
                        </label>
                      )}

                      {manualEventType === 'breakdown' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Quién reportó la novedad
                          </label>
                          <input
                            type="text"
                            value={manualReporter}
                            onChange={e => setManualReporter(e.target.value)}
                            placeholder="Nombre de quien reporta"
                            className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Detalle / Observación
                        </label>
                        <input
                          type="text"
                          value={manualNotes}
                          onChange={e => setManualNotes(e.target.value)}
                          placeholder={
                            manualEventType === 'breakdown'
                              ? 'Ej. Falla hidráulica / pinchazo'
                              : 'Ej. Descargue en relleno sanitario'
                          }
                          className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>

                      {manualError && (
                        <div className="text-[11px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 rounded-lg px-2.5 py-1.5">
                          {manualError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setBoardModalTab('none')}
                          className="min-h-[38px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={manualBusy}
                          className="min-h-[38px] bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {manualBusy ? 'Registrando...' : 'Registrar Novedad'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {(() => {
                const refillEntries: { shift: DriverShift; startAt: string; endAt: string | null; durationMins: number | null; id: string; isSupport?: boolean }[] = [];
                if (liveSelectedCard.shift?.refillEvents?.length) {
                  liveSelectedCard.shift.refillEvents.forEach(ev => {
                    refillEntries.push({ shift: liveSelectedCard.shift!, ...ev, isSupport: false });
                  });
                }
                liveSelectedCard.supportingVehicles.forEach(sv => {
                  if (sv.shift?.refillEvents?.length) {
                    sv.shift.refillEvents.forEach(ev => {
                      refillEntries.push({ shift: sv.shift, ...ev, isSupport: true });
                    });
                  }
                });
                if (refillEntries.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-xs font-bold text-purple-700 uppercase block">
                      Rellenos / Descargues ({refillEntries.length})
                    </span>
                    {refillEntries.map(ev => (
                      <div
                        key={ev.id}
                        className="text-xs rounded-xl px-3 py-2 bg-purple-50 border border-purple-200 flex items-center justify-between font-mono font-bold text-purple-950"
                      >
                        <span>
                          {ev.isSupport ? `M.${ev.shift.vehicleNumber} · ` : ''}
                          {formatClock(ev.startAt)} → {ev.endAt ? formatClock(ev.endAt) : 'En curso'}
                        </span>
                        <span>{ev.durationMins !== null ? `${ev.durationMins} min` : 'Activo'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {(() => {
                const breakdownEntries: { shift: DriverShift; ev: BreakdownEvent; isSupport?: boolean }[] = [];
                if (liveSelectedCard.shift?.breakdownEvents?.length) {
                  liveSelectedCard.shift.breakdownEvents.forEach(ev => {
                    breakdownEntries.push({ shift: liveSelectedCard.shift!, ev, isSupport: false });
                  });
                }
                liveSelectedCard.supportingVehicles.forEach(sv => {
                  if (sv.shift?.breakdownEvents?.length) {
                    sv.shift.breakdownEvents.forEach(ev => {
                      breakdownEntries.push({ shift: sv.shift, ev, isSupport: true });
                    });
                  }
                });
                if (breakdownEntries.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-slate-100 space-y-2 max-h-72 overflow-y-auto pr-0.5">
                    <span className="text-xs font-bold text-rose-700 uppercase block">
                      Averías Mecánicas Reportadas
                    </span>
                    {breakdownEntries.map(({ shift: bShift, ev, isSupport }) => {
                      const isClosed = Boolean(ev.endAt);
                      return (
                        <div
                          key={ev.id}
                          className={`text-xs rounded-xl p-3 border space-y-2 ${
                            isClosed
                              ? 'bg-emerald-50/70 border-emerald-200'
                              : 'bg-rose-50 border-rose-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 font-mono font-bold">
                            <span className={isClosed ? 'text-emerald-950' : 'text-rose-900'}>
                              {isSupport ? `M.${bShift.vehicleNumber} · ` : ''}
                              {formatClock(ev.startAt)} → {ev.endAt ? formatClock(ev.endAt) : 'Activa'}
                              {isClosed && ev.durationMins !== null ? ` (${ev.durationMins} min)` : ''}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isClosed
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : ev.acknowledgedAt
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {isClosed ? 'Finalizada' : ev.acknowledgedAt ? 'Aceptada' : 'Pendiente'}
                            </span>
                          </div>

                          {ev.notes && (
                            <p className={isClosed ? 'text-slate-700' : 'text-rose-800'}>
                              <span className="font-semibold">Novedad:</span> {ev.notes}
                            </p>
                          )}

                          {isClosed ? (
                            <div className="text-[11px] text-slate-700 space-y-0.5 border-t border-emerald-200/70 pt-1.5">
                              <div>
                                <span className="font-semibold text-slate-600">Quién reportó la novedad:</span>{' '}
                                <span className="font-bold text-slate-900">
                                  {ev.resolvedReportedBy || ev.reportedByName || bShift.driverName}
                                </span>
                              </div>
                              {ev.resolutionNotes && (
                                <div>
                                  <span className="font-semibold text-slate-600">Cierre:</span> {ev.resolutionNotes}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-rose-200/80 space-y-2">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                                  Quién reportó la novedad <span className="text-rose-600">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={resolveReporterName}
                                  onChange={e => {
                                    setResolveReporterName(e.target.value);
                                    if (resolveError) setResolveError('');
                                  }}
                                  placeholder="Nombre de quien reportó la novedad"
                                  className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                                  Observación de cierre (Opcional)
                                </label>
                                <input
                                  type="text"
                                  value={resolveNotes}
                                  onChange={e => setResolveNotes(e.target.value)}
                                  placeholder="Ej. Reparación completada / vehículo operativo"
                                  className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                              {resolveError && (
                                <div className="text-[11px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 rounded-lg px-2.5 py-1.5">
                                  {resolveError}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => handleFinalizeBreakdown(bShift.id, ev.id)}
                                disabled={resolveBusyId === ev.id}
                                className="w-full min-h-[40px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {resolveBusyId === ev.id ? 'Finalizando Reporte...' : 'Finalizar Reporte de Avería'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Audit Log Modal ("Archivo de Auditoría de Novedades") */}
      {showAuditModal && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAuditModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-base">Archivo de Auditoría de Novedades</h3>
                  <p className="text-xs text-slate-300">
                    Trazabilidad de fallas mecánicas reportadas, fecha, hora y usuario que aceptó la novedad.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditShowAllDates(v => !v)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  {auditShowAllDates ? 'Ver solo fecha seleccionada' : 'Ver historial completo'}
                </button>
                <button
                  type="button"
                  onClick={handleExportAuditCsv}
                  disabled={filteredAuditLogs.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Fecha</th>
                    <th className="p-2.5">Grupo</th>
                    <th className="p-2.5">Móvil</th>
                    <th className="p-2.5">Ruta</th>
                    <th className="p-2.5">Conductor</th>
                    <th className="p-2.5">Detalle Novedad</th>
                    <th className="p-2.5">Hora Reporte</th>
                    <th className="p-2.5">Estado</th>
                    <th className="p-2.5">Hora Aceptación</th>
                    <th className="p-2.5">Usuario que Aceptó</th>
                    <th className="p-2.5">Quién Reportó</th>
                    <th className="p-2.5">Cierre / Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">{log.date}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{log.workGroupName || log.workGroupId}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">Móvil {log.vehicleNumber}</td>
                      <td className="p-2.5 font-mono text-slate-700">{log.routeCode || 'S/R'}</td>
                      <td className="p-2.5 text-slate-700">{log.driverName}</td>
                      <td className="p-2.5 text-slate-700 max-w-xs">
                        <div>{log.notes || 'Falla mecánica reportada'}</div>
                        {log.acknowledgementNotes && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">Obs: {log.acknowledgementNotes}</div>
                        )}
                      </td>
                      <td className="p-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatClock(log.reportedAt)}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            log.status === 'ACEPTADA'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatClock(log.acknowledgedAt)}
                      </td>
                      <td className="p-2.5 text-slate-800">
                        {log.acknowledgedByUsername ? (
                          <div>
                            <div className="font-bold">{log.acknowledgedByFullName || log.acknowledgedByUsername}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              @{log.acknowledgedByUsername} ({log.acknowledgedByRole})
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Pendiente</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-800">
                        {log.resolvedReportedBy || log.reportedByName || (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-700 whitespace-nowrap">
                        {log.resolvedAt ? (
                          <div>
                            <div className="font-mono font-bold text-emerald-700">
                              {formatClock(log.resolvedAt)}
                              {log.durationMins !== null && log.durationMins !== undefined ? ` (${log.durationMins} min)` : ''}
                            </div>
                            {log.resolutionNotes && (
                              <div className="text-[10px] text-slate-500 whitespace-normal max-w-[180px]">{log.resolutionNotes}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-rose-600 font-semibold">Activa</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-slate-400">
                        No hay registros de auditoría de novedades para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Blocking Un-dismissible Mechanical Breakdown Alarm Pop-up */}
      {activeAlarm && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-rose-500">
            <div className="bg-rose-600 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg leading-tight uppercase tracking-wide">
                    Alerta de Falla Mecánica
                  </h3>
                  <p className="text-xs text-rose-100 font-semibold mt-0.5">
                    Debe aceptar la novedad para continuar monitoreando el tablero.
                  </p>
                </div>
              </div>
              {pendingAlarms.length > 1 && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/40 text-white text-xs font-mono font-bold shrink-0">
                  1 de {pendingAlarms.length}
                </span>
              )}
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Vehículo / Móvil</span>
                  <span className="text-lg font-extrabold font-mono text-slate-900 mt-0.5 block">
                    Móvil {activeAlarm.shift.vehicleNumber}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Grupo / Ruta</span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    {activeAlarm.groupName} · {activeAlarm.routeCode !== 'S/R' ? `Ruta ${activeAlarm.routeCode}` : 'Sin ruta'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Conductor</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">{activeAlarm.shift.driverName}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Hora Reporte</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-rose-700 mt-0.5 block">
                    {formatClock(activeAlarm.breakdown.startAt)}
                  </span>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                <span className="text-[11px] font-bold text-rose-700 uppercase flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Detalle de la Novedad Mecánica
                </span>
                <p className="text-sm font-semibold text-rose-950 mt-1">
                  {activeAlarm.breakdown.notes?.trim() || 'El conductor reportó falla mecánica sin observación escrita.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Observación de Aceptación / Gestión (Opcional)
                </label>
                <input
                  type="text"
                  value={ackNotes}
                  onChange={e => setAckNotes(e.target.value)}
                  placeholder="Ej. Taller notificado / móvil relevo en camino"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              {ackError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {ackError}
                </div>
              )}

              <button
                type="button"
                onClick={handleAcknowledgeAlarm}
                disabled={ackBusy}
                className="w-full min-h-[54px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl font-bold text-base shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
              >
                <CheckCircle2 className="h-5 w-5" />
                {ackBusy ? 'Registrando en Auditoría...' : 'Aceptar Novedad'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spreadsheet / Date-Range Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-sky-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-base">Exportar Datos del Tablero</h3>
                  <p className="text-xs text-slate-300">Seleccione rango de fechas y formato de descarga</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={e => setExportStartDate(e.target.value)}
                    className="w-full h-11 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={e => setExportEndDate(e.target.value)}
                    className="w-full h-11 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contenido del Reporte
                </label>
                <select
                  value={exportScope}
                  onChange={e => setExportScope(e.target.value as 'complete' | 'shifts' | 'audit')}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  <option value="complete">Reporte Completo (Operación + Auditoría)</option>
                  <option value="shifts">Solo Operación, Tiempos y Apoyos</option>
                  <option value="audit">Solo Auditoría de Novedades / Averías</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Formato de Descarga
                </label>
                <select
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value as 'xlsx' | 'xls' | 'ods' | 'csv')}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  <option value="xlsx">Excel (.xlsx) — Hoja de Cálculo</option>
                  <option value="xls">Excel Clásico 97-2003 (.xls) — Hoja de Cálculo</option>
                  <option value="ods">OpenDocument (.ods) — Hoja de Cálculo LibreOffice</option>
                  <option value="csv">CSV (.csv) — Texto separado por comas</option>
                </select>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-600">
                <span>Registros encontrados en el rango:</span>
                <span className="font-mono font-bold text-slate-900">
                  {exportPreviewCounts.shiftsCount} op. · {exportPreviewCounts.auditsCount} aud.
                </span>
              </div>

              {exportError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {exportError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRangeExport}
                  className="min-h-[48px] bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
