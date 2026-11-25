import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { exportToCsv } from '../../utils/exportCsv';
import {
  Users,
  CheckCircle,
  Search,
  Calendar,
  Save,
  PieChart as PieChartIcon,
  XCircle,
  Truck,
  Activity,
  Clock,
} from 'lucide-react';
import { AttendanceStatus, DriverShift, NOVELTY_TYPES } from '../../types';
import { ReportSubMenuHeader } from './ReportSubMenuHeader';
import {
  formatFirestoreRuleError,
  getEffectiveAssignmentWithShift,
  isConductorRole,
  validateAssignmentSelection,
} from '../../utils/assignmentRules';

function toLocalDateKey(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-CA');
  }
  return trimmed.slice(0, 10);
}

function formatShortTime(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getOperationalPhaseLabel(shift?: DriverShift | null, assignmentStatus?: string): string {
  if (shift) {
    if (shift.isInBreakdown) return 'En Avería';
    if (shift.isPausedForRefill) return 'En Relleno';
    if (shift.isPausedForSupport) return 'En Apoyo';
    if (shift.status === 'EN_BASE') return 'Turno Finalizado (Base)';
    if (shift.status === 'FIN_RUTA') return 'Fin de Ruta';
    if (shift.status === 'EN_RUTA') return 'En Ruta';
    return 'En Turno';
  }
  if (assignmentStatus === 'Base') return 'Turno Finalizado (Base)';
  if (assignmentStatus === 'Fin de Ruta') return 'Fin de Ruta';
  if (assignmentStatus === 'Relleno') return 'En Relleno';
  if (assignmentStatus === 'Inicio de Ruta') return 'En Ruta';
  if (assignmentStatus === 'Salida de Base') return 'En Turno';
  return 'Por iniciar turno';
}

interface EmployeeAttendanceEntry {
  status: AttendanceStatus;
  source: 'auto' | 'manual';
  isAssigned: boolean;
  isOperationalActive: boolean;
  operationalState: 'ACTIVE' | 'ASSIGNED' | 'UNASSIGNED';
  routeLabel: string;
  vehicleLabel: string;
  phaseLabel: string;
  shiftStartAt: string;
}

export const AttendanceIncidentsReportView: React.FC = () => {
  const { state, saveAttendance, addAssignment } = useAppContext();

  // Filters State (always local YYYY-MM-DD so evening shifts stay on today's date)
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toLocaleDateString('en-CA')
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [activeModalNovelty, setActiveModalNovelty] = useState<string | null>(null);
  const [modalPendingChanges, setModalPendingChanges] = useState<Record<string, AttendanceStatus>>({});

  // Manual Assignment Modal State
  const [pendingAssignmentEmp, setPendingAssignmentEmp] = useState<{
    id: string;
    name: string;
    role?: string;
    workGroupId?: string;
  } | null>(null);
  const [assignmentRouteId, setAssignmentRouteId] = useState('');
  const [assignmentVehicleId, setAssignmentVehicleId] = useState('');
  const [assignmentConductorId, setAssignmentConductorId] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const selectAllGroups = () => {
    setSelectedGroupIds([]);
  };

  // Filtered Employees List (NOMINA)
  const filteredEmployees = useMemo(() => {
    return state.employees.filter(emp => {
      if (selectedGroupIds.length > 0) {
        const empGroupId =
          emp.workGroupId || state.workGroups.find(g => g.name === emp.workGroup)?.id;
        if (!empGroupId || !selectedGroupIds.includes(empGroupId)) return false;
      }
      return true;
    });
  }, [state.employees, selectedGroupIds, state.workGroups]);

  // Real-time Attendance + Route Assignment + Shift Start Confirmation calculation
  const attendanceData = useMemo(() => {
    const data: Record<string, EmployeeAttendanceEntry> = {};

    const enrichedAssignmentsToday = state.assignments
      .filter(a => a.status !== 'Cancelado' && toLocalDateKey(a.date) === selectedDate)
      .map(a => getEffectiveAssignmentWithShift(a, state.driverShifts, state.vehicles, state.employees));

    const shiftsToday = (state.driverShifts || []).filter(
      s => s.date === selectedDate || toLocalDateKey(s.t1StartShiftAt) === selectedDate
    );

    const priorityScore = (entry: {
      assignment: ReturnType<typeof getEffectiveAssignmentWithShift>['assignment'];
      linkedShift: DriverShift | null;
      effectiveStatus: string;
    }) => {
      if (entry.linkedShift && entry.linkedShift.status !== 'EN_BASE') return 4;
      if (['Salida de Base', 'Inicio de Ruta', 'Relleno', 'Fin de Ruta'].includes(entry.effectiveStatus)) return 3;
      if (entry.linkedShift || entry.effectiveStatus === 'Base') return 2;
      return 1;
    };

    filteredEmployees.forEach(emp => {
      const empAssignments = enrichedAssignmentsToday
        .filter(item => (item.assignment.employeeIds || []).includes(emp.id))
        .sort((a, b) => priorityScore(b) - priorityScore(a));

      const matchedEnriched = empAssignments[0] || null;

      // Also check direct driver shift in case a driver started a shift without prior assignment doc
      const empNormalizedName = emp.name.trim().toLowerCase();
      const directShift =
        matchedEnriched?.linkedShift ||
        shiftsToday.find(
          s =>
            s.driverId === emp.id ||
            (Boolean(empNormalizedName) &&
              s.driverName.trim().toLowerCase() === empNormalizedName)
        ) ||
        null;

      const hasStartedShift = Boolean(
        directShift ||
          (matchedEnriched &&
            ['Salida de Base', 'Inicio de Ruta', 'Fin de Ruta', 'Relleno', 'Base'].includes(
              matchedEnriched.effectiveStatus
            ))
      );
      const isAssigned = Boolean(matchedEnriched || directShift);

      if (isAssigned) {
        const routeObj = matchedEnriched
          ? state.routes.find(r => r.id === matchedEnriched.assignment.routeId)
          : directShift?.routeId
            ? state.routes.find(r => r.id === directShift.routeId)
            : null;
        const vehicleObj = matchedEnriched
          ? state.vehicles.find(v => v.id === matchedEnriched.assignment.vehicleId)
          : directShift?.vehicleId
            ? state.vehicles.find(v => v.id === directShift.vehicleId)
            : null;

        const routeCode = routeObj?.code || directShift?.routeCode || '';
        const routeName = routeObj?.name || directShift?.routeName || '';
        const routeLabel = routeCode
          ? `[${routeCode}] ${routeName}`.trim()
          : routeName || 'Ruta asignada';

        const vehicleNumber =
          vehicleObj?.internalNumber || directShift?.vehicleNumber || '';
        const vehicleLabel = vehicleNumber
          ? `Móvil ${vehicleNumber}${vehicleObj?.plate ? ` (${vehicleObj.plate})` : ''}`
          : vehicleObj?.plate || 'Vehículo asignado';

        const shiftStartAt =
          directShift?.t1StartShiftAt ||
          matchedEnriched?.assignment.salidaBaseAt ||
          '';

        data[emp.id] = {
          status: 'OK',
          source: 'auto',
          isAssigned: true,
          isOperationalActive: hasStartedShift,
          operationalState: hasStartedShift ? 'ACTIVE' : 'ASSIGNED',
          routeLabel,
          vehicleLabel,
          phaseLabel: getOperationalPhaseLabel(
            directShift,
            matchedEnriched?.effectiveStatus
          ),
          shiftStartAt,
        };
        return;
      }

      const manualRecord = state.attendances?.find(
        att => att.employeeId === emp.id && att.date === selectedDate
      );

      if (manualRecord) {
        data[emp.id] = {
          status: manualRecord.status,
          source: 'manual',
          isAssigned: false,
          isOperationalActive: false,
          operationalState: 'UNASSIGNED',
          routeLabel: '',
          vehicleLabel: '',
          phaseLabel: 'Sin asignación',
          shiftStartAt: '',
        };
      } else {
        data[emp.id] = {
          status: 'AUS',
          source: 'auto',
          isAssigned: false,
          isOperationalActive: false,
          operationalState: 'UNASSIGNED',
          routeLabel: '',
          vehicleLabel: '',
          phaseLabel: 'Sin asignación',
          shiftStartAt: '',
        };
      }
    });

    return data;
  }, [
    filteredEmployees,
    state.assignments,
    state.driverShifts,
    state.vehicles,
    state.routes,
    state.employees,
    state.attendances,
    selectedDate,
  ]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const nomina = filteredEmployees.length;
    const allData = Object.values(attendanceData) as EmployeeAttendanceEntry[];
    const assignedCount = allData.filter(d => d.isAssigned).length;
    const activeInOperationCount = allData.filter(d => d.isOperationalActive).length;
    const assignedPendingCount = Math.max(0, assignedCount - activeInOperationCount);

    const counts: Record<string, number> = {};
    allData.forEach(d => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });

    return {
      nomina,
      planOperativo: assignedCount || nomina,
      assignedCount,
      activeInOperationCount,
      assignedPendingCount,
      counts,
    };
  }, [attendanceData, filteredEmployees.length]);

  const searchedEmployees = useMemo(() => {
    if (!searchTerm.trim()) return filteredEmployees;
    const lowerSearch = searchTerm.toLowerCase();
    return filteredEmployees.filter(emp => {
      const entry = attendanceData[emp.id];
      return (
        emp.name.toLowerCase().includes(lowerSearch) ||
        emp.role.toLowerCase().includes(lowerSearch) ||
        (entry?.routeLabel || '').toLowerCase().includes(lowerSearch) ||
        (entry?.vehicleLabel || '').toLowerCase().includes(lowerSearch)
      );
    });
  }, [filteredEmployees, searchTerm, attendanceData]);

  const openAssignmentModalForEmployee = (emp: {
    id: string;
    name: string;
    role?: string;
    workGroupId?: string;
  }) => {
    setPendingAssignmentEmp(emp);
    setAssignmentRouteId('');
    setAssignmentVehicleId('');
    setAssignmentConductorId(isConductorRole(emp.role) ? emp.id : '');
    setAssignmentError('');
  };

  const handleStatusChange = (employeeId: string, status: AttendanceStatus) => {
    if (status === 'OK') {
      const emp = state.employees.find(e => e.id === employeeId);
      if (emp) {
        openAssignmentModalForEmployee(emp);
      }
      return;
    }

    saveAttendance({
      employeeId,
      date: selectedDate,
      status,
      workGroupId: state.employees.find(e => e.id === employeeId)?.workGroupId,
    });
  };

  const modalRoutes = useMemo(() => {
    if (!pendingAssignmentEmp?.workGroupId) return state.routes;
    return state.routes.filter(r => r.workGroupId === pendingAssignmentEmp.workGroupId);
  }, [state.routes, pendingAssignmentEmp]);

  const modalVehicles = useMemo(() => {
    return state.vehicles.filter(
      v =>
        v.status === 'Operativo' &&
        (!pendingAssignmentEmp?.workGroupId || v.workGroupId === pendingAssignmentEmp.workGroupId)
    );
  }, [state.vehicles, pendingAssignmentEmp]);

  const modalDrivers = useMemo(() => {
    return state.employees.filter(
      e =>
        isConductorRole(e.role) &&
        (!pendingAssignmentEmp?.workGroupId || e.workGroupId === pendingAssignmentEmp.workGroupId)
    );
  }, [state.employees, pendingAssignmentEmp]);

  const handleCreateAssignment = async () => {
    if (!pendingAssignmentEmp || !assignmentRouteId || !assignmentVehicleId) return;
    setAssignmentError('');

    const employeeIds = isConductorRole(pendingAssignmentEmp.role)
      ? [pendingAssignmentEmp.id]
      : assignmentConductorId
        ? [assignmentConductorId, pendingAssignmentEmp.id]
        : [];

    const validation = validateAssignmentSelection({
      routeId: assignmentRouteId,
      vehicleId: assignmentVehicleId,
      employeeIds,
      routes: state.routes,
      vehicles: state.vehicles,
      employees: state.employees,
    });

    if (!validation.ok || !validation.normalizedEmployeeIds) {
      setAssignmentError(
        validation.error || 'Debe seleccionar conductor, ruta y vehículo operativo válidos.'
      );
      return;
    }

    setAssignmentSaving(true);
    try {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const localDateTime = `${selectedDate}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

      await addAssignment({
        routeId: assignmentRouteId,
        vehicleId: assignmentVehicleId,
        employeeIds: validation.normalizedEmployeeIds,
        date: localDateTime,
        workGroupId: pendingAssignmentEmp.workGroupId,
      });

      setPendingAssignmentEmp(null);
      setAssignmentRouteId('');
      setAssignmentVehicleId('');
      setAssignmentConductorId('');
    } catch (err: any) {
      setAssignmentError(
        formatFirestoreRuleError(err, 'No se pudo crear la asignación de ruta.')
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleModalSave = () => {
    Object.entries(modalPendingChanges).forEach(([empId, newStatus]) => {
      handleStatusChange(empId, newStatus as AttendanceStatus);
    });
    setActiveModalNovelty(null);
    setModalPendingChanges({});
  };

  const handleExport = () => {
    const data = filteredEmployees.map(emp => {
      const statusData = attendanceData[emp.id];
      const noveltyLabel =
        NOVELTY_TYPES.find(n => n.code === statusData?.status)?.label || statusData?.status;
      const operationalLabel =
        statusData?.operationalState === 'ACTIVE'
          ? 'EN OPERACIÓN / ACTIVO'
          : statusData?.operationalState === 'ASSIGNED'
            ? 'ASIGNADO EN RUTA (Pendiente inicio de turno)'
            : 'SIN ASIGNACIÓN';

      return {
        Fecha: selectedDate,
        Colaborador: emp.name,
        Rol: emp.role,
        Grupo: emp.workGroup,
        Estado: noveltyLabel,
        'Estado Operativo': operationalLabel,
        'Fase Turno': statusData?.phaseLabel || 'Sin asignación',
        'Ruta Asignada': statusData?.routeLabel || '',
        'Vehículo / Móvil': statusData?.vehicleLabel || '',
        'Confirmación Turno': formatShortTime(statusData?.shiftStartAt) || '',
        Origen: statusData?.source === 'auto' ? 'Automático (Sistema)' : 'Manual',
      };
    });
    exportToCsv(`asistencia_${selectedDate}.csv`, data);
  };

  const noveltyList = NOVELTY_TYPES.filter(n => n.code !== 'OK');

  return (
    <div className="space-y-6">
      <ReportSubMenuHeader
        workGroups={state.workGroups}
        selectedGroupIds={selectedGroupIds}
        onToggleGroup={toggleGroupSelection}
        onSelectAllGroups={selectAllGroups}
        onExportCsv={handleExport}
      >
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 pr-4 rounded-2xl w-full">
          <div className="bg-emerald-100 text-emerald-700 p-2.5 rounded-xl flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Seleccionar Fecha
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none font-black text-slate-800 text-lg w-full p-0 focus:ring-0"
            />
          </div>
        </div>
      </ReportSubMenuHeader>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Indicator Table */}
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden flex-1 max-w-sm self-start">
          <div className="bg-[#a3d95c] text-center p-3">
            <h2 className="font-black text-slate-900 text-sm tracking-widest uppercase">
              NOVEDADES DE PERSONAL
            </h2>
          </div>
          <div className="bg-[#bbed69] text-center p-2">
            <div className="font-bold text-slate-800 text-xs opacity-90 capitalize">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>

          <div className="flex flex-col text-[10px] font-bold text-slate-700">
            <div className="flex justify-between border-b border-slate-200 bg-slate-50">
              <div className="flex-1 p-2 px-3">PLAN OPERATIVO</div>
              <div className="w-12 p-2 text-center border-l border-slate-200">
                {metrics.planOperativo}
              </div>
              <div className="w-16 p-2 text-center border-l border-slate-200 flex justify-center items-center text-emerald-600">
                <PieChartIcon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex justify-between border-b border-slate-200 bg-slate-100">
              <div className="flex-1 p-2 px-3">NOMINA</div>
              <div className="w-12 p-2 text-center border-l border-slate-200">{metrics.nomina}</div>
              <div className="w-16 p-2 text-center border-l border-slate-200"></div>
            </div>
            <div className="flex justify-between border-b border-emerald-200 bg-emerald-50 text-emerald-900">
              <div className="flex-1 p-2 px-3 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                EN OPERACIÓN / ACTIVOS (TURNO CONFIRMADO)
              </div>
              <div className="w-12 p-2 text-center border-l border-emerald-200 bg-emerald-600 text-white font-black">
                {metrics.activeInOperationCount}
              </div>
              <div className="w-16 p-2 text-center border-l border-emerald-200 font-black">
                {metrics.nomina > 0
                  ? ((metrics.activeInOperationCount / metrics.nomina) * 100).toFixed(1)
                  : '0.0'}
                %
              </div>
            </div>
            <div className="flex justify-between border-b border-sky-200 bg-sky-50 text-sky-900">
              <div className="flex-1 p-2 px-3">ASIGNADOS EN RUTA (POR INICIAR TURNO)</div>
              <div className="w-12 p-2 text-center border-l border-sky-200 bg-sky-600 text-white font-black">
                {metrics.assignedPendingCount}
              </div>
              <div className="w-16 p-2 text-center border-l border-sky-200 font-black">
                {metrics.nomina > 0
                  ? ((metrics.assignedPendingCount / metrics.nomina) * 100).toFixed(1)
                  : '0.0'}
                %
              </div>
            </div>

            {/* Iterate NOVELTIES */}
            {noveltyList.map(nov => {
              const count = metrics.counts[nov.code] || 0;
              const pct = metrics.nomina > 0 ? (count / metrics.nomina) * 100 : 0;
              const hasData = count > 0;

              return (
                <div
                  key={nov.code}
                  onClick={() => hasData && setActiveModalNovelty(nov.code)}
                  className={`flex justify-between border-b border-slate-100 bg-white transition-colors ${
                    hasData ? 'cursor-pointer hover:bg-slate-50' : ''
                  }`}
                >
                  <div className="flex-1 p-2 px-3">{nov.label}</div>
                  <div
                    className={`w-12 p-2 text-center border-l border-slate-200 ${
                      hasData && nov.code === 'AUS' ? 'bg-[#ef4444] text-white' : ''
                    } ${hasData && nov.code !== 'AUS' ? 'bg-[#3b82f6] text-white opacity-90' : ''}`}
                  >
                    {count}
                  </div>
                  <div
                    className={`w-16 p-2 text-center border-l border-slate-200 ${
                      hasData ? 'bg-[#3b82f6] text-white' : ''
                    }`}
                  >
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}

            <div
              className="flex justify-between bg-[#a3d95c] text-xs cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setActiveModalNovelty('OK')}
            >
              <div className="flex-1 p-3 px-3 text-right font-black tracking-wider text-slate-900">
                OPERATIVOS
              </div>
              <div className="w-12 p-3 text-center border-l border-white/30 bg-[#facc15] font-black text-slate-900">
                {metrics.counts['OK'] || 0}
              </div>
              <div className="w-16 p-3 text-center border-l border-white/30 bg-[#3b82f6] font-black text-white">
                {metrics.nomina > 0
                  ? (((metrics.counts['OK'] || 0) / metrics.nomina) * 100).toFixed(1)
                  : '0.0'}
                %
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          {/* Editor Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex-1">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-slate-500" /> Registro de Novedades y Estado
                  Operativo
                </h3>
                <p className="text-[11px] font-semibold text-slate-500 mt-1">
                  Las asignaciones a ruta y confirmaciones de inicio de turno actualizan
                  automáticamente el estado a En Operación / Activo.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar personal, ruta o móvil..."
                    className="block w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-slate-400 text-slate-700"
                  />
                </div>
                <div className="bg-white px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm whitespace-nowrap">
                  Mostrando {searchedEmployees.length} registros
                </div>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-sm text-[10px]">
                  <tr>
                    <th className="p-4">Personal</th>
                    <th className="p-4">Rol / Grupo</th>
                    <th className="p-4">Asignación / Operación</th>
                    <th className="p-4">Estado / Novedad</th>
                    <th className="p-4 text-center">Acción / Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {searchedEmployees.map(emp => {
                    const data = attendanceData[emp.id];
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800 text-sm">{emp.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            ID: {emp.id}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[10px] mb-1">
                            {emp.role}
                          </span>
                          <div className="text-[10px] text-slate-500 font-bold">{emp.workGroup}</div>
                        </td>
                        <td className="p-4 min-w-[210px]">
                          {data?.operationalState === 'ACTIVE' ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wide">
                                <Activity className="h-3 w-3 text-emerald-600" />
                                En Operación / Activo
                              </span>
                              <div className="text-[11px] font-bold text-slate-700">
                                {data.routeLabel}
                              </div>
                              <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3 text-slate-400" />
                                  {data.vehicleLabel}
                                </span>
                                {data.shiftStartAt && (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    <Clock className="h-3 w-3" />
                                    Turno {formatShortTime(data.shiftStartAt)} · {data.phaseLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : data?.operationalState === 'ASSIGNED' ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-extrabold uppercase tracking-wide">
                                <Clock className="h-3 w-3 text-sky-600" />
                                Asignado en Ruta
                              </span>
                              <div className="text-[11px] font-bold text-slate-700">
                                {data.routeLabel}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <Truck className="h-3 w-3 text-slate-400" />
                                {data.vehicleLabel} · Por iniciar turno
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">
                              Sin asignación en ruta
                            </span>
                          )}
                        </td>
                        <td className="p-4 min-w-[200px]">
                          <select
                            value={data?.status || 'AUS'}
                            onChange={e =>
                              handleStatusChange(emp.id, e.target.value as AttendanceStatus)
                            }
                            disabled={data?.isAssigned}
                            className={`w-full text-xs font-bold py-2.5 px-3 rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-emerald-500 ${
                              data?.isOperationalActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 cursor-not-allowed'
                                : data?.isAssigned
                                  ? 'bg-sky-50 text-sky-800 border-sky-200 cursor-not-allowed'
                                  : data?.status === 'AUS'
                                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                                    : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                            }`}
                          >
                            {NOVELTY_TYPES.map(n => (
                              <option key={n.code} value={n.code}>
                                {n.label}
                              </option>
                            ))}
                          </select>
                          {data?.isOperationalActive ? (
                            <div className="text-[10px] font-bold text-emerald-700 mt-1.5 flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" /> ACTIVO (Inicio de turno
                              confirmado)
                            </div>
                          ) : data?.isAssigned ? (
                            <div className="text-[10px] font-bold text-sky-700 mt-1.5 flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" /> OK (Asignado a ruta)
                            </div>
                          ) : null}
                        </td>
                        <td className="p-4 text-center">
                          {data?.source === 'auto' ? (
                            <span
                              className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-bold ${
                                data.isOperationalActive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : data.isAssigned
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {data.isOperationalActive
                                ? 'Activo en Vivo'
                                : data.isAssigned
                                  ? 'Asignación Ruta'
                                  : 'Automático'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                              <Save className="h-3 w-3 mr-1" /> Guardado Manual
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {searchedEmployees.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <span className="font-semibold text-sm">
                          No se encontró personal con los filtros aplicados.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Novelty Detail Modal */}
      {activeModalNovelty &&
        (() => {
          const modalTitle =
            activeModalNovelty === 'OK'
              ? 'Personal Operativo y Asignado'
              : NOVELTY_TYPES.find(n => n.code === activeModalNovelty)?.label;
          const modalEmployees = filteredEmployees.filter(
            emp => attendanceData[emp.id]?.status === activeModalNovelty
          );

          return (
            <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">{modalTitle}</h3>
                  <button
                    onClick={() => {
                      setActiveModalNovelty(null);
                      setModalPendingChanges({});
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 flex-1">
                  {modalEmployees.length === 0 ? (
                    <p className="text-center text-slate-500 py-4 font-medium">
                      No hay personal con esta novedad.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {modalEmployees.map(emp => {
                        const data = attendanceData[emp.id];
                        const currentModalStatus = modalPendingChanges[emp.id] || data.status;

                        return (
                          <div
                            key={emp.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-xl border border-slate-200 gap-3 shadow-sm"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-800 text-sm">{emp.name}</span>
                                {data?.operationalState === 'ACTIVE' && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                    EN OPERACIÓN / ACTIVO
                                  </span>
                                )}
                                {data?.operationalState === 'ASSIGNED' && (
                                  <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                                    ASIGNADO EN RUTA
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                {emp.role} • {emp.workGroup}
                                {data?.routeLabel ? ` • ${data.routeLabel} (${data.vehicleLabel})` : ''}
                              </div>
                            </div>
                            <div className="flex items-center min-w-[200px]">
                              <select
                                value={currentModalStatus}
                                onChange={e => {
                                  if (e.target.value === 'OK') {
                                    openAssignmentModalForEmployee(emp);
                                  } else {
                                    setModalPendingChanges(prev => ({
                                      ...prev,
                                      [emp.id]: e.target.value as AttendanceStatus,
                                    }));
                                  }
                                }}
                                disabled={data?.isAssigned}
                                className={`w-full text-xs font-bold py-2 px-3 rounded-lg border outline-none transition-colors ${
                                  data?.isAssigned
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 cursor-not-allowed'
                                    : 'bg-white border-slate-300 text-slate-700 focus:ring-2 focus:ring-emerald-500'
                                }`}
                              >
                                {NOVELTY_TYPES.map(n => (
                                  <option key={n.code} value={n.code}>
                                    {n.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setActiveModalNovelty(null);
                      setModalPendingChanges({});
                    }}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleModalSave}
                    className="px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-md flex items-center"
                  >
                    <Save className="h-4 w-4 mr-2" /> Guardar Cambios
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Manual Assignment Modal for 'OK' Status */}
      {pendingAssignmentEmp && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">Asignar a Ruta Operativa</h3>
              <p className="text-xs text-slate-500 mt-1">
                Al marcar a <strong>{pendingAssignmentEmp.name}</strong> como operativo, debes
                asignarlo a una ruta activa y vehículo operativo.
              </p>
            </div>
            <div className="p-5 space-y-4">
              {!isConductorRole(pendingAssignmentEmp.role) && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Conductor Titular de la Ruta (Obligatorio)
                  </label>
                  <select
                    value={assignmentConductorId}
                    onChange={e => setAssignmentConductorId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Seleccione un conductor...</option>
                    {modalDrivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Ruta
                </label>
                <select
                  value={assignmentRouteId}
                  onChange={e => setAssignmentRouteId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Seleccione una ruta...</option>
                  {modalRoutes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.code ? `[${r.code}] ` : ''}
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Vehículo Operativo
                </label>
                <select
                  value={assignmentVehicleId}
                  onChange={e => setAssignmentVehicleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Seleccione un vehículo...</option>
                  {modalVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.internalNumber ? `Móvil ${v.internalNumber} · ` : ''}
                      {v.plate}
                    </option>
                  ))}
                </select>
              </div>
              {assignmentError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {assignmentError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setPendingAssignmentEmp(null);
                  setAssignmentRouteId('');
                  setAssignmentVehicleId('');
                  setAssignmentConductorId('');
                  setAssignmentError('');
                }}
                disabled={assignmentSaving}
                className="px-4 py-2 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateAssignment}
                disabled={
                  assignmentSaving ||
                  !assignmentRouteId ||
                  !assignmentVehicleId ||
                  (!isConductorRole(pendingAssignmentEmp.role) && !assignmentConductorId)
                }
                className="px-4 py-2 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-md"
              >
                {assignmentSaving ? 'Creando...' : 'Crear Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
