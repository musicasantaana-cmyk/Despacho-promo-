import React, { useState, useMemo } from 'react';
import { Clock, Truck, PauseCircle, Wrench, Search, Calendar, Download, CheckCircle2, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { DriverShift } from '../../types';
import { exportToCsv } from '../../utils/exportCsv';
import { ReportSubMenuHeader } from './ReportSubMenuHeader';

function formatTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const DriverShiftsReportView: React.FC = () => {
  const { state } = useAppContext();
  const { lockedWorkGroupId } = useAuth();

  const today = new Date().toLocaleDateString('en-CA');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(lockedWorkGroupId ? [lockedWorkGroupId] : []);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailShift, setDetailShift] = useState<DriverShift | null>(null);

  const toggleGroup = (id: string) => {
    if (lockedWorkGroupId) return;
    setSelectedGroupIds(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]));
  };

  const selectAllGroups = () => {
    if (lockedWorkGroupId) return;
    setSelectedGroupIds([]);
  };

  const filteredShifts = useMemo(() => {
    return state.driverShifts.filter(s => {
      if (lockedWorkGroupId && s.workGroupId !== lockedWorkGroupId) return false;
      if (!lockedWorkGroupId && selectedGroupIds.length > 0 && !selectedGroupIds.includes(s.workGroupId)) {
        return false;
      }
      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchDriver = s.driverName.toLowerCase().includes(q);
        const matchVeh = s.vehicleNumber.toLowerCase().includes(q);
        if (!matchDriver && !matchVeh) return false;
      }
      return true;
    });
  }, [state.driverShifts, lockedWorkGroupId, selectedGroupIds, startDate, endDate, searchTerm]);

  const summary = useMemo(() => {
    const total = filteredShifts.length;
    const completed = filteredShifts.filter(s => s.status === 'EN_BASE');
    const avgRouteMins =
      completed.length > 0
        ? Math.round(completed.reduce((sum, s) => sum + (s.routeExecutionMins || 0), 0) / completed.length)
        : 0;
    const avgOpMins =
      completed.length > 0
        ? Math.round(completed.reduce((sum, s) => sum + (s.totalOperationMins || 0), 0) / completed.length)
        : 0;
    const totalRefillMins = filteredShifts.reduce((sum, s) => sum + (s.refillTotalMins || 0), 0);
    const totalBreakdownMins = filteredShifts.reduce((sum, s) => sum + (s.mechanicalBreakdownTotalMins || 0), 0);

    return {
      total,
      completedCount: completed.length,
      avgRouteMins,
      avgOpMins,
      totalRefillMins,
      totalBreakdownMins,
    };
  }, [filteredShifts]);

  const handleExport = () => {
    const rows = filteredShifts.map(s => ({
      Fecha: s.date,
      Grupo: s.workGroupName || state.workGroups.find(g => g.id === s.workGroupId)?.name || s.workGroupId,
      Conductor: s.driverName,
      Movil: s.vehicleNumber,
      Estado: s.status,
      'Checklist Confirmado': s.checklistConfirmed ? 'SI' : 'NO',
      'T1 Inicio Turno': formatTimeShort(s.t1StartShiftAt),
      'T2 Inicio Ruta': formatTimeShort(s.t2StartRouteAt),
      'T3 Fin Ruta': formatTimeShort(s.t3EndRouteAt),
      'T4 Llegada Base': formatTimeShort(s.t4ArriveBaseAt),
      'Desplazamiento Ida (min)': s.initialTransitMins ?? '',
      'Ejecucion Ruta Bruta T3-T2 (min)': s.routeExecutionMins ?? '',
      'Ejecucion Ruta Neta sin Pausas (min)': s.routeExecutionNetMins ?? '',
      'Desplazamiento Retorno (min)': s.returnTransitMins ?? '',
      'Tiempo Relleno/Descargue (min)': s.refillTotalMins ?? 0,
      'Eventos Relleno': s.refillEvents?.length || 0,
      'Tiempo Averia Mecanica (min)': s.mechanicalBreakdownTotalMins ?? 0,
      'Eventos Averia': s.breakdownEvents?.length || 0,
      'Total Operacion Bruta T4-T1 (min)': s.totalOperationMins ?? '',
      'Total Operacion Neta sin Pausas (min)': s.totalOperationNetMins ?? '',
    }));

    exportToCsv(`control_tiempos_conductores_${startDate}_a_${endDate}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <ReportSubMenuHeader
        workGroups={state.workGroups}
        selectedGroupIds={lockedWorkGroupId ? [lockedWorkGroupId] : selectedGroupIds}
        onToggleGroup={toggleGroup}
        onSelectAllGroups={selectAllGroups}
        onExportCsv={handleExport}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center">
              <Calendar className="h-3.5 w-3.5 mr-1 text-slate-400" /> Desde
            </span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center">
              <Calendar className="h-3.5 w-3.5 mr-1 text-slate-400" /> Hasta
            </span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </ReportSubMenuHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Jornadas Registradas</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.total}</div>
          <span className="text-[11px] text-slate-500">{summary.completedCount} finalizadas en base</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Prom. Ejecución Ruta</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{summary.avgRouteMins} min</div>
          <span className="text-[11px] text-slate-500">T3 - T2</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Prom. Total Operación</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.avgOpMins} min</div>
          <span className="text-[11px] text-slate-500">T4 - T1</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-amber-700 uppercase">Total Relleno / Descargue</span>
          <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">{summary.totalRefillMins} min</div>
          <span className="text-[11px] text-slate-500">Pausas acumuladas</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-rose-700 uppercase">Inoperatividad Mecánica</span>
          <div className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">{summary.totalBreakdownMins} min</div>
          <span className="text-[11px] text-slate-500">Fallas reportadas</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" />
              Control de Tiempos de Conductores (T1 → T4)
            </h3>
            <p className="text-xs text-slate-500">Visualización consolidada con pausas de relleno y averías mecánicas.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar conductor o móvil..."
                className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="p-3">Fecha / Grupo</th>
                <th className="p-3">Conductor / Móvil</th>
                <th className="p-3">Estado</th>
                <th className="p-3 font-mono">T1 → T2 → T3 → T4</th>
                <th className="p-3 text-right">Ejecución (T3-T2)</th>
                <th className="p-3 text-right">Relleno</th>
                <th className="p-3 text-right">Avería Mec.</th>
                <th className="p-3 text-right">Total Op. (T4-T1)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShifts.map(s => {
                const groupName = s.workGroupName || state.workGroups.find(g => g.id === s.workGroupId)?.name || '—';
                return (
                  <tr
                    key={s.id}
                    onClick={() => setDetailShift(s)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="p-3">
                      <div className="font-semibold text-slate-900 tabular-nums">{s.date}</div>
                      <div className="text-[11px] text-slate-500">{groupName}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{s.driverName}</div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                        <Truck className="h-3 w-3" /> Móvil {s.vehicleNumber}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-700">
                        {s.status}
                        {s.isPausedForRefill ? ' · En Relleno' : ''}
                        {s.isInBreakdown ? ' · En Avería' : ''}
                      </span>
                    </td>
                    <td className="p-3 font-mono tabular-nums text-slate-700">
                      {formatTimeShort(s.t1StartShiftAt)} → {formatTimeShort(s.t2StartRouteAt)} →{' '}
                      {formatTimeShort(s.t3EndRouteAt)} → {formatTimeShort(s.t4ArriveBaseAt)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {s.routeExecutionMins !== null && s.routeExecutionMins !== undefined
                        ? `${s.routeExecutionMins} min`
                        : '—'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {s.refillTotalMins} min
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                      {s.mechanicalBreakdownTotalMins} min
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {s.totalOperationMins !== null && s.totalOperationMins !== undefined
                        ? `${s.totalOperationMins} min`
                        : 'En curso'}
                    </td>
                  </tr>
                );
              })}
              {filteredShifts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No hay jornadas de conductores registradas para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Detail Modal */}
      {detailShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900">Detalle de Jornada — Móvil {detailShift.vehicleNumber}</h3>
                <p className="text-xs text-slate-500">
                  {detailShift.driverName} · {detailShift.date}
                </p>
              </div>
              <button onClick={() => setDetailShift(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-sm">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Checklist Preoperacional
                </span>
                <span className="font-semibold text-slate-900">
                  {detailShift.checklistConfirmed ? `Confirmado (${formatTimeShort(detailShift.checklistConfirmedAt)})` : 'Pendiente'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 border border-slate-200 rounded-xl">
                  <span className="text-slate-500 block">Ejecución Ruta (Bruto)</span>
                  <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                    {detailShift.routeExecutionMins ?? '—'} min
                  </span>
                </div>
                <div className="p-3 border border-slate-200 rounded-xl">
                  <span className="text-slate-500 block">Ejecución Ruta (Neto sin pausas)</span>
                  <span className="font-bold font-mono tabular-nums text-emerald-700 text-sm">
                    {detailShift.routeExecutionNetMins ?? '—'} min
                  </span>
                </div>
                <div className="p-3 border border-slate-200 rounded-xl">
                  <span className="text-slate-500 block">Operación Total (T4 - T1)</span>
                  <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                    {detailShift.totalOperationMins ?? '—'} min
                  </span>
                </div>
                <div className="p-3 border border-slate-200 rounded-xl">
                  <span className="text-slate-500 block">Operación Neta (sin pausas)</span>
                  <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                    {detailShift.totalOperationNetMins ?? '—'} min
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase text-amber-700 mb-2 flex items-center gap-1.5">
                  <PauseCircle className="h-3.5 w-3.5" /> Eventos de Relleno / Descargue ({detailShift.refillEvents?.length || 0})
                </h4>
                {detailShift.refillEvents?.length ? (
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    {detailShift.refillEvents.map((ev, i) => (
                      <div key={ev.id} className="p-2 bg-amber-50 rounded-lg border border-amber-200 flex justify-between">
                        <span>#{i + 1} · {formatTimeShort(ev.startAt)} → {formatTimeShort(ev.endAt)}</span>
                        <span className="font-bold">{ev.durationMins ?? '—'} min</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin eventos de relleno registrados.</p>
                )}
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase text-rose-700 mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Averías Mecánicas ({detailShift.breakdownEvents?.length || 0})
                </h4>
                {detailShift.breakdownEvents?.length ? (
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    {detailShift.breakdownEvents.map((ev, i) => (
                      <div key={ev.id} className="p-2 bg-rose-50 rounded-lg border border-rose-200 flex justify-between">
                        <span>
                          #{i + 1} · {formatTimeShort(ev.startAt)} → {formatTimeShort(ev.endAt)}
                          {ev.notes ? ` (${ev.notes})` : ''}
                        </span>
                        <span className="font-bold">{ev.durationMins ?? '—'} min</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin averías mecánicas registradas.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
