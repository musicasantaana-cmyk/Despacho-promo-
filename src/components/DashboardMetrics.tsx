import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon, RefreshCw, AlertCircle } from 'lucide-react';
import {
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
} from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Assignment, DriverShift, Vehicle } from '../types';

type TimeRangeFilter = 'today' | '7d' | '30d' | 'all';
type ChartViewMode = 'both' | 'pie' | 'bar';

interface StatusSlice {
  key: 'completed' | 'in_progress' | 'cancelled';
  name: string;
  value: number;
  color: string;
  percentage: number;
}

const STATUS_META = {
  completed: { label: 'Completadas', color: '#10b981' },
  in_progress: { label: 'En Progreso', color: '#0ea5e9' },
  cancelled: { label: 'Canceladas', color: '#f43f5e' },
} as const;

function getLocalDateKey(daysOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export const DashboardMetrics: React.FC = () => {
  const { state, useBackendSync, syncNow } = useAppContext();
  const { lockedWorkGroupId, canManageAllGroups } = useAuth();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [driverShifts, setDriverShifts] = useState<DriverShift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [chartMode, setChartMode] = useState<ChartViewMode>('both');
  const [groupScope, setGroupScope] = useState<'active' | 'all'>(
    state.activeWorkGroupId ? 'active' : 'all'
  );

  // Sync default group scope when activeWorkGroupId changes for unrestricted admins
  useEffect(() => {
    if (lockedWorkGroupId) {
      setGroupScope('active');
    } else if (!state.activeWorkGroupId) {
      setGroupScope('all');
    } else {
      setGroupScope('active');
    }
  }, [lockedWorkGroupId, state.activeWorkGroupId]);

  const effectiveWorkGroupId = lockedWorkGroupId
    ? lockedWorkGroupId
    : groupScope === 'active'
      ? state.activeWorkGroupId
      : null;

  const buildQueries = useCallback((): {
    assignmentsQuery: Query<DocumentData>;
    shiftsQuery: Query<DocumentData>;
  } => {
    const assignmentsRef = collection(db, 'assignments');
    const shiftsRef = collection(db, 'driver_shifts');

    if (effectiveWorkGroupId) {
      return {
        assignmentsQuery: query(assignmentsRef, where('workGroupId', '==', effectiveWorkGroupId)),
        shiftsQuery: query(shiftsRef, where('workGroupId', '==', effectiveWorkGroupId)),
      };
    }
    return {
      assignmentsQuery: assignmentsRef,
      shiftsQuery: shiftsRef,
    };
  }, [effectiveWorkGroupId]);

  // Sync metrics from AppContext when Express backend SSE sync is active; otherwise subscribe directly to Firestore
  useEffect(() => {
    if (useBackendSync) {
      const scopedAssignments = effectiveWorkGroupId
        ? state.assignments.filter(a => a.workGroupId === effectiveWorkGroupId)
        : state.assignments;
      const scopedShifts = effectiveWorkGroupId
        ? state.driverShifts.filter(s => s.workGroupId === effectiveWorkGroupId)
        : state.driverShifts;
      setAssignments(scopedAssignments);
      setDriverShifts(scopedShifts);
      setLoading(false);
      setErrorMsg('');
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      return;
    }

    if (!isFirebaseConfigured || !db) {
      setLoading(false);
      setAssignments([]);
      setDriverShifts([]);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { assignmentsQuery, shiftsQuery } = buildQueries();
    let assignmentsLoaded = false;
    let shiftsLoaded = false;

    const markReady = () => {
      if (assignmentsLoaded && shiftsLoaded) {
        setLoading(false);
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    };

    const unsubAssignments = onSnapshot(
      assignmentsQuery,
      snapshot => {
        const docs = snapshot.docs.map(d => ({ ...(d.data() as Omit<Assignment, 'id'>), id: d.id }));
        setAssignments(docs);
        assignmentsLoaded = true;
        markReady();
      },
      err => {
        setLoading(false);
        setErrorMsg('No se pudieron cargar las asignaciones de rutas desde Firestore.');
        try {
          handleFirestoreError(err, OperationType.LIST, 'assignments');
        } catch {
          // Structured error logged via handleFirestoreError
        }
      }
    );

    const unsubShifts = onSnapshot(
      shiftsQuery,
      snapshot => {
        const docs = snapshot.docs.map(d => ({ ...(d.data() as Omit<DriverShift, 'id'>), id: d.id }));
        setDriverShifts(docs);
        shiftsLoaded = true;
        markReady();
      },
      err => {
        setLoading(false);
        setErrorMsg('No se pudieron cargar las jornadas operativas desde Firestore.');
        try {
          handleFirestoreError(err, OperationType.LIST, 'driver_shifts');
        } catch {
          // Structured error logged via handleFirestoreError
        }
      }
    );

    return () => {
      unsubAssignments();
      unsubShifts();
    };
  }, [useBackendSync, effectiveWorkGroupId, state.assignments, state.driverShifts, buildQueries]);

  // Explicit on-demand refresh
  const handleManualRefresh = async () => {
    if (refreshing) return;
    if (useBackendSync) {
      setRefreshing(true);
      setErrorMsg('');
      try {
        await syncNow();
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } catch {
        setErrorMsg('Error al sincronizar los datos actualizados.');
      } finally {
        setRefreshing(false);
      }
      return;
    }

    if (!isFirebaseConfigured || !db) return;
    setRefreshing(true);
    setErrorMsg('');
    try {
      const { assignmentsQuery, shiftsQuery } = buildQueries();
      const [assignSnap, shiftSnap] = await Promise.all([
        getDocs(assignmentsQuery).catch(err => handleFirestoreError(err, OperationType.GET, 'assignments')),
        getDocs(shiftsQuery).catch(err => handleFirestoreError(err, OperationType.GET, 'driver_shifts')),
      ]);
      setAssignments(assignSnap.docs.map(d => ({ ...(d.data() as Omit<Assignment, 'id'>), id: d.id })));
      setDriverShifts(shiftSnap.docs.map(d => ({ ...(d.data() as Omit<DriverShift, 'id'>), id: d.id })));
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch {
      setErrorMsg('Error al consultar los datos actualizados desde Firestore.');
    } finally {
      setRefreshing(false);
    }
  };

  // Compute route metrics across Assignments + unmatched DriverShifts
  const metrics = useMemo(() => {
    const todayKey = getLocalDateKey(0);
    const minDateKey =
      timeRange === 'today'
        ? todayKey
        : timeRange === '7d'
          ? getLocalDateKey(-6)
          : timeRange === '30d'
            ? getLocalDateKey(-29)
            : '';

    const inDateWindow = (rawDate?: string) => {
      if (!minDateKey) return true;
      const dateStr = (rawDate || '').slice(0, 10);
      if (!dateStr) return false;
      return dateStr >= minDateKey && dateStr <= todayKey;
    };

    const filteredAssignments = assignments.filter(a => inDateWindow(a.date));
    const filteredShifts = driverShifts.filter(s => !s.isSupportShift && inDateWindow(s.date));

    let completed = 0;
    let inProgress = 0;
    let cancelled = 0;

    // Track matched shift IDs so we don't double-count an Assignment and its linked DriverShift
    const matchedShiftIds = new Set<string>();
    const vehicleById = new Map<string, Vehicle>(state.vehicles.map(v => [v.id, v]));

    for (const a of filteredAssignments) {
      const aDate = (a.date || '').slice(0, 10);
      const vehicle = vehicleById.get(a.vehicleId);
      const linkedShift = filteredShifts.find(s => {
        if (matchedShiftIds.has(s.id)) return false;
        if (s.date !== aDate) return false;
        if (a.workGroupId && s.workGroupId !== a.workGroupId) return false;
        if (s.vehicleId && s.vehicleId === a.vehicleId) return true;
        if (vehicle?.internalNumber && s.vehicleNumber.toLowerCase() === vehicle.internalNumber.toLowerCase()) {
          return true;
        }
        if (s.driverId && (a.employeeIds || []).includes(s.driverId)) return true;
        return false;
      });
      if (linkedShift) matchedShiftIds.add(linkedShift.id);

      if (a.status === 'Cancelado') {
        cancelled += 1;
      } else if (a.status === 'Fin de Ruta' || a.status === 'Base') {
        completed += 1;
      } else {
        // Pendiente, Salida de Base, Inicio de Ruta, Relleno
        inProgress += 1;
      }
    }

    // Add standalone driver shifts created directly from DriverPage without an Assignment record
    for (const s of filteredShifts) {
      if (matchedShiftIds.has(s.id)) continue;
      if (s.status === 'EN_BASE' || s.status === 'FIN_RUTA') {
        completed += 1;
      } else {
        inProgress += 1;
      }
    }

    const total = completed + inProgress + cancelled;
    const pct = (val: number) => (total > 0 ? Math.round((val / total) * 100) : 0);

    const chartData: StatusSlice[] = [
      {
        key: 'completed',
        name: STATUS_META.completed.label,
        value: completed,
        color: STATUS_META.completed.color,
        percentage: pct(completed),
      },
      {
        key: 'in_progress',
        name: STATUS_META.in_progress.label,
        value: inProgress,
        color: STATUS_META.in_progress.color,
        percentage: pct(inProgress),
      },
      {
        key: 'cancelled',
        name: STATUS_META.cancelled.label,
        value: cancelled,
        color: STATUS_META.cancelled.color,
        percentage: pct(cancelled),
      },
    ];

    const nonZeroPieData = chartData.filter(d => d.value > 0);

    return {
      total,
      completed,
      inProgress,
      cancelled,
      completedPct: pct(completed),
      inProgressPct: pct(inProgress),
      cancelledPct: pct(cancelled),
      chartData,
      nonZeroPieData,
    };
  }, [assignments, driverShifts, state.vehicles, timeRange]);

  const activeGroupName = useMemo(() => {
    if (!effectiveWorkGroupId) return 'Todos los grupos';
    return state.workGroups.find(g => g.id === effectiveWorkGroupId)?.name || 'Grupo seleccionado';
  }, [effectiveWorkGroupId, state.workGroups]);

  return (
    <section
      aria-label="Métricas del estado de rutas"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Métricas de Estado de Rutas
          </h2>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Datos en tiempo real desde Firestore</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-slate-700">{activeGroupName}</span>
            {lastUpdated && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Actualizado {lastUpdated}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Group scope toggle (when admin/gestion has an active group selected) */}
          {canManageAllGroups && state.activeWorkGroupId && (
            <div className="flex items-center p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setGroupScope('active')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  groupScope === 'active'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grupo activo
              </button>
              <button
                type="button"
                onClick={() => setGroupScope('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  groupScope === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
            </div>
          )}

          {/* Time Range Filter */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: '7d', label: '7 días' },
                { id: '30d', label: '30 días' },
                { id: 'all', label: 'Todo' },
              ] as const
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeRange(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  timeRange === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Chart Mode Selector */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('both')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chartMode === 'both'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Mostrar gráfico de pastel y barras"
            >
              <span>Ambos</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('pie')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chartMode === 'pie'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gráfico de pastel"
            >
              <PieChartIcon className="h-3.5 w-3.5" />
              <span>Pastel</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chartMode === 'bar'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gráfico de barras"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Barras</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing || (!useBackendSync && !isFirebaseConfigured)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Consultar nuevamente desde Firestore"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Warning if Firebase env vars are not configured yet and backend sync is unavailable */}
      {!useBackendSync && !isFirebaseConfigured && (
        <div className="mt-4 flex items-start gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Configure las variables de entorno <code className="font-mono">VITE_FIREBASE_*</code> para visualizar métricas en vivo desde Firestore.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="font-semibold underline hover:no-underline shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-slate-100">
        <div>
          <span className="text-xs font-medium text-slate-500 block">Total de Rutas</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {loading ? '—' : metrics.total}
          </div>
          <span className="text-xs text-slate-400">Registros evaluados</span>
        </div>

        <div>
          <span className="text-xs font-medium text-emerald-700 block">Completadas</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {loading ? '—' : metrics.completed}
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {loading ? '—' : `${metrics.completedPct}% del total`}
          </span>
        </div>

        <div>
          <span className="text-xs font-medium text-sky-700 block">En Progreso</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {loading ? '—' : metrics.inProgress}
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {loading ? '—' : `${metrics.inProgressPct}% del total`}
          </span>
        </div>

        <div>
          <span className="text-xs font-medium text-rose-700 block">Canceladas</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {loading ? '—' : metrics.cancelled}
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {loading ? '—' : `${metrics.cancelledPct}% del total`}
          </span>
        </div>
      </div>

      {/* Charts Area */}
      <div className="pt-5">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">
            Cargando métricas desde Firestore...
          </div>
        ) : metrics.total === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl px-4">
            <BarChart3 className="h-9 w-9 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">
              No hay rutas registradas en Firestore para el filtro seleccionado
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Pruebe cambiando el rango de fechas o el filtro de grupo operativo.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              chartMode === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(chartMode === 'both' || chartMode === 'pie') && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Distribución por Estado (Pastel)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {metrics.total} rutas
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.nonZeroPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        paddingAngle={3}
                        strokeWidth={2}
                        stroke="#ffffff"
                      >
                        {metrics.nonZeroPieData.map(entry => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          const pct =
                            metrics.total > 0 ? Math.round((Number(value) / metrics.total) * 100) : 0;
                          return [`${value} rutas (${pct}%)`, name];
                        }}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          borderColor: '#e2e8f0',
                          fontSize: '0.75rem',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        formatter={(value: string) => (
                          <span className="text-xs text-slate-700 font-medium">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {(chartMode === 'both' || chartMode === 'bar') && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Volumen por Estado (Barras)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    Completadas · En Progreso · Canceladas
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.chartData}
                      margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: '#475569' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                        formatter={(value: number) => [`${value} rutas`, 'Cantidad']}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          borderColor: '#e2e8f0',
                          fontSize: '0.75rem',
                        }}
                      />
                      <Bar dataKey="value" name="Rutas" radius={[8, 8, 0, 0]} maxBarSize={64}>
                        {metrics.chartData.map(entry => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
