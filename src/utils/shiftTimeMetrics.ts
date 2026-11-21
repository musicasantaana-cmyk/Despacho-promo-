import { BreakdownEvent, DriverShift, Incident, RefillEvent, SupportPauseEvent } from '../types';

export type RouteAlertLevel = 'none' | 'warning' | 'critical';

export const ROUTE_WARNING_HOURS = 8;
export const ROUTE_CRITICAL_HOURS = 10;
export const ROUTE_WARNING_MS = ROUTE_WARNING_HOURS * 3600 * 1000;
export const ROUTE_CRITICAL_MS = ROUTE_CRITICAL_HOURS * 3600 * 1000;

export interface TimeIntervalEvent {
  startAt: string;
  endAt: string | null;
}

export function calcSingleCategoryOverlapMs(
  events: TimeIntervalEvent[] | undefined,
  windowStartMs?: number,
  windowEndMs?: number,
  liveNowMs?: number
): number {
  if (!events || events.length === 0) return 0;
  let total = 0;
  for (const ev of events) {
    if (!ev.startAt) continue;
    const s = new Date(ev.startAt).getTime();
    const e = ev.endAt ? new Date(ev.endAt).getTime() : liveNowMs ?? NaN;
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue;
    if (windowStartMs !== undefined && windowEndMs !== undefined) {
      const clampedStart = Math.max(s, windowStartMs);
      const clampedEnd = Math.min(e, windowEndMs);
      if (clampedEnd > clampedStart) {
        total += clampedEnd - clampedStart;
      }
    } else {
      total += e - s;
    }
  }
  return total;
}

export function calcUnionPauseOverlapMs(
  eventLists: Array<TimeIntervalEvent[] | undefined>,
  windowStartMs: number,
  windowEndMs: number,
  liveNowMs?: number
): number {
  if (windowEndMs <= windowStartMs) return 0;
  const intervals: Array<[number, number]> = [];
  for (const list of eventLists) {
    if (!list) continue;
    for (const ev of list) {
      if (!ev.startAt) continue;
      const s = new Date(ev.startAt).getTime();
      const e = ev.endAt ? new Date(ev.endAt).getTime() : liveNowMs ?? NaN;
      if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue;
      const clampedStart = Math.max(s, windowStartMs);
      const clampedEnd = Math.min(e, windowEndMs);
      if (clampedEnd > clampedStart) {
        intervals.push([clampedStart, clampedEnd]);
      }
    }
  }
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let mergedTotal = 0;
  let curStart = intervals[0][0];
  let curEnd = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= curEnd) {
      if (e > curEnd) curEnd = e;
    } else {
      mergedTotal += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  mergedTotal += curEnd - curStart;
  return mergedTotal;
}

export function getRouteAlertFromTimestamps(
  routeStartIso?: string | null,
  routeEndIso?: string | null,
  nowMs: number = Date.now()
): {
  isActive: boolean;
  elapsedMs: number;
  elapsedHours: number;
  activeLevel: RouteAlertLevel;
  overallLevel: RouteAlertLevel;
} {
  if (!routeStartIso) {
    return {
      isActive: false,
      elapsedMs: 0,
      elapsedHours: 0,
      activeLevel: 'none',
      overallLevel: 'none',
    };
  }
  const startMs = new Date(routeStartIso).getTime();
  if (Number.isNaN(startMs)) {
    return {
      isActive: false,
      elapsedMs: 0,
      elapsedHours: 0,
      activeLevel: 'none',
      overallLevel: 'none',
    };
  }
  const endMs = routeEndIso ? new Date(routeEndIso).getTime() : NaN;
  const isActive = !routeEndIso || Number.isNaN(endMs);
  const refEndMs = isActive ? nowMs : endMs;
  const elapsedMs = Math.max(0, refEndMs - startMs);
  const elapsedHours = elapsedMs / 3600000;

  let overallLevel: RouteAlertLevel = 'none';
  if (elapsedMs > ROUTE_CRITICAL_MS) {
    overallLevel = 'critical';
  } else if (elapsedMs > ROUTE_WARNING_MS) {
    overallLevel = 'warning';
  }

  return {
    isActive,
    elapsedMs,
    elapsedHours,
    activeLevel: isActive ? overallLevel : 'none',
    overallLevel,
  };
}

