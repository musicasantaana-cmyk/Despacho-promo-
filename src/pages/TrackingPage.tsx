import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Assignment, DriverShift, IncidentType, AssignmentStatus } from '../types';
import {
  Clock, CheckCircle, AlertTriangle, XCircle, Navigation,
  MessageCircle, Phone, ChevronLeft, MapPin, Truck, ArrowRightCircle,
  Pencil, Save, UserPlus, Trash2, RefreshCw, Calendar, Search, User
} from 'lucide-react';
import {
  MAX_AUXILIARIES_PER_ROUTE,
  getAssignmentCrewBreakdown,
  getEffectiveAssignmentWithShift,
  isConductorRole,
  mapDriverShiftToAssignmentStatus,
  resolveAssignmentDriver,
  validateAssignmentSelection,
} from '../utils/assignmentRules';

// ─── Status metadata helpers ───────────────────────────────────────────────────
const STATUS_LABELS: Record<AssignmentStatus, string> = {
  'Pendiente': 'Pendiente',
  'Salida de Base': 'Salida de Base',
  'Inicio de Ruta': 'Inicio de Ruta',
  'Fin de Ruta': 'Fin de Ruta',
  'Relleno': 'Relleno',
  'Base': 'Llegada a Base',
  'Cancelado': 'Cancelado',
};

const STATUS_COLORS: Record<AssignmentStatus, string> = {
  'Pendiente': 'bg-slate-100 text-slate-600 border-slate-200',
  'Salida de Base': 'bg-blue-100 text-blue-700 border-blue-200',
  'Inicio de Ruta': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Fin de Ruta': 'bg-purple-100 text-purple-700 border-purple-200',
  'Relleno': 'bg-amber-100 text-amber-700 border-amber-200',
  'Base': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Cancelado': 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_ICONS: Partial<Record<AssignmentStatus, React.ReactNode>> = {
  'Pendiente': <Clock className="h-3 w-3" />,
  'Salida de Base': <ArrowRightCircle className="h-3 w-3" />,
  'Inicio de Ruta': <Navigation className="h-3 w-3" />,
  'Fin de Ruta': <MapPin className="h-3 w-3" />,
  'Relleno': <Truck className="h-3 w-3" />,
  'Base': <CheckCircle className="h-3 w-3" />,
  'Cancelado': <XCircle className="h-3 w-3" />,
};

