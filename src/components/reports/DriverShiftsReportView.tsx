import React, { useState, useMemo, useEffect } from 'react';
import { Clock, Truck, PauseCircle, Wrench, Search, Calendar, Download, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { DriverShift } from '../../types';
import { exportToCsv } from '../../utils/exportCsv';
import { ReportSubMenuHeader } from './ReportSubMenuHeader';
import { computeShiftTimeBreakdown, formatMsAsHoursMins } from '../../utils/shiftTimeMetrics';

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
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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

  const enrichedShifts = useMemo(() => {
    return filteredShifts.map(shift => ({
      shift,
      computed: computeShiftTimeBreakdown(shift, nowMs),
    }));
  }, [filteredShifts, nowMs]);

  const summary = useMemo(() => {
    const total = enrichedShifts.length;
    const completed = enrichedShifts.filter(item => item.shift.status === 'EN_BASE');
    const withRoute = enrichedShifts.filter(item => item.computed.routeNetMins !== null);
    const withTransit = enrichedShifts.filter(item => item.computed.totalTransitMins !== null);

    const totalRouteNetMins = withRoute.reduce((sum, item) => sum + (item.computed.routeNetMins || 0), 0);
    const avgRouteNetMins = withRoute.length > 0 ? Math.round(totalRouteNetMins / withRoute.length) : 0;

    const totalTransitSumMins = withTransit.reduce((sum, item) => sum + (item.computed.totalTransitMins || 0), 0);
    const avgTransitMins = withTransit.length > 0 ? Math.round(totalTransitSumMins / withTransit.length) : 0;

    const avgOpMins =
      completed.length > 0
        ? Math.round(completed.reduce((sum, item) => sum + (item.computed.totalOperationMins || 0), 0) / completed.length)
        : 0;

    const totalRefillMins = enrichedShifts.reduce((sum, item) => sum + item.computed.totalRefillMins, 0);
    const totalBreakdownMins = enrichedShifts.reduce((sum, item) => sum + item.computed.totalBreakdownMins, 0);
    const totalWeightTons = Number(
      enrichedShifts.reduce((sum, item) => sum + (item.shift.weightTons || 0), 0).toFixed(2)
    );

    const criticalAlerts = enrichedShifts.filter(item => item.computed.overallAlertLevel === 'critical');
    const warningAlerts = enrichedShifts.filter(item => item.computed.overallAlertLevel === 'warning');

    return {
      total,
      completedCount: completed.length,
      totalRouteNetMins,
      avgRouteNetMins,
      totalTransitSumMins,
      avgTransitMins,
      avgOpMins,
      totalRefillMins,
      totalBreakdownMins,
      totalWeightTons,
      criticalAlerts,
      warningAlerts,
    };
  }, [enrichedShifts]);

  const handleExport = () => {
    const rows = enrichedShifts.map(({ shift: s, computed: c }) => ({
      Fecha: s.date,
      Grupo: s.workGroupName || state.workGroups.find(g => g.id === s.workGroupId)?.name || s.workGroupId,
      Conductor: s.driverName,
      Movil: s.vehicleNumber,
      'Tipo Jornada': s.isSupportShift ? `Apoyo (de ${s.parentRouteCode || 'Principal'})` : 'Principal',
      Ruta: s.routeCode || s.routeName || '',
      Estado: `${s.status}${s.isPausedForSupport ? ' (Pausada por Apoyo)' : ''}`,
      'Checklist Confirmado': s.checklistConfirmed ? 'SI' : 'NO',
      'T1 Inicio Turno': formatTimeShort(s.t1StartShiftAt),
      'T2 Inicio Ruta': formatTimeShort(s.t2StartRouteAt),
      'T3 Fin Ruta': formatTimeShort(s.t3EndRouteAt),
      'T4 Llegada Base': formatTimeShort(s.t4ArriveBaseAt),
      'Desplazamiento Ida T2-T1 (min)': c.initialTransitMins ?? '',
      'Desplazamiento Retorno T4-T3 (min)': c.returnTransitMins ?? '',
      'Tiempo Total Desplazamiento (min)': c.totalTransitMins ?? '',
      'Tiempo Total Ruta Bruta T3-T2 (min)': c.routeGrossMins ?? '',
      'Descuento Averias y Rellenos en Ruta (min)': c.routeDeductedMins,
      'Tiempo Neto Ruta (min)': c.routeNetMins ?? '',
      'Tiempo Total Relleno/Descargue (min)': c.totalRefillMins,
      'Eventos Relleno': s.refillEvents?.length || 0,
      'Tiempo Apoyo (min)': c.totalSupportMins,
      'Eventos Apoyo': s.supportEvents?.length || 0,
      'Tiempo Total Averia Mecanica (min)': c.totalBreakdownMins,
      'Eventos Averia': s.breakdownEvents?.length || 0,
      'Total Operacion Bruta T4-T1 (min)': c.totalOperationMins ?? '',
      'Total Operacion Neta sin Pausas (min)': c.totalOperationNetMins ?? '',
      'Peso Recogido (Tons)': s.weightTons !== null && s.weightTons !== undefined ? s.weightTons : '',
      'Alerta Duracion Ruta':
        c.overallAlertLevel === 'critical'
          ? 'CRITICA (+10h)'
          : c.overallAlertLevel === 'warning'
            ? 'ALERTA (+8h)'
            : 'Normal',
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

      {/* 8h / 10h Route Duration Alerts */}
      {(summary.criticalAlerts.length > 0 || summary.warningAlerts.length > 0) && (
        <div
          className={`rounded-2xl p-4 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            summary.criticalAlerts.length > 0
              ? 'bg-rose-50 border-rose-400 text-rose-950'
              : 'bg-amber-50 border-amber-400 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`h-5 w-5 shrink-0 mt-0.5 ${
                summary.criticalAlerts.length > 0 ? 'text-rose-600' : 'text-amber-600'
              }`}
            />
            <div className="text-xs space-y-1">
              <div className="font-extrabold uppercase tracking-wide">
                Alertas por Duración de Ruta desde Inicio (T2)
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.criticalAlerts.map(({ shift: s, computed: c }) => (
                  <span
                    key={s.id}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-bold"
                  >
                    CRÍTICA +10h · M.{s.vehicleNumber} ({s.routeCode || 'S/R'} · {formatMsAsHoursMins(c.routeElapsedMs)})
                  </span>
                ))}
                {summary.warningAlerts.map(({ shift: s, computed: c }) => (
                  <span
                    key={s.id}
                    className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-bold"
                  >
                    ALERTA +8h · M.{s.vehicleNumber} ({s.routeCode || 'S/R'} · {formatMsAsHoursMins(c.routeElapsedMs)})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Jornadas / Peso</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.total}</div>
          <span className="text-[11px] text-slate-500">
            {summary.completedCount} en base · <strong className="text-purple-700">{summary.totalWeightTons.toFixed(1)} Ton</strong>
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-blue-700 uppercase">Desplazamiento Total</span>
          <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">{summary.totalTransitSumMins} min</div>
          <span className="text-[11px] text-slate-500">(T1→T2)+(T3→T4) · Prom: {summary.avgTransitMins}m</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-emerald-700 uppercase">Tiempo Neto en Ruta</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{summary.totalRouteNetMins} min</div>
          <span className="text-[11px] text-slate-500">Sin averías/rellenos · Prom: {summary.avgRouteNetMins}m</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-amber-700 uppercase">Total Relleno / Descargue</span>
          <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">{summary.totalRefillMins} min</div>
          <span className="text-[11px] text-slate-500">Suma total de rellenos</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-rose-700 uppercase">Total Averías Mecánicas</span>
          <div className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">{summary.totalBreakdownMins} min</div>
          <span className="text-[11px] text-slate-500">Suma total de averías</span>
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
                <th className="p-3 text-right">Desplaz. Total</th>
                <th className="p-3 text-right">Ruta Neta (Bruto)</th>
                <th className="p-3 text-right">Relleno</th>
                <th className="p-3 text-right">Avería Mec.</th>
                <th className="p-3 text-right">Peso</th>
                <th className="p-3 text-right">Total Op. (T4-T1)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrichedShifts.map(({ shift: s, computed: c }) => {
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
                        {s.routeCode ? ` · R.${s.routeCode}` : ''}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-slate-700">
                          {s.status}
                          {s.isSupportShift ? ' · Apoyo' : ''}
                          {s.isPausedForSupport ? ' · Pausada (Apoyo)' : ''}
                          {s.isPausedForRefill ? ' · En Relleno' : ''}
                          {s.isInBreakdown ? ' · En Avería' : ''}
                        </span>
                        {c.overallAlertLevel === 'critical' && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-mono font-bold">
                            CRÍTICA +10h
                          </span>
                        )}
                        {c.overallAlertLevel === 'warning' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-mono font-bold">
                            ALERTA +8h
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono tabular-nums text-slate-700">
                      {formatTimeShort(s.t1StartShiftAt)} → {formatTimeShort(s.t2StartRouteAt)} →{' '}
                      {formatTimeShort(s.t3EndRouteAt)} → {formatTimeShort(s.t4ArriveBaseAt)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-blue-700">
                      {c.totalTransitMins !== null ? `${c.totalTransitMins} min` : '—'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {c.routeNetMins !== null ? (
                        <div>
                          <span>{c.routeNetMins} min</span>
                          {c.routeDeductedMins > 0 && (
                            <div className="text-[10px] text-slate-400">
                              Bruto {c.routeGrossMins ?? 0}m (-{c.routeDeductedMins}m)
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {c.totalRefillMins} min
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                      {c.totalBreakdownMins} min
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-purple-700">
                      {s.weightTons !== null && s.weightTons !== undefined ? `${s.weightTons} Ton` : '—'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {c.totalOperationMins !== null ? `${c.totalOperationMins} min` : 'En curso'}
                    </td>
                  </tr>
                );
              })}
              {enrichedShifts.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
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

              {(() => {
                const dm = computeShiftTimeBreakdown(detailShift, nowMs);
                return (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 border border-blue-200 bg-blue-50/50 rounded-xl col-span-2">
                      <span className="text-blue-700 font-semibold block">
                        Tiempo Total de Desplazamiento (Ida + Retorno)
                      </span>
                      <span className="font-bold font-mono tabular-nums text-blue-950 text-sm">
                        {dm.totalTransitMins ?? '—'} min
                      </span>
                      <span className="text-[11px] text-blue-700 font-mono ml-2">
                        (Ida: {dm.initialTransitMins ?? '—'}m + Retorno: {dm.returnTransitMins ?? '—'}m)
                      </span>
                    </div>
                    <div className="p-3 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Tiempo Total Ruta (T3 - T2 Bruto)</span>
                      <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                        {dm.routeGrossMins ?? '—'} min
                      </span>
                    </div>
                    <div className="p-3 border border-emerald-200 bg-emerald-50/50 rounded-xl">
                      <span className="text-emerald-700 block">Tiempo Neto Ruta (Descontando Nov.)</span>
                      <span className="font-bold font-mono tabular-nums text-emerald-800 text-sm">
                        {dm.routeNetMins ?? '—'} min
                      </span>
                      {dm.routeDeductedMins > 0 && (
                        <span className="text-[10px] text-emerald-700 block">
                          Descontado: {dm.routeDeductedMins} min
                        </span>
                      )}
                    </div>
                    <div className="p-3 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Operación Total (T4 - T1)</span>
                      <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                        {dm.totalOperationMins ?? '—'} min
                      </span>
                    </div>
                    <div className="p-3 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Operación Neta (sin pausas)</span>
                      <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                        {dm.totalOperationNetMins ?? '—'} min
                      </span>
                    </div>
                    <div className="p-3 border border-purple-200 bg-purple-50/50 rounded-xl col-span-2 flex items-center justify-between">
                      <span className="text-purple-800 font-semibold">Peso Recogido en Ruta</span>
                      <span className="font-bold font-mono tabular-nums text-purple-950 text-sm">
                        {detailShift.weightTons !== null && detailShift.weightTons !== undefined
                          ? `${detailShift.weightTons} Ton`
                          : 'No registrado'}
                      </span>
                    </div>
                  </div>
                );
              })()}

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
                      <div key={ev.id} className="p-2 bg-rose-50 rounded-lg border border-rose-200 space-y-0.5">
                        <div className="flex justify-between">
                          <span>
                            #{i + 1} · {formatTimeShort(ev.startAt)} → {formatTimeShort(ev.endAt)}
                            {ev.notes ? ` (${ev.notes})` : ''}
                          </span>
                          <span className="font-bold">{ev.durationMins ?? 'Activa'} min</span>
                        </div>
                        {(ev.resolvedReportedBy || ev.reportedByName) && (
                          <div className="text-[11px] font-sans text-rose-900">
                            Reportó novedad: <span className="font-semibold">{ev.resolvedReportedBy || ev.reportedByName}</span>
                            {ev.resolutionNotes ? ` · ${ev.resolutionNotes}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin averías mecánicas registradas.</p>
                )}
              </div>

              {(detailShift.isSupportShift || (detailShift.supportEvents?.length || 0) > 0) && (
                <div>
                  <h4 className="font-bold text-xs uppercase text-orange-700 mb-2">
                    Registro de Apoyos ({detailShift.supportEvents?.length || 0})
                  </h4>
                  {detailShift.isSupportShift && (
                    <div className="p-2.5 bg-orange-50 rounded-lg border border-orange-200 text-xs font-semibold text-orange-900 mb-2">
                      Esta jornada corresponde a una Ruta de Apoyo ({detailShift.routeCode || detailShift.routeName}).
                      {detailShift.parentRouteCode ? ` Ruta principal pausada: ${detailShift.parentRouteCode}.` : ''}
                    </div>
                  )}
                  {(detailShift.supportEvents?.length || 0) > 0 && (
                    <div className="space-y-1.5 text-xs font-mono tabular-nums">
                      {detailShift.supportEvents!.map((ev, i) => (
                        <div key={ev.id} className="p-2 bg-orange-50 rounded-lg border border-orange-200 flex justify-between">
                          <span>
                            #{i + 1} Apoyo {ev.supportRouteCode || ''} · {formatTimeShort(ev.startAt)} → {formatTimeShort(ev.endAt)}
                          </span>
                          <span className="font-bold">{ev.durationMins ?? 'Activo'} min</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