export interface ComputedShiftTimeBreakdown {
  initialTransitMins: number | null;
  returnTransitMins: number | null;
  totalTransitMins: number | null;
  routeGrossMins: number | null;
  routeNetMins: number | null;
  routeRefillMins: number;
  routeBreakdownMins: number;
  routeSupportMins: number;
  routeDeductedMins: number;
  totalRefillMins: number;
  totalBreakdownMins: number;
  totalSupportMins: number;
  totalOperationMins: number | null;
  totalOperationNetMins: number | null;
  routeElapsedMs: number;
  routeElapsedHours: number;
  isRouteActive: boolean;
  activeAlertLevel: RouteAlertLevel;
  overallAlertLevel: RouteAlertLevel;
}

export function computeShiftTimeBreakdown(
  shift: DriverShift,
  nowMs: number = Date.now()
): ComputedShiftTimeBreakdown {
  const t1 = shift.t1StartShiftAt ? new Date(shift.t1StartShiftAt).getTime() : NaN;
  const t2 = shift.t2StartRouteAt ? new Date(shift.t2StartRouteAt).getTime() : NaN;
  const t3 = shift.t3EndRouteAt ? new Date(shift.t3EndRouteAt).getTime() : NaN;
  const t4 = shift.t4ArriveBaseAt ? new Date(shift.t4ArriveBaseAt).getTime() : NaN;

  const initialTransitMins =
    shift.initialTransitMins !== null && shift.initialTransitMins !== undefined
      ? shift.initialTransitMins
      : !Number.isNaN(t1) && !Number.isNaN(t2) && t2 >= t1
        ? Math.round((t2 - t1) / 60000)
        : null;

  const returnTransitMins =
    shift.returnTransitMins !== null && shift.returnTransitMins !== undefined
      ? shift.returnTransitMins
      : !Number.isNaN(t3) && !Number.isNaN(t4) && t4 >= t3
        ? Math.round((t4 - t3) / 60000)
        : null;

  const totalTransitMins =
    shift.totalTransitMins !== null && shift.totalTransitMins !== undefined && returnTransitMins !== null
      ? shift.totalTransitMins
      : initialTransitMins !== null || returnTransitMins !== null
        ? (initialTransitMins ?? 0) + (returnTransitMins ?? 0)
        : null;

  const refills: RefillEvent[] = shift.refillEvents || [];
  const breakdowns: BreakdownEvent[] = shift.breakdownEvents || [];
  const supports: SupportPauseEvent[] = shift.supportEvents || [];

  const totalRefillMs = calcSingleCategoryOverlapMs(refills, undefined, undefined, nowMs);
  const totalBreakdownMs = calcSingleCategoryOverlapMs(breakdowns, undefined, undefined, nowMs);
  const totalSupportMs = calcSingleCategoryOverlapMs(supports, undefined, undefined, nowMs);

  const totalRefillMins = Math.max(shift.refillTotalMins || 0, Math.round(totalRefillMs / 60000));
  const totalBreakdownMins = Math.max(shift.mechanicalBreakdownTotalMins || 0, Math.round(totalBreakdownMs / 60000));
  const totalSupportMins = Math.max(shift.supportTotalMins || 0, Math.round(totalSupportMs / 60000));

  let routeGrossMins: number | null = null;
  let routeNetMins: number | null = null;
  let routeRefillMins = 0;
  let routeBreakdownMins = 0;
  let routeSupportMins = 0;
  let routeDeductedMins = 0;

  if (!Number.isNaN(t2)) {
    const endRefMs = !Number.isNaN(t3) ? t3 : nowMs;
    const grossMs = Math.max(0, endRefMs - t2);
    routeGrossMins =
      !Number.isNaN(t3) && shift.routeExecutionMins !== null && shift.routeExecutionMins !== undefined
        ? shift.routeExecutionMins
        : Math.round(grossMs / 60000);

    const refMs = calcSingleCategoryOverlapMs(refills, t2, endRefMs, nowMs);
    const brkMs = calcSingleCategoryOverlapMs(breakdowns, t2, endRefMs, nowMs);
    const supMs = calcSingleCategoryOverlapMs(supports, t2, endRefMs, nowMs);
    const unionPauseMs = calcUnionPauseOverlapMs([refills, breakdowns, supports], t2, endRefMs, nowMs);

    routeRefillMins = Math.round(refMs / 60000);
    routeBreakdownMins = Math.round(brkMs / 60000);
    routeSupportMins = Math.round(supMs / 60000);
    routeDeductedMins = Math.round(unionPauseMs / 60000);
    routeNetMins = Math.max(0, Math.round((grossMs - unionPauseMs) / 60000));
  }

  let totalOperationMins = shift.totalOperationMins ?? null;
  let totalOperationNetMins = shift.totalOperationNetMins ?? null;
  if (!Number.isNaN(t1)) {
    const endOpMs = !Number.isNaN(t4) ? t4 : nowMs;
    const opGrossMs = Math.max(0, endOpMs - t1);
    if (totalOperationMins === null && !Number.isNaN(t4)) {
      totalOperationMins = Math.round(opGrossMs / 60000);
    }
    const unionOpPauseMs = calcUnionPauseOverlapMs([refills, breakdowns, supports], t1, endOpMs, nowMs);
    if (!Number.isNaN(t4)) {
      totalOperationNetMins = Math.max(0, Math.round((opGrossMs - unionOpPauseMs) / 60000));
    }
  }

  const alert = getRouteAlertFromTimestamps(
    shift.t2StartRouteAt,
    shift.t3EndRouteAt || (shift.status === 'EN_BASE' ? shift.t4ArriveBaseAt : null),
    nowMs
  );

  return {
    initialTransitMins,
    returnTransitMins,
    totalTransitMins,
    routeGrossMins,
    routeNetMins,
    routeRefillMins,
    routeBreakdownMins,
    routeSupportMins,
    routeDeductedMins,
    totalRefillMins,
    totalBreakdownMins,
    totalSupportMins,
    totalOperationMins,
    totalOperationNetMins,
    routeElapsedMs: alert.elapsedMs,
    routeElapsedHours: alert.elapsedHours,
    isRouteActive: alert.isActive,
    activeAlertLevel: alert.activeLevel,
    overallAlertLevel: alert.overallLevel,
  };
}