// Format a JS Date or ISO string as local datetime-local input value (YYYY-MM-DDTHH:mm)
const toLocalDatetimeValue = (d?: Date | string | null): string => {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

interface MergedAssignmentEntry {
  kind: 'assignment';
  key: string;
  id: string;
  assignment: Assignment;
  linkedShift: DriverShift | null;
  driverName: string;
  routeCode: string;
  routeName: string;
  vehicleNumber: string;
  vehiclePlate: string;
  status: AssignmentStatus;
  weightTons?: number;
  date: string;
  incidentsCount: number;
}

interface StandaloneShiftEntry {
  kind: 'shift';
  key: string;
  id: string;
  shift: DriverShift;
  driverName: string;
  routeCode: string;
  routeName: string;
  vehicleNumber: string;
  vehiclePlate: string;
  status: AssignmentStatus;
  weightTons?: number;
  date: string;
  incidentsCount: number;
}

type TrackingItem = MergedAssignmentEntry | StandaloneShiftEntry;

export const TrackingPage: React.FC = () => {
  const { state, updateAssignmentStatus, updateAssignmentResources, addIncident } = useAppContext();
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Incident form state ─────────────────────────────────────────────────────
  const [incidentType, setIncidentType] = useState<IncidentType>('Retraso');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentStartTime, setIncidentStartTime] = useState('');
  const [incidentEndTime, setIncidentEndTime] = useState('');

  // ── Status Confirmation Modal state ────────────────────────────────────────
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AssignmentStatus | null>(null);
  const [statusTimestamp, setStatusTimestamp] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // ── Edit Resources Modal state ─────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState('');
  const [editDriverId, setEditDriverId] = useState('');
  const [editAssistantIds, setEditAssistantIds] = useState<string[]>([]);
  const [editTimestamps, setEditTimestamps] = useState<Record<string, string>>({});
  const [addAssistantId, setAddAssistantId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Derived synchronized data (Assignments merged with live DriverShifts + unmatched active DriverShifts) ──
  const { allMergedAssignments, trackingItems, metrics } = useMemo(() => {
    const todayStr = toLocalDatetimeValue(new Date()).slice(0, 10);
    const matchedShiftIds = new Set<string>();

    const groupAssignments = state.assignments.filter(
      a => !state.activeWorkGroupId || a.workGroupId === state.activeWorkGroupId
    );

    const mergedList: MergedAssignmentEntry[] = groupAssignments.map(raw => {
      const effective = getEffectiveAssignmentWithShift(
        raw,
        state.driverShifts,
        state.vehicles,
        state.employees
      );
      if (effective.linkedShift) {
        matchedShiftIds.add(effective.linkedShift.id);
      }

      const route = state.routes.find(r => r.id === effective.assignment.routeId);
      const vehicle = state.vehicles.find(v => v.id === effective.assignment.vehicleId);
      const driver = resolveAssignmentDriver(effective.assignment, state.employees);
      const driverName =
        driver?.name ||
        effective.linkedShift?.driverName ||
        'Sin Conductor';

      return {
        kind: 'assignment',
        key: `asig_${effective.assignment.id}`,
        id: effective.assignment.id,
        assignment: effective.assignment,
        linkedShift: effective.linkedShift,
        driverName,
        routeCode: route?.code || effective.linkedShift?.routeCode || 'S/R',
        routeName: route?.name || effective.linkedShift?.routeName || 'Ruta Desconocida',
        vehicleNumber: vehicle?.internalNumber || effective.linkedShift?.vehicleNumber || 'N/A',
        vehiclePlate: vehicle?.plate || 'N/A',
        status: effective.effectiveStatus,
        weightTons: effective.effectiveWeightTons,
        date: effective.assignment.date,
        incidentsCount: (effective.assignment.incidents || []).length,
      };
    });

    const groupShifts = state.driverShifts.filter(
      s => !state.activeWorkGroupId || s.workGroupId === state.activeWorkGroupId
    );

    const standaloneShifts: StandaloneShiftEntry[] = groupShifts
      .filter(s => !matchedShiftIds.has(s.id) && s.status !== 'EN_BASE')
      .map(s => {
        const route = s.routeId
          ? state.routes.find(r => r.id === s.routeId)
          : state.routes.find(r => s.routeCode && r.code.toLowerCase() === s.routeCode.toLowerCase());
        const vehicle = state.vehicles.find(
          v =>
            (s.vehicleId && v.id === s.vehicleId) ||
            (v.internalNumber.toLowerCase() === s.vehicleNumber.toLowerCase() &&
              (!v.workGroupId || v.workGroupId === s.workGroupId))
        );
        const catalogDriver = s.driverId
          ? state.employees.find(e => e.id === s.driverId)
          : undefined;
        const driverName = catalogDriver?.name || s.driverName || 'Conductor';

        return {
          kind: 'shift',
          key: `shift_${s.id}`,
          id: s.id,
          shift: s,
          driverName,
          routeCode: route?.code || s.routeCode || 'S/R',
          routeName: route?.name || s.routeName || (s.isSupportShift ? 'Apoyo en Ruta' : 'Turno Activo'),
          vehicleNumber: vehicle?.internalNumber || s.vehicleNumber || 'N/A',
          vehiclePlate: vehicle?.plate || 'N/A',
          status: mapDriverShiftToAssignmentStatus(s),
          weightTons: s.weightTons ?? undefined,
          date: s.t1StartShiftAt || s.date,
          incidentsCount: (s.breakdownEvents || []).length + (s.refillEvents || []).length,
        };
      });

    const activeItems: TrackingItem[] = [
      ...mergedList.filter(item => item.status !== 'Base' && item.status !== 'Cancelado'),
      ...standaloneShifts,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Today's metrics synchronized with DriverShifts
    const todayAssignments = mergedList.filter(item => item.assignment.date.startsWith(todayStr));
    const todayStandaloneShifts = groupShifts.filter(
      s => !matchedShiftIds.has(s.id) && !s.isSupportShift && s.date === todayStr
    );
    const todayStatuses: AssignmentStatus[] = [
      ...todayAssignments.map(a => a.status),
      ...todayStandaloneShifts.map(s => mapDriverShiftToAssignmentStatus(s)),
    ];

    return {
      allMergedAssignments: mergedList,
      trackingItems: activeItems,
      metrics: {
        salida: todayStatuses.filter(st => st === 'Salida de Base').length,
        inicio: todayStatuses.filter(st => st === 'Inicio de Ruta').length,
        fin: todayStatuses.filter(st => st === 'Fin de Ruta').length,
        relleno: todayStatuses.filter(st => st === 'Relleno').length,
        base: todayStatuses.filter(st => st === 'Base').length,
      },
    };
  }, [state.assignments, state.driverShifts, state.vehicles, state.routes, state.employees, state.activeWorkGroupId]);

  const filteredTrackingItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return trackingItems;
    return trackingItems.filter(
      item =>
        item.driverName.toLowerCase().includes(q) ||
        item.routeCode.toLowerCase().includes(q) ||
        item.routeName.toLowerCase().includes(q) ||
        item.vehicleNumber.toLowerCase().includes(q) ||
        item.vehiclePlate.toLowerCase().includes(q)
    );
  }, [trackingItems, searchQuery]);

  const selectedItem = useMemo<TrackingItem | null>(() => {
    if (!selectedItemKey) return null;
    return (
      trackingItems.find(item => item.key === selectedItemKey) ||
      allMergedAssignments.find(item => item.key === selectedItemKey) ||
      null
    );
  }, [trackingItems, allMergedAssignments, selectedItemKey]);

  const selectedAssignmentEntry = selectedItem?.kind === 'assignment' ? selectedItem : null;
  const selectedAssignment = selectedAssignmentEntry?.assignment || null;

  // Available employees / vehicles for this group (for edit modal)
  const groupVehicles = useMemo(
    () => state.vehicles.filter(v => !state.activeWorkGroupId || v.workGroupId === state.activeWorkGroupId),
    [state.vehicles, state.activeWorkGroupId]
  );

  const groupEmployees = useMemo(
    () => state.employees.filter(e => !state.activeWorkGroupId || e.workGroupId === state.activeWorkGroupId),
    [state.employees, state.activeWorkGroupId]
  );

  const groupDrivers = useMemo(
    () => groupEmployees.filter(e => isConductorRole(e.role)),
    [groupEmployees]
  );

  const groupAssistants = useMemo(
    () => groupEmployees.filter(e => !isConductorRole(e.role)),
    [groupEmployees]
  );

  // ── Status badge ───────────────────────────────────────────────────────────
  const getStatusBadge = (status: AssignmentStatus) => (
    <span className={`px-2 py-1 text-[10px] rounded-full font-bold uppercase flex items-center gap-1 tracking-wider border shrink-0 ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>
      {STATUS_ICONS[status]}
      {STATUS_LABELS[status] || status}
    </span>
  );

  // ── Open status confirmation modal ─────────────────────────────────────────
  const handleStatusChange = (newStatus: AssignmentStatus) => {
    if (!selectedAssignment || newStatus === selectedAssignment.status) return;
    setPendingStatus(newStatus);
    setStatusTimestamp(toLocalDatetimeValue(new Date()));
    setWeightInput(selectedAssignment.weightTons !== undefined ? String(selectedAssignment.weightTons) : '');
    setShowStatusModal(true);
  };

  // ── Confirm status change ──────────────────────────────────────────────────
  const handleConfirmStatus = async () => {
    if (!selectedAssignment || !pendingStatus) return;
    if (pendingStatus === 'Fin de Ruta' && !weightInput) return;
    setStatusSaving(true);
    const weight = weightInput ? parseFloat(weightInput) : undefined;
    const customTs = statusTimestamp || toLocalDatetimeValue(new Date());
    await updateAssignmentStatus(selectedAssignment.id, pendingStatus, weight, customTs);
    setStatusSaving(false);
    setShowStatusModal(false);
    setPendingStatus(null);
    setWeightInput('');
    if (pendingStatus === 'Base' || pendingStatus === 'Cancelado') {
      setSelectedItemKey(null);
    }
  };

  // ── Open edit resources modal ──────────────────────────────────────────────
  const openEditModal = () => {
    if (!selectedAssignment) return;
    setEditError('');
    setEditVehicleId(selectedAssignment.vehicleId);
    const breakdown = getAssignmentCrewBreakdown(selectedAssignment.employeeIds, state.employees);
    setEditDriverId(breakdown.driver?.id || '');
    setEditAssistantIds(breakdown.assistants.slice(0, MAX_AUXILIARIES_PER_ROUTE).map(a => a.id));

    // Pre-fill timestamps from history / phase fields
    const tsMap: Record<string, string> = {};
    (selectedAssignment.statusHistory || []).forEach(h => {
      if (!tsMap[h.status]) tsMap[h.status] = toLocalDatetimeValue(h.timestamp);
    });
    if (selectedAssignment.salidaBaseAt) tsMap['Salida de Base'] = toLocalDatetimeValue(selectedAssignment.salidaBaseAt);
    if (selectedAssignment.inicioRutaAt) tsMap['Inicio de Ruta'] = toLocalDatetimeValue(selectedAssignment.inicioRutaAt);
    if (selectedAssignment.finRutaAt) tsMap['Fin de Ruta'] = toLocalDatetimeValue(selectedAssignment.finRutaAt);
    if (selectedAssignment.llegadaBaseAt) tsMap['Base'] = toLocalDatetimeValue(selectedAssignment.llegadaBaseAt);
    if (selectedAssignment.createdAt) tsMap['Pendiente'] = toLocalDatetimeValue(selectedAssignment.createdAt);
    setEditTimestamps(tsMap);
    setAddAssistantId('');
    setShowEditModal(true);
  };

  // ── Save resource edits ────────────────────────────────────────────────────
  const handleSaveResources = async () => {
    if (!selectedAssignment) return;
    setEditError('');

    const combinedEmployeeIds = [editDriverId, ...editAssistantIds].filter(Boolean);
    const check = validateAssignmentSelection({
      routeId: selectedAssignment.routeId,
      vehicleId: editVehicleId,
      employeeIds: combinedEmployeeIds,
      routes: state.routes,
      vehicles: state.vehicles,
      employees: state.employees,
      requireOperationalVehicle: editVehicleId !== selectedAssignment.vehicleId,
    });

    if (!check.ok || !check.normalizedEmployeeIds) {
      setEditError(check.error || 'Verifique los datos de conductor, auxiliares y vehículo.');
      return;
    }

    setEditSaving(true);
    try {
      const isoTimestamps: Record<string, string> = {};
      Object.entries(editTimestamps).forEach(([status, val]) => {
        if (val) isoTimestamps[status] = new Date(val as string).toISOString();
      });
      await updateAssignmentResources(selectedAssignment.id, {
        vehicleId: editVehicleId,
        employeeIds: check.normalizedEmployeeIds,
        statusTimestamps: isoTimestamps,
      });
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err?.message || 'No se pudieron guardar los cambios de la asignación.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Incident form ──────────────────────────────────────────────────────────
  const handleAddIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !incidentDesc) return;
    await addIncident(selectedAssignment.id, {
      type: incidentType,
      description: incidentDesc,
      startTime: incidentStartTime || undefined,
      endTime: incidentEndTime || undefined
    });
    setIncidentDesc('');
    setIncidentStartTime('');
    setIncidentEndTime('');
  };

  const allStatuses: AssignmentStatus[] = ['Pendiente', 'Salida de Base', 'Inicio de Ruta', 'Fin de Ruta', 'Relleno', 'Base', 'Cancelado'];

  const currentRoute = selectedAssignment ? state.routes.find(r => r.id === selectedAssignment.routeId) : null;
  const currentVehicle = selectedAssignment ? state.vehicles.find(v => v.id === selectedAssignment.vehicleId) : null;
  const currentCrewBreakdown = selectedAssignment
    ? getAssignmentCrewBreakdown(selectedAssignment.employeeIds, state.employees)
    : null;

  const selectableEditVehicles = useMemo(() => {
    if (!selectedAssignment) return groupVehicles.filter(v => v.status === 'Operativo');
    return groupVehicles.filter(v => v.status === 'Operativo' || v.id === selectedAssignment.vehicleId);
  }, [groupVehicles, selectedAssignment]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">

      {/* ── Assignment & Live Shift List ─────────────────────────────────── */}
      <div className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex-col shadow-sm ${selectedItem ? 'hidden lg:flex' : 'flex'} h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)]`}>
        <div className="p-4 border-b border-slate-100 space-y-2.5">
          <h3 className="font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Seguimiento en Vivo (Referencia: Conductor)
          </h3>
          <div className="grid grid-cols-5 gap-1">
            {[
              { label: 'Salida', val: metrics.salida, cls: 'bg-blue-50 border-blue-100 text-blue-800 text-blue-600' },
              { label: 'Inicio', val: metrics.inicio, cls: 'bg-emerald-50 border-emerald-100 text-emerald-800 text-emerald-500' },
              { label: 'Fin', val: metrics.fin, cls: 'bg-purple-50 border-purple-100 text-purple-800 text-purple-600' },
              { label: 'Relleno', val: metrics.relleno, cls: 'bg-amber-50 border-amber-100 text-amber-800 text-amber-600' },
              { label: 'Base', val: metrics.base, cls: 'bg-emerald-50 border-emerald-100 text-emerald-800 text-emerald-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className={`flex flex-col items-center p-1.5 rounded-lg border ${cls.split(' ').slice(0, 2).join(' ')}`}>
                <span className={`text-[9px] font-bold uppercase mb-0.5 ${cls.split(' ')[3]}`}>{label}</span>
                <span className={`text-sm font-black ${cls.split(' ')[2]}`}>{val}</span>
              </div>
            ))}
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar conductor, ruta o móvil..."
              className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>
          <p className="text-[10px] text-slate-500 text-center">Seleccione un conductor para ver ruta, móvil y novedades.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredTrackingItems.map(item => (
            <button
              key={item.key}
              onClick={() => setSelectedItemKey(item.key)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedItem?.key === item.key
                  ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/40'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {item.driverName}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                    {item.routeCode !== 'S/R' ? `[${item.routeCode}] ` : ''}{item.routeName}
                  </div>
                </div>
                {getStatusBadge(item.status)}
              </div>
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center font-mono font-semibold text-slate-700">
                  <Truck className="h-3 w-3 mr-1 text-slate-400" />
                  Móvil {item.vehicleNumber}
                </span>
                <span className="flex items-center">
                  <Clock className="h-3 w-3 mr-1 text-slate-400" />
                  {new Date(item.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                {item.kind === 'shift' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                    {item.shift.isSupportShift ? 'Apoyo en Vivo' : 'Turno Directo'}
                  </span>
                )}
                {item.incidentsCount > 0 && (
                  <span className="text-amber-600 font-medium flex items-center">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {item.incidentsCount} novedad(es)
                  </span>
                )}
              </div>
            </button>
          ))}
          {filteredTrackingItems.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              {trackingItems.length === 0 ? 'No hay rutas ni turnos activos.' : 'No se encontraron coincidencias.'}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Panel ────────────────────────────────────────────────── */}
      <div className={`lg:col-span-7 ${!selectedItem ? 'hidden lg:block' : 'block h-[calc(100vh-10rem)] lg:h-auto'}`}>
        {selectedAssignment && selectedAssignmentEntry ? (
          <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm">

            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex justify-between items-start gap-2 mb-4">
                <div className="flex items-center min-w-0">
                  <button
                    onClick={() => setSelectedItemKey(null)}
                    className="mr-3 p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200 lg:hidden shrink-0"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Conductor
                      </span>
                      <h2 className="text-lg md:text-xl font-bold text-slate-900 truncate">
                        {selectedAssignmentEntry.driverName}
                      </h2>
                    </div>
                    <p className="text-xs md:text-sm text-slate-600 font-medium mt-1 truncate">
                      {currentRoute?.code ? `[${currentRoute.code}] ` : ''}{currentRoute?.name || 'Ruta Desconocida'} • Móvil {currentVehicle?.internalNumber || 'N/A'} • {new Date(selectedAssignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

                {/* Status selector + Edit button */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={openEditModal}
                    title="Editar insumos de la asignación"
                    className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <select
                    value={selectedAssignment.status}
                    onChange={e => handleStatusChange(e.target.value as AssignmentStatus)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {allStatuses.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Relevant Info Cards: Conductor, Ruta, Móvil */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-4">
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <span className="block text-[11px] font-bold uppercase text-emerald-700 mb-1">Conductor</span>
                  <span className="font-bold text-slate-900 block truncate">
                    {selectedAssignmentEntry.driverName}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Ruta</span>
                  <span className="font-semibold text-slate-800 block truncate">
                    {currentRoute?.code ? `[${currentRoute.code}] ` : ''}{currentRoute?.name || 'N/A'}
                  </span>
                  <span className="text-[11px] text-slate-500 line-clamp-1">
                    {currentRoute?.origin} → {currentRoute?.destination}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Móvil / Vehículo</span>
                  <span className="font-semibold text-slate-800 block">
                    Móvil {currentVehicle?.internalNumber || 'N/A'} · {currentVehicle?.plate || 'N/A'}
                  </span>
                </div>
                {selectedAssignment.weightTons !== undefined && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 sm:col-span-3 flex items-center justify-between">
                    <span className="block text-xs font-medium text-slate-500">Peso de Ruta Registrado</span>
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">
                      {selectedAssignment.weightTons} Tons
                    </span>
                  </div>
                )}
              </div>

              {/* Status history timeline */}
              {selectedAssignment.statusHistory && selectedAssignment.statusHistory.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedAssignment.statusHistory.map((h, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${STATUS_COLORS[h.status] || 'bg-slate-100 text-slate-600'}`}>
                      <span>{STATUS_LABELS[h.status] || h.status}</span>
                      <span className="opacity-70">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col space-y-8">

              {/* Personnel: 1 Conductor + max 3 Auxiliares */}
              <section>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>Tripulación Asignada (1 Conductor + máx. {MAX_AUXILIARIES_PER_ROUTE} Auxiliares)</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                    {currentCrewBreakdown ? (currentCrewBreakdown.driver ? 1 : 0) + currentCrewBreakdown.assistants.length : 0} integrantes
                  </span>
                </h3>
                <div className="grid gap-3">
                  {currentCrewBreakdown?.driver && (
                    <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 p-3 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                            Conductor Principal
                          </span>
                          <p className="font-bold text-sm text-slate-900">{currentCrewBreakdown.driver.name}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{currentCrewBreakdown.driver.role}</p>
                      </div>
                      <div className="flex space-x-2">
                        <a href={`tel:${currentCrewBreakdown.driver.phone}`} className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors" title="Llamar">
                          <Phone className="h-4 w-4" />
                        </a>
                        <a href={`https://wa.me/${currentCrewBreakdown.driver.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  )}

                  {currentCrewBreakdown?.assistants.map((emp, idx) => (
                    <div key={emp.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                            Auxiliar {idx + 1}
                          </span>
                          <p className="font-medium text-sm text-slate-800">{emp.name}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{emp.role}</p>
                      </div>
                      <div className="flex space-x-2">
                        <a href={`tel:${emp.phone}`} className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors" title="Llamar">
                          <Phone className="h-4 w-4" />
                        </a>
                        <a href={`https://wa.me/${emp.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}

                  {(!currentCrewBreakdown || (!currentCrewBreakdown.driver && currentCrewBreakdown.assistants.length === 0)) && (
                    <p className="text-sm text-slate-400 italic">Sin personal asignado.</p>
                  )}
                </div>
              </section>

              {/* Incidents */}
              <section>
                <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-semibold text-slate-800">Registro de Novedades</h3>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {selectedAssignment.incidents.length} Registros
                  </span>
                </div>
                <div className="space-y-3 mb-6">
                  {selectedAssignment.incidents.map(inc => (
                    <div key={inc.id} className="p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-start space-x-3">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-slate-800">{inc.type}</span>
                          <span className="text-xs text-slate-500">{new Date(inc.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{inc.description}</p>
                        {(inc.startTime || inc.endTime) && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-100 text-xs font-medium text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>
                              {inc.startTime ? `Desde: ${inc.startTime}` : 'Desde: N/A'}
                              {inc.endTime ? ` — Hasta: ${inc.endTime}` : ' — Hasta: N/A'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedAssignment.incidents.length === 0 && (
                    <p className="text-sm text-slate-500 italic">No hay novedades registradas en esta ruta.</p>
                  )}
                </div>

                {selectedAssignment.status !== 'Base' && selectedAssignment.status !== 'Cancelado' && (
                  <form onSubmit={handleAddIncident} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Reportar Nueva Novedad</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={incidentType}
                        onChange={e => setIncidentType(e.target.value as IncidentType)}
                        className="w-full sm:w-1/3 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="Retraso">Retraso</option>
                        <option value="Mecánico">Falla Mecánica</option>
                        <option value="Personal">Problema Personal</option>
                        <option value="Clima">Clima/Tráfico</option>
                        <option value="Otro">Otro</option>
                      </select>
                      <input
                        type="text"
                        required
                        value={incidentDesc}
                        onChange={e => setIncidentDesc(e.target.value)}
                        placeholder="Descripción de la novedad..."
                        className="w-full sm:flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="w-full sm:w-1/2 flex items-center space-x-2">
                        <span className="text-xs text-slate-500 w-12 font-medium">Inicio:</span>
                        <input type="time" value={incidentStartTime} onChange={e => setIncidentStartTime(e.target.value)}
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="w-full sm:w-1/2 flex items-center space-x-2">
                        <span className="text-xs text-slate-500 w-12 font-medium">Fin:</span>
                        <input type="time" value={incidentEndTime} onChange={e => setIncidentEndTime(e.target.value)}
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors">
                        Guardar Novedad
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </div>
        ) : selectedItem?.kind === 'shift' ? (
          <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex justify-between items-start gap-3 mb-4">
                <div className="flex items-center min-w-0">
                  <button
                    onClick={() => setSelectedItemKey(null)}
                    className="mr-3 p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200 lg:hidden shrink-0"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                        Turno Conductor
                      </span>
                      <h2 className="text-lg md:text-xl font-bold text-slate-900 truncate">
                        {selectedItem.driverName}
                      </h2>
                    </div>
                    <p className="text-xs md:text-sm text-slate-600 font-medium mt-1 truncate">
                      {selectedItem.routeCode !== 'S/R' ? `[${selectedItem.routeCode}] ` : ''}{selectedItem.routeName} • Móvil {selectedItem.vehicleNumber}
                    </p>
                  </div>
                </div>
                {getStatusBadge(selectedItem.status)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-4">
                <div className="bg-white p-3 rounded-lg border border-emerald-200">
                  <span className="block text-[11px] font-bold uppercase text-emerald-700 mb-1">Conductor</span>
                  <span className="font-bold text-slate-900 block truncate">{selectedItem.driverName}</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Ruta</span>
                  <span className="font-semibold text-slate-800 block truncate">
                    {selectedItem.routeCode !== 'S/R' ? `[${selectedItem.routeCode}] ` : ''}{selectedItem.routeName}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Móvil / Vehículo</span>
                  <span className="font-semibold text-slate-800 block">
                    Móvil {selectedItem.vehicleNumber}{selectedItem.vehiclePlate !== 'N/A' ? ` · ${selectedItem.vehiclePlate}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-900">
                Jornada iniciada directamente desde el Módulo Conductor y sincronizada en tiempo real con el Tablero en Vivo.
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 block">T1 Inicio Turno</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedItem.shift.t1StartShiftAt ? new Date(selectedItem.shift.t1StartShiftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 block">T2 Inicio Ruta</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedItem.shift.t2StartRouteAt ? new Date(selectedItem.shift.t2StartRouteAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 block">T3 Fin Ruta</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedItem.shift.t3EndRouteAt ? new Date(selectedItem.shift.t3EndRouteAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 block">Peso Registrado</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {selectedItem.shift.weightTons !== null && selectedItem.shift.weightTons !== undefined ? `${selectedItem.shift.weightTons} Ton` : '—'}
                  </span>
                </div>
              </div>

              {(selectedItem.shift.refillEvents.length > 0 || selectedItem.shift.breakdownEvents.length > 0) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
                    Eventos de Jornada (Relleno / Avería)
                  </h3>
                  {selectedItem.shift.refillEvents.map(ev => (
                    <div key={ev.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs flex justify-between">
                      <span className="font-bold text-amber-900">Relleno / Descargue</span>
                      <span className="font-mono text-amber-800">
                        {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {ev.endAt ? new Date(ev.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'En curso'}
                      </span>
                    </div>
                  ))}
                  {selectedItem.shift.breakdownEvents.map(ev => (
                    <div key={ev.id} className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs flex justify-between">
                      <span className="font-bold text-rose-900">Avería Mecánica {ev.notes ? `· ${ev.notes}` : ''}</span>
                      <span className="font-mono text-rose-800">
                        {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {ev.endAt ? new Date(ev.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'En curso'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full bg-slate-50 border border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-center p-8">
            <Navigation className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600">Ningún Conductor / Ruta Seleccionada</h3>
            <p className="text-slate-400 text-sm mt-2">Seleccione un conductor de la lista lateral para ver su ruta, móvil, estado y novedades.</p>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          STATUS CONFIRMATION MODAL
      ═════════════════════════════════════════════════════════════════════ */}
      {showStatusModal && pendingStatus && selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">

            {/* Modal header */}
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Confirmar Cambio de Estado</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedAssignmentEntry?.driverName} · {currentRoute?.code ? `[${currentRoute.code}] ` : ''}{currentRoute?.name}
                </p>
              </div>
              <button
                onClick={() => { setShowStatusModal(false); setPendingStatus(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* State transition display */}
              <div className="flex items-center justify-center gap-4">
                <span className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase ${STATUS_COLORS[selectedAssignment.status]}`}>
                  {STATUS_LABELS[selectedAssignment.status]}
                </span>
                <ArrowRightCircle className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <span className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase shadow-sm ${STATUS_COLORS[pendingStatus]}`}>
                  {STATUS_LABELS[pendingStatus]}
                </span>
              </div>

              {/* Datetime picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                  Hora del Cambio de Estado
                </label>
                <input
                  type="datetime-local"
                  value={statusTimestamp}
                  onChange={e => setStatusTimestamp(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Por defecto: hora actual. Edite si el evento ocurrió en otro momento.
                </p>
              </div>

              {/* Weight field — only for Fin de Ruta */}
              {pendingStatus === 'Fin de Ruta' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-purple-600" />
                    Peso Total de Ruta (Toneladas) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    placeholder="Ej. 12.5"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-lg font-semibold text-slate-800 text-center focus:ring-2 focus:ring-purple-500 outline-none"
                    autoFocus
                  />
                </div>
              )}

              {/* Note about timing impact */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <span>La hora seleccionada se registrará en el historial de tiempos operativos e impactará los indicadores de <strong>toma de tiempos</strong> en Reportes.</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowStatusModal(false); setPendingStatus(null); }}
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmStatus}
                  disabled={statusSaving || (pendingStatus === 'Fin de Ruta' && (!weightInput || isNaN(parseFloat(weightInput))))}
                  className="flex-1 bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                >
                  {statusSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {statusSaving ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          EDIT RESOURCES MODAL (Pencil ✏️)
      ═════════════════════════════════════════════════════════════════════ */}
      {showEditModal && selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-100">

            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Editar Insumos de Asignación</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Vehículo, 1 Conductor + máx. {MAX_AUXILIARIES_PER_ROUTE} Auxiliares y Tiempos</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* ── Vehicle ── */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-amber-600" /> Vehículo Existente Asignado
                </h4>
                <select
                  value={editVehicleId}
                  onChange={e => { setEditVehicleId(e.target.value); setEditError(''); }}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-amber-400 outline-none bg-slate-50"
                >
                  {selectableEditVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      Móvil {v.internalNumber} · {v.plate} ({v.capacity} Ton){v.status !== 'Operativo' ? ' - Inoperativo' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Driver (Obligatorio - 1 por ruta) ── */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-emerald-600" /> Conductor Principal (1 obligatorio)
                </h4>
                <select
                  value={editDriverId}
                  onChange={e => { setEditDriverId(e.target.value); setEditError(''); }}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none bg-slate-50"
                >
                  <option value="">— Seleccionar Conductor —</option>
                  {groupDrivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Auxiliares (Opcional - máx. 3 por ruta) ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                    <UserPlus className="h-3.5 w-3.5 text-indigo-600" /> Auxiliares Asignados
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    editAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {editAssistantIds.length} / {MAX_AUXILIARIES_PER_ROUTE} auxiliares
                  </span>
                </div>

                {/* Current assistants */}
                <div className="space-y-2 mb-3">
                  {editAssistantIds.map((empId, idx) => {
                    const emp = state.employees.find(e => e.id === empId);
                    if (!emp) return null;
                    return (
                      <div key={empId} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                        <div>
                          <p className="font-medium text-sm text-slate-800">
                            <span className="text-[10px] font-bold uppercase text-slate-500 mr-1.5">Aux. {idx + 1}:</span>
                            {emp.name}
                          </p>
                          <p className="text-xs text-slate-500">{emp.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setEditAssistantIds(prev => prev.filter(id => id !== empId)); setEditError(''); }}
                          className="p-1.5 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors"
                          title="Eliminar auxiliar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {editAssistantIds.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">Sin auxiliares asignados (opcional, máximo {MAX_AUXILIARIES_PER_ROUTE}).</p>
                  )}
                </div>

                {/* Add assistant */}
                <div className="flex gap-2">
                  <select
                    value={addAssistantId}
                    onChange={e => setAddAssistantId(e.target.value)}
                    disabled={editAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE}
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-slate-50 disabled:opacity-50"
                  >
                    <option value="">
                      {editAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE
                        ? `Límite de ${MAX_AUXILIARIES_PER_ROUTE} auxiliares alcanzado`
                        : '— Seleccionar auxiliar —'}
                    </option>
                    {groupAssistants
                      .filter(e => !editAssistantIds.includes(e.id))
                      .map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        addAssistantId &&
                        !editAssistantIds.includes(addAssistantId) &&
                        editAssistantIds.length < MAX_AUXILIARIES_PER_ROUTE
                      ) {
                        setEditAssistantIds(prev => [...prev, addAssistantId]);
                        setAddAssistantId('');
                        setEditError('');
                      }
                    }}
                    disabled={!addAssistantId || editAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-40 text-sm font-bold"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ── Status Timestamps ── */}
              {selectedAssignment.statusHistory && selectedAssignment.statusHistory.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" /> Historial de Tiempos de Estado
                  </h4>
                  <p className="text-[10px] text-slate-400 mb-3">Edite la hora exacta de cada cambio de estado para corregir la toma de tiempos operativos.</p>
                  <div className="space-y-2.5">
                    {selectedAssignment.statusHistory.map((h, idx) => (
                      <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border ${STATUS_COLORS[h.status] || 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{STATUS_LABELS[h.status] || h.status}</p>
                        </div>
                        <input
                          type="datetime-local"
                          value={editTimestamps[h.status] || toLocalDatetimeValue(h.timestamp)}
                          onChange={e => setEditTimestamps(prev => ({ ...prev, [h.status]: e.target.value }))}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none bg-white w-48"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-100 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveResources}
                disabled={editSaving || !editDriverId || !editVehicleId}
                className="flex-1 bg-amber-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                {editSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editSaving ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

