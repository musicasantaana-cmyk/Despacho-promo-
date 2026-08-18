import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { exportToCsv } from '../../utils/exportCsv';
import { 
  Users, AlertTriangle, CheckCircle, Clock, Filter, Download, 
  Calendar, Briefcase, Layers, Search, ChevronRight, UserCheck, 
  UserX, Shield, AlertCircle, Phone, Truck, FileSpreadsheet
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Employee, Assignment, Incident, EmployeeRole } from '../../types';

export const AttendanceIncidentsReportView: React.FC = () => {
  const { state } = useAppContext();

  // Filters State
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'last7' | 'last30' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]); // empty = all groups
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'available' | 'with_incidents'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState<Employee | null>(null);

  // Group Multi-selection toggle
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

  // Date filtering helper
  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    const targetDate = new Date(dateStr);
    const now = new Date();

    if (dateFilter === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      return dateStr.startsWith(todayStr);
    }
    if (dateFilter === 'last7') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return targetDate >= sevenDaysAgo;
    }
    if (dateFilter === 'last30') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return targetDate >= thirtyDaysAgo;
    }
    if (dateFilter === 'custom') {
      if (customStartDate && targetDate < new Date(customStartDate)) return false;
      if (customEndDate && targetDate > new Date(customEndDate + 'T23:59:59')) return false;
      return true;
    }
    return true; // 'all'
  };

  // Filtered Assignments based on date and selected groups
  const filteredAssignments = useMemo(() => {
    return state.assignments.filter(a => {
      // Date filter
      if (!isDateInRange(a.date)) return false;
      // Group filter
      if (selectedGroupIds.length > 0) {
        if (a.workGroupId && !selectedGroupIds.includes(a.workGroupId)) return false;
      }
      return true;
    });
  }, [state.assignments, dateFilter, customStartDate, customEndDate, selectedGroupIds]);

  // Set of employee IDs that have at least 1 assignment in the filtered range
  const assignedEmployeeIds = useMemo(() => {
    const ids = new Set<string>();
    filteredAssignments.forEach(a => {
      a.employeeIds?.forEach(id => ids.add(id));
    });
    return ids;
  }, [filteredAssignments]);

  // Incidents mapped to employee assignments in range
  const incidentsList = useMemo(() => {
    const list: {
      incident: Incident;
      assignment: Assignment;
      employeeNames: string[];
      routeCode: string;
      vehiclePlate: string;
      groupName: string;
    }[] = [];

    filteredAssignments.forEach(a => {
      if (a.incidents && a.incidents.length > 0) {
        const route = state.routes.find(r => r.id === a.routeId);
        const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
        const group = state.workGroups.find(g => g.id === a.workGroupId);
        const assignedEmps = (a.employeeIds || [])
          .map(id => state.employees.find(e => e.id === id)?.name || '')
          .filter(Boolean);

        a.incidents.forEach(inc => {
          list.push({
            incident: inc,
            assignment: a,
            employeeNames: assignedEmps,
            routeCode: route?.code || route?.name || 'N/A',
            vehiclePlate: vehicle?.plate || 'N/A',
            groupName: group?.name || 'General',
          });
        });
      }
    });

    return list;
  }, [filteredAssignments, state.routes, state.vehicles, state.workGroups, state.employees]);

  // Filtered Employees List
  const filteredEmployees = useMemo(() => {
    return state.employees.filter(emp => {
      // Role filter
      if (roleFilter !== 'all' && emp.role !== roleFilter) return false;

      // Group filter
      if (selectedGroupIds.length > 0) {
        const empGroupId = emp.workGroupId || state.workGroups.find(g => g.name === emp.workGroup)?.id;
        if (!empGroupId || !selectedGroupIds.includes(empGroupId)) return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchPhone = emp.phone.toLowerCase().includes(q);
        const matchGroup = (emp.workGroup || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchGroup) return false;
      }

      // Status filter
      const isAssigned = assignedEmployeeIds.has(emp.id);
      const empIncidentsCount = filteredAssignments.filter(a => (a.employeeIds || []).includes(emp.id) && a.incidents.length > 0).length;

      if (statusFilter === 'assigned' && !isAssigned) return false;
      if (statusFilter === 'available' && isAssigned) return false;
      if (statusFilter === 'with_incidents' && empIncidentsCount === 0) return false;

      return true;
    });
  }, [state.employees, roleFilter, selectedGroupIds, state.workGroups, searchTerm, statusFilter, assignedEmployeeIds, filteredAssignments]);

  // Overall Metrics
  const metrics = useMemo(() => {
    const totalFiltered = filteredEmployees.length;
    const activeInOps = filteredEmployees.filter(e => assignedEmployeeIds.has(e.id)).length;
    const available = totalFiltered - activeInOps;
    const attendanceRate = totalFiltered > 0 ? Math.round((activeInOps / totalFiltered) * 100) : 0;

    // Role breakdown
    const drivers = filteredEmployees.filter(e => e.role === 'Conductor').length;
    const assistants = filteredEmployees.filter(e => e.role === 'Ayudante').length;
    const coordinators = filteredEmployees.filter(e => e.role === 'Coordinador').length;

    // Incidents breakdown
    const incidentTypeCounts: Record<string, number> = {
      'Retraso': 0,
      'Mecánico': 0,
      'Personal': 0,
      'Clima': 0,
      'Otro': 0
    };

    incidentsList.forEach(item => {
      const type = item.incident.type || 'Otro';
      incidentTypeCounts[type] = (incidentTypeCounts[type] || 0) + 1;
    });

    const incidentData = Object.entries(incidentTypeCounts)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0);

    return {
      totalFiltered,
      activeInOps,
      available,
      attendanceRate,
      drivers,
      assistants,
      coordinators,
      totalIncidents: incidentsList.length,
      incidentData,
    };
  }, [filteredEmployees, assignedEmployeeIds, incidentsList]);

  // Export current filtered attendance and incidents to CSV
  const handleExportFilteredData = () => {
    const data = filteredEmployees.map(emp => {
      const empAssignments = filteredAssignments.filter(a => (a.employeeIds || []).includes(emp.id));
      const empIncidents = empAssignments.flatMap(a => a.incidents);
      const isAssigned = empAssignments.length > 0;
      const groupName = emp.workGroupId 
        ? state.workGroups.find(g => g.id === emp.workGroupId)?.name 
        : (emp.workGroup || 'General');

      return {
        ID: emp.id,
        'Nombre Completo': emp.name,
        Rol: emp.role,
        'Grupo de Trabajo': groupName,
        'Teléfono': emp.phone,
        'Estado Operativo': isAssigned ? 'Asignado / En Operación' : 'Disponible / En Base',
        'Total Asignaciones Periodo': empAssignments.length,
        'Total Novedades Reportadas': empIncidents.length,
        'Filtro Fecha Aplicado': dateFilter.toUpperCase(),
      };
    });

    exportToCsv(`reporte_asistencia_personal_${new Date().getTime()}.csv`, data);
  };

  // Export Incidents Detailed CSV
  const handleExportIncidentsDetail = () => {
    const data = incidentsList.map((item, index) => ({
      '#': index + 1,
      'Fecha / Hora': item.incident.timestamp,
      'Tipo de Novedad': item.incident.type,
      'Descripción': item.incident.description,
      'Ruta / Código': item.routeCode,
      'Móvil / Placa': item.vehiclePlate,
      'Grupo de Trabajo': item.groupName,
      'Personal Asignado': item.employeeNames.join(', '),
      'Estado Asignación': item.assignment.status,
    }));

    exportToCsv(`reporte_novedades_personal_${new Date().getTime()}.csv`, data);
  };

  const incidentColors: Record<string, string> = {
    'Retraso': '#f59e0b',
    'Mecánico': '#ef4444',
    'Personal': '#8b5cf6',
    'Clima': '#0ea5e9',
    'Otro': '#64748b'
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar for General Coordinator */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Métricas de Asistencia y Novedades</h2>
              <p className="text-xs text-slate-500">Módulo exclusivo de Coordinación General con filtros multidimensionales</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportFilteredData}
              className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar Asistencia (CSV)
            </button>
            <button
              onClick={handleExportIncidentsDetail}
              className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              Exportar Novedades (CSV)
            </button>
          </div>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Date Range Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Calendar className="h-3 w-3 mr-1 text-slate-400" /> Rango Temporal / Histórico
            </label>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">Todo el Histórico</option>
              <option value="today">Hoy (Operación Actual)</option>
              <option value="last7">Últimos 7 días</option>
              <option value="last30">Últimos 30 días</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {/* 2. Role Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Briefcase className="h-3 w-3 mr-1 text-slate-400" /> Rol Operativo
            </label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">Todos los Roles</option>
              <option value="Conductor">Conductor</option>
              <option value="Ayudante">Ayudante</option>
              <option value="Coordinador">Coordinador</option>
            </select>
          </div>

          {/* 3. Operational Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Filter className="h-3 w-3 mr-1 text-slate-400" /> Estado de Asistencia
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">Todos los Estados</option>
              <option value="assigned">En Ruta / Despachados</option>
              <option value="available">Disponibles (Sin asignar)</option>
              <option value="with_incidents">Con Novedades Reportadas</option>
            </select>
          </div>

          {/* 4. Text Search Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center">
              <Search className="h-3 w-3 mr-1 text-slate-400" /> Buscar Personal
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nombre, teléfono..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Custom Date Picker row */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-600">Desde:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="font-bold text-slate-600">Hasta:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        {/* Multi-Group Selection Tags */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
              <Layers className="h-3 w-3 mr-1 text-slate-400" /> Filtrar por Grupo(s) de Trabajo:
            </span>
            <button
              onClick={selectAllGroups}
              className={`text-[11px] font-semibold transition-colors ${
                selectedGroupIds.length === 0 ? 'text-emerald-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {selectedGroupIds.length === 0 ? '✓ Todos los grupos seleccionados' : 'Seleccionar todos los grupos'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectAllGroups}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                selectedGroupIds.length === 0
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({state.employees.length})
            </button>
            {state.workGroups.map(wg => {
              const isSelected = selectedGroupIds.includes(wg.id);
              const count = state.employees.filter(e => (e.workGroupId === wg.id || e.workGroup === wg.name)).length;
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Plantilla Filtrada</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-800">{metrics.totalFiltered}</span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {metrics.drivers} cond. / {metrics.assistants} ayud.
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs flex flex-col justify-between bg-emerald-50/20">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Activos en Operación</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-emerald-600">{metrics.activeInOps}</span>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-2">
            Tasa de Asistencia: {metrics.attendanceRate}%
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Personal Disponible</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-700">{metrics.available}</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <UserX className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            En base / Sin despacho
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-xs flex flex-col justify-between bg-amber-50/20">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Novedades Reportadas</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-amber-600">{metrics.totalIncidents}</span>
            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-amber-600 font-semibold mt-2">
            Incidencias en el período
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Asignaciones en Periodo</span>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-800">{filteredAssignments.length}</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Rutas ejecutadas
          </div>
        </div>
      </div>

      {/* Analytics Breakdown & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Novedades por Tipo */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Distribución de Novedades por Tipo
          </h3>
          <div className="h-52 w-full flex-1 flex items-center justify-center">
            {metrics.incidentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.incidentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {metrics.incidentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={incidentColors[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 text-center">
                Sin novedades reportadas en el periodo seleccionado
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-center pt-2 border-t border-slate-100">
            {metrics.incidentData.map(item => (
              <span key={item.name} className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: incidentColors[item.name] || '#94a3b8' }} />
                {item.name}: {item.value}
              </span>
            ))}
          </div>
        </div>

        {/* Estado Operativo & Tasa de Asistencia */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-500" />
            Participación de Personal Activo
          </h3>
          <div className="space-y-4 flex-1 flex flex-col justify-center">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1 text-slate-700">
                <span>En Operación / Ruta</span>
                <span>{metrics.activeInOps} ({metrics.attendanceRate}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${metrics.attendanceRate}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1 text-slate-700">
                <span>Disponibles en Base</span>
                <span>{metrics.available} ({100 - metrics.attendanceRate}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-amber-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${100 - metrics.attendanceRate}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-2 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Conductores Asignados:</span>
                <strong className="text-slate-800">
                  {filteredEmployees.filter(e => e.role === 'Conductor' && assignedEmployeeIds.has(e.id)).length} / {metrics.drivers}
                </strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Ayudantes Asignados:</span>
                <strong className="text-slate-800">
                  {filteredEmployees.filter(e => e.role === 'Ayudante' && assignedEmployeeIds.has(e.id)).length} / {metrics.assistants}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Novedades Recientes */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Últimas Novedades
            </h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {incidentsList.length} total
            </span>
          </div>
          <div className="space-y-2.5 overflow-y-auto max-h-56 flex-1 pr-1">
            {incidentsList.slice(0, 5).map((item, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    {item.incident.type}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {item.incident.timestamp ? new Date(item.incident.timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' }) : 'Hoy'}
                  </span>
                </div>
                <p className="text-slate-700 font-medium line-clamp-2">{item.incident.description}</p>
                <div className="text-[10px] text-slate-500 truncate">
                  Ruta: {item.routeCode} • Móvil: {item.vehiclePlate}
                </div>
              </div>
            ))}
            {incidentsList.length === 0 && (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 py-6">
                Sin novedades reportadas en el periodo
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Detailed Attendance & Personnel Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Registro Individual de Asistencia y Novedades</h3>
            <p className="text-xs text-slate-500">Listado detallado del personal según los filtros activos ({filteredEmployees.length} registros)</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Mostrando {filteredEmployees.length} de {state.employees.length} colaboradores
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Colaborador / Personal</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Grupo de Trabajo</th>
                <th className="py-3 px-4">Teléfono</th>
                <th className="py-3 px-4 text-center">Estado Operativo</th>
                <th className="py-3 px-4 text-center">Rutas Asignadas</th>
                <th className="py-3 px-4 text-center">Novedades</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredEmployees.map(emp => {
                const empAssignments = filteredAssignments.filter(a => (a.employeeIds || []).includes(emp.id));
                const empIncidents = empAssignments.flatMap(a => a.incidents);
                const isAssigned = empAssignments.length > 0;
                const groupName = emp.workGroupId 
                  ? state.workGroups.find(g => g.id === emp.workGroupId)?.name 
                  : (emp.workGroup || 'General');

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800 text-sm">{emp.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {emp.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        emp.role === 'Conductor'
                          ? 'bg-amber-100 text-amber-800'
                          : emp.role === 'Coordinador'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {emp.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {groupName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {emp.phone || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isAssigned 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isAssigned ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {isAssigned ? 'En Operación' : 'Disponible en Base'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {empAssignments.length}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {empIncidents.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                          {empIncidents.length}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEmployeeForModal(emp)}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                      >
                        Ver Historial
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                    No se encontraron colaboradores que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Employee History Modal */}
      {selectedEmployeeForModal && (
        <EmployeeHistoryModal
          employee={selectedEmployeeForModal}
          assignments={filteredAssignments.filter(a => (a.employeeIds || []).includes(selectedEmployeeForModal.id))}
          onClose={() => setSelectedEmployeeForModal(null)}
        />
      )}
    </div>
  );
};

interface EmployeeHistoryModalProps {
  employee: Employee;
  assignments: Assignment[];
  onClose: () => void;
}

const EmployeeHistoryModal: React.FC<EmployeeHistoryModalProps> = ({ employee, assignments, onClose }) => {
  const { state } = useAppContext();
  const allIncidents = assignments.flatMap(a => a.incidents);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-base text-white">{employee.name}</h3>
            <p className="text-xs text-slate-400">{employee.role} • {employee.phone || 'Sin teléfono'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block mb-1">Rutas Asignadas</span>
              <strong className="text-lg font-black text-slate-800">{assignments.length}</strong>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block mb-1">Novedades Reportadas</span>
              <strong className="text-lg font-black text-amber-600">{allIncidents.length}</strong>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block mb-1">Estado Actual</span>
              <strong className="text-xs font-bold text-emerald-600 block mt-1">
                {assignments.length > 0 ? 'En Operación' : 'Disponible'}
              </strong>
            </div>
          </div>

          {/* Incidents Section */}
          <div>
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-2 flex items-center">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
              Novedades Registradas ({allIncidents.length})
            </h4>
            <div className="space-y-2">
              {allIncidents.map((inc, i) => (
                <div key={i} className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="font-bold text-amber-800 uppercase text-[10px]">{inc.type}</span>
                    <span className="text-slate-400 text-[10px]">{inc.timestamp}</span>
                  </div>
                  <p className="text-slate-700">{inc.description}</p>
                </div>
              ))}
              {allIncidents.length === 0 && (
                <p className="text-xs text-slate-400 italic">No registra novedades en el periodo consultado.</p>
              )}
            </div>
          </div>

          {/* Assignments Section */}
          <div>
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-2 flex items-center">
              <Truck className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
              Historial de Rutas Despachadas ({assignments.length})
            </h4>
            <div className="space-y-2">
              {assignments.map(a => {
                const route = state.routes.find(r => r.id === a.routeId);
                const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
                return (
                  <div key={a.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800">{route?.name || 'Ruta Desconocida'} ({route?.code || 'N/A'})</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Móvil: {vehicle?.plate || vehicle?.internalNumber} • Fecha: {new Date(a.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">
                      {a.status}
                    </span>
                  </div>
                );
              })}
              {assignments.length === 0 && (
                <p className="text-xs text-slate-400 italic">Sin asignaciones registradas.</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl hover:bg-slate-900">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
