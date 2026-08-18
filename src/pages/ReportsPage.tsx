import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { exportToCsv } from '../utils/exportCsv';
import { 
  BarChart2, Download, Users, Truck, CheckCircle, 
  AlertTriangle, XCircle, PieChart as PieChartIcon, 
  X, Clock, ShieldCheck, FileSpreadsheet, Layers
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Assignment, Incident } from '../types';
import { AttendanceIncidentsReportView } from '../components/reports/AttendanceIncidentsReportView';
import { FleetAssetsReportView } from '../components/reports/FleetAssetsReportView';
import { CustomExportReportView } from '../components/reports/CustomExportReportView';

type ReportSubTab = 'attendance' | 'fleet' | 'export_wizard' | 'general';

export const ReportsPage: React.FC = () => {
  const { state } = useAppContext();
  const [activeTab, setActiveTab] = useState<ReportSubTab>('attendance');
  const [activeDetail, setActiveDetail] = useState<'asignadas' | 'novedades' | null>(null);

  // Derived metrics based on active context for General View
  const metrics = useMemo(() => {
    const relevantAssignments = state.assignments.filter(a => 
      !state.activeWorkGroupId || a.workGroupId === state.activeWorkGroupId
    );
    
    const completed = relevantAssignments.filter(a => ['Fin de Ruta', 'Base'].includes(a.status)).length;
    const inProgress = relevantAssignments.filter(a => ['Salida de Base', 'Inicio de Ruta', 'Relleno'].includes(a.status)).length;
    
    let totalIncidents = 0;
    relevantAssignments.forEach(a => {
      totalIncidents += a.incidents.length;
    });

    const relevantVehicles = state.vehicles.filter(v => 
      !state.activeWorkGroupId || v.workGroupId === state.activeWorkGroupId
    );
    const totalVehicles = relevantVehicles.length;
    const operationalVehicles = relevantVehicles.filter(v => v.status === 'Operativo').length;
    const inoperableVehicles = relevantVehicles.filter(v => v.status === 'Inoperativo').length;

    // Assignment Chart Data
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

    // Vehicle Chart Data
    const vehicleData = [
      { name: 'Operativos', value: operationalVehicles },
      { name: 'Inoperativos', value: inoperableVehicles }
    ].filter(d => d.value > 0);

    return {
      totalAssignments: relevantAssignments.length,
      completed,
      inProgress,
      totalIncidents,
      relevantAssignments,
      totalVehicles,
      operationalVehicles,
      inoperableVehicles,
      assignmentData,
      vehicleData
    };
  }, [state.assignments, state.vehicles, state.activeWorkGroupId]);

  // Export functions for general view
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
        Novedades: a.incidents.length
      };
    });
    exportToCsv(`asignaciones_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  const handleExportEmployees = () => {
    const data = state.employees
      .filter(e => !state.activeWorkGroupId || e.workGroupId === state.activeWorkGroupId)
      .map(e => ({
        ID: e.id,
        Nombre: e.name,
        Rol: e.role,
        Telefono: e.phone
      }));
    exportToCsv(`personal_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  const tabs: { id: ReportSubTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'attendance',
      label: 'Asistencia y Novedades (Personal)',
      icon: <Users className="h-4 w-4" />,
      badge: `${state.employees.length} activos`
    },
    {
      id: 'fleet',
      label: 'Activos de Operación (Vehículos)',
      icon: <Truck className="h-4 w-4" />,
      badge: `${state.vehicles.length} móviles`
    },
    {
      id: 'export_wizard',
      label: 'Descargar Informes (Configurable)',
      icon: <FileSpreadsheet className="h-4 w-4" />
    },
    {
      id: 'general',
      label: 'Resumen Global de Rutas',
      icon: <BarChart2 className="h-4 w-4" />
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-menu Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className={isActive ? 'text-amber-300' : 'text-slate-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Sub-View */}
      {activeTab === 'attendance' && <AttendanceIncidentsReportView />}
      {activeTab === 'fleet' && <FleetAssetsReportView />}
      {activeTab === 'export_wizard' && <CustomExportReportView />}

      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Panel de Operaciones Global</h2>
              <p className="text-sm text-slate-500">
                Métricas del grupo: <strong className="text-emerald-600">{state.workGroups.find(g => g.id === state.activeWorkGroupId)?.name || 'Todos los grupos'}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Asignaciones" 
              value={metrics.totalAssignments.toString()} 
              icon={<BarChart2 className="h-6 w-6 text-emerald-500" />}
              bg="bg-amber-50"
              onClick={() => setActiveDetail('asignadas')}
            />
            <MetricCard 
              title="Rutas Completadas" 
              value={metrics.completed.toString()} 
              icon={<CheckCircle className="h-6 w-6 text-emerald-600" />}
              bg="bg-emerald-50"
            />
            <MetricCard 
              title="En Progreso" 
              value={metrics.inProgress.toString()} 
              icon={<Truck className="h-6 w-6 text-blue-600" />}
              bg="bg-blue-50"
            />
            <MetricCard 
              title="Novedades Registradas" 
              value={metrics.totalIncidents.toString()} 
              icon={<AlertTriangle className="h-6 w-6 text-emerald-600" />}
              bg="bg-amber-50"
              onClick={() => setActiveDetail('novedades')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard 
              title="Total Vehículos" 
              value={metrics.totalVehicles.toString()} 
              icon={<Truck className="h-6 w-6 text-slate-600" />}
              bg="bg-slate-100"
            />
            <MetricCard 
              title="Vehículos Operativos" 
              value={metrics.operationalVehicles.toString()} 
              icon={<CheckCircle className="h-6 w-6 text-emerald-600" />}
              bg="bg-emerald-50"
            />
            <MetricCard 
              title="Vehículos Inoperativos" 
              value={metrics.inoperableVehicles.toString()} 
              icon={<XCircle className="h-6 w-6 text-red-600" />}
              bg="bg-red-50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold flex items-center gap-2 mb-6 text-slate-800">
                <PieChartIcon className="h-5 w-5 text-emerald-500" />
                Estado de Asignaciones
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
                    No hay asignaciones registradas
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold flex items-center gap-2 mb-6 text-slate-800">
                <PieChartIcon className="h-5 w-5 text-emerald-500" />
                Disponibilidad de Flota
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
              <h3 className="font-bold flex items-center gap-2 mb-2 text-slate-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                Reporte Rápido de Asignaciones
              </h3>
              <p className="text-sm text-slate-500 mb-6 flex-1">
                Descargue el historial de asignaciones, rutas y novedades registradas por el personal de campo.
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
              <h3 className="font-bold flex items-center gap-2 mb-2 text-slate-800">
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

          {activeDetail === 'asignadas' && (
            <DetailModal 
              title="Detalle de Asignaciones" 
              onClose={() => setActiveDetail(null)}
            >
              <div className="space-y-3">
                {metrics.relevantAssignments.map((assignment: Assignment) => {
                  const route = state.routes.find(r => r.id === assignment.routeId);
                  const vehicle = state.vehicles.find(v => v.id === assignment.vehicleId);
                  return (
                    <div key={assignment.id} className="p-3 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{route?.name || 'Ruta Desconocida'}</h4>
                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                          <span className="flex items-center"><Clock className="h-3 w-3 mr-1" />{new Date(assignment.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                          <span className="flex items-center"><Truck className="h-3 w-3 mr-1" />Móvil {vehicle?.internalNumber || 'N/A'}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-800 rounded-full w-fit uppercase tracking-wider">
                        {assignment.status}
                      </span>
                    </div>
                  );
                })}
                {metrics.relevantAssignments.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No hay asignaciones registradas.</p>
                )}
              </div>
            </DetailModal>
          )}

          {activeDetail === 'novedades' && (
            <DetailModal 
              title="Detalle de Novedades" 
              onClose={() => setActiveDetail(null)}
            >
              <div className="space-y-3">
                {metrics.relevantAssignments.flatMap(a => 
                  a.incidents.map((inc: Incident) => {
                    const route = state.routes.find(r => r.id === a.routeId);
                    const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
                    return (
                      <div key={inc.id} className="p-3 border border-amber-200 bg-amber-50/50 rounded-lg flex flex-col gap-1">
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
                  <p className="text-sm text-slate-500 text-center py-4">No se han reportado novedades.</p>
                )}
              </div>
            </DetailModal>
          )}
        </div>
      )}
    </div>
  );
};

const DetailModal = ({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) => (
  <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
      <div className="flex justify-between items-center p-4 border-b border-slate-100">
        <h3 className="font-bold text-lg text-slate-800">{title}</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto">
        {children}
      </div>
    </div>
  </div>
);

const MetricCard = ({ title, value, icon, bg, onClick }: { title: string, value: string, icon: React.ReactNode, bg: string, onClick?: () => void }) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component 
      onClick={onClick}
      className={`bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between h-32 shadow-sm text-left ${onClick ? 'cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all' : ''}`}
    >
      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{title}</span>
      <div className="flex items-end justify-between w-full">
        <span className="text-3xl font-black text-slate-800">{value}</span>
        <div className={`p-2 rounded-lg ${bg}`}>
          {icon}
        </div>
      </div>
    </Component>
  );
};
