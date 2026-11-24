import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Assignment } from '../types';
import { Calendar, Map as MapIcon, CheckCircle, Users, Truck, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  MAX_AUXILIARIES_PER_ROUTE,
  formatFirestoreRuleError,
  isConductorRole,
  validateAssignmentSelection,
  validateCrewSelection,
} from '../utils/assignmentRules';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title: string, message: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="p-5">
          <h3 className="font-bold text-slate-800 text-lg mb-2">{title}</h3>
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex justify-end p-4 border-t border-slate-100 gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  );
};

export const AssignmentPage: React.FC = () => {
  const { state, addAssignment, addCrew, deleteCrew } = useAppContext();
  const [activeTab, setActiveTab] = useState<'assign' | 'crews'>('assign');

  // Assign state (1 Conductor obligatorio + máx 3 Auxiliares)
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [createdAssignment, setCreatedAssignment] = useState<Omit<Assignment, 'incidents' | 'status'> | null>(null);
  const [assignError, setAssignError] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  // Crew state
  const [crewName, setCrewName] = useState('');
  const [crewDriverId, setCrewDriverId] = useState('');
  const [crewAssistantIds, setCrewAssistantIds] = useState<string[]>([]);
  const [crewError, setCrewError] = useState('');
  const [crewSaving, setCrewSaving] = useState(false);
  const [deleteConfirmCrewId, setDeleteConfirmCrewId] = useState<string | null>(null);

  // Frequency and availability logic
  const selectedDateObj = useMemo(() => new Date(date), [date]);
  const selectedDayOfWeek = useMemo(() => isNaN(selectedDateObj.getTime()) ? new Date().getDay() : selectedDateObj.getDay(), [selectedDateObj]);
  const selectedDateStr = useMemo(() => date.slice(0, 10), [date]);
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Active vehicle assignments on selected date (not finished or cancelled)
  const activeVehicleAssignments = useMemo(() => {
    return state.assignments.filter(a => 
      a.date.slice(0, 10) === selectedDateStr && 
      !['Fin de Ruta', 'Base', 'Cancelado'].includes(a.status)
    );
  }, [state.assignments, selectedDateStr]);

  const occupiedVehicleIds = useMemo(() => {
    return new Set(activeVehicleAssignments.map(a => a.vehicleId));
  }, [activeVehicleAssignments]);

  // Active route assignments on selected date (status != Cancelado)
  const activeRouteAssignments = useMemo(() => {
    return state.assignments.filter(a => 
      a.date.slice(0, 10) === selectedDateStr && 
      a.status !== 'Cancelado'
    );
  }, [state.assignments, selectedDateStr]);

  const assignedRouteIds = useMemo(() => {
    return new Set(activeRouteAssignments.map(a => a.routeId));
  }, [activeRouteAssignments]);

  // Active employee assignments on selected date (status != Cancelado)
  const activeEmployeeAssignments = useMemo(() => {
    return state.assignments.filter(a => 
      a.date.slice(0, 10) === selectedDateStr && 
      a.status !== 'Cancelado'
    );
  }, [state.assignments, selectedDateStr]);

  const assignedEmployeeIds = useMemo(() => {
    const set = new Set<string>();
    activeEmployeeAssignments.forEach(a => {
      (a.employeeIds || []).forEach(id => set.add(id));
    });
    return set;
  }, [activeEmployeeAssignments]);

  const activeGroupVehicles = useMemo(
    () => state.vehicles.filter(v => v.workGroupId === state.activeWorkGroupId && v.status === 'Operativo'),
    [state.vehicles, state.activeWorkGroupId]
  );
  const activeGroupEmployees = useMemo(
    () => state.employees.filter(e => e.workGroupId === state.activeWorkGroupId),
    [state.employees, state.activeWorkGroupId]
  );
  const activeGroupRoutes = useMemo(
    () => state.routes.filter(r => r.workGroupId === state.activeWorkGroupId),
    [state.routes, state.activeWorkGroupId]
  );
  const activeCrews = useMemo(
    () => (state.crews || []).filter(c => c.workGroupId === state.activeWorkGroupId),
    [state.crews, state.activeWorkGroupId]
  );

  const groupDrivers = useMemo(
    () => activeGroupEmployees.filter(e => isConductorRole(e.role)),
    [activeGroupEmployees]
  );
  const groupAuxiliaries = useMemo(
    () => activeGroupEmployees.filter(e => !isConductorRole(e.role)),
    [activeGroupEmployees]
  );

  const displayedDrivers = useMemo(() => {
    if (!selectedCrewId) return groupDrivers;
    const crew = activeCrews.find(c => c.id === selectedCrewId);
    if (!crew) return groupDrivers;
    return groupDrivers.filter(e => e.id === crew.driverId);
  }, [selectedCrewId, activeCrews, groupDrivers]);

  const displayedAuxiliaries = useMemo(() => {
    if (!selectedCrewId) return groupAuxiliaries;
    const crew = activeCrews.find(c => c.id === selectedCrewId);
    if (!crew) return groupAuxiliaries;
    const auxSet = new Set(crew.assistantIds || []);
    return groupAuxiliaries.filter(e => auxSet.has(e.id));
  }, [selectedCrewId, activeCrews, groupAuxiliaries]);

  const toggleAssistant = (id: string) => {
    setAssignError('');
    setSelectedAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(e => e !== id);
      if (prev.length >= MAX_AUXILIARIES_PER_ROUTE) {
        setAssignError(`Solo se permiten máximo ${MAX_AUXILIARIES_PER_ROUTE} auxiliares por ruta.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleCrewAssistant = (id: string) => {
    setCrewError('');
    setCrewAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(e => e !== id);
      if (prev.length >= MAX_AUXILIARIES_PER_ROUTE) {
        setCrewError(`Solo se permiten máximo ${MAX_AUXILIARIES_PER_ROUTE} auxiliares por tripulación.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCrewSelect = (crewId: string) => {
    setAssignError('');
    setSelectedCrewId(crewId);
    if (!crewId) {
      return;
    }
    const crew = activeCrews.find(c => c.id === crewId);
    if (crew) {
      const driverAvailable = crew.driverId && !assignedEmployeeIds.has(crew.driverId);
      setSelectedDriverId(driverAvailable ? crew.driverId : '');
      const availableAux = (crew.assistantIds || [])
        .filter(id => id && id !== crew.driverId && !assignedEmployeeIds.has(id))
        .slice(0, MAX_AUXILIARIES_PER_ROUTE);
      setSelectedAssistantIds(availableAux);
    }
  };

  const combinedEmployeeIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedDriverId) ids.push(selectedDriverId);
    selectedAssistantIds.forEach(id => {
      if (id && id !== selectedDriverId && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }, [selectedDriverId, selectedAssistantIds]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError('');
    if (!date || assignSaving) return;

    const validation = validateAssignmentSelection({
      routeId,
      vehicleId,
      employeeIds: combinedEmployeeIds,
      routes: activeGroupRoutes,
      vehicles: activeGroupVehicles,
      employees: activeGroupEmployees,
      requireOperationalVehicle: true,
    });
    if (!validation.ok || !validation.normalizedEmployeeIds) {
      setAssignError(validation.error || 'Datos de asignación inválidos.');
      return;
    }
    
    // Prevent double booking route
    if (assignedRouteIds.has(routeId)) {
      setAssignError('Esta ruta ya se encuentra asignada para la fecha seleccionada.');
      return;
    }

    // Prevent double booking vehicle
    if (occupiedVehicleIds.has(vehicleId)) {
      setAssignError('El vehículo seleccionado se encuentra actualmente en una ruta activa. Debe finalizar la ruta previa para asignarlo de nuevo.');
      return;
    }

    // Prevent double booking employees
    const doubleBooked = validation.normalizedEmployeeIds.filter(id => assignedEmployeeIds.has(id));
    if (doubleBooked.length > 0) {
      setAssignError('Algunos trabajadores seleccionados ya se encuentran asignados a otra ruta en esta fecha.');
      return;
    }

    const newAssignment = {
      routeId,
      vehicleId,
      employeeIds: validation.normalizedEmployeeIds,
      date
    };

    setAssignSaving(true);
    try {
      await addAssignment(newAssignment);
      setCreatedAssignment(newAssignment);
      setRouteId('');
      setVehicleId('');
      setSelectedDriverId('');
      setSelectedAssistantIds([]);
      setSelectedCrewId('');
    } catch (err: any) {
      setAssignError(
        formatFirestoreRuleError(err, 'Error al guardar la asignación. Intente nuevamente.')
      );
    } finally {
      setAssignSaving(false);
    }
  };

  const handleSaveCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrewError('');
    if (!crewName.trim() || !crewDriverId || crewSaving) return;

    const check = validateCrewSelection({
      driverId: crewDriverId,
      assistantIds: crewAssistantIds,
      employees: activeGroupEmployees,
    });
    if (!check.ok || !check.normalizedAssistantIds) {
      setCrewError(check.error || 'Tripulación inválida.');
      return;
    }

    setCrewSaving(true);
    try {
      await addCrew({
        name: crewName.trim(),
        driverId: crewDriverId,
        assistantIds: check.normalizedAssistantIds,
      });
      setCrewName('');
      setCrewDriverId('');
      setCrewAssistantIds([]);
    } catch (err: any) {
      setCrewError(formatFirestoreRuleError(err, 'Error al guardar la tripulación.'));
    } finally {
      setCrewSaving(false);
    }
  };

  const confirmDeleteCrew = () => {
    if (deleteConfirmCrewId) {
      deleteCrew(deleteConfirmCrewId);
      setDeleteConfirmCrewId(null);
    }
  };

  return (
    <div className="flex flex-col space-y-6 h-full">
      <div className="flex justify-between items-center w-full bg-slate-100 p-1 rounded-xl">
        <div className="flex space-x-1 overflow-x-auto whitespace-nowrap flex-1 pb-1 md:pb-0 scrollbar-hide">
          <button
            onClick={() => setActiveTab('assign')}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'assign' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
          >
            <MapIcon className="h-4 w-4 mr-2" />
            Nueva Asignación
          </button>
          <button
            onClick={() => setActiveTab('crews')}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'crews' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
          >
            <Users className="h-4 w-4 mr-2" />
            Tripulaciones Predeterminadas
          </button>
        </div>
      </div>

      {!state.activeWorkGroupId ? (
        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-12 shadow-sm h-64">
          <h3 className="font-bold text-slate-800 text-lg mb-2">Seleccione un Grupo</h3>
          <p className="text-slate-500 text-sm">Debe seleccionar un Grupo de Trabajo activo en la barra superior para continuar.</p>
        </div>
      ) : activeTab === 'assign' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center">
              <MapIcon className="h-5 w-5 mr-2 text-emerald-500" />
              Nueva Asignación de Ruta
            </h2>
            {assignError && (
              <div className="mb-4 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                {assignError}
              </div>
            )}
            <form onSubmit={handleCreateAssignment} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Fecha y Hora de Operación</label>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Día: {dayNames[selectedDayOfWeek]}
                  </span>
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input required type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="pl-9 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ruta Base (Frecuencia de Operación)</label>
                <select required value={routeId} onChange={e => setRouteId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione una ruta existente...</option>
                  <optgroup label={`Rutas que operan los ${dayNames[selectedDayOfWeek]}`}>
                    {activeGroupRoutes.filter(r => (r.operatingDays || []).includes(selectedDayOfWeek)).map(r => {
                      const isAssigned = assignedRouteIds.has(r.id);
                      return (
                        <option key={r.id} value={r.id} disabled={isAssigned}>
                          {r.code ? `[${r.code}] ` : ''}{r.name} ({r.origin} - {r.destination}) {isAssigned ? '⛔ (Asignada)' : '✅ (Por Asignar)'}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="Otras Rutas (Fuera de frecuencia hoy)">
                    {activeGroupRoutes.filter(r => !(r.operatingDays || []).includes(selectedDayOfWeek)).map(r => {
                      const isAssigned = assignedRouteIds.has(r.id);
                      return (
                        <option key={r.id} value={r.id} disabled={isAssigned}>
                          {r.code ? `[${r.code}] ` : ''}{r.name} ({r.origin} - {r.destination}) {isAssigned ? '⛔ (Asignada)' : '⚠️ (Fuera de frecuencia)'}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
                {activeGroupRoutes.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No hay rutas registradas en el catálogo para este grupo de trabajo.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehículo Asignado (Catálogo Operativo)</label>
                <select required value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione un vehículo operativo...</option>
                  {activeGroupVehicles.map(v => {
                    const isOccupied = occupiedVehicleIds.has(v.id);
                    return (
                      <option key={v.id} value={v.id} disabled={isOccupied}>
                        {v.plate} (Int: {v.internalNumber}) - {v.capacity} ton/vol {isOccupied ? '⛔ [OCUPADO EN RUTA]' : '✅ [DISPONIBLE]'}
                      </option>
                    );
                  })}
                </select>
                {activeGroupVehicles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No hay vehículos operativos registrados en este grupo.</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="block text-sm font-medium text-slate-700">Tripulación Asignada (1 Conductor + máx. {MAX_AUXILIARIES_PER_ROUTE} Auxiliares)</label>
                  {activeCrews.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Tripulación:</span>
                      <select 
                        value={selectedCrewId} 
                        onChange={e => handleCrewSelect(e.target.value)}
                        className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 bg-white font-medium shadow-sm"
                      >
                        <option value="">Todo el personal del grupo</option>
                        {activeCrews.map(c => {
                          const isCrewOccupied = [c.driverId, ...(c.assistantIds || [])].some(id => assignedEmployeeIds.has(id));
                          return (
                            <option key={c.id} value={c.id} disabled={isCrewOccupied}>
                              Tripulación: {c.name} {isCrewOccupied ? '⛔ (Integrante asignado)' : '✅ (Disponible)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {selectedCrewId && (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-lg">
                    <span>Filtrando por tripulación <strong>{activeCrews.find(c => c.id === selectedCrewId)?.name}</strong></span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedCrewId('')}
                      className="text-emerald-700 hover:text-emerald-900 underline ml-2 font-medium"
                    >
                      Ver todos
                    </button>
                  </div>
                )}

                {/* 1. Conductor Obligatorio (exactamente 1) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">
                    Conductor (Obligatorio — 1 por ruta) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={selectedDriverId}
                    onChange={e => {
                      setAssignError('');
                      setSelectedDriverId(e.target.value);
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  >
                    <option value="">Seleccione un conductor...</option>
                    {displayedDrivers.map(emp => {
                      const isAssigned = assignedEmployeeIds.has(emp.id);
                      return (
                        <option key={emp.id} value={emp.id} disabled={isAssigned}>
                          {emp.name} {emp.phone ? `(${emp.phone})` : ''} {isAssigned ? '⛔ [YA ASIGNADO HOY]' : '✅ [DISPONIBLE]'}
                        </option>
                      );
                    })}
                  </select>
                  {displayedDrivers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No hay conductores disponibles en este grupo.</p>
                  )}
                </div>

                {/* 2. Auxiliares (Máximo 3) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Auxiliares / Ayudantes (Opcional — máx. {MAX_AUXILIARIES_PER_ROUTE})
                    </label>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      selectedAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {selectedAssistantIds.length} / {MAX_AUXILIARIES_PER_ROUTE} auxiliares
                    </span>
                  </div>

                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {displayedAuxiliaries.map(emp => {
                      const isAssigned = assignedEmployeeIds.has(emp.id);
                      const isChecked = selectedAssistantIds.includes(emp.id);
                      const limitReached = !isChecked && selectedAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE;
                      const isDisabled = isAssigned || limitReached;
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center justify-between px-4 py-2.5 ${isDisabled ? 'bg-slate-100/70 opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => toggleAssistant(emp.id)}
                              className="h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-300 rounded disabled:opacity-50"
                            />
                            <div className="ml-3 flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                                {isAssigned && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                                    ⛔ YA ASIGNADO HOY
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-500">{emp.phone ? `Tel: ${emp.phone}` : 'Sin teléfono'}</span>
                            </div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            emp.role === 'Ayudante'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {emp.role}
                          </span>
                        </label>
                      );
                    })}
                    {displayedAuxiliaries.length === 0 && (
                      <div className="p-4 text-sm text-slate-500 text-center">
                        {selectedCrewId
                          ? 'Sin auxiliares registrados para la tripulación seleccionada.'
                          : 'No hay auxiliares/ayudantes registrados en este grupo.'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>
                    Resumen: <strong className="text-emerald-600">{selectedDriverId ? 1 : 0} Conductor</strong> +{' '}
                    <strong className="text-slate-700">{selectedAssistantIds.length} Auxiliar(es)</strong>
                  </span>
                  {(selectedDriverId || selectedAssistantIds.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDriverId('');
                        setSelectedAssistantIds([]);
                        setSelectedCrewId('');
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Limpiar selección
                    </button>
                  )}
                </div>
              </div>
              
              <button
                type="submit"
                disabled={assignSaving || !routeId || !vehicleId || !selectedDriverId}
                className="w-full bg-emerald-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {assignSaving ? 'Guardando Asignación...' : 'Confirmar Asignación'}
              </button>
            </form>
          </div>
          
          <div>
            {createdAssignment ? (
              <div className="bg-slate-900 p-8 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center h-full space-y-6 text-white">
                <div className="h-16 w-16 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold tracking-wide">¡Asignación Creada!</h3>
                <p className="text-slate-400 text-sm max-w-xs">
                  La ruta ha sido programada. Escanee este código QR para acceder rápidamente a los detalles en campo.
                </p>
                <div className="p-4 bg-white rounded-xl shadow-lg">
                  <QRCodeSVG 
                     value={JSON.stringify({ 
                       r: createdAssignment.routeId, 
                       v: createdAssignment.vehicleId, 
                       d: createdAssignment.date 
                     })} 
                     size={200}
                    level="M"
                    includeMargin
                  />
                </div>
                <button onClick={() => setCreatedAssignment(null)} className="w-full mt-4 py-3 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
                  Crear otra asignación
                </button>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col items-center justify-center text-center p-8 shadow-sm">
                <MapIcon className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-600">Sin Asignación Reciente</h3>
                <p className="text-slate-400 text-sm mt-2 max-w-sm">
                  Complete el formulario para crear una nueva asignación. El código QR de acceso rápido se generará aquí.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center">
              <Users className="h-5 w-5 mr-2 text-emerald-500" />
              Nueva Tripulación
            </h2>
            {crewError && (
              <div className="mb-4 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                {crewError}
              </div>
            )}
            <form onSubmit={handleSaveCrew} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Tripulación (Alias)</label>
                <input required type="text" placeholder="Ej. Equipo Alfa" value={crewName} onChange={e => setCrewName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Conductor Principal (Obligatorio — 1)</label>
                <select required value={crewDriverId} onChange={e => setCrewDriverId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione un conductor...</option>
                  {groupDrivers.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Auxiliares / Ayudantes (Máx. {MAX_AUXILIARIES_PER_ROUTE})</label>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    crewAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {crewAssistantIds.length} / {MAX_AUXILIARIES_PER_ROUTE}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {groupAuxiliaries.map(emp => {
                    const isChecked = crewAssistantIds.includes(emp.id);
                    const limitReached = !isChecked && crewAssistantIds.length >= MAX_AUXILIARIES_PER_ROUTE;
                    return (
                      <label
                        key={emp.id}
                        className={`flex items-center px-4 py-3 ${limitReached ? 'bg-slate-100/70 opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={limitReached}
                          onChange={() => toggleCrewAssistant(emp.id)}
                          className="h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-300 rounded disabled:opacity-50"
                        />
                        <div className="ml-3 flex flex-col">
                          <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                          <span className="text-xs text-slate-500">{emp.role}</span>
                        </div>
                      </label>
                    );
                  })}
                  {groupAuxiliaries.length === 0 && (
                    <div className="p-4 text-sm text-slate-500 text-center">No hay personal de apoyo registrado.</div>
                  )}
                </div>
              </div>

              <button type="submit" disabled={crewSaving || !crewName.trim() || !crewDriverId} className="w-full bg-emerald-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {crewSaving ? 'Guardando...' : 'Guardar Tripulación'}
              </button>
            </form>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center">
              <Truck className="h-5 w-5 mr-2 text-slate-500" />
              Tripulaciones Guardadas
            </h2>
            <div className="space-y-4 overflow-y-auto max-h-[500px]">
              {activeCrews.map(crew => {
                const driver = state.employees.find(e => e.id === crew.driverId);
                const assistants = crew.assistantIds.map(id => state.employees.find(e => e.id === id)).filter(Boolean);
                return (
                  <div key={crew.id} className="border border-slate-200 rounded-xl p-4 relative group hover:border-amber-300 transition-colors">
                    <button onClick={() => setDeleteConfirmCrewId(crew.id)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-slate-100 p-1.5">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <h3 className="font-bold text-slate-800 text-md mb-2">{crew.name}</h3>
                    <div className="space-y-2">
                      <div className="flex items-start">
                        <div className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded mr-2 mt-0.5 uppercase">Conductor</div>
                        <span className="text-sm font-medium text-slate-700">{driver?.name || 'Desconocido'}</span>
                      </div>
                      {assistants.length > 0 && (
                        <div className="flex items-start">
                          <div className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded mr-2 mt-0.5 uppercase">Auxiliares ({assistants.length})</div>
                          <span className="text-sm text-slate-600">{assistants.map(a => a?.name).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeCrews.length === 0 && (
                <div className="text-center p-8 text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No has configurado tripulaciones predeterminadas.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <ConfirmModal
        isOpen={!!deleteConfirmCrewId}
        onClose={() => setDeleteConfirmCrewId(null)}
        onConfirm={confirmDeleteCrew}
        title="Eliminar Tripulación"
        message="¿Está seguro de eliminar esta tripulación? Esta acción no se puede deshacer."
      />
    </div>
  );
};

