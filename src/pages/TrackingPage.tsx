import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Assignment, IncidentType, AssignmentStatus } from '../types';
import {
  Clock, CheckCircle, AlertTriangle, XCircle, Navigation,
  MessageCircle, Phone, ChevronLeft, MapPin, Truck, ArrowRightCircle,
  Pencil, Save, UserPlus, Trash2, RefreshCw, Calendar
} from 'lucide-react';

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

export const TrackingPage: React.FC = () => {
  const { state, updateAssignmentStatus, updateAssignmentResources, addIncident } = useAppContext();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

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
  const [editEmployeeIds, setEditEmployeeIds] = useState<string[]>([]);
  const [editTimestamps, setEditTimestamps] = useState<Record<string, string>>({});
  const [addEmpId, setAddEmpId] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Derived data ───────────────────────────────────────────────────────────
  const sortedAssignments = useMemo(() => {
    return [...state.assignments]
      .filter(a => !state.activeWorkGroupId || a.workGroupId === state.activeWorkGroupId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.assignments, state.activeWorkGroupId]);

  const selectedAssignment = useMemo(() => {
    if (!selectedAssignmentId) return null;
    return state.assignments.find(a => a.id === selectedAssignmentId) || null;
  }, [state.assignments, selectedAssignmentId]);

  const metrics = useMemo(() => ({
    salida: sortedAssignments.filter(a => a.status === 'Salida de Base').length,
    inicio: sortedAssignments.filter(a => a.status === 'Inicio de Ruta').length,
    fin: sortedAssignments.filter(a => a.status === 'Fin de Ruta').length,
    relleno: sortedAssignments.filter(a => a.status === 'Relleno').length,
    base: sortedAssignments.filter(a => a.status === 'Base').length,
  }), [sortedAssignments]);

  // Available employees / vehicles for this group (for edit modal)
  const groupVehicles = useMemo(() =>
    state.vehicles.filter(v => !state.activeWorkGroupId || v.workGroupId === state.activeWorkGroupId),
    [state.vehicles, state.activeWorkGroupId]);

  const groupEmployees = useMemo(() =>
    state.employees.filter(e => !state.activeWorkGroupId || e.workGroupId === state.activeWorkGroupId),
    [state.employees, state.activeWorkGroupId]);

  // ── Status badge ───────────────────────────────────────────────────────────
  const getStatusBadge = (status: Assignment['status']) => (
    <span className={`px-2 py-1 text-[10px] rounded-full font-bold uppercase flex items-center gap-1 tracking-wider border ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>
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
    if (pendingStatus === 'Fin de Ruta' && !weightInput) return; // require weight
    setStatusSaving(true);
    const weight = weightInput ? parseFloat(weightInput) : undefined;
    const customTs = statusTimestamp || toLocalDatetimeValue(new Date());
    await updateAssignmentStatus(selectedAssignment.id, pendingStatus, weight, customTs);
    setStatusSaving(false);
    setShowStatusModal(false);
    setPendingStatus(null);
    setWeightInput('');
  };

  // ── Open edit resources modal ──────────────────────────────────────────────
  const openEditModal = () => {
    if (!selectedAssignment) return;
    setEditVehicleId(selectedAssignment.vehicleId);
    setEditEmployeeIds([...selectedAssignment.employeeIds]);

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
    setAddEmpId('');
    setShowEditModal(true);
  };

  // ── Save resource edits ────────────────────────────────────────────────────
  const handleSaveResources = async () => {
    if (!selectedAssignment) return;
    setEditSaving(true);
    // Convert datetime-local strings → ISO
    const isoTimestamps: Record<string, string> = {};
    Object.entries(editTimestamps).forEach(([status, val]) => {
      if (val) isoTimestamps[status] = new Date(val as string).toISOString();
    });
    await updateAssignmentResources(selectedAssignment.id, {
      vehicleId: editVehicleId,
      employeeIds: editEmployeeIds,
      statusTimestamps: isoTimestamps,
    });
    setEditSaving(false);
    setShowEditModal(false);
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

  // Status choices that can be selected for a given current status
  const allStatuses: AssignmentStatus[] = ['Pendiente', 'Salida de Base', 'Inicio de Ruta', 'Fin de Ruta', 'Relleno', 'Base', 'Cancelado'];

  const currentRoute = selectedAssignment ? state.routes.find(r => r.id === selectedAssignment.routeId) : null;
  const currentVehicle = selectedAssignment ? state.vehicles.find(v => v.id === selectedAssignment.vehicleId) : null;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">

      {/* ── Assignment List ──────────────────────────────────────────────── */}
      <div className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex-col shadow-sm ${selectedAssignment ? 'hidden lg:flex' : 'flex'} h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)]`}>
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Control de Rutas
          </h3>
          <div className="grid grid-cols-5 gap-1 mb-2">
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
          <p className="text-[10px] text-slate-500 text-center">Seleccione una asignación para ver detalles.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {sortedAssignments.map(assignment => {
            const route = state.routes.find(r => r.id === assignment.routeId);
            const vehicle = state.vehicles.find(v => v.id === assignment.vehicleId);
            return (
              <button
                key={assignment.id}
                onClick={() => setSelectedAssignmentId(assignment.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedAssignment?.id === assignment.id
                    ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/40'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-slate-800">
                    {route?.code ? `[${route.code}] ` : ''}{route?.name || 'Ruta Desconocida'}
                  </span>
                  {getStatusBadge(assignment.status)}
                </div>
                <div className="text-xs text-slate-500 flex flex-col space-y-1">
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 text-slate-400" />
                    {new Date(assignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="flex items-center">
                    <Truck className="h-3 w-3 mr-1 text-slate-400" />
                    Móvil {vehicle?.internalNumber || 'N/A'}
                  </span>
                  {assignment.incidents.length > 0 && (
                    <span className="text-amber-600 font-medium flex items-center mt-1">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {assignment.incidents.length} novedad(es)
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {sortedAssignments.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No hay asignaciones creadas.</div>
          )}
        </div>
      </div>

      {/* ── Detail Panel ────────────────────────────────────────────────── */}
      <div className={`lg:col-span-7 ${!selectedAssignment ? 'hidden lg:block' : 'block h-[calc(100vh-10rem)] lg:h-auto'}`}>
        {selectedAssignment ? (
          <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm">

            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <button
                    onClick={() => setSelectedAssignmentId(null)}
                    className="mr-3 p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200 lg:hidden"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div>
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">
                      {currentRoute?.code ? `[${currentRoute.code}] ` : ''}
                      {currentRoute?.name || 'Ruta Desconocida'}
                    </h2>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                      ID: {selectedAssignment.id.slice(0, 8)}… • {new Date(selectedAssignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

                {/* Status selector + Edit button */}
                <div className="flex items-center gap-2">
                  {/* ✏️ Edit resources button */}
                  <button
                    onClick={openEditModal}
                    title="Editar insumos de la asignación"
                    className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  {/* Status change select → triggers confirmation modal */}
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

              {/* Info cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Vehículo</span>
                  <span className="font-semibold text-slate-800">
                    {currentVehicle?.plate || 'N/A'}
                    {currentVehicle?.internalNumber ? ` · Móvil ${currentVehicle.internalNumber}` : ''}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Trayecto</span>
                  <span className="text-slate-800 line-clamp-1">
                    {currentRoute?.origin} → {currentRoute?.destination}
                  </span>
                </div>
                {selectedAssignment.weightTons !== undefined && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 sm:col-span-2 flex items-center justify-between">
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

              {/* Personnel */}
              <section>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
                  Personal Asignado
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                    {selectedAssignment.employeeIds.length}
                  </span>
                </h3>
                <div className="grid gap-3">
                  {selectedAssignment.employeeIds.map(empId => {
                    const emp = state.employees.find(e => e.id === empId);
                    if (!emp) return null;
                    return (
                      <div key={emp.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-lg">
                        <div>
                          <p className="font-medium text-sm text-slate-800">{emp.name}</p>
                          <p className="text-xs text-slate-500">{emp.role}</p>
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
                    );
                  })}
                  {selectedAssignment.employeeIds.length === 0 && (
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
        ) : (
          <div className="h-full bg-slate-50 border border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-center p-8">
            <Navigation className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600">Ninguna Asignación Seleccionada</h3>
            <p className="text-slate-400 text-sm mt-2">Seleccione una ruta de la lista lateral para ver sus detalles, estado y registrar novedades.</p>
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
                  {currentRoute?.code ? `[${currentRoute.code}] ` : ''}{currentRoute?.name}
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
                  <p className="text-xs text-slate-500 mt-0.5">Vehículo, Personal y Tiempos</p>
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

              {/* ── Vehicle ── */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-amber-600" /> Vehículo Asignado
                </h4>
                <select
                  value={editVehicleId}
                  onChange={e => setEditVehicleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-amber-400 outline-none bg-slate-50"
                >
                  {groupVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · Móvil {v.internalNumber} ({v.capacity} Ton)
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Personnel ── */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-indigo-600" /> Personal Asignado
                </h4>

                {/* Current employees */}
                <div className="space-y-2 mb-3">
                  {editEmployeeIds.map(empId => {
                    const emp = state.employees.find(e => e.id === empId);
                    if (!emp) return null;
                    return (
                      <div key={empId} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                        <div>
                          <p className="font-medium text-sm text-slate-800">{emp.name}</p>
                          <p className="text-xs text-slate-500">{emp.role}</p>
                        </div>
                        <button
                          onClick={() => setEditEmployeeIds(prev => prev.filter(id => id !== empId))}
                          className="p-1.5 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors"
                          title="Eliminar de la asignación"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {editEmployeeIds.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">Sin personal. Agrega al menos un empleado.</p>
                  )}
                </div>

                {/* Add employee */}
                <div className="flex gap-2">
                  <select
                    value={addEmpId}
                    onChange={e => setAddEmpId(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-slate-50"
                  >
                    <option value="">— Seleccionar empleado —</option>
                    {groupEmployees
                      .filter(e => !editEmployeeIds.includes(e.id))
                      .map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      if (addEmpId && !editEmployeeIds.includes(addEmpId)) {
                        setEditEmployeeIds(prev => [...prev, addEmpId]);
                        setAddEmpId('');
                      }
                    }}
                    disabled={!addEmpId}
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
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-100 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveResources}
                disabled={editSaving || editEmployeeIds.length === 0}
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
