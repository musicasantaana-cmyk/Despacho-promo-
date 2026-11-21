import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { exportToCsv } from '../utils/exportCsv';
import { 
  BarChart2, Download, Users, Truck, CheckCircle, 
  AlertTriangle, XCircle, PieChart as PieChartIcon, 
  X, Clock, MapPin, Layers, Info, Smartphone,
  ChevronLeft, ChevronRight, LayoutGrid
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Assignment, DriverShift, Incident, RouteDef, Vehicle, Employee } from '../types';
import { AttendanceIncidentsReportView } from '../components/reports/AttendanceIncidentsReportView';
import { FleetAssetsReportView } from '../components/reports/FleetAssetsReportView';
import { CustomExportReportView } from '../components/reports/CustomExportReportView';
import { DriverShiftsReportView } from '../components/reports/DriverShiftsReportView';
import { OperationsBoardView } from '../components/reports/OperationsBoardView';
import { ReportSubMenuHeader } from '../components/reports/ReportSubMenuHeader';
import {
  computeShiftTimeBreakdown,
  calcUnionPauseOverlapMs,
  getRouteAlertFromTimestamps,
  parseAssignmentIncidentInterval,
  formatMsAsHoursMins,
  TimeIntervalEvent,
  RouteAlertLevel,
} from '../utils/shiftTimeMetrics';

type ReportSubTab = 'board' | 'attendance' | 'fleet' | 'export_wizard' | 'general' | 'driver_shifts';
type DetailModalType = 
  | 'rutas_asignadas' 
  | 'rutas_todas' 
  | 'vehiculos_asignados' 
  | 'vehiculos_todos' 
  | 'personal_asignado' 
  | 'personal_todos' 
  | 'completadas_gestionadas' 
  | 'completadas_todas' 
  | 'novedades' 
  | null;

