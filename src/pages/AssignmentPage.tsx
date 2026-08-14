import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { QRCodeSVG } from 'qrcode.react';
import { Assignment } from '../types';
import { Map, Truck, Users, Calendar, CheckCircle } from 'lucide-react';

export const AssignmentPage: React.FC = () => {
  const { state, addAssignment } = useAppContext();
  
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [createdAssignment, setCreatedAssignment] = useState<Omit<Assignment, 'incidents' | 'status'> | null>(null);

  const activeGroupVehicles = state.vehicles.filter(v => v.workGroupId === state.activeWorkGroupId && v.status === 'Operativo');
  const activeGroupEmployees = state.employees.filter(e => e.workGroupId === state.activeWorkGroupId);
  const activeGroupRoutes = state.routes.filter(r => r.workGroupId === state.activeWorkGroupId);

  const availableRoutes = useMemo(() => {
    if (!date) return [];
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    return activeGroupRoutes.filter(r => !r.operatingDays || r.operatingDays.includes(dayOfWeek));
  }, [date, activeGroupRoutes]);

  // Reset routeId if the selected route is not available on the new date
  useEffect(() => {
    if (routeId && !availableRoutes.find(r => r.id === routeId)) {
      setRouteId('');
    }
  }, [availableRoutes, routeId]);

  const toggleEmployee = (id: string) => {
    setEmployeeIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleCreate = (e: React.FormEvent) => {
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
    
    // reset form
    setRouteId('');
    setVehicleId('');
    setEmployeeIds([]);
  };

  const availableVehicles = state.vehicles.filter(v => v.status === 'Operativo');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col relative">
        {!state.activeWorkGroupId && (
          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-center p-6">
            <h3 className="font-bold text-slate-800 text-lg mb-2">Seleccione un Grupo</h3>
            <p className="text-slate-500 text-sm">Debe seleccionar un Grupo de Trabajo activo en la barra superior para crear asignaciones.</p>
          </div>
        )}
        <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center">
          <Map className="h-5 w-5 mr-2 text-indigo-500" />
          Nueva Asignación de Ruta
        </h2>

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Operación</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="pl-9 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ruta Base (Disponible para el día seleccionado)</label>
            <select required value={routeId} onChange={e => setRouteId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Seleccione una ruta...</option>
              {availableRoutes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.code ? `[${r.code}] ` : ''}{r.name} ({r.origin} - {r.destination})
                </option>
              ))}
            </select>
            {availableRoutes.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No hay rutas operativas registradas para este día de la semana.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vehículo Asignado</label>
            <select required value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Seleccione un vehículo operativo...</option>
              {activeGroupVehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} (Int: {v.internalNumber}) - {v.capacity} ton/vol</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Personal Asignado</label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {activeGroupEmployees.map(emp => (
                <label key={emp.id} className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={employeeIds.includes(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <div className="ml-3 flex flex-col">
                    <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                    <span className="text-xs text-slate-500">{emp.role}</span>
                  </div>
                </label>
              ))}
              {activeGroupEmployees.length === 0 && (
                <div className="p-4 text-sm text-slate-500 text-center">No hay personal registrado en este grupo</div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Seleccionados: {employeeIds.length}</p>
          </div>

          <button type="submit" disabled={!routeId || !vehicleId || employeeIds.length === 0} className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
  );
};
