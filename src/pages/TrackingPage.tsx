import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Assignment, IncidentType, AssignmentStatus } from '../types';
import { Clock, CheckCircle, AlertTriangle, XCircle, Navigation, MessageCircle, Phone, ChevronLeft, MapPin, Truck, Route, ArrowRightCircle } from 'lucide-react';

export const TrackingPage: React.FC = () => {
  const { state, updateAssignmentStatus, addIncident } = useAppContext();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  
  // Novedades Form
  const [incidentType, setIncidentType] = useState<IncidentType>('Retraso');
  const [incidentDesc, setIncidentDesc] = useState('');

  // Sort by date desc and filter by active group
  const sortedAssignments = useMemo(() => {
    return [...state.assignments]
      .filter(a => a.workGroupId === state.activeWorkGroupId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.assignments, state.activeWorkGroupId]);

  const metrics = useMemo(() => {
    return {
      salida: sortedAssignments.filter(a => a.status === 'Salida de Base').length,
      inicio: sortedAssignments.filter(a => a.status === 'Inicio de Ruta').length,
      fin: sortedAssignments.filter(a => a.status === 'Fin de Ruta').length,
      relleno: sortedAssignments.filter(a => a.status === 'Relleno').length,
      base: sortedAssignments.filter(a => a.status === 'Base').length,
    };
  }, [sortedAssignments]);

  const getStatusBadge = (status: Assignment['status']) => {
    switch (status) {
      case 'Pendiente': return <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><Clock className="h-3 w-3 mr-1" /> Pendiente</span>;
      case 'Salida de Base': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><ArrowRightCircle className="h-3 w-3 mr-1" /> Salida Base</span>;
      case 'Inicio de Ruta': return <span className="px-2 py-1 bg-amber-100 text-emerald-600 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><Navigation className="h-3 w-3 mr-1" /> Inicio Ruta</span>;
      case 'Fin de Ruta': return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><MapPin className="h-3 w-3 mr-1" /> Fin Ruta</span>;
      case 'Relleno': return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><Truck className="h-3 w-3 mr-1" /> Relleno</span>;
      case 'Base': return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><CheckCircle className="h-3 w-3 mr-1" /> Base</span>;
      case 'Cancelado': return <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] rounded-full font-bold uppercase flex items-center tracking-wider"><XCircle className="h-3 w-3 mr-1" /> Cancelado</span>;
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] rounded-full font-bold uppercase">{status}</span>;
    }
  };

  const handleAddIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !incidentDesc) return;
    
    addIncident(selectedAssignment.id, { type: incidentType, description: incidentDesc });
    setIncidentDesc('');
    
    // Refresh selected assignment from state to show new incident
    const updated = state.assignments.find(a => a.id === selectedAssignment.id);
    if (updated) setSelectedAssignment(updated);
  };

  const handleStatusChange = (status: Assignment['status']) => {
    if (!selectedAssignment) return;
    updateAssignmentStatus(selectedAssignment.id, status);
    
    const updated = state.assignments.find(a => a.id === selectedAssignment.id);
    if (updated) setSelectedAssignment({ ...updated, status });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {/* List */}
      <div className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex-col shadow-sm ${selectedAssignment ? 'hidden lg:flex' : 'flex'} h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)]`}>
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Control de Rutas</h3>
          
          {/* Status Counters */}
          <div className="grid grid-cols-5 gap-1 mb-2">
            <div className="flex flex-col items-center p-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-[9px] font-bold text-blue-600 uppercase mb-0.5">Salida</span>
              <span className="text-sm font-black text-blue-800">{metrics.salida}</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-[9px] font-bold text-emerald-500 uppercase mb-0.5">Inicio</span>
              <span className="text-sm font-black text-amber-800">{metrics.inicio}</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-purple-50 rounded-lg border border-purple-100">
              <span className="text-[9px] font-bold text-purple-600 uppercase mb-0.5">Fin</span>
              <span className="text-sm font-black text-purple-800">{metrics.fin}</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Relleno</span>
              <span className="text-sm font-black text-amber-800">{metrics.relleno}</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
              <span className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Base</span>
              <span className="text-sm font-black text-emerald-800">{metrics.base}</span>
            </div>
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
                onClick={() => setSelectedAssignment(assignment)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedAssignment?.id === assignment.id 
                    ? 'border-emerald-500 ring-1 ring-emerald-500 bg-amber-50/50' 
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-slate-800">{route?.code ? `[${route.code}] ` : ''}{route?.name || 'Ruta Desconocida'}</span>
                  {getStatusBadge(assignment.status)}
                </div>
                <div className="text-xs text-slate-500 flex flex-col space-y-1">
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 text-slate-400" /> 
                    {new Date(assignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="flex items-center"><Truck className="h-3 w-3 mr-1 text-slate-400" /> Móvil {vehicle?.internalNumber || 'N/A'}</span>
                  {assignment.incidents.length > 0 && (
                    <span className="text-emerald-600 font-medium flex items-center mt-1">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {assignment.incidents.length} novedad(es) registrada(s)
                    </span>
                  )}
                </div>
              </button>
            )
          })}
          {sortedAssignments.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No hay asignaciones creadas.</div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className={`lg:col-span-7 ${!selectedAssignment ? 'hidden lg:block' : 'block h-[calc(100vh-10rem)] lg:h-auto'}`}>
        {selectedAssignment ? (
          <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <button onClick={() => setSelectedAssignment(null)} className="mr-3 p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200 lg:hidden">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div>
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">
                      {state.routes.find(r => r.id === selectedAssignment.routeId)?.code ? `[${state.routes.find(r => r.id === selectedAssignment.routeId)?.code}] ` : ''}
                      {state.routes.find(r => r.id === selectedAssignment.routeId)?.name || 'Ruta Desconocida'}
                    </h2>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">ID: {selectedAssignment.id} • {new Date(selectedAssignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <select 
                    value={selectedAssignment.status} 
                    onChange={e => handleStatusChange(e.target.value as any)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="Salida de Base">Salida de Base</option>
                    <option value="Inicio de Ruta">Inicio de Ruta</option>
                    <option value="Fin de Ruta">Fin de Ruta</option>
                    <option value="Relleno">Relleno</option>
                    <option value="Base">Llegada a Base</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Vehículo</span>
                  <span className="font-semibold text-slate-800">
                    {state.vehicles.find(v => v.id === selectedAssignment.vehicleId)?.plate || 'N/A'}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Trayecto</span>
                  <span className="text-slate-800 line-clamp-1">
                    {state.routes.find(r => r.id === selectedAssignment.routeId)?.origin} &rarr; {state.routes.find(r => r.id === selectedAssignment.routeId)?.destination}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col space-y-8">
              
              {/* Personnel Section */}
              <section>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 border-b border-slate-100 pb-2">Personal Asignado</h3>
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
                    )
                  })}
                </div>
              </section>

              {/* Incidents Section */}
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
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-slate-800">{inc.type}</span>
                          <span className="text-xs text-slate-500">{new Date(inc.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{inc.description}</p>
                      </div>
                    </div>
                  ))}
                  {selectedAssignment.incidents.length === 0 && (
                    <p className="text-sm text-slate-500 italic">No hay novedades registradas en esta ruta.</p>
                  )}
                </div>

                {/* Add Incident Form */}
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
                    <div className="flex justify-end">
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
    </div>
  );
};