export const ReportsPage: React.FC = () => {
  // Active WorkGroup and Sub-Tabs
  const { state, setActiveWorkGroup } = useAppContext();
  const { lockedWorkGroupId } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportSubTab>('attendance');
  const [activeDetail, setActiveDetail] = useState<DetailModalType>(null);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const sheetTabsRef = useRef<HTMLDivElement | null>(null);

  const scrollSheetTabs = (direction: 'left' | 'right') => {
    if (!sheetTabsRef.current) return;
    const offset = direction === 'left' ? -240 : 240;
    sheetTabsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };
  
  // Real-time ticking for in-progress operations & 8h/10h alerts
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Date filter initialized to today (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  );
  const [selectedEndDate, setSelectedEndDate] = useState<string>(
    new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  );

  // Multi-route filter toggles
  const toggleRouteSelection = (routeId: string) => {
    setSelectedRouteIds(prev =>
      prev.includes(routeId) ? prev.filter(id => id !== routeId) : [...prev, routeId]
    );
  };

  const selectAllRoutes = () => {
    setSelectedRouteIds([]);
  };

  // Group routes matching current active group
  const activeGroupRoutes = useMemo(() => {
    return state.routes.filter(r => !state.activeWorkGroupId || r.workGroupId === state.activeWorkGroupId);
  }, [state.routes, state.activeWorkGroupId]);

  // Derived metrics based on active group, selected route filters & selected date range
  const metrics = useMemo(() => {
    // Filtered routes by selectedRouteIds
    const filteredRoutes = activeGroupRoutes.filter(r => 
      selectedRouteIds.length === 0 || selectedRouteIds.includes(r.id)
    );
    const filteredRouteIds = new Set(filteredRoutes.map(r => r.id));

    // Relevant assignments matching active group, selected routes, and date logic
    const relevantAssignments = state.assignments.filter(a => {
      if (state.activeWorkGroupId && a.workGroupId !== state.activeWorkGroupId) return false;
      if (selectedRouteIds.length > 0 && !selectedRouteIds.includes(a.routeId)) return false;
      
      const asigDate = a.date.slice(0, 10);
      
      // Date logic: include if assignment date is within range OR if it's from a past date but not finished
      const isInRange = asigDate >= selectedDate && asigDate <= selectedEndDate;
      const isPastUnfinished = asigDate < selectedDate && !['Fin de Ruta', 'Base', 'Cancelado'].includes(a.status);
      
      return isInRange || isPastUnfinished;
    });

    // Pareto 1: Rutas Asignadas / Total Rutas Disponibles
    const totalRoutesCount = filteredRoutes.length;
    const assignedRouteIdsSet = new Set(relevantAssignments.map(a => a.routeId));
    const assignedRoutesCount = filteredRoutes.filter(r => assignedRouteIdsSet.has(r.id)).length;

    // Pareto 2: Rutas Completadas / Total Rutas Asignadas
    const completedAssignments = relevantAssignments.filter(a => ['Fin de Ruta', 'Base'].includes(a.status));
    const completedCount = completedAssignments.length;
    const totalAssignedCount = relevantAssignments.length;
    const inProgressCount = relevantAssignments.filter(a => ['Salida de Base', 'Inicio de Ruta', 'Relleno'].includes(a.status)).length;

    // Pareto 3: Vehículos Asignados / Total Vehículos Grupo
    const relevantVehicles = state.vehicles.filter(v => 
      !state.activeWorkGroupId || v.workGroupId === state.activeWorkGroupId
    );
    const totalVehiclesCount = relevantVehicles.length;
    const assignedVehicleIdsSet = new Set(relevantAssignments.map(a => a.vehicleId));
    const assignedVehiclesCount = relevantVehicles.filter(v => assignedVehicleIdsSet.has(v.id)).length;
    const operationalVehiclesCount = relevantVehicles.filter(v => v.status === 'Operativo').length;
    const inoperableVehiclesCount = relevantVehicles.filter(v => v.status === 'Inoperativo').length;

    // Pareto 4: Personal Asignado / Total Personal Grupo
    const relevantEmployees = state.employees.filter(e => 
      !state.activeWorkGroupId || e.workGroupId === state.activeWorkGroupId
    );
    const totalEmployeesCount = relevantEmployees.length;
    const assignedEmployeeIdsSet = new Set(relevantAssignments.flatMap(a => a.employeeIds || []));
    const assignedEmployeesCount = relevantEmployees.filter(e => assignedEmployeeIdsSet.has(e.id)).length;

    // Incidents
    let totalIncidents = 0;
    relevantAssignments.forEach(a => {
      totalIncidents += (a.incidents || []).length;
    });

    // Assignment Status Chart Data
    const statusCounts: Record<string, number> = {
      'Salida de Base': 0,
      'Inicio de Ruta': 0,
      'Fin de Ruta': 0,
      'Relleno': 0,
      'Base': 0,
      'Pendiente': 0
    };
    relevantAssignments.forEach(a => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    });

    const assignmentData = Object.entries(statusCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));

    // Vehicle Availability Chart Data
    const vehicleData = [
      { name: 'Operativos', value: operationalVehiclesCount },
      { name: 'Inoperativos', value: inoperableVehiclesCount }
    ].filter(d => d.value > 0);

    // Step-by-Step Operational Time Calculations (Statistician Metrics)
    let sumWaitMins = 0, countWait = 0;
    let sumTransitMins = 0, countTransit = 0;
    let sumExecNetMins = 0, countExec = 0;
    let sumExecGrossMins = 0;
    let sumCycleMins = 0, countCycle = 0;
    let sumBreakdownMins = 0;
    let sumRefillMins = 0;
    let sumDeductedMins = 0;

    let earliestTimeMs = Infinity;
    let latestTimeMs = -Infinity;

    // Matching DriverShifts for the selected group, routes, and date window
    const filteredRouteCodeSet = new Set(filteredRoutes.map(r => r.code.toLowerCase()));
    const relevantDriverShifts = state.driverShifts.filter(s => {
      if (state.activeWorkGroupId && s.workGroupId !== state.activeWorkGroupId) return false;
      if (selectedRouteIds.length > 0) {
        const matchesId = s.routeId && filteredRouteIds.has(s.routeId);
        const matchesCode = s.routeCode && filteredRouteCodeSet.has(s.routeCode.toLowerCase());
        if (!matchesId && !matchesCode) return false;
      }
      const isInRange = s.date >= selectedDate && s.date <= selectedEndDate;
      const isPastUnfinished = s.date < selectedDate && s.status !== 'EN_BASE';
      return isInRange || isPastUnfinished;
    });

    const usedShiftIds = new Set<string>();

    const formatTime = (tsStr?: string | null) => {
      if (!tsStr) return '';
      const d = new Date(tsStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    interface TimeBreakdownRow {
      rowId: string;
      assignment?: Assignment;
      shift?: DriverShift;
      date: string;
      routeCode: string;
      routeName: string;
      routeOrigin: string;
      routeDestination: string;
      groupName: string;
      vehicleNumber: string;
      crewName: string;
      statusLabel: string;
      weightTons: number;
      waitMins: number | null;
      initTransitMins: number | null;
      finalTransitMins: number | null;
      totalTransitMins: number | null;
      execGrossMins: number | null;
      execMins: number | null;
      deductedMins: number;
      breakdownMins: number;
      refillMins: number;
      totalNovedadesMins: number;
      cycleMins: number | null;
      efficiency: number | null;
      tAsigStr: string;
      tSalidaStr: string;
      tInicioStr: string;
      tFinStr: string;
      tBaseStr: string;
      isRouteActive: boolean;
      routeElapsedMs: number;
      activeAlertLevel: RouteAlertLevel;
      overallAlertLevel: RouteAlertLevel;
    }

    const timeBreakdownAssignments: TimeBreakdownRow[] = relevantAssignments.map(a => {
      const asigDate = a.date.slice(0, 10);
      const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
      const route = state.routes.find(r => r.id === a.routeId);
      const group = state.workGroups.find(g => g.id === a.workGroupId);
      const crew = state.crews.find(c => (a.employeeIds || []).includes(c.driverId));

      // Try matching an unused DriverShift for this assignment
      const matchedShift =
        relevantDriverShifts.find(s => {
          if (usedShiftIds.has(s.id) || s.isSupportShift) return false;
          if (s.date !== asigDate) return false;
          if (a.workGroupId && s.workGroupId !== a.workGroupId) return false;
          if (s.vehicleId && s.vehicleId === a.vehicleId) return true;
          if (vehicle?.internalNumber && s.vehicleNumber.toLowerCase() === vehicle.internalNumber.toLowerCase()) return true;
          if (s.driverId && (a.employeeIds || []).includes(s.driverId)) return true;
          return false;
        }) || null;

      if (matchedShift) {
        usedShiftIds.add(matchedShift.id);
      }

      // Find timestamps from explicit fields, status history, or matched DriverShift
      const historyMap: Record<string, string> = {};
      (a.statusHistory || []).forEach(h => {
        if (!historyMap[h.status]) historyMap[h.status] = h.timestamp;
      });

      const tAsigStr = a.createdAt || a.date;
      const tSalidaStr = a.salidaBaseAt || historyMap['Salida de Base'] || matchedShift?.t1StartShiftAt;
      const tInicioStr = a.inicioRutaAt || historyMap['Inicio de Ruta'] || matchedShift?.t2StartRouteAt || undefined;
      const tFinStr = a.finRutaAt || historyMap['Fin de Ruta'] || matchedShift?.t3EndRouteAt || undefined;
      const tBaseStr = a.llegadaBaseAt || historyMap['Base'] || matchedShift?.t4ArriveBaseAt || undefined;

      const tAsig = tAsigStr ? new Date(tAsigStr).getTime() : NaN;
      const tSalida = tSalidaStr ? new Date(tSalidaStr).getTime() : NaN;
      const tInicio = tInicioStr ? new Date(tInicioStr).getTime() : NaN;
      const tFin = tFinStr ? new Date(tFinStr).getTime() : NaN;
      const tBase = tBaseStr ? new Date(tBaseStr).getTime() : NaN;

      // Group operational window tracking
      if (!isNaN(tAsig) && tAsig < earliestTimeMs) earliestTimeMs = tAsig;
      if (!isNaN(tSalida) && tSalida < earliestTimeMs) earliestTimeMs = tSalida;
      if (!isNaN(tBase) && tBase > latestTimeMs) latestTimeMs = tBase;
      if (!isNaN(tFin) && tFin > latestTimeMs) latestTimeMs = tFin;

      // Phase 1: Wait time for departure (Asignación -> Salida Base)
      let waitMins: number | null = null;
      if (!isNaN(tAsig)) {
        if (!isNaN(tSalida)) {
          if (tSalida >= tAsig) waitMins = Math.round((tSalida - tAsig) / 60000);
        } else {
          waitMins = Math.max(0, Math.round((nowMs - tAsig) / 60000));
        }
      }

      // Phase 2: Initial Transit (Inicio Turno / Salida Base -> Inicio Ruta)
      let initTransitMins: number | null = null;
      if (!isNaN(tSalida)) {
        if (!isNaN(tInicio)) {
          if (tInicio >= tSalida) initTransitMins = Math.round((tInicio - tSalida) / 60000);
        } else {
          initTransitMins = Math.max(0, Math.round((nowMs - tSalida) / 60000));
        }
      }

      // Phase 4: Final Transit (Fin Ruta -> Llegada Base)
      let finalTransitMins: number | null = null;
      if (!isNaN(tFin)) {
        if (!isNaN(tBase)) {
          if (tBase >= tFin) finalTransitMins = Math.round((tBase - tFin) / 60000);
        } else {
          finalTransitMins = Math.max(0, Math.round((nowMs - tFin) / 60000));
        }
      }

      // Tiempo Total de Desplazamiento = (Inicio Turno -> Inicio Ruta) + (Fin Ruta -> Base)
      const totalTransitMins =
        initTransitMins !== null || finalTransitMins !== null
          ? (initTransitMins || 0) + (finalTransitMins || 0)
          : null;

      // Collect incident intervals from Assignment (breakdowns / refills / other novelties)
      const asigMechIntervals: TimeIntervalEvent[] = [];
      const asigRefillIntervals: TimeIntervalEvent[] = [];
      const asigAllIntervals: TimeIntervalEvent[] = [];
      let totalAssignmentIncidentsMins = 0;

      (a.incidents || []).forEach(inc => {
        const parsed = parseAssignmentIncidentInterval(inc, asigDate);
        totalAssignmentIncidentsMins += parsed.durationMins;
        if (parsed.startMs !== null && parsed.endMs !== null && parsed.endMs > parsed.startMs) {
          const ev: TimeIntervalEvent = {
            startAt: new Date(parsed.startMs).toISOString(),
            endAt: new Date(parsed.endMs).toISOString(),
          };
          asigAllIntervals.push(ev);
          const typeNorm = (inc.type || '').toLowerCase();
          const descNorm = (inc.description || '').toLowerCase();
          if (typeNorm.includes('mecán') || typeNorm.includes('mecan') || typeNorm.includes('aver')) {
            asigMechIntervals.push(ev);
          } else if (
            typeNorm.includes('rellen') ||
            typeNorm.includes('descarg') ||
            descNorm.includes('rellen') ||
            descNorm.includes('descarg')
          ) {
            asigRefillIntervals.push(ev);
          }
        }
      });

      const shiftBreakdown = matchedShift ? computeShiftTimeBreakdown(matchedShift, nowMs) : null;
      const horizonEndMs = nowMs + 24 * 60 * 60 * 1000;

      const breakdownMins = matchedShift
        ? Math.max(
            shiftBreakdown!.totalBreakdownMins,
            Math.round(
              calcUnionPauseOverlapMs([matchedShift.breakdownEvents, asigMechIntervals], 0, horizonEndMs, nowMs) / 60000
            )
          )
        : Math.round(calcUnionPauseOverlapMs([asigMechIntervals], 0, horizonEndMs, nowMs) / 60000);

      const refillMins = matchedShift
        ? Math.max(
            shiftBreakdown!.totalRefillMins,
            Math.round(
              calcUnionPauseOverlapMs([matchedShift.refillEvents, asigRefillIntervals], 0, horizonEndMs, nowMs) / 60000
            )
          )
        : Math.round(calcUnionPauseOverlapMs([asigRefillIntervals], 0, horizonEndMs, nowMs) / 60000);

      // Phase 3: Route Execution (Inicio Ruta -> Fin Ruta) deducting Averías / Rellenos / Apoyos without double-counting
      let execGrossMins: number | null = null;
      let execMins: number | null = null;
      let deductedMins = 0;

      if (!isNaN(tInicio)) {
        const endRefMs = !isNaN(tFin) && tFin >= tInicio ? tFin : nowMs;
        const grossMs = Math.max(0, endRefMs - tInicio);
        execGrossMins = Math.round(grossMs / 60000);

        const pauseLists: Array<TimeIntervalEvent[] | undefined> = [
          matchedShift?.breakdownEvents,
          matchedShift?.refillEvents,
          matchedShift?.supportEvents,
          asigAllIntervals,
        ];
        const deductedMs = calcUnionPauseOverlapMs(pauseLists, tInicio, endRefMs, nowMs);
        deductedMins = Math.round(deductedMs / 60000);
        execMins = Math.max(0, Math.round((grossMs - deductedMs) / 60000));
      }

      // Total Cycle Time (Asignación -> Base)
      let cycleMins: number | null = null;
      if (!isNaN(tAsig)) {
        if (!isNaN(tBase) && tBase >= tAsig) {
          cycleMins = Math.round((tBase - tAsig) / 60000);
        } else {
          cycleMins = Math.max(0, Math.round((nowMs - tAsig) / 60000));
        }
      }

      const routeAlert = getRouteAlertFromTimestamps(
        tInicioStr,
        tFinStr || (a.status === 'Base' ? tBaseStr : null),
        nowMs
      );

      // Accumulate totals & averages
      if (waitMins !== null) { sumWaitMins += waitMins; countWait++; }
      if (totalTransitMins !== null) { sumTransitMins += totalTransitMins; countTransit++; }
      if (execGrossMins !== null) { sumExecGrossMins += execGrossMins; }
      if (execMins !== null) { sumExecNetMins += execMins; countExec++; }
      if (cycleMins !== null) { sumCycleMins += cycleMins; countCycle++; }
      sumBreakdownMins += breakdownMins;
      sumRefillMins += refillMins;
      sumDeductedMins += deductedMins;

      const efficiency =
        execMins !== null && cycleMins && cycleMins > 0
          ? Math.round((execMins / cycleMins) * 100)
          : null;

      return {
        rowId: a.id,
        assignment: a,
        shift: matchedShift || undefined,
        date: a.date,
        routeCode: route?.code || 'R',
        routeName: route?.name || 'N/A',
        routeOrigin: route?.origin || 'N/A',
        routeDestination: route?.destination || 'N/A',
        groupName: group?.name || 'N/A',
        vehicleNumber: vehicle?.internalNumber || matchedShift?.vehicleNumber || 'N/A',
        crewName: crew?.name || matchedShift?.driverName || 'Sin Tripulación',
        statusLabel: a.status,
        weightTons:
          a.weightTons !== undefined && a.weightTons > 0
            ? a.weightTons
            : (matchedShift?.weightTons ?? 0),
        waitMins,
        initTransitMins,
        finalTransitMins,
        totalTransitMins,
        execGrossMins,
        execMins,
        deductedMins,
        breakdownMins,
        refillMins,
        totalNovedadesMins: Math.max(totalAssignmentIncidentsMins, breakdownMins + refillMins),
        cycleMins,
        efficiency,
        tAsigStr: formatTime(tAsigStr),
        tSalidaStr: formatTime(tSalidaStr),
        tInicioStr: formatTime(tInicioStr),
        tFinStr: formatTime(tFinStr),
        tBaseStr: formatTime(tBaseStr),
        isRouteActive: routeAlert.isActive,
        routeElapsedMs: routeAlert.elapsedMs,
        activeAlertLevel: routeAlert.activeLevel,
        overallAlertLevel: routeAlert.overallLevel,
      };
    });

    // Include remaining DriverShifts that have no linked Assignment record so General Report reflects 100% of driver shifts
    relevantDriverShifts.forEach(s => {
      if (usedShiftIds.has(s.id)) return;
      const tb = computeShiftTimeBreakdown(s, nowMs);
      const route = s.routeId
        ? state.routes.find(r => r.id === s.routeId)
        : state.routes.find(r => s.routeCode && r.code.toLowerCase() === s.routeCode.toLowerCase());
      const group = state.workGroups.find(g => g.id === s.workGroupId);

      const t1 = s.t1StartShiftAt ? new Date(s.t1StartShiftAt).getTime() : NaN;
      const t3 = s.t3EndRouteAt ? new Date(s.t3EndRouteAt).getTime() : NaN;
      const t4 = s.t4ArriveBaseAt ? new Date(s.t4ArriveBaseAt).getTime() : NaN;
      if (!isNaN(t1) && t1 < earliestTimeMs) earliestTimeMs = t1;
      if (!isNaN(t4) && t4 > latestTimeMs) latestTimeMs = t4;
      if (!isNaN(t3) && t3 > latestTimeMs) latestTimeMs = t3;

      if (tb.totalTransitMins !== null) { sumTransitMins += tb.totalTransitMins; countTransit++; }
      if (tb.routeGrossMins !== null) { sumExecGrossMins += tb.routeGrossMins; }
      if (tb.routeNetMins !== null) { sumExecNetMins += tb.routeNetMins; countExec++; }
      const opCycle = tb.totalOperationMins;
      if (opCycle !== null) { sumCycleMins += opCycle; countCycle++; }
      sumBreakdownMins += tb.totalBreakdownMins;
      sumRefillMins += tb.totalRefillMins;
      sumDeductedMins += tb.routeDeductedMins;

      const efficiency =
        tb.routeNetMins !== null && opCycle && opCycle > 0
          ? Math.round((tb.routeNetMins / opCycle) * 100)
          : null;

      timeBreakdownAssignments.push({
        rowId: `shift_${s.id}`,
        shift: s,
        date: s.date,
        routeCode: s.routeCode || route?.code || 'S/R',
        routeName: s.routeName || route?.name || (s.isSupportShift ? 'Apoyo en Ruta' : 'Ruta Conductor'),
        routeOrigin: route?.origin || 'Base',
        routeDestination: route?.destination || 'Ruta',
        groupName: s.workGroupName || group?.name || 'N/A',
        vehicleNumber: s.vehicleNumber,
        crewName: s.driverName,
        statusLabel: s.status,
        weightTons: s.weightTons ?? 0,
        waitMins: null,
        initTransitMins: tb.initialTransitMins,
        finalTransitMins: tb.returnTransitMins,
        totalTransitMins: tb.totalTransitMins,
        execGrossMins: tb.routeGrossMins,
        execMins: tb.routeNetMins,
        deductedMins: tb.routeDeductedMins,
        breakdownMins: tb.totalBreakdownMins,
        refillMins: tb.totalRefillMins,
        totalNovedadesMins: tb.totalBreakdownMins + tb.totalRefillMins,
        cycleMins: opCycle,
        efficiency,
        tAsigStr: formatTime(s.t1StartShiftAt),
        tSalidaStr: formatTime(s.t1StartShiftAt),
        tInicioStr: formatTime(s.t2StartRouteAt),
        tFinStr: formatTime(s.t3EndRouteAt),
        tBaseStr: formatTime(s.t4ArriveBaseAt),
        isRouteActive: tb.isRouteActive,
        routeElapsedMs: tb.routeElapsedMs,
        activeAlertLevel: tb.activeAlertLevel,
        overallAlertLevel: tb.overallAlertLevel,
      });
    });

    const totalWeightTons = Number(
      timeBreakdownAssignments.reduce((sum, r) => sum + (r.weightTons || 0), 0).toFixed(2)
    );

    // Group Total Operational Window Metric ("Tiempo Total del Grupo")
    const groupTotalMins = (earliestTimeMs !== Infinity && latestTimeMs !== -Infinity && latestTimeMs >= earliestTimeMs)
      ? Math.round((latestTimeMs - earliestTimeMs) / 60000)
      : 0;

    const groupTotalHoursStr = groupTotalMins > 0
      ? `${Math.floor(groupTotalMins / 60)}h ${groupTotalMins % 60}m`
      : '0h 0m';

    const avgWaitMins = countWait > 0 ? Math.round(sumWaitMins / countWait) : 0;
    const avgTransitMins = countTransit > 0 ? Math.round(sumTransitMins / countTransit) : 0;
    const avgExecMins = countExec > 0 ? Math.round(sumExecNetMins / countExec) : 0;

    const activeCriticalAlerts = timeBreakdownAssignments.filter(r => r.activeAlertLevel === 'critical');
    const activeWarningAlerts = timeBreakdownAssignments.filter(r => r.activeAlertLevel === 'warning');
    const overallCriticalCount = timeBreakdownAssignments.filter(r => r.overallAlertLevel === 'critical').length;
    const overallWarningCount = timeBreakdownAssignments.filter(r => r.overallAlertLevel === 'warning').length;

    // Overall Operational Efficiency Score (based on Net Route Execution vs Cycle)
    const globalEfficiency = (sumExecNetMins > 0 && sumCycleMins > 0)
      ? Math.round((sumExecNetMins / sumCycleMins) * 100)
      : (countExec > 0 ? 78 : 0);

    return {
      totalRoutesCount,
      assignedRoutesCount,
      totalAssignedCount,
      completedCount,
      inProgressCount,
      totalVehiclesCount,
      assignedVehiclesCount,
      operationalVehiclesCount,
      inoperableVehiclesCount,
      totalEmployeesCount,
      assignedEmployeesCount,
      totalIncidents,
      totalWeightTons,
      filteredRoutes,
      relevantAssignments,
      relevantVehicles,
      relevantEmployees,
      assignmentData,
      vehicleData,
      // Operational Time Metrics
      timeBreakdownAssignments,
      groupTotalHoursStr,
      avgWaitMins,
      sumWaitMins,
      avgTransitMins,
      sumTransitMins,
      avgExecMins,
      sumExecGrossMins,
      sumExecNetMins,
      sumBreakdownMins,
      sumRefillMins,
      sumDeductedMins,
      activeCriticalAlerts,
      activeWarningAlerts,
      overallCriticalCount,
      overallWarningCount,
      globalEfficiency
    };
  }, [state.assignments, state.driverShifts, state.routes, state.vehicles, state.employees, state.workGroups, state.crews, state.activeWorkGroupId, selectedRouteIds, activeGroupRoutes, selectedDate, selectedEndDate, nowMs]);

  // Export functions
  const handleExportIndicators = () => {
    const data = metrics.timeBreakdownAssignments.map(row => {
      const alertLabel =
        row.overallAlertLevel === 'critical'
          ? `CRÍTICA (+10h · ${formatMsAsHoursMins(row.routeElapsedMs)})`
          : row.overallAlertLevel === 'warning'
            ? `ALERTA (+8h · ${formatMsAsHoursMins(row.routeElapsedMs)})`
            : 'Normal';

      return {
        Fecha: row.date,
        'Ruta (Key)': row.routeName,
        Grupo: row.groupName,
        Origen: row.routeOrigin,
        Destino: row.routeDestination,
        'Móvil': row.vehicleNumber,
        'ID Tripulación': row.crewName,
        Estado: row.statusLabel,
        'Averías (min)': row.breakdownMins,
        'Rellenos (min)': row.refillMins,
        'Novedades (min)': row.totalNovedadesMins,
        'Peso (Tons)': row.weightTons,
        'Hora Asignación': row.tAsigStr,
        '1. Espera Salida (min)': row.waitMins !== null ? row.waitMins : '',
        'Hora Salida Base': row.tSalidaStr,
        'Desplazamiento Ida (min)': row.initTransitMins !== null ? row.initTransitMins : '',
        'Desplazamiento Retorno (min)': row.finalTransitMins !== null ? row.finalTransitMins : '',
        '2. Desplazamiento Total (min)': row.totalTransitMins !== null ? row.totalTransitMins : '',
        'Hora Inicio Ejecucion': row.tInicioStr,
        'Ruta Bruta (min)': row.execGrossMins !== null ? row.execGrossMins : '',
        'Descuento Averías/Rellenos (min)': row.deductedMins,
        '3. Ejecucion Ruta Neta (min)': row.execMins !== null ? row.execMins : '',
        'Hora Fin Ruta': row.tFinStr,
        'Hora Llegada Base': row.tBaseStr,
        'Alerta Duración Ruta': alertLabel,
        'Ciclo Total (min)': row.cycleMins !== null ? row.cycleMins : '',
        'Eficiencia (%)': row.efficiency !== null ? row.efficiency : ''
      };
    });

    // Sort by Fecha then Ruta
    data.sort((a, b) => {
      if (a.Fecha !== b.Fecha) return b.Fecha.localeCompare(a.Fecha);
      return a['Ruta (Key)'].localeCompare(b['Ruta (Key)']);
    });

    const dateSuffix = selectedDate === selectedEndDate ? selectedDate : `${selectedDate}_to_${selectedEndDate}`;
    exportToCsv(`indicadores_ruta_${dateSuffix}_${state.activeWorkGroupId || 'general'}.csv`, data);
  };

  const handleExportAssignments = () => {
    const data = metrics.relevantAssignments.map(a => {
      const route = state.routes.find(r => r.id === a.routeId);
      const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
      return {
        ID: a.id,
        Fecha: a.date,
        Ruta: route?.name || 'N/A',
        Origen: route?.origin || 'N/A',
        Destino: route?.destination || 'N/A',
        Vehiculo: vehicle?.plate || 'N/A',
        Estado: a.status,
        Novedades: a.incidents.length,
        'Peso (Tons)': a.weightTons !== undefined ? a.weightTons : 'N/A'
      };
    });
    exportToCsv(`asignaciones_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  const handleExportEmployees = () => {
    const data = metrics.relevantEmployees.map(e => ({
      ID: e.id,
      Nombre: e.name,
      Rol: e.role,
      Telefono: e.phone
    }));
    exportToCsv(`personal_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  const unacknowledgedAlarmsCount = useMemo(() => {
    return state.driverShifts.reduce((acc, s) => {
      const pending = (s.breakdownEvents || []).filter(ev => !ev.acknowledgedAt).length;
      return acc + pending;
    }, 0);
  }, [state.driverShifts]);

  const tabs: { id: ReportSubTab; label: string; icon: React.ReactNode; badge?: string; alertBadge?: boolean }[] = [
    {
      id: 'board',
      label: 'Tablero en Vivo',
      icon: <LayoutGrid className="h-4 w-4" />,
      badge: unacknowledgedAlarmsCount > 0 ? `${unacknowledgedAlarmsCount} alerta` : `${state.driverShifts.filter(s => s.date === new Date().toLocaleDateString('en-CA')).length} hoy`,
      alertBadge: unacknowledgedAlarmsCount > 0,
    },
    {
      id: 'fleet',
      label: 'Flota Vehicular',
      icon: <Truck className="h-4 w-4" />,
      badge: `${state.vehicles.length} móviles`
    },
    {
      id: 'attendance',
      label: 'Reporte de Personal',
      icon: <Users className="h-4 w-4" />,
      badge: `${state.employees.length} activos`
    },
    {
      id: 'general',
      label: 'Indicadores de Ruta',
      icon: <BarChart2 className="h-4 w-4" />
    },
    {
      id: 'driver_shifts',
      label: 'Control Conductores',
      icon: <Smartphone className="h-4 w-4" />,
      badge: `${state.driverShifts.length} turnos`
    },
    {
      id: 'export_wizard',
      label: 'Reporte Customizado (+)',
      icon: <Layers className="h-4 w-4" />
    }
  ];

  return (
    <div className="space-y-0">
      {/* Spreadsheet-style Horizontal Scrollable Sheet Tabs */}
      <div className="bg-slate-200/80 pt-2 px-2 flex items-end gap-1 border-b border-slate-300 rounded-t-2xl">
        <button
          type="button"
          onClick={() => scrollSheetTabs('left')}
          className="mb-1 p-1.5 rounded-md bg-white/80 hover:bg-white border border-slate-300 text-slate-600 shrink-0 shadow-2xs transition-colors"
          title="Desplazar hojas a la izquierda"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={sheetTabsRef}
          className="flex-1 flex items-end gap-1 overflow-x-auto flex-nowrap scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-t border-x rounded-t-lg -mb-px relative ${
                  isActive
                    ? 'bg-white text-emerald-700 border-slate-300 shadow-sm z-10'
                    : 'bg-slate-100/80 text-slate-600 border-slate-300/60 hover:bg-white/70'
                }`}
              >
                <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums ${
                      tab.alertBadge
                        ? 'bg-rose-600 text-white'
                        : isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollSheetTabs('right')}
          className="mb-1 p-1.5 rounded-md bg-white/80 hover:bg-white border border-slate-300 text-slate-600 shrink-0 shadow-2xs transition-colors"
          title="Desplazar hojas a la derecha"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Render Sub-View */}
      <div className={`bg-white rounded-b-2xl border-x border-b border-slate-300 shadow-sm min-h-[600px] ${activeTab === 'board' ? 'p-2.5 sm:p-3' : 'p-4 sm:p-6'}`}>
        {activeTab === 'board' && <OperationsBoardView />}
        {activeTab === 'attendance' && <AttendanceIncidentsReportView />}
        {activeTab === 'fleet' && <FleetAssetsReportView />}
        {activeTab === 'driver_shifts' && <DriverShiftsReportView />}
        {activeTab === 'export_wizard' && <CustomExportReportView />}

        {activeTab === 'general' && (
          <div className="space-y-6">
            <ReportSubMenuHeader 
              workGroups={state.workGroups}
              selectedGroupIds={state.activeWorkGroupId ? [state.activeWorkGroupId] : []}
              onToggleGroup={(id) => !lockedWorkGroupId && setActiveWorkGroup(state.activeWorkGroupId === id ? null : id)}
              onSelectAllGroups={() => !lockedWorkGroupId && setActiveWorkGroup(null)}
              routes={activeGroupRoutes}
              selectedRouteIds={selectedRouteIds}
              onToggleRoute={toggleRouteSelection}
              onSelectAllRoutes={selectAllRoutes}
              onExportCsv={handleExportIndicators}
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center">
                    <Clock className="h-4 w-4 mr-1.5 text-slate-400" /> Fecha Inicio
                  </span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full sm:w-auto bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center">
                    <Clock className="h-4 w-4 mr-1.5 text-slate-400" /> Fecha Fin
                  </span>
                  <input
                    type="date"
                    value={selectedEndDate}
                    onChange={(e) => setSelectedEndDate(e.target.value)}
                    className="w-full sm:w-auto bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
            </ReportSubMenuHeader>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-emerald-600" />
                  Indicadores Pareto de Despacho & Operaciones
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Haz clic en el número <strong className="text-emerald-600">Gestionado (izq)</strong> para ver los elementos asignados o en el <strong className="text-slate-700">Total (der)</strong> para ver todo el catálogo.
                </p>
              </div>
              {selectedRouteIds.length > 0 && (
                <div className="bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-2">
                  <span>Filtrando {selectedRouteIds.length} ruta(s)</span>
                  <button onClick={selectAllRoutes} className="underline text-amber-800 hover:text-amber-950">Limpiar</button>
                </div>
              )}
            </div>

            {/* Pareto Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between h-36 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Peso Recolectado</span>
                  <div className="p-2 rounded-xl bg-purple-50">
                    <Layers className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline gap-1 text-2xl sm:text-3xl font-black text-slate-800">
                    {metrics.totalWeightTons.toFixed(1)} <span className="text-sm font-bold text-slate-500">Ton</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold mt-1 text-slate-500">
                    Acumulado en rutas
                  </div>
                </div>
              </div>

              <ParetoMetricCard 
                title="Rutas Asignadas vs Disponibles" 
                managedValue={metrics.assignedRoutesCount} 
                totalValue={metrics.totalRoutesCount}
                managedLabel="Asignadas"
                totalLabel="Total Rutas"
                icon={<MapPin className="h-6 w-6 text-emerald-600" />}
                bg="bg-emerald-50"
                onManagedClick={() => setActiveDetail('rutas_asignadas')}
                onTotalClick={() => setActiveDetail('rutas_todas')}
              />

              <ParetoMetricCard 
                title="Rutas Completadas vs Asignadas" 
                managedValue={metrics.completedCount} 
                totalValue={metrics.totalAssignedCount}
                managedLabel="Completadas"
                totalLabel="Total Asignadas"
                icon={<CheckCircle className="h-6 w-6 text-blue-600" />}
                bg="bg-blue-50"
                onManagedClick={() => setActiveDetail('completadas_gestionadas')}
                onTotalClick={() => setActiveDetail('completadas_todas')}
              />

              <ParetoMetricCard 
                title="Vehículos Asignados vs Flota Total" 
                managedValue={metrics.assignedVehiclesCount} 
                totalValue={metrics.totalVehiclesCount}
                managedLabel="Asignados"
                totalLabel="Flota Total"
                icon={<Truck className="h-6 w-6 text-amber-600" />}
                bg="bg-amber-50"
                onManagedClick={() => setActiveDetail('vehiculos_asignados')}
                onTotalClick={() => setActiveDetail('vehiculos_todos')}
              />

              <ParetoMetricCard 
                title="Personal Asignado vs Nómina Total" 
                managedValue={metrics.assignedEmployeesCount} 
                totalValue={metrics.totalEmployeesCount}
                managedLabel="Asignados"
                totalLabel="Total Personal"
                icon={<Users className="h-6 w-6 text-indigo-600" />}
                bg="bg-indigo-50"
                onManagedClick={() => setActiveDetail('personal_asignado')}
                onTotalClick={() => setActiveDetail('personal_todos')}
              />
            </div>

            {/* Specialized Operational Time Statistics Panel */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                      Estadística de Operaciones
                    </span>
                    <span className="text-xs text-slate-400">KPIs de Ciclo & Tiempos</span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-1 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-emerald-400" />
                    Toma de Tiempos por Etapa & Eficiencia del Grupo
                  </h3>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tiempo Total del Grupo</span>
                    <span className="text-xl font-black text-emerald-400">{metrics.groupTotalHoursStr}</span>
                  </div>
                  <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Route Duration Alerts (> 8h Warning / > 10h Critical) */}
              {(metrics.activeCriticalAlerts.length > 0 || metrics.activeWarningAlerts.length > 0) && (
                <div className="space-y-2">
                  {metrics.activeCriticalAlerts.length > 0 && (
                    <div className="bg-rose-950/80 border border-rose-500/60 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-rose-200 text-xs font-extrabold">
                        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                        <span>
                          ALERTA CRÍTICA (+10h en Ruta): {metrics.activeCriticalAlerts.length} ruta(s) superan las 10 horas desde su inicio
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {metrics.activeCriticalAlerts.map(r => (
                          <span
                            key={`crit_${r.rowId}`}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono text-[11px] font-bold"
                          >
                            M.{r.vehicleNumber} ({r.routeCode}) · {formatMsAsHoursMins(r.routeElapsedMs)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {metrics.activeWarningAlerts.length > 0 && (
                    <div className="bg-amber-950/70 border border-amber-500/60 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-amber-200 text-xs font-extrabold">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>
                          ALERTA (+8h en Ruta): {metrics.activeWarningAlerts.length} ruta(s) superan las 8 horas desde su inicio
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {metrics.activeWarningAlerts.map(r => (
                          <span
                            key={`warn_${r.rowId}`}
                            className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[11px] font-bold"
                          >
                            M.{r.vehicleNumber} ({r.routeCode}) · {formatMsAsHoursMins(r.routeElapsedMs)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Time Phase KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">T. Espera para Salida</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-400">{metrics.avgWaitMins}</span>
                    <span className="text-xs text-slate-400 font-semibold">min prom.</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Desde Asignación a Salida Base</span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">T. Total Desplazamiento</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-blue-400">{metrics.sumTransitMins}</span>
                    <span className="text-xs text-slate-400 font-semibold">min totales</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Prom: {metrics.avgTransitMins} min · (Turno&rarr;Ruta + Fin&rarr;Base)
                  </span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">T. Neto en Ruta</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-400">{metrics.sumExecNetMins}</span>
                    <span className="text-xs text-slate-400 font-semibold">min netos</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Prom: {metrics.avgExecMins}m · Desc. -{metrics.sumDeductedMins}m nov.
                  </span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Total Tiempo Averías</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-rose-400">{metrics.sumBreakdownMins}</span>
                    <span className="text-xs text-slate-400 font-semibold">min totales</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Descontado dentro de ruta</span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Total Tiempo Rellenos</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-purple-400">{metrics.sumRefillMins}</span>
                    <span className="text-xs text-slate-400 font-semibold">min totales</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Descontado dentro de ruta</span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eficiencia de Operación</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-indigo-400">{metrics.globalEfficiency}%</span>
                    <span className="text-xs text-slate-400 font-semibold">productividad</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">% Ruta Neta vs Ciclo Total</span>
                </div>
              </div>

              {/* Detailed Operational Times Breakdown Table */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex flex-wrap justify-between items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Info className="h-4 w-4 text-emerald-400" />
                    Desglose Individual de Tiempos por Operación
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {(metrics.overallCriticalCount > 0 || metrics.overallWarningCount > 0) && (
                      <span className="font-mono font-bold text-rose-300">
                        Alertas: {metrics.overallCriticalCount} Críticas (+10h) · {metrics.overallWarningCount} Alerta (+8h)
                      </span>
                    )}
                    <span>{metrics.timeBreakdownAssignments.length} operaciones registradas</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-700">
                      <tr>
                        <th className="p-3">Ruta Base</th>
                        <th className="p-3">Móvil</th>
                        <th className="p-3">1. Espera</th>
                        <th className="p-3">2. Desplaz. Total</th>
                        <th className="p-3">3. Ruta Neta (Bruto)</th>
                        <th className="p-3">Averías</th>
                        <th className="p-3">Rellenos</th>
                        <th className="p-3">Alerta</th>
                        <th className="p-3 text-right">Eficiencia (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50 text-slate-300">
                      {metrics.timeBreakdownAssignments.map(row => (
                        <tr key={row.rowId} className="hover:bg-slate-800/80 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded font-bold">{row.routeCode}</span>
                              <span className="font-bold text-white">{row.routeName}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono bg-slate-700 px-2 py-0.5 rounded text-slate-300">Móvil {row.vehicleNumber}</span>
                          </td>
                          <td className="p-3 font-mono">
                            {row.waitMins !== null ? <span className="font-bold text-amber-400">{row.waitMins}m</span> : <span className="text-slate-600">-</span>}
                          </td>
                          <td className="p-3 font-mono">
                            {row.totalTransitMins !== null ? (
                              <div>
                                <span className="font-bold text-blue-400">{row.totalTransitMins}m</span>
                                <span className="block text-[10px] text-slate-400">
                                  ({row.initTransitMins ?? '—'}+{row.finalTransitMins ?? '—'})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {row.execMins !== null ? (
                              <div>
                                <span className="font-bold text-emerald-400">{row.execMins}m</span>
                                {row.execGrossMins !== null && row.deductedMins > 0 && (
                                  <span className="block text-[10px] text-slate-400">
                                    Bruto {row.execGrossMins}m (-{row.deductedMins}m)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            <span className={row.breakdownMins > 0 ? 'font-bold text-rose-400' : 'text-slate-500'}>
                              {row.breakdownMins}m
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            <span className={row.refillMins > 0 ? 'font-bold text-purple-400' : 'text-slate-500'}>
                              {row.refillMins}m
                            </span>
                          </td>
                          <td className="p-3">
                            {row.overallAlertLevel === 'critical' ? (
                              <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap">
                                CRÍTICA +10h{row.isRouteActive ? ' (Activa)' : ''}
                              </span>
                            ) : row.overallAlertLevel === 'warning' ? (
                              <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                                ALERTA +8h{row.isRouteActive ? ' (Activa)' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Normal</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {row.efficiency !== null ? (
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                row.efficiency >= 70 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                row.efficiency >= 50 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}>
                                {row.efficiency}%
                              </span>
                            ) : (
                              <span className="text-slate-500">En proceso</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {metrics.timeBreakdownAssignments.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400">
                            No hay datos de tiempos operativos para la selección actual.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold flex items-center gap-2 mb-6 text-slate-800 text-sm">
                  <PieChartIcon className="h-5 w-5 text-emerald-500" />
                  Distribución de Estados de Asignación
                </h3>
                <div className="h-64">
                  {metrics.assignmentData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metrics.assignmentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {metrics.assignmentData.map((entry, index) => {
                            const colors: Record<string, string> = {
                              'Salida de Base': '#f59e0b',
                              'Inicio de Ruta': '#3b82f6',
                              'Fin de Ruta': '#10b981',
                              'Relleno': '#8b5cf6',
                              'Base': '#64748b',
                              'Pendiente': '#cbd5e1'
                            };
                            return <Cell key={`cell-${index}`} fill={colors[entry.name] || '#94a3b8'} />;
                          })}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                      No hay asignaciones registradas para el filtro seleccionado
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold flex items-center gap-2 mb-6 text-slate-800 text-sm">
                  <PieChartIcon className="h-5 w-5 text-emerald-500" />
                  Disponibilidad Operativa de Flota
                </h3>
                <div className="h-64">
                  {metrics.vehicleData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metrics.vehicleData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {metrics.vehicleData.map((entry, index) => {
                            const colors: Record<string, string> = {
                              'Operativos': '#10b981',
                              'Inoperativos': '#ef4444'
                            };
                            return <Cell key={`cell-${index}`} fill={colors[entry.name] || '#94a3b8'} />;
                          })}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                      No hay vehículos registrados
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Export Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
                <h3 className="font-bold flex items-center gap-2 mb-2 text-slate-800 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  Reporte Rápido de Asignaciones
                </h3>
                <p className="text-sm text-slate-500 mb-6 flex-1">
                  Descargue el historial de asignaciones, rutas y novedades registradas en el filtro actual.
                </p>
                <button 
                  onClick={handleExportAssignments}
                  className="w-full flex items-center justify-center bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl py-3 text-sm font-bold transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Asignaciones (CSV)
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
                <h3 className="font-bold flex items-center gap-2 mb-2 text-slate-800 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  Directorio de Personal
                </h3>
                <p className="text-sm text-slate-500 mb-6 flex-1">
                  Descargue el listado completo de empleados, incluyendo conductores, ayudantes y coordinadores.
                </p>
                <button 
                  onClick={handleExportEmployees}
                  className="w-full flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl py-3 text-sm font-bold transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Personal (CSV)
                </button>
              </div>
            </div>

            {/* Dynamic Interactive Detail Modals */}
            {activeDetail && (
              <DetailModal 
                title={
                  activeDetail === 'rutas_asignadas' ? 'Rutas Asignadas (Gestionadas)' :
                  activeDetail === 'rutas_todas' ? 'Catálogo Completo de Rutas & Estado' :
                  activeDetail === 'vehiculos_asignados' ? 'Vehículos Asignados en Ruta' :
                  activeDetail === 'vehiculos_todos' ? 'Catálogo Completo de Vehículos' :
                  activeDetail === 'personal_asignado' ? 'Personal Asignado en Ruta' :
                  activeDetail === 'personal_todos' ? 'Directorio Completo de Personal' :
                  activeDetail === 'completadas_gestionadas' ? 'Rutas Completadas' :
                  activeDetail === 'completadas_todas' ? 'Todas las Rutas Asignadas' :
                  'Registro de Novedades'
                } 
                onClose={() => setActiveDetail(null)}
              >
                {/* 1. RUTAS ASIGNADAS (ONLY MANAGED) */}
                {activeDetail === 'rutas_asignadas' && (
                  <div className="space-y-3">
                    {metrics.relevantAssignments.map((assignment: Assignment) => {
                      const route = state.routes.find(r => r.id === assignment.routeId);
                      const vehicle = state.vehicles.find(v => v.id === assignment.vehicleId);
                      return (
                        <div key={assignment.id} className="p-3 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs bg-slate-800 text-white px-1.5 py-0.5 rounded font-bold">{route?.code || 'N/A'}</span>
                              <h4 className="font-bold text-slate-800 text-sm">{route?.name || 'Ruta Desconocida'}</h4>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-3 mt-1.5">
                              <span className="flex items-center"><Clock className="h-3 w-3 mr-1" />{new Date(assignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                              <span className="flex items-center"><Truck className="h-3 w-3 mr-1" />Móvil {vehicle?.internalNumber || 'N/A'}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full w-fit uppercase tracking-wider border border-emerald-200">
                            {assignment.status}
                          </span>
                        </div>
                      );
                    })}
                    {metrics.relevantAssignments.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-6">No hay rutas asignadas en el filtro actual.</p>
                    )}
                  </div>
                )}

                {/* 2. RUTAS TODAS (TOTAL UNIVERSES & STATUS) */}
                {activeDetail === 'rutas_todas' && (
                  <div className="space-y-3">
                    {metrics.filteredRoutes.map((route: RouteDef) => {
                      const activeAssignment = metrics.relevantAssignments.find(a => a.routeId === route.id);
                      const vehicle = activeAssignment ? state.vehicles.find(v => v.id === activeAssignment.vehicleId) : null;
                      return (
                        <div key={route.id} className={`p-3.5 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${activeAssignment ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs bg-slate-800 text-white px-1.5 py-0.5 rounded font-bold">{route.code}</span>
                              <h4 className="font-bold text-slate-800 text-sm">{route.name}</h4>
                            </div>
                            <p className="text-xs text-slate-500">{route.origin} &rarr; {route.destination}</p>
                            {activeAssignment && (
                              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center">
                                <Truck className="h-3 w-3 mr-1" /> Asignada a Móvil {vehicle?.internalNumber || 'N/A'} ({activeAssignment.status})
                              </p>
                            )}
                          </div>
                          {activeAssignment ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-emerald-500 text-white rounded-full w-fit uppercase tracking-wider shadow-xs">
                              ASIGNADA
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full w-fit uppercase tracking-wider">
                              SIN ASIGNAR (DISPONIBLE)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. VEHÍCULOS ASIGNADOS */}
                {activeDetail === 'vehiculos_asignados' && (
                  <div className="space-y-3">
                    {metrics.relevantVehicles.filter(v => metrics.relevantAssignments.some(a => a.vehicleId === v.id)).map(veh => {
                      const assignment = metrics.relevantAssignments.find(a => a.vehicleId === veh.id);
                      const route = assignment ? state.routes.find(r => r.id === assignment.routeId) : null;
                      return (
                        <div key={veh.id} className="p-3 border border-amber-200 bg-amber-50/40 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase">Móvil {veh.internalNumber}</span>
                            <h4 className="font-bold text-slate-800 text-sm">{veh.plate} ({veh.capacity} Ton)</h4>
                            <p className="text-xs text-slate-600 mt-0.5">Ruta: <strong>{route?.name || 'N/A'}</strong></p>
                          </div>
                          <span className="text-[10px] font-bold px-2.5 py-1 bg-amber-500 text-white rounded-full uppercase">
                            EN RUTA
                          </span>
                        </div>
                      );
                    })}
                    {metrics.assignedVehiclesCount === 0 && (
                      <p className="text-sm text-slate-500 text-center py-6">No hay vehículos asignados actualmente.</p>
                    )}
                  </div>
                )}

                {/* 4. VEHÍCULOS TODOS */}
                {activeDetail === 'vehiculos_todos' && (
                  <div className="space-y-3">
                    {metrics.relevantVehicles.map(veh => {
                      const assignment = metrics.relevantAssignments.find(a => a.vehicleId === veh.id);
                      const route = assignment ? state.routes.find(r => r.id === assignment.routeId) : null;
                      return (
                        <div key={veh.id} className={`p-3.5 border rounded-xl flex justify-between items-center ${assignment ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase">Móvil {veh.internalNumber}</span>
                            <h4 className="font-bold text-slate-800 text-sm">{veh.plate} ({veh.capacity} Ton)</h4>
                            {assignment ? (
                              <p className="text-xs text-amber-800 font-semibold mt-0.5">Asignado a: {route?.name || 'Ruta'}</p>
                            ) : (
                              <p className="text-xs text-emerald-600 font-semibold mt-0.5">Disponible en Base</p>
                            )}
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            veh.status === 'Operativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {veh.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 5. PERSONAL ASIGNADO */}
                {activeDetail === 'personal_asignado' && (
                  <div className="space-y-3">
                    {metrics.relevantEmployees.filter(e => metrics.relevantAssignments.some(a => (a.employeeIds || []).includes(e.id))).map(emp => {
                      const assignment = metrics.relevantAssignments.find(a => (a.employeeIds || []).includes(emp.id));
                      const route = assignment ? state.routes.find(r => r.id === assignment.routeId) : null;
                      return (
                        <div key={emp.id} className="p-3 border border-indigo-200 bg-indigo-50/40 rounded-xl flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{emp.name}</h4>
                            <p className="text-xs text-slate-500">{emp.role} • Ruta: <strong>{route?.name || 'N/A'}</strong></p>
                          </div>
                          <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-600 text-white rounded-full uppercase">
                            ASIGNADO
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 6. PERSONAL TODOS */}
                {activeDetail === 'personal_todos' && (
                  <div className="space-y-3">
                    {metrics.relevantEmployees.map(emp => {
                      const assignment = metrics.relevantAssignments.find(a => (a.employeeIds || []).includes(emp.id));
                      return (
                        <div key={emp.id} className={`p-3.5 border rounded-xl flex justify-between items-center ${assignment ? 'bg-indigo-50/40 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{emp.name}</h4>
                            <p className="text-xs text-slate-500">{emp.role} • Tel: {emp.phone || 'Sin teléfono'}</p>
                          </div>
                          {assignment ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-600 text-white rounded-full uppercase">
                              EN RUTA
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full uppercase">
                              DISPONIBLE
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 7. NOVEDADES */}
                {activeDetail === 'novedades' && (
                  <div className="space-y-3">
                    {metrics.relevantAssignments.flatMap(a => 
                      a.incidents.map((inc: Incident) => {
                        const route = state.routes.find(r => r.id === a.routeId);
                        const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
                        return (
                          <div key={inc.id} className="p-3 border border-amber-200 bg-amber-50/50 rounded-xl flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase">{inc.type}</span>
                              <span className="text-[10px] text-slate-500 flex items-center"><Clock className="h-3 w-3 mr-1" /> {inc.timestamp}</span>
                            </div>
                            <p className="text-sm text-slate-800 mt-1">{inc.description}</p>
                            <p className="text-xs text-slate-500 mt-2 font-medium">
                              {route?.name || 'Ruta N/A'} • Móvil {vehicle?.internalNumber || 'N/A'}
                            </p>
                          </div>
                        );
                      })
                    )}
                    {metrics.totalIncidents === 0 && (
                      <p className="text-sm text-slate-500 text-center py-6">No se han reportado novedades.</p>
                    )}
                  </div>
                )}

                {/* 8. COMPLETADAS GESTIONADAS / TODAS */}
                {(activeDetail === 'completadas_gestionadas' || activeDetail === 'completadas_todas') && (
                  <div className="space-y-3">
                    {metrics.relevantAssignments.map((assignment: Assignment) => {
                      const isCompleted = ['Fin de Ruta', 'Base'].includes(assignment.status);
                      if (activeDetail === 'completadas_gestionadas' && !isCompleted) return null;
                      const route = state.routes.find(r => r.id === assignment.routeId);
                      const vehicle = state.vehicles.find(v => v.id === assignment.vehicleId);
                      return (
                        <div key={assignment.id} className={`p-3.5 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isCompleted ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{route?.name || 'Ruta Desconocida'}</h4>
                            <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                              <span className="flex items-center"><Clock className="h-3 w-3 mr-1" />{new Date(assignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                              <span className="flex items-center"><Truck className="h-3 w-3 mr-1" />Móvil {vehicle?.internalNumber || 'N/A'}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            isCompleted ? 'bg-emerald-600 text-white' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {assignment.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </DetailModal>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const DetailModal = ({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) => (
  <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl border border-slate-100">
      <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
        <h3 className="font-bold text-md text-slate-800">{title}</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto max-h-[65vh]">
        {children}
      </div>
    </div>
  </div>
);

interface ParetoCardProps {
  title: string;
  managedValue: number | string;
  totalValue: number | string;
  managedLabel?: string;
  totalLabel?: string;
  icon: React.ReactNode;
  bg: string;
  onManagedClick: () => void;
  onTotalClick: () => void;
}

const ParetoMetricCard: React.FC<ParetoCardProps> = ({
  title, managedValue, totalValue, managedLabel = 'Gestionadas', totalLabel = 'Total', icon, bg, onManagedClick, onTotalClick
}) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between h-36 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{title}</span>
      <div className={`p-2 rounded-xl ${bg}`}>
        {icon}
      </div>
    </div>
    <div>
      <div className="flex items-baseline gap-1 text-2xl sm:text-3xl font-black">
        <button 
          onClick={onManagedClick}
          className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer transition-transform hover:scale-105"
          title={`Ver ${managedLabel} (${managedValue})`}
        >
          {managedValue}
        </button>
        <span className="text-slate-300 font-normal text-xl">/</span>
        <button 
          onClick={onTotalClick}
          className="text-slate-600 hover:text-slate-800 hover:underline cursor-pointer transition-transform hover:scale-105"
          title={`Ver ${totalLabel} (${totalValue})`}
        >
          {totalValue}
        </button>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-bold mt-1">
        <button onClick={onManagedClick} className="text-emerald-700 hover:underline cursor-pointer">
          {managedValue} {managedLabel}
        </button>
        <span className="text-slate-300">•</span>
        <button onClick={onTotalClick} className="text-slate-500 hover:underline cursor-pointer">
          {totalValue} {totalLabel}
        </button>
      </div>
    </div>
  </div>
);

