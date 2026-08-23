import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { exportToCsv } from '../utils/exportCsv';
import { 
  BarChart2, Download, Users, Truck, CheckCircle, 
  AlertTriangle, XCircle, PieChart as PieChartIcon, 
  X, Clock, MapPin, Layers, Info
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Assignment, Incident, RouteDef, Vehicle, Employee } from '../types';
import { AttendanceIncidentsReportView } from '../components/reports/AttendanceIncidentsReportView';
import { FleetAssetsReportView } from '../components/reports/FleetAssetsReportView';
import { CustomExportReportView } from '../components/reports/CustomExportReportView';
import { ReportSubMenuHeader } from '../components/reports/ReportSubMenuHeader';

type ReportSubTab = 'attendance' | 'fleet' | 'export_wizard' | 'general';
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
  const { state, setActiveWorkGroup } = useAppContext();
  const [activeTab, setActiveTab] = useState<ReportSubTab>('attendance');
  const [activeDetail, setActiveDetail] = useState<DetailModalType>(null);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);

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

  // Derived metrics based on active group & selected route filters
  const metrics = useMemo(() => {
    // Filtered routes by selectedRouteIds
    const filteredRoutes = activeGroupRoutes.filter(r => 
      selectedRouteIds.length === 0 || selectedRouteIds.includes(r.id)
    );
    const filteredRouteIds = new Set(filteredRoutes.map(r => r.id));

    // Relevant assignments matching active group & selected routes
    const relevantAssignments = state.assignments.filter(a => {
      if (state.activeWorkGroupId && a.workGroupId !== state.activeWorkGroupId) return false;
      if (selectedRouteIds.length > 0 && !selectedRouteIds.includes(a.routeId)) return false;
      return true;
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

    // Incidents & Weight
    let totalIncidents = 0;
    let totalWeightTons = 0;
    relevantAssignments.forEach(a => {
      totalIncidents += (a.incidents || []).length;
      if (a.weightTons) totalWeightTons += a.weightTons;
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
      vehicleData
    };
  }, [state.assignments, state.routes, state.vehicles, state.employees, state.activeWorkGroupId, selectedRouteIds, activeGroupRoutes]);

  // Export functions
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

  const tabs: { id: ReportSubTab; label: string; icon: React.ReactNode; badge?: string }[] = [
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
      id: 'export_wizard',
      label: 'Reporte Customizado (+)',
      icon: <Layers className="h-4 w-4" />
    }
  ];

  return (
    <div className="space-y-0">
      {/* Navigation Sub-Tabs */}
      <div className="bg-slate-100 pt-2 px-2 flex flex-wrap gap-1 border-b border-slate-300">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold transition-all border-t border-x rounded-t-lg -mb-px relative z-10 ${
                isActive
                  ? 'bg-white text-emerald-700 border-slate-300 shadow-sm'
                  : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <span className={isActive ? 'text-emerald-500' : 'text-slate-400'}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ml-2 ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Render Sub-View */}
      <div className="bg-white p-4 sm:p-6 rounded-b-2xl border-x border-b border-slate-300 shadow-sm min-h-[600px]">
        {activeTab === 'attendance' && <AttendanceIncidentsReportView />}
        {activeTab === 'fleet' && <FleetAssetsReportView />}
        {activeTab === 'export_wizard' && <CustomExportReportView />}

        {activeTab === 'general' && (
          <div className="space-y-6">
            <ReportSubMenuHeader 
              workGroups={state.workGroups}
              selectedGroupIds={state.activeWorkGroupId ? [state.activeWorkGroupId] : []}
              onToggleGroup={(id) => setActiveWorkGroup(state.activeWorkGroupId === id ? null : id)}
              onSelectAllGroups={() => setActiveWorkGroup(null)}
              routes={activeGroupRoutes}
              selectedRouteIds={selectedRouteIds}
              onToggleRoute={toggleRouteSelection}
              onSelectAllRoutes={selectAllRoutes}
            />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* Additional Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div 
                onClick={() => setActiveDetail('novedades')}
                className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-xs cursor-pointer hover:border-amber-400 hover:shadow-sm transition-all"
              >
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Novedades Registradas</span>
                  <span className="text-3xl font-black text-amber-600">{metrics.totalIncidents}</span>
                  <span className="text-xs text-slate-400 block mt-0.5">Reportadas en ruta</span>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Peso Recopilado Total</span>
                  <span className="text-3xl font-black text-emerald-600">{metrics.totalWeightTons.toFixed(2)}</span>
                  <span className="text-xs text-slate-400 block mt-0.5">Toneladas transportadas</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                  <Layers className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Rutas en Progreso</span>
                  <span className="text-3xl font-black text-blue-600">{metrics.inProgressCount}</span>
                  <span className="text-xs text-slate-400 block mt-0.5">En operación activa</span>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Clock className="h-6 w-6" />
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

