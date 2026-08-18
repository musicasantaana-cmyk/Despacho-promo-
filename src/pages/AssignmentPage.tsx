import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Assignment, CrewTemplate } from '../types';
import { Calendar, Map, CheckCircle, Users, Truck, Plus, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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

  // Assign state
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');
  const [date, setDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [createdAssignment, setCreatedAssignment] = useState<Omit<Assignment, 'incidents' | 'status'> | null>(null);

  // Crew state
  const [crewName, setCrewName] = useState('');
  const [crewDriverId, setCrewDriverId] = useState('');
  const [crewAssistantIds, setCrewAssistantIds] = useState<string[]>([]);
  const [deleteConfirmCrewId, setDeleteConfirmCrewId] = useState<string | null>(null);

  const activeGroupVehicles = state.vehicles.filter(v => v.workGroupId === state.activeWorkGroupId && v.status === 'Operativo');
  const activeGroupEmployees = state.employees.filter(e => e.workGroupId === state.activeWorkGroupId);
  const activeGroupRoutes = state.routes.filter(r => r.workGroupId === state.activeWorkGroupId);
  const activeCrews = (state.crews || []).filter(c => c.workGroupId === state.activeWorkGroupId);

  const displayedEmployees = useMemo(() => {
    if (!selectedCrewId) return activeGroupEmployees;
    const crew = activeCrews.find(c => c.id === selectedCrewId);
    if (!crew) return activeGroupEmployees;
    const crewMemberIds = new Set([crew.driverId, ...(crew.assistantIds || [])].filter(Boolean));
    return activeGroupEmployees.filter(e => crewMemberIds.has(e.id));
  }, [selectedCrewId, activeCrews, activeGroupEmployees]);

  const toggleEmployee = (id: string) => {
    setEmployeeIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const toggleCrewAssistant = (id: string) => {
    setCrewAssistantIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleCrewSelect = (crewId: string) => {
    setSelectedCrewId(crewId);
    if (!crewId) {
      return;
    }
    const crew = activeCrews.find(c => c.id === crewId);
    if (crew) {
      const memberIds = [crew.driverId, ...(crew.assistantIds || [])].filter(Boolean);
      // Auto-select crew members in employeeIds
      setEmployeeIds(prev => Array.from(new Set([...prev, ...memberIds])));
    }
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !vehicleId || employeeIds.length === 0 || !date) return;
    
    const newAssignment = {
      routeId,
      vehicleId,
      employeeIds,
      date
    };
    
    addAssignment(newAssignment);
    setCreatedAssignment(newAssignment);
    
    setRouteId('');
    setVehicleId('');
    setEmployeeIds([]);
    setSelectedCrewId('');
  };

  const handleSaveCrew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewName || !crewDriverId) return;

    addCrew({
      name: crewName,
      driverId: crewDriverId,
      assistantIds: crewAssistantIds,
    });

    setCrewName('');
    setCrewDriverId('');
    setCrewAssistantIds([]);
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
            <Map className="h-4 w-4 mr-2" />
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
              <Map className="h-5 w-5 mr-2 text-emerald-500" />
              Nueva Asignación de Ruta
            </h2>
            <form onSubmit={handleCreateAssignment} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha y Hora de Operación</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input required type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="pl-9 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ruta Base</label>
                <select required value={routeId} onChange={e => setRouteId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione una ruta...</option>
                  {activeGroupRoutes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.code ? `[${r.code}] ` : ''}{r.name} ({r.origin} - {r.destination})
                    </option>
                  ))}
                </select>
                {activeGroupRoutes.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No hay rutas registradas para este grupo de trabajo.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehículo Asignado</label>
                <select required value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione un vehículo operativo...</option>
                  {activeGroupVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plate} (Int: {v.internalNumber}) - {v.capacity} ton/vol</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <label className="block text-sm font-medium text-slate-700">Personal Asignado</label>
                  {activeCrews.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Filtrar por tripulación:</span>
                      <select 
                        value={selectedCrewId} 
                        onChange={e => handleCrewSelect(e.target.value)}
                        className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 bg-white font-medium shadow-sm"
                      >
                        <option value="">Todo el personal del grupo</option>
                        {activeCrews.map(c => (
                          <option key={c.id} value={c.id}>Tripulación: {c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {selectedCrewId && (
                  <div className="mb-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-lg">
                    <span>Mostrando únicamente integrantes de <strong>{activeCrews.find(c => c.id === selectedCrewId)?.name}</strong> ({displayedEmployees.length})</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedCrewId('')}
                      className="text-emerald-700 hover:text-emerald-900 underline ml-2 font-medium"
                    >
                      Ver todos
                    </button>
                  </div>
                )}
                
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {displayedEmployees.map(emp => (
                    <label key={emp.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={employeeIds.includes(emp.id)}
                          onChange={() => toggleEmployee(emp.id)}
                          className="h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-300 rounded"
                        />
                        <div className="ml-3 flex flex-col">
                          <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                          <span className="text-xs text-slate-500">{emp.phone ? `Tel: ${emp.phone}` : 'Sin teléfono'}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        emp.role === 'Conductor' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : emp.role === 'Ayudante' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {emp.role}
                      </span>
                    </label>
                  ))}
                  {displayedEmployees.length === 0 && (
                    <div className="p-4 text-sm text-slate-500 text-center">
                      {selectedCrewId 
                        ? "No hay integrantes registrados para la tripulación seleccionada."
                        : "No hay personal registrado en este grupo."}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                  <span>Seleccionados: <strong className="text-emerald-600">{employeeIds.length}</strong></span>
                  {employeeIds.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setEmployeeIds([])}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Limpiar selección
                    </button>
                  )}
                </div>
              </div>
              
              <button type="submit" disabled={!routeId || !vehicleId || employeeIds.length === 0} className="w-full bg-emerald-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Confirmar Asignación
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
                <Map className="h-12 w-12 text-slate-300 mb-4" />
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
            <form onSubmit={handleSaveCrew} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Tripulación (Alias)</label>
                <input required type="text" placeholder="Ej. Equipo Alfa" value={crewName} onChange={e => setCrewName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Conductor Principal</label>
                <select required value={crewDriverId} onChange={e => setCrewDriverId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">Seleccione un conductor...</option>
                  {activeGroupEmployees.filter(e => (e.role || '').toLowerCase().includes('conductor')).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ayudantes / Coordinadores</label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {activeGroupEmployees.filter(e => !(e.role || '').toLowerCase().includes('conductor')).map(emp => (
                    <label key={emp.id} className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crewAssistantIds.includes(emp.id)}
                        onChange={() => toggleCrewAssistant(emp.id)}
                        className="h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                        <span className="text-xs text-slate-500">{emp.role}</span>
                      </div>
                    </label>
                  ))}
                  {activeGroupEmployees.filter(e => !(e.role || '').toLowerCase().includes('conductor')).length === 0 && (
                    <div className="p-4 text-sm text-slate-500 text-center">No hay personal de apoyo registrado.</div>
                  )}
                </div>
              </div>

              <button type="submit" disabled={!crewName || !crewDriverId} className="w-full bg-emerald-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Guardar Tripulación
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
                          <div className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded mr-2 mt-0.5 uppercase">Apoyo</div>
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
