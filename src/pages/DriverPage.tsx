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
  Volume2,
  VolumeX,
  MapPin,
  LifeBuoy,
  HelpCircle,
  X,
  FileText,
  Download,
  ExternalLink,
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
  startSupportShiftApi,
  finalizePendingShiftApi,
  startRefillApi,
  endRefillApi,
  startBreakdownApi,
  endBreakdownApi,
} from '../lib/api';
import {
  calcUnionPauseOverlapMs,
  computeShiftTimeBreakdown,
  formatMsAsHoursMins,
} from '../utils/shiftTimeMetrics';

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
  const { state, syncNow } = useAppContext();
  const { user, lockedWorkGroupId } = useAuth();

  // Initial setup form state
  const [selectedGroupId, setSelectedGroupId] = useState<string>(lockedWorkGroupId || state.activeWorkGroupId || '');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(user?.employeeId || '');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
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
  const [checklistOdometer, setChecklistOdometer] = useState('');
  const [checklistServiceTime, setChecklistServiceTime] = useState('');
  const [checklistError, setChecklistError] = useState('');
  const [breakdownNote, setBreakdownNote] = useState('');
  const [breakdownReporter, setBreakdownReporter] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [speechMuted, setSpeechMuted] = useState(false);

  // Support ("Apoyo") & Help ("Ayuda") state
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSupportWarningModal, setShowSupportWarningModal] = useState(false);
  const [showSupportRouteModal, setShowSupportRouteModal] = useState(false);
  const [supportRouteId, setSupportRouteId] = useState('');
  const [supportManualCode, setSupportManualCode] = useState('');
  const [supportIncludeOtherGroups, setSupportIncludeOtherGroups] = useState(false);
  const [pendingParentShift, setPendingParentShift] = useState<DriverShift | null>(null);

  // Weight collection modal before finalizing shift ("Peso recogido en ruta")
  const [weightFinishModal, setWeightFinishModal] = useState<{
    mode: 'arrive-base' | 'finalize-pending';
    targetShift: DriverShift;
  } | null>(null);
  const [weightTonsInput, setWeightTonsInput] = useState('');
  const [weightModalError, setWeightModalError] = useState('');
  const [pdfViewerModal, setPdfViewerModal] = useState<{
    title: string;
    fileName: string;
    blobUrl: string;
  } | null>(null);

  type ConfirmActionType =
    | 'start-shift'
    | 'start-route'
    | 'end-route'
    | 'arrive-base'
    | 'refill-start'
    | 'refill-end'
    | 'breakdown-start'
    | 'breakdown-end'
    | 'start-support'
    | 'continue-pending'
    | 'finalize-pending';

  const [pendingConfirm, setPendingConfirm] = useState<{
    type: ConfirmActionType;
    title: string;
    subtitle: string;
    spokenPhrase: string;
    detail?: string;
  } | null>(null);

  const speakConfirmationPrompt = (phrase: string, forceUnmuted = false) => {
    if (speechMuted && !forceUnmuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      const voices = window.speechSynthesis.getVoices();
      const esVoice =
        voices.find(v => v.lang.toLowerCase().startsWith('es-co')) ||
        voices.find(v => v.lang.toLowerCase().startsWith('es-419')) ||
        voices.find(v => v.lang.toLowerCase().startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
      utterance.lang = esVoice?.lang || 'es-CO';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore speech synthesis errors on restricted devices
    }
  };

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  };

  // 1-second live chronometer tick + cleanup speech on unmount
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      stopSpeech();
    };
  }, []);

  // Revoke generated PDF Blob URLs when closed or unmounted
  useEffect(() => {
    const url = pdfViewerModal?.blobUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfViewerModal]);

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

  // Automatically restore or sync any open (or externally closed) shift for this user from realtime state
  // Prioritize active support shifts or unpaused shifts over paused primary shifts.
  useEffect(() => {
    if (!user || pendingParentShift) return;
    const matchingOpen = state.driverShifts.filter(
      s => s.status !== 'EN_BASE' && (s.createdByUserId === user.id || (user.employeeId && s.driverId === user.employeeId))
    );
    const prioritized =
      matchingOpen.find(s => s.isSupportShift && !s.isPausedForSupport) ||
      matchingOpen.find(s => !s.isPausedForSupport) ||
      matchingOpen[0];

    if (prioritized) {
      setActiveShift(prioritized);
      if (!prioritized.checklistConfirmed) {
        setShowChecklistModal(true);
      }
      return;
    }

    if (activeShift) {
      const updatedCurrent = state.driverShifts.find(s => s.id === activeShift.id);
      if (updatedCurrent && updatedCurrent.status === 'EN_BASE') {
        setActiveShift(null);
        setCompletedShiftSummary(updatedCurrent);
      }
    }
  }, [state.driverShifts, user, pendingParentShift, activeShift]);

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

  const groupRoutes = useMemo(() => {
    if (!selectedGroupId) return [];
    return state.routes.filter(r => r.workGroupId === selectedGroupId);
  }, [state.routes, selectedGroupId]);

  const selectedRoute = useMemo(
    () => state.routes.find(r => r.id === selectedRouteId) || null,
    [state.routes, selectedRouteId]
  );

  const effectiveRoute = useMemo(() => {
    if (activeShift) {
      return (
        state.routes.find(r => activeShift.routeId && r.id === activeShift.routeId) ||
        state.routes.find(
          r =>
            Boolean(activeShift.routeCode) &&
            r.code === activeShift.routeCode &&
            r.workGroupId === activeShift.workGroupId
        ) ||
        null
      );
    }
    return selectedRoute;
  }, [activeShift, state.routes, selectedRoute]);

  const selectedDriver = useMemo(
    () => state.employees.find(e => e.id === selectedDriverId) || null,
    [state.employees, selectedDriverId]
  );

  const selectedGroup = useMemo(
    () => state.workGroups.find(g => g.id === selectedGroupId) || null,
    [state.workGroups, selectedGroupId]
  );

  const handleOpenAndDownloadRoutePdf = (docType: 'map' | 'discharge') => {
    setErrorMsg('');
    if (!effectiveRoute) {
      setErrorMsg('Seleccione una ruta primero para descargar y abrir su documento PDF.');
      return;
    }

    const isMap = docType === 'map';
    const label = isMap ? 'Mapa de la Ruta' : 'Ficha de Descargue';
    const dataUrl = isMap ? effectiveRoute.routeMapPdfDataUrl : effectiveRoute.dischargeSheetPdfDataUrl;
    const rawName = isMap
      ? effectiveRoute.routeMapPdfName || `Mapa_Ruta_${effectiveRoute.code || effectiveRoute.id}.pdf`
      : effectiveRoute.dischargeSheetPdfName || `Ficha_Descargue_${effectiveRoute.code || effectiveRoute.id}.pdf`;

    if (!dataUrl || !dataUrl.startsWith('data:application/pdf;base64,')) {
      setErrorMsg(
        `La ruta [${effectiveRoute.code}] ${effectiveRoute.name} no tiene cargado el PDF de ${label}. Solicite a Administración o Supervisión cargarlo en Rutas Base.`
      );
      return;
    }

    try {
      const base64 = dataUrl.slice('data:application/pdf;base64,'.length);
      const binary = atob(base64);
      if (!binary.startsWith('%PDF-')) {
        setErrorMsg(`El archivo adjunto de ${label} no tiene un formato PDF válido.`);
        return;
      }

      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const safeFileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;

      // Descarga automática del PDF
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = safeFileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      // Apertura automática en el visor PDF integrado
      setPdfViewerModal({
        title: `${label} — [${effectiveRoute.code}] ${effectiveRoute.name}`,
        fileName: safeFileName,
        blobUrl,
      });
    } catch {
      setErrorMsg(`No se pudo descargar o abrir el PDF de ${label}.`);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-CA');

  // Auto-match today's assignment route when vehicle or driver is selected in Step 1
  useEffect(() => {
    if (activeShift || !selectedGroupId) return;
    const match = state.assignments.find(a => {
      if (a.date.slice(0, 10) !== todayStr) return false;
      if (a.workGroupId && a.workGroupId !== selectedGroupId) return false;
      if (a.status === 'Cancelado') return false;
      if (selectedVehicleId && a.vehicleId === selectedVehicleId) return true;
      if (selectedDriverId && (a.employeeIds || []).includes(selectedDriverId)) return true;
      return false;
    });
    if (match && match.routeId) {
      setSelectedRouteId(match.routeId);
    }
  }, [activeShift, selectedGroupId, selectedVehicleId, selectedDriverId, state.assignments, todayStr]);

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

    // Active support pause timer
    const openSupport = activeShift.isPausedForSupport
      ? (activeShift.supportEvents || []).find(ev => !ev.endAt)
      : null;

    // Route execution elapsed timer (freezes visually while paused for refill, breakdown, or support)
    let routeExecElapsedMs = 0;
    if (t2) {
      const pauseCandidates: number[] = [];
      if (openRefill) pauseCandidates.push(new Date(openRefill.startAt).getTime());
      if (openBreakdown) pauseCandidates.push(new Date(openBreakdown.startAt).getTime());
      if (openSupport) pauseCandidates.push(new Date(openSupport.startAt).getTime());
      const earliestOpenPause = pauseCandidates.length > 0 ? Math.min(...pauseCandidates) : null;
      const endRef = t3 || earliestOpenPause || nowMs;

      const unionPausedDuringRouteMs = calcUnionPauseOverlapMs(
        [
          activeShift.refillEvents || [],
          activeShift.breakdownEvents || [],
          activeShift.supportEvents || [],
        ],
        t2,
        endRef,
        nowMs
      );
      routeExecElapsedMs = Math.max(0, endRef - t2 - unionPausedDuringRouteMs);
    }

    const computed = computeShiftTimeBreakdown(activeShift, nowMs);

    return {
      totalOperationMs,
      routeExecElapsedMs,
      currentRefillMs,
      currentBreakdownMs,
      routeAlertLevel: computed.activeAlertLevel,
      routeElapsedMs: computed.routeElapsedMs,
    };
  }, [activeShift, nowMs]);

  // ── Request Confirmation Helpers (All time actions) ─────────────────────────
  const openActionConfirmation = (type: ConfirmActionType) => {
    setErrorMsg('');

    if (type === 'start-shift') {
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
      const routeText = selectedRoute ? ` · Ruta ${selectedRoute.code}` : '';
      const phrase = `¿Desea confirmar el Inicio de Turno para el móvil ${cleanVehicleNumber}? Presione el botón verde para confirmar o el botón rojo para cancelar.`;
      setPendingConfirm({
        type,
        title: '1. Confirmar Inicio de Turno (T1)',
        subtitle: `Móvil ${cleanVehicleNumber} · ${selectedDriver.name}${routeText}`,
        spokenPhrase: phrase,
      });
      speakConfirmationPrompt(phrase);
      return;
    }

    if (type === 'continue-pending' && pendingParentShift) {
      const phrase = `¿Desea confirmar continuar con su ruta pendiente en el móvil ${pendingParentShift.vehicleNumber}? Presione el botón verde para confirmar o el botón rojo para cancelar.`;
      setPendingConfirm({
        type,
        title: 'Confirmar Continuar Ruta Pendiente',
        subtitle: `Móvil ${pendingParentShift.vehicleNumber} · ${pendingParentShift.routeCode ? `Ruta ${pendingParentShift.routeCode}` : 'Turno principal'}`,
        spokenPhrase: phrase,
      });
      speakConfirmationPrompt(phrase);
      return;
    }

    if (type === 'finalize-pending' && pendingParentShift) {
      const phrase = `¿Desea confirmar la finalización de su ruta pendiente en el móvil ${pendingParentShift.vehicleNumber}? Presione el botón verde para confirmar o el botón rojo para cancelar.`;
      setPendingConfirm({
        type,
        title: 'Confirmar Finalizar Ruta Pendiente',
        subtitle: `Móvil ${pendingParentShift.vehicleNumber} · ${pendingParentShift.routeCode ? `Ruta ${pendingParentShift.routeCode}` : 'Turno principal'}`,
        spokenPhrase: phrase,
        detail: 'Se registrará el cierre definitivo de la jornada principal.',
      });
      speakConfirmationPrompt(phrase);
      return;
    }

    if (!activeShift) return;
    const movil = activeShift.vehicleNumber;
    const routeLabel = activeShift.routeCode ? ` · Ruta ${activeShift.routeCode}` : '';

    if (type === 'start-support') {
      const chosenRoute = state.routes.find(r => r.id === supportRouteId) || null;
      const chosenLabel = chosenRoute ? `${chosenRoute.code} - ${chosenRoute.name}` : supportManualCode.trim();
      const phrase = `¿Desea confirmar el inicio de la ruta de apoyo ${chosenLabel} con el móvil ${movil}? Su ruta actual quedará en pausa. Presione el botón verde para confirmar o el botón rojo para cancelar.`;
      setPendingConfirm({
        type,
        title: 'Confirmar Inicio de Ruta de Apoyo',
        subtitle: `Móvil ${movil} · ${activeShift.driverName}`,
        spokenPhrase: phrase,
        detail: `Nueva ruta de apoyo: ${chosenLabel}`,
      });
      speakConfirmationPrompt(phrase);
      return;
    }

    const configMap: Record<
      Exclude<ConfirmActionType, 'start-shift' | 'start-support' | 'continue-pending' | 'finalize-pending'>,
      { title: string; spokenPhrase: string; detail?: string }
    > = {
      'start-route': {
        title: activeShift.isSupportShift ? '2. Confirmar Inicio de Apoyo (T2)' : '2. Confirmar Inicio de Ruta (T2)',
        spokenPhrase: `¿Desea confirmar el Inicio de Ruta para el móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
      },
      'end-route': {
        title: activeShift.isSupportShift ? '3. Confirmar Fin de Ruta Apoyo (T3)' : '3. Confirmar Fin de Ruta (T3)',
        spokenPhrase: `¿Desea confirmar el Fin de Ruta para el móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
      },
      'arrive-base': {
        title: activeShift.isSupportShift ? '4. Confirmar Finalizar Apoyo (T4)' : '4. Confirmar Llegada a Base (T4)',
        spokenPhrase: activeShift.isSupportShift
          ? `¿Desea confirmar la finalización de la ruta de apoyo del móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`
          : `¿Desea confirmar la Llegada a Base y finalizar el turno del móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
      },
      'refill-start': {
        title: '5. Confirmar Inicio de Relleno / Descargue',
        spokenPhrase: `¿Desea confirmar el inicio de pausa por relleno o descargue para el móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
      },
      'refill-end': {
        title: '5. Confirmar Fin de Descargue (Reanudar)',
        spokenPhrase: `¿Desea confirmar el fin de descargue y reanudar la jornada del móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
      },
      'breakdown-start': {
        title: '6. Confirmar Reporte de Avería Mecánica',
        spokenPhrase: `Atención. ¿Desea confirmar el reporte de avería mecánica para el móvil ${movil}? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
        detail: breakdownNote.trim() ? `Detalle reportado: ${breakdownNote.trim()}` : 'Sin detalle escrito (se enviará alarma al tablero de control).',
      },
      'breakdown-end': {
        title: '6. Confirmar Fin de Avería / Vehículo Operativo',
        spokenPhrase: `¿Desea confirmar que el móvil ${movil} superó la avería y vuelve a estar operativo? Presione el botón verde para confirmar o el botón rojo para cancelar.`,
        detail: `Reportado por: ${breakdownReporter.trim() || activeShift.driverName}`,
      },
    };

    const cfg = configMap[type];
    setPendingConfirm({
      type,
      title: cfg.title,
      subtitle: `Móvil ${movil} · ${activeShift.driverName}${routeLabel}`,
      spokenPhrase: cfg.spokenPhrase,
      detail: cfg.detail,
    });
    speakConfirmationPrompt(cfg.spokenPhrase);
  };

  const handleCancelConfirmation = () => {
    stopSpeech();
    setPendingConfirm(null);
  };

  // ── Action Execution Handlers ───────────────────────────────────────────────
  const handleStartShift = async () => {
    if (!selectedGroupId || !selectedDriver) return;
    const cleanVehicleNumber = vehicleNumber.trim();
    if (!cleanVehicleNumber) return;

    setBusyAction('start');
    try {
      const { shift } = await startDriverShiftApi({
        workGroupId: selectedGroupId,
        workGroupName: selectedGroup?.name || '',
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
        vehicleNumber: cleanVehicleNumber,
        vehicleId: selectedVehicleId || '',
        routeId: selectedRoute?.id || '',
        routeCode: selectedRoute?.code || '',
        routeName: selectedRoute?.name || '',
      });
      setCompletedShiftSummary(null);
      setActiveShift(shift);
      setChecklistItems({ brakesTires: false, lightsSignals: false, fluidsLeaks: false, docsSafety: false });
      setChecklistOdometer('');
      setChecklistServiceTime('');
      setChecklistError('');
      setShowChecklistModal(true);
      await syncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al iniciar turno.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmChecklist = async () => {
    if (!activeShift) return;
    setChecklistError('');
    const parsedOdometer = Number(checklistOdometer);
    if (checklistOdometer.trim() === '' || !Number.isFinite(parsedOdometer) || parsedOdometer < 0) {
      setChecklistError('Ingrese un valor de Odómetro válido (mayor o igual a 0).');
      return;
    }
    const cleanServiceTime = checklistServiceTime.trim();
    if (!cleanServiceTime) {
      setChecklistError('Ingrese el Tiempo de Servicio del vehículo.');
      return;
    }

    setBusyAction('checklist');
    setErrorMsg('');
    try {
      const { shift } = await confirmChecklistApi(activeShift.id, {
        odometer: Number(parsedOdometer.toFixed(2)),
        serviceTime: cleanServiceTime.slice(0, 50),
      });
      setActiveShift(shift);
      setChecklistOdometer('');
      setChecklistServiceTime('');
      setChecklistError('');
      setShowChecklistModal(false);
      await syncNow();
    } catch (err: any) {
      setChecklistError(err?.message || 'Error al confirmar checklist.');
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
      await syncNow();
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
      await syncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo finalizar la ruta.');
    } finally {
      setBusyAction(null);
    }
  };

  const openWeightFinishModal = (mode: 'arrive-base' | 'finalize-pending', targetShift: DriverShift) => {
    setErrorMsg('');
    setWeightModalError('');
    setWeightTonsInput(
      targetShift.weightTons !== null && targetShift.weightTons !== undefined
        ? String(targetShift.weightTons)
        : ''
    );
    setWeightFinishModal({ mode, targetShift });
    const phrase = targetShift.isSupportShift
      ? `Para finalizar el apoyo del móvil ${targetShift.vehicleNumber}, ingrese el peso recogido en ruta en toneladas.`
      : `Para finalizar el turno del móvil ${targetShift.vehicleNumber}, ingrese el peso recogido en ruta en toneladas y presione el botón verde para confirmar.`;
    speakConfirmationPrompt(phrase);
  };

  const handleConfirmWeightFinish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!weightFinishModal) return;
    const normalized = weightTonsInput.replace(',', '.').trim();
    if (!normalized) {
      setWeightModalError('Debe ingresar el peso recogido en ruta (toneladas) para finalizar el turno.');
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
      setWeightModalError('Ingrese un peso válido entre 0 y 500 toneladas.');
      return;
    }
    const roundedWeight = Math.round(parsed * 100) / 100;
    const { mode } = weightFinishModal;
    stopSpeech();

    if (mode === 'arrive-base') {
      const ok = await handleArriveBase(roundedWeight);
      if (ok) setWeightFinishModal(null);
    } else {
      const ok = await handleFinalizePendingShift(roundedWeight);
      if (ok) setWeightFinishModal(null);
    }
  };

  const handleArriveBase = async (weightTons?: number): Promise<boolean> => {
    if (!activeShift) return false;
    setBusyAction('arrive-base');
    setErrorMsg('');
    setWeightModalError('');
    try {
      const { shift, parentShift } = await arriveBaseApi(
        activeShift.id,
        weightTons !== undefined ? { weightTons, requireWeight: true } : undefined
      );
      setActiveShift(null);
      setVehicleNumber('');
      setSelectedVehicleId('');
      setSelectedRouteId('');
      setBreakdownNote('');
      setBreakdownReporter('');

      if (shift.isSupportShift && parentShift) {
        setCompletedShiftSummary(null);
        setPendingParentShift(parentShift);
        const pendingPhrase = `Apoyo finalizado. Atención: aún tiene pendiente una ruta en curso para el móvil ${parentShift.vehicleNumber}. Seleccione continuar ruta o finalizar ruta.`;
        speakConfirmationPrompt(pendingPhrase);
      } else {
        setCompletedShiftSummary(shift);
      }
      await syncNow();
      return true;
    } catch (err: any) {
      const msg = err?.message || 'No se pudo registrar llegada a base.';
      setErrorMsg(msg);
      setWeightModalError(msg);
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenSupportClick = () => {
    if (!activeShift) return;
    setErrorMsg('');
    if (activeShift.isInBreakdown || activeShift.isPausedForRefill) {
      setErrorMsg('Finalice la pausa de relleno o la avería mecánica activa antes de iniciar un Apoyo.');
      return;
    }
    setShowSupportWarningModal(true);
    speakConfirmationPrompt(
      'Atención. ¿Desea pausar la ruta actual para iniciar otra ruta? Tenga en cuenta que su ruta actual aún no finaliza. Presione aceptar para continuar o cancelar para regresar.'
    );
  };

  const handleConfirmSupportWarning = () => {
    stopSpeech();
    setShowSupportWarningModal(false);
    setSupportRouteId('');
    setSupportManualCode('');
    setSupportIncludeOtherGroups(false);
    setShowSupportRouteModal(true);
    speakConfirmationPrompt('Seleccione la nueva ruta de apoyo para iniciar.');
  };

  const handleStartSupportShift = async () => {
    if (!activeShift) return;
    const chosenRoute = state.routes.find(r => r.id === supportRouteId) || null;
    const manual = supportManualCode.trim();
    if (!chosenRoute && !manual) {
      setErrorMsg('Debe seleccionar o escribir una ruta de apoyo.');
      return;
    }
    setBusyAction('support-start');
    setErrorMsg('');
    try {
      const { supportShift } = await startSupportShiftApi(activeShift.id, {
        routeId: chosenRoute?.id || '',
        routeCode: chosenRoute?.code || manual,
        routeName: chosenRoute?.name || `Apoyo ${manual}`,
      });
      setShowSupportRouteModal(false);
      setCompletedShiftSummary(null);
      setActiveShift(supportShift);
      await syncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo iniciar la ruta de apoyo.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleContinuePendingShift = () => {
    if (!pendingParentShift) return;
    const resumed = pendingParentShift;
    setPendingParentShift(null);
    setCompletedShiftSummary(null);
    setActiveShift(resumed);
  };

  const handleFinalizePendingShift = async (weightTons?: number): Promise<boolean> => {
    if (!pendingParentShift) return false;
    setBusyAction('finalize-pending');
    setErrorMsg('');
    setWeightModalError('');
    try {
      const { shift } = await finalizePendingShiftApi(
        pendingParentShift.id,
        weightTons !== undefined ? { weightTons, requireWeight: true } : undefined
      );
      setPendingParentShift(null);
      setActiveShift(null);
      setCompletedShiftSummary(shift);
      await syncNow();
      return true;
    } catch (err: any) {
      const msg = err?.message || 'No se pudo finalizar la ruta pendiente.';
      setErrorMsg(msg);
      setWeightModalError(msg);
      return false;
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
      await syncNow();
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
    const reporterName = breakdownReporter.trim() || activeShift.driverName;
    try {
      const { shift } = activeShift.isInBreakdown
        ? await endBreakdownApi(activeShift.id, {
            resolvedReportedBy: reporterName,
          })
        : await startBreakdownApi(activeShift.id, breakdownNote, reporterName);
      setActiveShift(shift);
      if (!activeShift.isInBreakdown) {
        setBreakdownNote('');
      }
      setBreakdownReporter('');
      await syncNow();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar estado de avería mecánica.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!pendingConfirm) return;
    const actionType = pendingConfirm.type;
    stopSpeech();
    setPendingConfirm(null);

    switch (actionType) {
      case 'start-shift':
        await handleStartShift();
        break;
      case 'start-route':
        await handleStartRoute();
        break;
      case 'end-route':
        await handleEndRoute();
        break;
      case 'arrive-base':
        await handleArriveBase();
        break;
      case 'refill-start':
      case 'refill-end':
        await handleToggleRefill();
        break;
      case 'breakdown-start':
      case 'breakdown-end':
        await handleToggleBreakdown();
        break;
      case 'start-support':
        await handleStartSupportShift();
        break;
      case 'continue-pending':
        handleContinuePendingShift();
        break;
      case 'finalize-pending':
        await handleFinalizePendingShift();
        break;
    }
  };

  const allChecklistChecked =
    checklistItems.brakesTires &&
    checklistItems.lightsSignals &&
    checklistItems.fluidsLeaks &&
    checklistItems.docsSafety;

  const isChecklistComplete =
    allChecklistChecked &&
    checklistOdometer.trim() !== '' &&
    Number.isFinite(Number(checklistOdometer)) &&
    Number(checklistOdometer) >= 0 &&
    checklistServiceTime.trim().length > 0;

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
                {activeShift.routeCode ? ` · Ruta ${activeShift.routeCode}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {activeShift && !activeShift.isSupportShift && !activeShift.isPausedForSupport && (
              <button
                type="button"
                onClick={handleOpenSupportClick}
                disabled={busyAction === 'support-start'}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                title="Pausar ruta actual e iniciar ruta de apoyo"
              >
                <LifeBuoy className="h-4 w-4" />
                <span>Apoyo</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-sky-300 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Ayuda rápida del módulo Conductores"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Ayuda</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!speechMuted) stopSpeech();
                setSpeechMuted(m => !m);
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={speechMuted ? 'Activar voz de confirmación' : 'Silenciar voz de confirmación'}
            >
              {speechMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
              <span className="hidden sm:inline">{speechMuted ? 'Audio Silenciado' : 'Audio Activo'}</span>
            </button>

            {activeShift && liveTimers && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-left sm:text-right shrink-0">
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

        {/* Documentos PDF de la Ruta (Mapa de la Ruta y Ficha de Descargue) */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {effectiveRoute ? (
              <span>
                Documentos de ruta <strong className="text-slate-200">[{effectiveRoute.code}] {effectiveRoute.name}</strong>
              </span>
            ) : (
              <span>Seleccione una ruta para consultar sus documentos PDF</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenAndDownloadRoutePdf('map')}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all border ${
                effectiveRoute?.routeMapPdfDataUrl
                  ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500 shadow-sm active:scale-[0.98]'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span>Mapa de la Ruta</span>
              <Download className="h-3.5 w-3.5 opacity-80 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleOpenAndDownloadRoutePdf('discharge')}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all border ${
                effectiveRoute?.dischargeSheetPdfDataUrl
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm active:scale-[0.98]'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span>Ficha de Descargue</span>
              <Download className="h-3.5 w-3.5 opacity-80 shrink-0" />
            </button>
          </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  setSelectedRouteId('');
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

            {/* 4. Ruta (Opcional / Auto-asignada) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-600" />
                Ruta Asignada (Opcional)
              </label>
              <select
                value={selectedRouteId}
                onChange={e => setSelectedRouteId(e.target.value)}
                disabled={!selectedGroupId}
                className="w-full h-12 border border-slate-300 rounded-xl px-3.5 text-base font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
              >
                <option value="">Sin ruta preseleccionada...</option>
                {groupRoutes.map(r => (
                  <option key={r.id} value={r.id}>
                    [{r.code}] {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Primary Action: Botón 1 - Inicio de Turno */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => openActionConfirmation('start-shift')}
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
          {/* Active Support Route Banner */}
          {activeShift.isSupportShift && (
            <div className="bg-orange-50 border-2 border-orange-500 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <LifeBuoy className="h-7 w-7 text-orange-600 shrink-0" />
                <div>
                  <h4 className="font-extrabold text-orange-950 text-base uppercase tracking-wide">
                    Ruta de Apoyo en Curso — {activeShift.routeCode || activeShift.routeName || 'Apoyo Operativo'}
                  </h4>
                  <p className="text-xs text-orange-900 font-medium mt-0.5">
                    Su ruta principal ({activeShift.parentRouteCode ? `Ruta ${activeShift.parentRouteCode}` : 'turno principal'}) se encuentra PAUSADA hasta que finalice este apoyo.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-extrabold uppercase tracking-wider text-center shrink-0">
                Modo Apoyo
              </span>
            </div>
          )}

          {!activeShift.isSupportShift && (activeShift.supportEvents?.length || 0) > 0 && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                <LifeBuoy className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Ruta principal retomada tras apoyo ({activeShift.supportEvents?.length} apoyo(s) · {activeShift.supportTotalMins || 0} min).
                </span>
              </div>
            </div>
          )}

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

          {liveTimers.routeAlertLevel !== 'none' && (
            <div
              className={`rounded-2xl p-4 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                liveTimers.routeAlertLevel === 'critical'
                  ? 'bg-rose-50 border-rose-500 text-rose-950'
                  : 'bg-amber-50 border-amber-500 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle
                  className={`h-7 w-7 shrink-0 ${
                    liveTimers.routeAlertLevel === 'critical' ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <div>
                  <h4 className="font-extrabold text-base uppercase tracking-wide">
                    {liveTimers.routeAlertLevel === 'critical'
                      ? 'Alerta Crítica: Ruta Supera 10 Horas'
                      : 'Alerta Operativa: Ruta Supera 8 Horas'}
                  </h4>
                  <p className="text-xs font-medium mt-0.5">
                    Han transcurrido {formatMsAsHoursMins(liveTimers.routeElapsedMs)} desde el Inicio de Ruta (T2).
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold uppercase text-center shrink-0 ${
                  liveTimers.routeAlertLevel === 'critical'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {formatMsAsHoursMins(liveTimers.routeElapsedMs)}
              </span>
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
                  Ejecución Neta de Ruta{' '}
                  {activeShift.isPausedForRefill || activeShift.isInBreakdown || activeShift.isPausedForSupport
                    ? '(PAUSADA / DESCONTADA)'
                    : '(sin averías/rellenos)'}
                  :
                </span>
                <span className="font-mono font-bold tabular-nums text-lg text-slate-900">
                  {activeShift.t3EndRouteAt
                    ? formatDurationMinutes(activeShift.routeExecutionNetMins ?? activeShift.routeExecutionMins)
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
                onClick={() => openActionConfirmation('start-route')}
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
                onClick={() => openActionConfirmation('end-route')}
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

              {/* Button 4: Llegada a Base (T4) -> solicita peso recogido antes de finalizar */}
              <button
                type="button"
                onClick={() => openWeightFinishModal('arrive-base', activeShift)}
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
                  {busyAction === 'arrive-base'
                    ? 'Cerrando Jornada...'
                    : activeShift.isSupportShift
                      ? '4. Finalizar Apoyo (T4)'
                      : '4. Llegada a Base (T4)'}
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
                onClick={() => openActionConfirmation(activeShift.isPausedForRefill ? 'refill-end' : 'refill-start')}
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

              {!activeShift.isInBreakdown ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={breakdownNote}
                    onChange={e => setBreakdownNote(e.target.value)}
                    placeholder="Detalle opcional de la falla (ej. Llanta / Frenos)"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <input
                    type="text"
                    value={breakdownReporter}
                    onChange={e => setBreakdownReporter(e.target.value)}
                    placeholder={`Quién reporta la novedad (por defecto: ${activeShift.driverName})`}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Quién reportó la novedad (al finalizar avería)
                  </label>
                  <input
                    type="text"
                    value={breakdownReporter}
                    onChange={e => setBreakdownReporter(e.target.value)}
                    placeholder={`Nombre (por defecto: ${activeShift.driverName})`}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {activeShift.breakdownEvents.length > 0 && (
                <div className="space-y-1.5 max-h-28 overflow-y-auto text-xs border-t border-slate-100 pt-2">
                  {activeShift.breakdownEvents.map((ev, idx) => (
                    <div key={ev.id} className="text-slate-600 font-mono tabular-nums">
                      <div className="flex justify-between">
                        <span>Avería #{idx + 1}: {formatClock(ev.startAt)} → {ev.endAt ? formatClock(ev.endAt) : 'Activa'}</span>
                        <span className="font-bold">{ev.durationMins !== null ? `${ev.durationMins} min` : 'Activa'}</span>
                      </div>
                      {(ev.resolvedReportedBy || ev.reportedByName) && (
                        <div className="text-[11px] font-sans text-slate-500">
                          Reportó: {ev.resolvedReportedBy || ev.reportedByName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => openActionConfirmation(activeShift.isInBreakdown ? 'breakdown-end' : 'breakdown-start')}
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

          {(() => {
            const summaryMetrics = computeShiftTimeBreakdown(completedShiftSummary, nowMs);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[11px] font-semibold text-blue-800 uppercase block">
                    Tiempo Total Desplazamiento
                  </span>
                  <span className="text-base font-bold font-mono tabular-nums text-blue-950 mt-1 block">
                    {formatDurationMinutes(summaryMetrics.totalTransitMins)}
                  </span>
                  <span className="text-[10px] text-blue-700 font-mono block mt-0.5">
                    Ida: {summaryMetrics.initialTransitMins ?? 0}m + Retorno: {summaryMetrics.returnTransitMins ?? 0}m
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase block">
                    Tiempo Neto de Ruta
                  </span>
                  <span className="text-base font-bold font-mono tabular-nums text-emerald-900 mt-1 block">
                    {formatDurationMinutes(summaryMetrics.routeNetMins)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono block mt-0.5">
                    Bruto: {summaryMetrics.routeGrossMins ?? 0}m · Desc: {summaryMetrics.routeDeductedMins}m
                  </span>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-semibold text-amber-800 uppercase block">Total Relleno / Descargue</span>
                  <span className="text-base font-bold font-mono tabular-nums text-amber-900 mt-1 block">
                    {formatDurationMinutes(summaryMetrics.totalRefillMins)}
                  </span>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="text-[11px] font-semibold text-rose-800 uppercase block">Total Averías Mecánicas</span>
                  <span className="text-base font-bold font-mono tabular-nums text-rose-900 mt-1 block">
                    {formatDurationMinutes(summaryMetrics.totalBreakdownMins)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Operación Neta (sin pausas)</span>
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1 block">
                    {formatDurationMinutes(summaryMetrics.totalOperationNetMins)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-xl">
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase block">Tiempo Total Operación (T4 - T1)</span>
                  <span className="text-base font-bold font-mono tabular-nums mt-1 block">
                    {formatDurationMinutes(summaryMetrics.totalOperationMins)}
                  </span>
                </div>
                {completedShiftSummary.weightTons !== null && completedShiftSummary.weightTons !== undefined && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl col-span-2 sm:col-span-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-purple-600" />
                      Peso Recogido en Ruta
                    </span>
                    <span className="text-lg font-extrabold font-mono tabular-nums text-purple-950">
                      {completedShiftSummary.weightTons.toFixed(2)} Ton
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
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
            {todayCompletedShifts.map(s => {
              const sm = computeShiftTimeBreakdown(s, nowMs);
              return (
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
                    {s.weightTons !== null && s.weightTons !== undefined && (
                      <span className="text-purple-700 font-bold">Peso: {s.weightTons.toFixed(2)}t</span>
                    )}
                    <span className="text-blue-700 font-semibold">Despl: {sm.totalTransitMins ?? 0}m</span>
                    <span className="text-emerald-700 font-bold">Ruta Neta: {sm.routeNetMins ?? 0}m</span>
                    <span className="text-amber-700 font-semibold">Relleno: {sm.totalRefillMins}m</span>
                    <span className="text-rose-700 font-semibold">Avería: {sm.totalBreakdownMins}m</span>
                    <span className="text-slate-900 font-bold">Total: {sm.totalOperationMins ?? 0}m</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mandatory Preoperational Checklist Modal */}
      {showChecklistModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="bg-amber-500 text-slate-950 p-5 flex items-center gap-3 shrink-0">
              <ShieldCheck className="h-8 w-8 shrink-0" />
              <div>
                <h3 className="font-bold text-lg leading-tight">Recordatorio Obligatorio</h3>
                <p className="text-xs font-semibold opacity-90">Checklist Preoperacional del Vehículo</p>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Odómetro (km) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={checklistOdometer}
                    onChange={e => {
                      setChecklistOdometer(e.target.value);
                      if (checklistError) setChecklistError('');
                    }}
                    placeholder="Ej. 125430"
                    className="w-full h-12 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3.5 text-sm font-bold font-mono tabular-nums text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tiempo de Servicio <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    required
                    value={checklistServiceTime}
                    onChange={e => {
                      setChecklistServiceTime(e.target.value);
                      if (checklistError) setChecklistError('');
                    }}
                    placeholder="Ej. 4520 hrs / 08:30"
                    className="w-full h-12 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3.5 text-sm font-bold font-mono text-slate-900 outline-none"
                  />
                </div>
              </div>

              {checklistError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {checklistError}
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmChecklist}
                disabled={!isChecklistComplete || busyAction === 'checklist'}
                className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busyAction === 'checklist' ? 'Confirmando...' : 'Checklist Preoperacional Realizado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support ("Apoyo") Step 1: Warning Pop-Up Modal */}
      {showSupportWarningModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-orange-500">
            <div className="bg-orange-500 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-7 w-7 shrink-0" />
                <div>
                  <h3 className="font-extrabold text-base leading-tight uppercase">Advertencia de Apoyo</h3>
                  <p className="text-xs text-orange-100 font-semibold mt-0.5">
                    Móvil {activeShift.vehicleNumber} · {activeShift.driverName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  speakConfirmationPrompt(
                    '¿Desea pausar la ruta actual para iniciar otra ruta? Tenga en cuenta que su ruta actual aún no finaliza.',
                    true
                  )
                }
                className="p-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
                title="Escuchar advertencia"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2">
                <p className="text-sm font-bold text-orange-950 leading-relaxed">
                  ¿Desea pausar la ruta actual para iniciar otra ruta?
                </p>
                <p className="text-xs font-semibold text-orange-900">
                  Tenga en cuenta que su ruta actual aún no finaliza.
                </p>
                <div className="pt-2 border-t border-orange-200/70 text-xs text-orange-800 font-mono">
                  Ruta en curso: {activeShift.routeCode || 'Sin código'} · Estado: {activeShift.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setShowSupportWarningModal(false);
                  }}
                  className="min-h-[52px] bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-base transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSupportWarning}
                  className="min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-base transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Support ("Apoyo") Step 2: Select New Support Route (Driver & Vehicle Pre-filled) */}
      {showSupportRouteModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                  <LifeBuoy className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Asignar Nueva Ruta de Apoyo</h3>
                  <p className="text-xs text-slate-300 mt-0.5">Datos de conductor y móvil asociados automáticamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSpeech();
                  setShowSupportRouteModal(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Locked pre-filled Conductor & Vehicle */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 font-semibold uppercase block">Conductor</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">{activeShift.driverName}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 font-semibold uppercase block">Móvil / Grupo</span>
                  <span className="font-bold font-mono text-slate-900 mt-0.5 block">
                    Móvil {activeShift.vehicleNumber} · {activeShift.workGroupName || 'Op.'}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Nueva Ruta de Apoyo
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={supportIncludeOtherGroups}
                      onChange={e => setSupportIncludeOtherGroups(e.target.checked)}
                      className="rounded border-slate-300 text-orange-600"
                    />
                    Incluir otros grupos
                  </label>
                </div>
                <select
                  value={supportRouteId}
                  onChange={e => setSupportRouteId(e.target.value)}
                  className="w-full h-12 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="">Seleccione ruta del catálogo...</option>
                  {state.routes
                    .filter(r => supportIncludeOtherGroups || r.workGroupId === activeShift.workGroupId)
                    .map(r => {
                      const wgName = state.workGroups.find(w => w.id === r.workGroupId)?.name;
                      const isCurrent = activeShift.routeId && r.id === activeShift.routeId;
                      return (
                        <option key={r.id} value={r.id} disabled={Boolean(isCurrent)}>
                          [{r.code}] {r.name}
                          {supportIncludeOtherGroups && wgName ? ` (${wgName})` : ''}
                          {isCurrent ? ' (Ruta actual)' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  O código de ruta manual (si no figura en lista)
                </label>
                <input
                  type="text"
                  value={supportManualCode}
                  onChange={e => setSupportManualCode(e.target.value)}
                  placeholder="Ej. APOYO-R3-05"
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setShowSupportRouteModal(false);
                  }}
                  className="min-h-[52px] bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-base transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={(!supportRouteId && !supportManualCode.trim()) || busyAction === 'support-start'}
                  onClick={() => openActionConfirmation('start-support')}
                  className="min-h-[52px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-bold text-base transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Iniciar Apoyo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Primary Route Modal (shown when Support Route finishes) */}
      {pendingParentShift && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-orange-500">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Ruta Pendiente en Curso</h3>
                  <p className="text-xs text-slate-300 mt-0.5">Ruta de apoyo finalizada correctamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  speakConfirmationPrompt(
                    `Apoyo finalizado. Atención: aún tiene pendiente una ruta en curso para el móvil ${pendingParentShift.vehicleNumber}. Seleccione continuar ruta o finalizar ruta.`,
                    true
                  )
                }
                className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 shrink-0"
                title="Escuchar aviso"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                Aún tiene pendiente una ruta principal en curso. Seleccione si desea <strong>continuar</strong> su ejecución o <strong>finalizarla</strong> ahora.
              </p>

              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                <div>
                  <span className="text-slate-500 block">Móvil / Grupo</span>
                  <span className="font-bold text-slate-900 font-mono">
                    Móvil {pendingParentShift.vehicleNumber} · {pendingParentShift.workGroupName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Ruta Pendiente</span>
                  <span className="font-bold text-slate-900">
                    {pendingParentShift.routeCode || pendingParentShift.routeName || 'Turno principal'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Estado</span>
                  <span className="font-bold text-orange-700">{pendingParentShift.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tiempo en Apoyo</span>
                  <span className="font-bold font-mono text-slate-900">{pendingParentShift.supportTotalMins || 0} min</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  disabled={busyAction === 'finalize-pending'}
                  onClick={() => openWeightFinishModal('finalize-pending', pendingParentShift)}
                  className="min-h-[54px] bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-1.5"
                >
                  <Flag className="h-4 w-4" />
                  Finalizar Ruta
                </button>
                <button
                  type="button"
                  disabled={busyAction === 'finalize-pending'}
                  onClick={() => openActionConfirmation('continue-pending')}
                  className="min-h-[54px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Play className="h-4 w-4" />
                  Continuar Ruta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Driver Help Modal ("Ayuda del Módulo Conductores") */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="h-6 w-6 text-sky-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-base">Ayuda Rápida — Módulo Conductores</h3>
                  <p className="text-xs text-slate-300">Guía de tiempos, confirmaciones y botón de Apoyo</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    speakConfirmationPrompt(
                      'Guía rápida del módulo conductores. Paso uno: inicie turno y confirme el checklist preoperacional. Paso dos: registre inicio de ruta, fin de ruta y llegada a base. Cada botón solicita confirmación con botón verde para confirmar y botón rojo para cancelar. Si necesita apoyar otra ruta sin terminar la actual, presione el botón naranja Apoyo; su ruta actual quedará en pausa y al finalizar el apoyo podrá continuarla o finalizarla.',
                      true
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <Volume2 className="h-4 w-4" />
                  Escuchar Guía
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setShowHelpModal(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-sm text-slate-700">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <h4 className="font-bold text-emerald-900 text-xs uppercase">1. Confirmación y Voz</h4>
                <p className="text-xs mt-1 text-emerald-950">
                  Cada registro de tiempo muestra un aviso por voz y una ventana con <strong>botón verde (Confirmar)</strong> y <strong>botón rojo (Cancelar)</strong> para evitar errores táctiles.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-slate-900 text-xs uppercase">2. Secuencia Principal (T1 → T4)</h4>
                <p className="text-xs mt-1">
                  Inicie turno (T1) y complete el <strong>Checklist Preoperacional</strong>. Luego registre <strong>Inicio de Ruta (T2)</strong>, <strong>Fin de Ruta (T3)</strong> y <strong>Llegada a Base (T4)</strong>.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                <h4 className="font-bold text-orange-950 text-xs uppercase">3. Botón Naranja "Apoyo"</h4>
                <p className="text-xs mt-1 text-orange-950">
                  Si debe cubrir otra ruta sin haber terminado la actual, presione <strong>Apoyo</strong>. El sistema pausa su ruta actual, toma su conductor y móvil automáticamente y abre un tablero completo para la ruta de apoyo. Al cerrar el apoyo podrá <strong>Continuar</strong> o <strong>Finalizar</strong> la ruta pendiente.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <h4 className="font-bold text-rose-950 text-xs uppercase">4. Relleno y Avería Mecánica</h4>
                <p className="text-xs mt-1 text-rose-950">
                  Use <strong>Inicio de Relleno</strong> para pausar el cronómetro durante el descargue. Si reporta <strong>Avería Mecánica</strong>, el tablero central recibe una alarma inmediata.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Action Confirmation Pop-up (Green Confirm / Red Cancel + Spanish Audio) */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">{pendingConfirm.title}</h3>
                  <p className="text-xs text-slate-300 mt-0.5">{pendingConfirm.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => speakConfirmationPrompt(pendingConfirm.spokenPhrase, true)}
                className="p-2.5 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 transition-colors shrink-0"
                title="Reproducir confirmación por voz"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span>Hora a registrar</span>
                  <span className="font-mono tabular-nums text-sm text-slate-900">
                    {new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                  {pendingConfirm.spokenPhrase}
                </p>
                {pendingConfirm.detail && (
                  <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    {pendingConfirm.detail}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleCancelConfirmation}
                  className="min-h-[56px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteConfirmedAction}
                  className="min-h-[56px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Weight Collection Pop-Up Modal before finalizing shift */}
      {weightFinishModal && (
        <div className="fixed inset-0 z-[65] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmWeightFinish}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-emerald-500"
          >
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    {weightFinishModal.targetShift.isSupportShift
                      ? 'Peso Recogido en Ruta de Apoyo'
                      : 'Peso Recogido en Ruta'}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Móvil {weightFinishModal.targetShift.vehicleNumber} ·{' '}
                    {weightFinishModal.targetShift.routeCode
                      ? `Ruta ${weightFinishModal.targetShift.routeCode}`
                      : weightFinishModal.targetShift.driverName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  speakConfirmationPrompt(
                    `Ingrese el peso recogido en ruta en toneladas para finalizar el turno del móvil ${weightFinishModal.targetShift.vehicleNumber}.`,
                    true
                  )
                }
                className="p-2.5 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 transition-colors shrink-0"
                title="Escuchar instrucción"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-950 font-semibold leading-relaxed">
                Para finalizar el turno (T4), debe registrar el peso total recogido en la ruta.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Peso Recogido en Ruta (Toneladas) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="500"
                    required
                    autoFocus
                    value={weightTonsInput}
                    onChange={e => {
                      setWeightTonsInput(e.target.value);
                      if (weightModalError) setWeightModalError('');
                    }}
                    placeholder="Ej. 12.50"
                    className="w-full h-14 border-2 border-slate-300 focus:border-emerald-500 rounded-2xl pl-4 pr-16 text-xl font-extrabold font-mono text-slate-900 outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                    Ton
                  </span>
                </div>
              </div>

              {weightModalError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {weightModalError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  disabled={busyAction === 'arrive-base' || busyAction === 'finalize-pending'}
                  onClick={() => {
                    stopSpeech();
                    setWeightFinishModal(null);
                    setWeightModalError('');
                  }}
                  className="min-h-[54px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'arrive-base' || busyAction === 'finalize-pending'}
                  className="min-h-[54px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {busyAction === 'arrive-base' || busyAction === 'finalize-pending'
                    ? 'Finalizando...'
                    : 'Finalizar Turno'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Visor PDF integrado (Mapa de la Ruta / Ficha de Descargue) */}
      {pdfViewerModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
          onClick={() => setPdfViewerModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base truncate">{pdfViewerModal.title}</h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    Descargado automáticamente: {pdfViewerModal.fileName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pdfViewerModal.blobUrl}
                  download={pdfViewerModal.fileName}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Descargar PDF</span>
                </a>
                <a
                  href={pdfViewerModal.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir en pestaña</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPdfViewerModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Cerrar visor PDF"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 relative">
              <iframe
                src={pdfViewerModal.blobUrl}
                title={pdfViewerModal.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