export function formatMinutesAsHoursMins(mins?: number | null): string {
  if (mins === null || mins === undefined) return '—';
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatMsAsHoursMins(ms: number): string {
  const safeMins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(safeMins / 60);
  const m = safeMins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Parses an Assignment Incident duration in milliseconds and minutes.
 * Handles both ISO timestamps and "HH:mm" time inputs paired with fallbackDate ("YYYY-MM-DD").
 */
export function parseAssignmentIncidentInterval(
  inc: Incident,
  fallbackDate: string
): { startMs: number | null; endMs: number | null; durationMins: number } {
  if (!inc.startTime || !inc.endTime) {
    return { startMs: null, endMs: null, durationMins: 0 };
  }

  const parsePoint = (raw: string, baseDate: string): number | null => {
    const trimmed = raw.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const parts = trimmed.split(':').map(Number);
      const [hh, mm, ss = 0] = parts;
      const dateStr = (baseDate || new Date().toLocaleDateString('en-CA')).slice(0, 10);
      const d = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  const s = parsePoint(inc.startTime, fallbackDate);
  let e = parsePoint(inc.endTime, fallbackDate);
  if (s === null || e === null) {
    return { startMs: null, endMs: null, durationMins: 0 };
  }
  if (e < s) {
    e += 24 * 60 * 60 * 1000;
  }
  const durationMins = Math.max(0, Math.round((e - s) / 60000));
  return { startMs: s, endMs: e, durationMins };
}
