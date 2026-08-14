import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { exportToCsv } from '../utils/exportCsv';
import { BarChart2, Download, Users, Truck, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { state } = useAppContext();

  // Derived metrics based on active context
  const metrics = useMemo(() => {
    const relevantAssignments = state.assignments.filter(a => a.workGroupId === state.activeWorkGroupId);
    
    const completed = relevantAssignments.filter(a => ['Fin de Ruta', 'Base'].includes(a.status)).length;
    const inProgress = relevantAssignments.filter(a => ['Salida de Base', 'Inicio de Ruta', 'Relleno'].includes(a.status)).length;
    
    let totalIncidents = 0;
    relevantAssignments.forEach(a => {
      totalIncidents += a.incidents.length;
    });

    const relevantVehicles = state.vehicles.filter(v => v.workGroupId === state.activeWorkGroupId);
    const totalVehicles = relevantVehicles.length;
    const operationalVehicles = relevantVehicles.filter(v => v.status === 'Operativo').length;
    const inoperableVehicles = relevantVehicles.filter(v => v.status === 'Inoperativo').length;

    return {
      totalAssignments: relevantAssignments.length,
      completed,
      inProgress,
      totalIncidents,
      relevantAssignments,
      totalVehicles,
      operationalVehicles,
      inoperableVehicles
    };
  }, [state.assignments, state.vehicles, state.activeWorkGroupId]);

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
        Novedades: a.incidents.length
      };
    });
    exportToCsv(`asignaciones_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  const handleExportEmployees = () => {
    const data = state.employees
      .filter(e => e.workGroupId === state.activeWorkGroupId)
      .map(e => ({
        ID: e.id,
        Nombre: e.name,
        Rol: e.role,
        Telefono: e.phone
      }));
    exportToCsv(`personal_${state.activeWorkGroupId || 'general'}_${new Date().getTime()}.csv`, data);
  };

  if (!state.activeWorkGroupId) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <BarChart2 className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Seleccione un Grupo</h3>
        <p className="text-slate-500 text-sm">
          Debe seleccionar un Grupo de Trabajo activo en la barra superior para visualizar las métricas y reportes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Panel de Reportes</h2>
          <p className="text-sm text-slate-500">Métricas del grupo: <strong className="text-indigo-600">{state.workGroups.find(g => g.id === state.activeWorkGroupId)?.name}</strong></p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Asignaciones" 
          value={metrics.totalAssignments.toString()} 
          icon={<BarChart2 className="h-6 w-6 text-indigo-600" />}
          bg="bg-indigo-50"
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
          icon={<AlertTriangle className="h-6 w-6 text-amber-600" />}
          bg="bg-amber-50"
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
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            Reporte de Operaciones
          </h3>
          <p className="text-sm text-slate-500 mb-6 flex-1">
            Descargue el historial completo de asignaciones, rutas y novedades registradas por el personal de campo.
          </p>
          <button 
            onClick={handleExportAssignments}
            className="w-full flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl py-3 text-sm font-bold transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Asignaciones (CSV)
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Directorio de Personal
          </h3>
          <p className="text-sm text-slate-500 mb-6 flex-1">
            Descargue el listado completo de empleados, incluyendo conductores, ayudantes y coordinadores.
          </p>
          <button 
            onClick={handleExportEmployees}
            className="w-full flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl py-3 text-sm font-bold transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Personal (CSV)
          </button>
        </div>
      </div>
      
    </div>
  );
};

const MetricCard = ({ title, value, icon, bg }: { title: string, value: string, icon: React.ReactNode, bg: string }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between h-32 shadow-sm">
    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{title}</span>
    <div className="flex items-end justify-between">
      <span className="text-3xl font-black text-slate-800">{value}</span>
      <div className={`p-2 rounded-lg ${bg}`}>
        {icon}
      </div>
    </div>
  </div>
);
