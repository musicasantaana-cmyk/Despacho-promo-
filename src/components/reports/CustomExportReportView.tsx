import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { exportToCsv } from '../../utils/exportCsv';
import { 
  FileSpreadsheet, Download, Filter, Calendar, Users, 
  Truck, CheckSquare, Square, Layers, Sparkles, Check
} from 'lucide-react';
import { Employee, Assignment, Incident, Vehicle } from '../../types';

export const CustomExportReportView: React.FC = () => {
  const { state } = useAppContext();

  const [reportType, setReportType] = useState<'attendance' | 'incidents' | 'fleet' | 'master'>('attendance');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'last7' | 'last30' | 'custom'>('last7');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['Conductor', 'Ayudante', 'Coordinador']);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]); // empty = all
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Toggle role
  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Toggle group
  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    const targetDate = new Date(dateStr);
    const now = new Date();

    if (dateRange === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      return dateStr.startsWith(todayStr);
    }
    if (dateRange === 'last7') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return targetDate >= sevenDaysAgo;
    }
    if (dateRange === 'last30') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return targetDate >= thirtyDaysAgo;
    }
    if (dateRange === 'custom') {
      if (startDate && targetDate < new Date(startDate)) return false;
      if (endDate && targetDate > new Date(endDate + 'T23:59:59')) return false;
      return true;
    }
    return true;
  };

  // Filtered dataset generator for preview and export
  const generatedData = useMemo(() => {
    // 1. Attendance / Personnel
    if (reportType === 'attendance') {
      const filteredAssignments = state.assignments.filter(a => isDateInRange(a.date));
      return state.employees
        .filter(emp => {
          if (selectedRoles.length > 0 && !selectedRoles.includes(emp.role)) return false;
          if (selectedGroups.length > 0) {
            const gid = emp.workGroupId || state.workGroups.find(g => g.name === emp.workGroup)?.id;
            if (!gid || !selectedGroups.includes(gid)) return false;
          }
          return true;
        })
        .map(emp => {
          const empAss = filteredAssignments.filter(a => (a.employeeIds || []).includes(emp.id));
          const empInc = empAss.flatMap(a => a.incidents);
          const groupName = emp.workGroupId 
            ? state.workGroups.find(g => g.id === emp.workGroupId)?.name 
            : (emp.workGroup || 'General');

          return {
            ID: emp.id,
            'Nombre Completo': emp.name,
            Rol: emp.role,
            'Grupo de Trabajo': groupName,
            'Teléfono': emp.phone || 'N/A',
            'Estado Operativo': empAss.length > 0 ? 'En Operación / Asignado' : 'Disponible en Base',
            'Rutas Asignadas (Periodo)': empAss.length,
            'Novedades Reportadas': empInc.length,
            'Periodo': dateRange.toUpperCase(),
          };
        });
    }

    // 2. Incidents
    if (reportType === 'incidents') {
      const rows: any[] = [];
      state.assignments
        .filter(a => isDateInRange(a.date))
        .filter(a => selectedGroups.length === 0 || (a.workGroupId && selectedGroups.includes(a.workGroupId)))
        .forEach(a => {
          const route = state.routes.find(r => r.id === a.routeId);
          const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
          const group = state.workGroups.find(g => g.id === a.workGroupId);
          const emps = (a.employeeIds || [])
            .map(id => state.employees.find(e => e.id === id))
            .filter(Boolean) as Employee[];

          // Filter by role
          const hasMatchingRole = selectedRoles.length === 0 || emps.some(e => selectedRoles.includes(e.role));
          if (!hasMatchingRole) return;

          a.incidents.forEach(inc => {
            rows.push({
              'ID Asignación': a.id,
              'Fecha y Hora': inc.timestamp,
              'Tipo de Novedad': inc.type,
              'Descripción de Incidente': inc.description,
              'Ruta / Código': route?.code || route?.name || 'N/A',
              'Origen': route?.origin || 'N/A',
              'Destino': route?.destination || 'N/A',
              'Móvil / Placa': vehicle?.plate || 'N/A',
              'Grupo de Trabajo': group?.name || 'General',
              'Personal Asignado': emps.map(e => `${e.name} (${e.role})`).join('; '),
              'Estado de Viaje': a.status,
            });
          });
        });
      return rows;
    }

    // 3. Fleet Assets
    if (reportType === 'fleet') {
      return state.vehicles
        .filter(v => {
          if (selectedGroups.length > 0 && (!v.workGroupId || !selectedGroups.includes(v.workGroupId))) return false;
          return true;
        })
        .map(v => {
          const group = state.workGroups.find(g => g.id === v.workGroupId);
          return {
            ID: v.id,
            'Placa / Matrícula': v.plate,
            'N° Interno': v.internalNumber,
            'Grupo de Trabajo': group?.name || 'General',
            'Capacidad Carga (kg)': v.capacity,
            'Estado Mecánico': v.status,
          };
        });
    }

    // 4. Master Consolidated
    const masterRows: any[] = [];
    state.assignments
      .filter(a => isDateInRange(a.date))
      .filter(a => selectedGroups.length === 0 || (a.workGroupId && selectedGroups.includes(a.workGroupId)))
      .forEach(a => {
        const route = state.routes.find(r => r.id === a.routeId);
        const vehicle = state.vehicles.find(v => v.id === a.vehicleId);
        const group = state.workGroups.find(g => g.id === a.workGroupId);
        const emps = (a.employeeIds || [])
          .map(id => state.employees.find(e => e.id === id))
          .filter(Boolean) as Employee[];

        const drivers = emps.filter(e => e.role === 'Conductor').map(e => e.name).join(', ');
        const assistants = emps.filter(e => e.role === 'Ayudante').map(e => e.name).join(', ');

        masterRows.push({
          'ID Asignación': a.id,
          'Fecha Asignada': a.date,
          'Grupo de Trabajo': group?.name || 'General',
          'Ruta': route?.name || 'N/A',
          'Código Ruta': route?.code || 'N/A',
          'Origen': route?.origin || 'N/A',
          'Destino': route?.destination || 'N/A',
          'Móvil / Placa': vehicle?.plate || 'N/A',
          'N° Interno Vehículo': vehicle?.internalNumber || 'N/A',
          'Conductor(es)': drivers || 'N/A',
          'Ayudante(s)': assistants || 'N/A',
          'Total Personal': emps.length,
          'Estado Actual': a.status,
          'Total Novedades': a.incidents.length,
        });
      });
    return masterRows;
  }, [reportType, dateRange, startDate, endDate, selectedRoles, selectedGroups, state]);

  const handleDownload = () => {
    const filename = `informe_${reportType}_${new Date().toISOString().split('T')[0]}_${new Date().getTime()}.csv`;
    exportToCsv(filename, generatedData);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Generador de Informes Personalizados
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configura y combina múltiples filtros para exportar datos consolidados de personal, novedades, activos o asignaciones.
          </p>
        </div>

        {/* Step 1: Report Type */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            1. Selecciona el Tipo de Informe
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: 'attendance', title: 'Asistencia y Despacho', desc: 'Registro de personal activo, disponible y asignaciones' },
              { id: 'incidents', title: 'Novedades e Incidencias', desc: 'Bitácora detallada de eventos, retrasos y fallas' },
              { id: 'fleet', title: 'Activos de Flota / Vehículos', desc: 'Disponibilidad de vehículos, capacidad y estado' },
              { id: 'master', title: 'Consolidado Maestro', desc: 'Matriz completa de rutas, tripulaciones y móviles' },
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setReportType(type.id as any)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  reportType === type.id
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-sm text-slate-800">{type.title}</div>
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{type.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Date Filters */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
            2. Filtro Temporal / Histórico
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'last7', label: 'Últimos 7 días' },
              { id: 'last30', label: 'Últimos 30 días' },
              { id: 'custom', label: 'Rango Específico' },
              { id: 'all', label: 'Todo el Histórico' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setDateRange(opt.id as any)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  dateRange === opt.id
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs mt-2">
              <span className="font-semibold text-slate-600">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="font-semibold text-slate-600">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        {/* Step 3: Multi-Select Filters (Roles & Groups) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          {/* Roles selection */}
          {['attendance', 'incidents'].includes(reportType) && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <Users className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                3. Filtrar por Roles
              </label>
              <div className="flex flex-wrap gap-2">
                {['Conductor', 'Ayudante', 'Coordinador'].map(role => {
                  const isChecked = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        isChecked 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-slate-300" />}
                      <span>{role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Groups selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <Layers className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                Grupos de Trabajo
              </label>
              <button
                onClick={() => setSelectedGroups([])}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {selectedGroups.length === 0 ? '✓ Todos los grupos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
              {state.workGroups.map(group => {
                const isChecked = selectedGroups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => toggleGroup(group.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isChecked 
                        ? 'bg-slate-800 text-white border-slate-800' 
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{group.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action & Preview Summary */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <div className="font-bold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Vista Previa del Informe
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Se generarán <strong className="text-white">{generatedData.length} registros</strong> con los filtros y parámetros seleccionados.
            </p>
          </div>

          <button
            onClick={handleDownload}
            disabled={generatedData.length === 0}
            className="flex items-center px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar Informe (CSV / Excel)
          </button>
        </div>

        {downloadSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center justify-center font-semibold">
            <Check className="h-4 w-4 mr-2 text-emerald-600" />
            ¡Informe generado y descargado exitosamente!
          </div>
        )}
      </div>
    </div>
  );
};
