import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { exportToCsv } from '../../utils/exportCsv';
import { 
  Truck, CheckCircle, XCircle, AlertTriangle, Download, 
  Layers, Search, Filter, Activity, Users, Shield
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Vehicle } from '../../types';

export const FleetAssetsReportView: React.FC = () => {
  const { state } = useAppContext();

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Operativo' | 'Inoperativo' | 'in_route'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Multi-group selection toggle
  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const selectAllGroups = () => {
    setSelectedGroupIds([]);
  };

  // Currently active assignment vehicle IDs
  const activeVehicleAssignments = useMemo(() => {
    const map = new Map<string, { assignmentId: string; routeName: string; driverName: string; status: string }>();
    state.assignments.forEach(a => {
      if (['Salida de Base', 'Inicio de Ruta', 'Relleno'].includes(a.status)) {
        const route = state.routes.find(r => r.id === a.routeId);
        const driver = (a.employeeIds || [])
          .map(id => state.employees.find(e => e.id === id))
          .find(e => e?.role === 'Conductor');

        map.set(a.vehicleId, {
          assignmentId: a.id,
          routeName: route?.name || 'Ruta en Curso',
          driverName: driver?.name || 'Conductor Asignado',
          status: a.status,
        });
      }
    });
    return map;
  }, [state.assignments, state.routes, state.employees]);

  // Filtered Vehicles
  const filteredVehicles = useMemo(() => {
    return state.vehicles.filter(v => {
      // Group filter
      if (selectedGroupIds.length > 0) {
        if (!v.workGroupId || !selectedGroupIds.includes(v.workGroupId)) return false;
      }

      // Status filter
      const isInRoute = activeVehicleAssignments.has(v.id);
      if (statusFilter === 'Operativo' && v.status !== 'Operativo') return false;
      if (statusFilter === 'Inoperativo' && v.status !== 'Inoperativo') return false;
      if (statusFilter === 'in_route' && !isInRoute) return false;

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchPlate = v.plate.toLowerCase().includes(q);
        const matchInt = v.internalNumber.toLowerCase().includes(q);
        if (!matchPlate && !matchInt) return false;
      }

      return true;
    });
  }, [state.vehicles, selectedGroupIds, statusFilter, searchTerm, activeVehicleAssignments]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = filteredVehicles.length;
    const operational = filteredVehicles.filter(v => v.status === 'Operativo').length;
    const inoperable = filteredVehicles.filter(v => v.status === 'Inoperativo').length;
    const inRoute = filteredVehicles.filter(v => activeVehicleAssignments.has(v.id)).length;
    const availableInBase = operational - inRoute;
    const totalCapacity = filteredVehicles.reduce((acc, v) => acc + (Number(v.capacity) || 0), 0);
    const availabilityRate = total > 0 ? Math.round((operational / total) * 100) : 0;

    const chartData = [
      { name: 'En Ruta Activa', value: inRoute, color: '#3b82f6' },
      { name: 'Disponibles en Base', value: Math.max(0, availableInBase), color: '#10b981' },
      { name: 'Inoperativos', value: inoperable, color: '#ef4444' }
    ].filter(d => d.value > 0);

    return {
      total,
      operational,
      inoperable,
      inRoute,
      availableInBase: Math.max(0, availableInBase),
      totalCapacity,
      availabilityRate,
      chartData,
    };
  }, [filteredVehicles, activeVehicleAssignments]);

  // Export Vehicles
  const handleExportFleet = () => {
    const data = filteredVehicles.map(v => {
      const group = state.workGroups.find(g => g.id === v.workGroupId);
      const activeOps = activeVehicleAssignments.get(v.id);
      return {
        ID: v.id,
        'Placa / Matrícula': v.plate,
        'N° Interno / Móvil': v.internalNumber,
        'Grupo de Trabajo': group?.name || 'General',
        'Capacidad (kg/m3)': v.capacity,
        'Estado Mecánico': v.status,
        'Estado Operativo': activeOps ? `En Ruta (${activeOps.routeName})` : (v.status === 'Operativo' ? 'Disponible en Base' : 'Fuera de Servicio'),
        'Conductor Asignado': activeOps?.driverName || 'N/A',
      };
    });

    exportToCsv(`reporte_activos_flota_${new Date().getTime()}.csv`, data);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Activos y Disponibilidad de Flota</h2>
              <p className="text-xs text-slate-500">Supervisión en tiempo real de vehículos, capacidad y estado operativo</p>
            </div>
          </div>

          <button
            onClick={handleExportFleet}
            className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar Flota (CSV)
          </button>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Filter className="h-3 w-3 mr-1 text-slate-400" /> Estado de Vehículo
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">Todos los Estados</option>
              <option value="Operativo">Operativos (Total)</option>
              <option value="in_route">En Ruta Activa (Despachados)</option>
              <option value="Inoperativo">Inoperativos / En Taller</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Search className="h-3 w-3 mr-1 text-slate-400" /> Buscar Móvil / Placa
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Placa o N° interno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Group Selector Tags */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
              <Layers className="h-3 w-3 mr-1 text-slate-400" /> Filtrar por Grupo de Trabajo:
            </span>
            <button
              onClick={selectAllGroups}
              className={`text-[11px] font-semibold transition-colors ${
                selectedGroupIds.length === 0 ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {selectedGroupIds.length === 0 ? '✓ Todos los grupos' : 'Seleccionar todos'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectAllGroups}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                selectedGroupIds.length === 0
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({state.vehicles.length})
            </button>
            {state.workGroups.map(wg => {
              const isSelected = selectedGroupIds.includes(wg.id);
              const count = state.vehicles.filter(v => v.workGroupId === wg.id).length;
              return (
                <button
                  key={wg.id}
                  onClick={() => toggleGroupSelection(wg.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{wg.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flota Total</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-800">{metrics.total}</span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Capacidad: {metrics.totalCapacity.toLocaleString()} kg
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-xs flex flex-col justify-between bg-blue-50/20">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">En Ruta Activa</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-blue-600">{metrics.inRoute}</span>
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-blue-600 font-semibold mt-2">
            Despachos en ejecución
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs flex flex-col justify-between bg-emerald-50/20">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Disponibles en Base</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-emerald-600">{metrics.availableInBase}</span>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-2">
            Listos para asignación
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-red-100 shadow-xs flex flex-col justify-between bg-red-50/20">
          <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Inoperativos</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-red-600">{metrics.inoperable}</span>
            <div className="p-2 rounded-lg bg-red-100 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-red-600 font-semibold mt-2">
            En taller / mantenimiento
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Disponibilidad Operativa</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-800">{metrics.availabilityRate}%</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Shield className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {metrics.operational} de {metrics.total} operativos
          </div>
        </div>
      </div>

      {/* Fleet Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Directorio de Vehículos y Estado Operativo</h3>
            <p className="text-xs text-slate-500">{filteredVehicles.length} móviles según los criterios seleccionados</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Móvil / Placa</th>
                <th className="py-3 px-4">Grupo de Trabajo</th>
                <th className="py-3 px-4 text-center">Capacidad</th>
                <th className="py-3 px-4 text-center">Estado Mecánico</th>
                <th className="py-3 px-4">Estado Operativo en Tiempo Real</th>
                <th className="py-3 px-4">Conductor Asignado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredVehicles.map(veh => {
                const group = state.workGroups.find(g => g.id === veh.workGroupId);
                const activeOps = activeVehicleAssignments.get(veh.id);

                return (
                  <tr key={veh.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800 text-sm">{veh.plate}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Móvil Int: {veh.internalNumber}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {group?.name || 'General'}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {veh.capacity} kg
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        veh.status === 'Operativo'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {veh.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {activeOps ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5" />
                            {activeOps.status}
                          </span>
                          <div className="text-[10px] text-slate-500 font-medium">{activeOps.routeName}</div>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center text-[11px] ${
                          veh.status === 'Operativo' ? 'text-emerald-600 font-medium' : 'text-slate-400'
                        }`}>
                          {veh.status === 'Operativo' ? '• Disponible en Base' : '• Inhabilitado'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {activeOps?.driverName || '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No se encontraron vehículos con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
