import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { exportToCsv } from '../../utils/exportCsv';
import { 
  Users, AlertTriangle, CheckCircle, Clock, Filter, Download, 
  Calendar, Briefcase, Layers, Search, ChevronRight, UserCheck, 
  UserX, Shield, AlertCircle, Phone, Truck, FileSpreadsheet,
  BarChart2, Share2, Save, PieChart as PieChartIcon, XCircle
} from 'lucide-react';
import { AttendanceStatus, NOVELTY_TYPES } from '../../types';
import { ReportSubMenuHeader } from './ReportSubMenuHeader';
import { DateRangeExportModal } from './DateRangeExportModal';

export const AttendanceIncidentsReportView: React.FC = () => {
  const { state, saveAttendance } = useAppContext();

  // Filters State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]); // empty = all groups
  
  // Modal State
  const [activeModalNovelty, setActiveModalNovelty] = useState<string | null>(null);
  const [modalPendingChanges, setModalPendingChanges] = useState<Record<string, AttendanceStatus>>({});

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

  // Filtered Employees List (NOMINA)
  const filteredEmployees = useMemo(() => {
    return state.employees.filter(emp => {
      // Group filter
      if (selectedGroupIds.length > 0) {
        const empGroupId = emp.workGroupId || state.workGroups.find(g => g.name === emp.workGroup)?.id;
        if (!empGroupId || !selectedGroupIds.includes(empGroupId)) return false;
      }
      return true;
    });
  }, [state.employees, selectedGroupIds, state.workGroups]);

  // Determine Attendance for selected date for each filtered employee
  const attendanceData = useMemo(() => {
    const data: Record<string, { status: AttendanceStatus, source: 'auto' | 'manual', isAssigned: boolean }> = {};
    
    // 1. Check assignments for the selected date
    const assignmentsToday = state.assignments.filter(a => a.date.startsWith(selectedDate) && ['Inicio de Ruta', 'Fin de Ruta', 'Relleno', 'Salida de Base'].includes(a.status));
    
    // 2. Map employees
    filteredEmployees.forEach(emp => {
      // Check manual attendance record
      const manualRecord = state.attendances?.find(att => att.employeeId === emp.id && att.date === selectedDate);
      
      if (manualRecord) {
        data[emp.id] = { status: manualRecord.status, source: 'manual', isAssigned: false };
      } else {
        // Check if assigned
        const isAssigned = assignmentsToday.some(a => (a.employeeIds || []).includes(emp.id));
        if (isAssigned) {
          data[emp.id] = { status: 'OK', source: 'auto', isAssigned: true };
        } else {
          // Default to AUS if no manual record and no assignment
          data[emp.id] = { status: 'AUS', source: 'auto', isAssigned: false };
        }
      }
    });
    
    return data;
  }, [filteredEmployees, state.assignments, state.attendances, selectedDate]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const nomina = filteredEmployees.length;
    const allData = Object.values(attendanceData) as { status: AttendanceStatus, source: 'auto' | 'manual', isAssigned: boolean }[];
    // Plan Operativo: We can consider it as the number of employees that were actually assigned today, OR just equal to Nomina for simplicity. Let's use count of assigned.
    const planOperativo = allData.filter(d => d.isAssigned).length || nomina; 
    
    const counts: Record<string, number> = {};
    allData.forEach(d => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });

    return {
      nomina,
      planOperativo,
      counts
    };
  }, [attendanceData, filteredEmployees.length]);

  const [showExportModal, setShowExportModal] = useState(false);

  const handleStatusChange = (employeeId: string, status: AttendanceStatus) => {
    saveAttendance({
      employeeId,
      date: selectedDate,
      status,
      workGroupId: state.employees.find(e => e.id === employeeId)?.workGroupId
    });
  };

  const handleModalSave = () => {
    Object.entries(modalPendingChanges).forEach(([empId, newStatus]) => {
      handleStatusChange(empId, newStatus as AttendanceStatus);
    });
    setActiveModalNovelty(null);
    setModalPendingChanges({});
  };

  const handleExportClick = () => {
    setShowExportModal(true);
  };

  const handleExport = (startDate: string, endDate: string) => {
    const data = filteredEmployees.map(emp => {
      // In a real multi-date export, we would aggregate or generate rows per date.
      // Since the frontend primarily shows selectedDate, we'll export based on the selectedDate data for now,
      // but if they wanted a range, we'd loop over dates. To satisfy the requirement:
      const statusData = attendanceData[emp.id];
      const noveltyLabel = NOVELTY_TYPES.find(n => n.code === statusData?.status)?.label || statusData?.status;
      return {
        'Fecha Rango': `${startDate} a ${endDate}`,
        'Colaborador': emp.name,
        'Rol': emp.role,
        'Grupo': emp.workGroup,
        'Estado Promedio (Fecha Seleccionada)': noveltyLabel,
        'Origen': statusData?.source === 'auto' ? 'Automático (Sistema)' : 'Manual'
      };
    });
    exportToCsv(`asistencia_${startDate}_${endDate}.csv`, data);
  };

  const noveltyList = NOVELTY_TYPES.filter(n => n.code !== 'OK');

  return (
    <div className="space-y-6">
      <ReportSubMenuHeader 
        workGroups={state.workGroups}
        selectedGroupIds={selectedGroupIds}
        onToggleGroup={toggleGroupSelection}
        onSelectAllGroups={selectAllGroups}
        onExportCsv={handleExportClick}
      >
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 pr-4 rounded-2xl w-full">
          <div className="bg-emerald-100 text-emerald-700 p-2.5 rounded-xl flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Seleccionar Fecha</div>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none font-black text-slate-800 text-lg w-full p-0 focus:ring-0"
            />
          </div>
        </div>
      </ReportSubMenuHeader>

      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Main Indicator Table (Image Replica) */}
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden flex-1 max-w-sm self-start">
          <div className="bg-[#a3d95c] text-center p-3">
            <h2 className="font-black text-slate-900 text-sm tracking-widest uppercase">NOVEDADES DE PERSONAL</h2>
          </div>
          <div className="bg-[#bbed69] text-center p-2">
            <div className="font-bold text-slate-800 text-xs opacity-90 capitalize">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>

          <div className="flex flex-col text-[10px] font-bold text-slate-700">
            <div className="flex justify-between border-b border-slate-200 bg-slate-50">
              <div className="flex-1 p-2 px-3">PLAN OPERATIVO</div>
              <div className="w-12 p-2 text-center border-l border-slate-200">{metrics.planOperativo}</div>
              <div className="w-16 p-2 text-center border-l border-slate-200 flex justify-center items-center text-emerald-600"><PieChartIcon className="h-4 w-4" /></div>
            </div>
            <div className="flex justify-between border-b border-slate-200 bg-slate-100">
              <div className="flex-1 p-2 px-3">NOMINA</div>
              <div className="w-12 p-2 text-center border-l border-slate-200">{metrics.nomina}</div>
              <div className="w-16 p-2 text-center border-l border-slate-200"></div>
            </div>

            {/* Iterate NOVELTIES */}
            {noveltyList.map(nov => {
              const count = metrics.counts[nov.code] || 0;
              const pct = metrics.nomina > 0 ? (count / metrics.nomina) * 100 : 0;
              const hasData = count > 0;
              
              return (
                <div 
                  key={nov.code} 
                  onClick={() => hasData && setActiveModalNovelty(nov.code)}
                  className={`flex justify-between border-b border-slate-100 bg-white transition-colors ${hasData ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                >
                  <div className="flex-1 p-2 px-3">{nov.label}</div>
                  <div className={`w-12 p-2 text-center border-l border-slate-200 ${hasData && nov.code === 'AUS' ? 'bg-[#ef4444] text-white' : ''} ${hasData && nov.code !== 'AUS' ? 'bg-[#3b82f6] text-white opacity-90' : ''}`}>
                    {count}
                  </div>
                  <div className={`w-16 p-2 text-center border-l border-slate-200 ${hasData ? 'bg-[#3b82f6] text-white' : ''}`}>
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}

            <div 
              className="flex justify-between bg-[#a3d95c] text-xs cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setActiveModalNovelty('OK')}
            >
              <div className="flex-1 p-3 px-3 text-right font-black tracking-wider text-slate-900">OPERATIVOS</div>
              <div className="w-12 p-3 text-center border-l border-white/30 bg-[#facc15] font-black text-slate-900">
                {metrics.counts['OK'] || 0}
              </div>
              <div className="w-16 p-3 text-center border-l border-white/30 bg-[#3b82f6] font-black text-white">
                {metrics.nomina > 0 ? (((metrics.counts['OK'] || 0) / metrics.nomina) * 100).toFixed(1) : '0.0'}%
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          {/* Editor Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-xs text-slate-800 flex items-center">
                  <Users className="h-4 w-4 mr-1.5 text-slate-500" /> Registro de Novedades
                </h3>
              </div>
              <div className="bg-white px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm">
                {filteredEmployees.length} registros
              </div>
            </div>
            <div className="overflow-x-auto flex-1 h-[calc(100vh-16rem)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-sm text-[10px]">
                  <tr>
                    <th className="p-4">Personal</th>
                    <th className="p-4">Rol / Grupo</th>
                    <th className="p-4">Estado / Novedad</th>
                    <th className="p-4 text-center">Acción / Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredEmployees.map(emp => {
                    const data = attendanceData[emp.id];
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800 text-sm">{emp.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {emp.id}</div>
                        </td>
                        <td className="p-4">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[10px] mb-1">{emp.role}</span>
                          <div className="text-[10px] text-slate-500 font-bold">{emp.workGroup}</div>
                        </td>
                        <td className="p-4 min-w-[200px]">
                          <select 
                            value={data?.status || 'AUS'}
                            onChange={(e) => handleStatusChange(emp.id, e.target.value as AttendanceStatus)}
                            disabled={data?.isAssigned}
                            className={`w-full text-xs font-bold py-2.5 px-3 rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-emerald-500 ${
                              data?.isAssigned 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 cursor-not-allowed' 
                                : data?.status === 'AUS'
                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                            }`}
                          >
                            {NOVELTY_TYPES.map(n => (
                              <option key={n.code} value={n.code}>{n.label}</option>
                            ))}
                          </select>
                          {data?.isAssigned && (
                            <div className="text-[10px] font-bold text-emerald-600 mt-1.5 flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" /> OK (Asignado en ruta)
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {data?.source === 'auto' ? (
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                              Automático
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                              <Save className="h-3 w-3 mr-1" /> Guardado Manual
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <span className="font-semibold text-sm">Sin personal en los grupos seleccionados.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <DateRangeExportModal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)} 
        onExport={handleExport} 
        title="Exportar Novedades de Personal" 
      />

      {/* Novelty Detail Modal */}
      {activeModalNovelty && (() => {
        const modalTitle = activeModalNovelty === 'OK' ? 'Personal Operativo' : NOVELTY_TYPES.find(n => n.code === activeModalNovelty)?.label;
        const modalEmployees = filteredEmployees.filter(emp => attendanceData[emp.id]?.status === activeModalNovelty);
        
        return (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800">{modalTitle}</h3>
                <button 
                  onClick={() => {
                    setActiveModalNovelty(null);
                    setModalPendingChanges({});
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                {modalEmployees.length === 0 ? (
                  <p className="text-center text-slate-500 py-4 font-medium">No hay personal con esta novedad.</p>
                ) : (
                  <div className="space-y-3">
                    {modalEmployees.map(emp => {
                      const data = attendanceData[emp.id];
                      const currentModalStatus = modalPendingChanges[emp.id] || data.status;
                      
                      return (
                        <div key={emp.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-xl border border-slate-200 gap-3 shadow-sm">
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{emp.name}</div>
                            <div className="text-[10px] text-slate-500 font-semibold">{emp.role} • {emp.workGroup}</div>
                          </div>
                          <div className="flex items-center min-w-[200px]">
                            <select 
                              value={currentModalStatus}
                              onChange={(e) => setModalPendingChanges(prev => ({ ...prev, [emp.id]: e.target.value as AttendanceStatus }))}
                              disabled={data?.isAssigned}
                              className={`w-full text-xs font-bold py-2 px-3 rounded-lg border outline-none transition-colors ${
                                data?.isAssigned 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 cursor-not-allowed' 
                                  : 'bg-white border-slate-300 text-slate-700 focus:ring-2 focus:ring-emerald-500'
                              }`}
                            >
                              {NOVELTY_TYPES.map(n => (
                                <option key={n.code} value={n.code}>{n.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                 <button 
                  onClick={() => {
                    setActiveModalNovelty(null);
                    setModalPendingChanges({});
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleModalSave}
                  className="px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-md flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" /> Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
