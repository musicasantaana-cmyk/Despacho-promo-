import {
  AuthSessionUser,
  BreakdownAuditLog,
  BreakdownEvent,
  DriverShift,
  DriverShiftStatus,
  RefillEvent,
  SupportPauseEvent,
  UserRole,
} from '../types';
import { auth, db, isFirebaseConfigured } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const CLIENT_USER_TOKEN_PREFIX = 'fb_user:';
const VALID_ROLES: ReadonlyArray<UserRole> = ['admin', 'gestion', 'supervisor', 'conductor'];

function generateClientDocId(prefix: string): string {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}_${Date.now().toString(36)}`;
}

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Firebase no está configurado. Configura las variables VITE_FIREBASE_* en tu entorno o en Vercel.'
    );
  }
}

async function resolveActiveClientUser(): Promise<AuthSessionUser> {
  try {
    const rawSession = localStorage.getItem('PROMO_USER_SESSION');
    if (rawSession) {
      const parsed = JSON.parse(rawSession) as AuthSessionUser;
      if (parsed && parsed.id && parsed.username) {
        return {
          ...parsed,
          role: VALID_ROLES.includes(parsed.role) ? parsed.role : 'gestion',
        };
      }
    }
  } catch {
    // fallback below
  }

  ensureFirestoreReady();
  try {
    const token = localStorage.getItem('PROMO_AUTH_TOKEN') || '';
    if (token.startsWith(CLIENT_USER_TOKEN_PREFIX)) {
      const docId = token.slice(CLIENT_USER_TOKEN_PREFIX.length);
      if (docId) {
        const snap = await getDoc(doc(db, 'app_users', docId));
        if (snap.exists()) {
          const d = snap.data();
          return {
            id: snap.id,
            username: String(d.username || ''),
            fullName: String(d.fullName || d.username || ''),
            role: VALID_ROLES.includes(d.role) ? (d.role as UserRole) : 'gestion',
            workGroupId: String(d.workGroupId || ''),
            employeeId: String(d.employeeId || ''),
          };
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  if (auth?.currentUser) {
    return {
      id: auth.currentUser.uid,
      username: auth.currentUser.email || auth.currentUser.uid,
      fullName: auth.currentUser.displayName || auth.currentUser.email || 'Usuario',
      role: 'admin',
      workGroupId: '',
      employeeId: '',
    };
  }

  throw new Error('Sesión no iniciada. Inicie sesión nuevamente.');
}

function requireRoles(user: AuthSessionUser, allowed: ReadonlyArray<UserRole>) {
  if (!allowed.includes(user.role)) {
    throw new Error('No tiene permisos suficientes para realizar esta acción.');
  }
}

function canAccessGroup(user: AuthSessionUser, targetGroupId: string): boolean {
  if (user.role === 'admin' || user.role === 'gestion') return true;
  if (user.role === 'supervisor') {
    return Boolean(user.workGroupId) && targetGroupId === user.workGroupId;
  }
  if (user.role === 'conductor') {
    if (!user.workGroupId || user.workGroupId === 'ALL') return true;
    return targetGroupId === user.workGroupId;
  }
  return false;
}

function calcEventsDurationMs(
  events: Array<{ startAt: string; endAt: string | null }>,
  windowStartMs?: number,
  windowEndMs?: number,
  liveEndMs?: number
): number {
  let total = 0;
  for (const ev of events) {
    if (!ev.startAt) continue;
    const s = new Date(ev.startAt).getTime();
    const e = ev.endAt ? new Date(ev.endAt).getTime() : liveEndMs ?? NaN;
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

function calcUnionEventsDurationMs(
  eventLists: Array<Array<{ startAt: string; endAt: string | null }>>,
  windowStartMs: number,
  windowEndMs: number,
  liveEndMs?: number
): number {
  if (windowEndMs <= windowStartMs) return 0;
  const intervals: Array<[number, number]> = [];
  for (const events of eventLists) {
    for (const ev of events || []) {
      if (!ev.startAt) continue;
      const s = new Date(ev.startAt).getTime();
      const e = ev.endAt ? new Date(ev.endAt).getTime() : liveEndMs ?? NaN;
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
  let merged = 0;
  let curStart = intervals[0][0];
  let curEnd = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= curEnd) {
      if (e > curEnd) curEnd = e;
    } else {
      merged += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  merged += curEnd - curStart;
  return merged;
}

function parseValidatedWeightTons(
  raw: unknown,
  requireWeight = false
): { ok: true; value: number | null; error?: string } | { ok: false; value?: number | null; error: string } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (requireWeight) {
      return {
        ok: false,
        error: 'Debe ingresar el peso recogido en ruta (toneladas) para finalizar el turno.',
      };
    }
    return { ok: true, value: null };
  }
  const normalized = typeof raw === 'string' ? raw.replace(',', '.').trim() : raw;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0 || num > 500) {
    return {
      ok: false,
      error: 'El peso recogido debe ser un número válido entre 0 y 500 toneladas.',
    };
  }
  return { ok: true, value: Math.round(num * 100) / 100 };
}

function recalculateShiftDerivedMetrics(
  shift: DriverShift,
  overrides: {
    t1StartShiftAt?: string;
    t2StartRouteAt?: string | null;
    t3EndRouteAt?: string | null;
    t4ArriveBaseAt?: string | null;
    refillEvents?: RefillEvent[];
    breakdownEvents?: BreakdownEvent[];
    supportEvents?: SupportPauseEvent[];
  } = {}
) {
  const t1At = overrides.t1StartShiftAt ?? shift.t1StartShiftAt;
  const t2At =
    overrides.t2StartRouteAt !== undefined ? overrides.t2StartRouteAt : (shift.t2StartRouteAt ?? null);
  const t3At =
    overrides.t3EndRouteAt !== undefined ? overrides.t3EndRouteAt : (shift.t3EndRouteAt ?? null);
  const t4At =
    overrides.t4ArriveBaseAt !== undefined ? overrides.t4ArriveBaseAt : (shift.t4ArriveBaseAt ?? null);

  const refillEvents = overrides.refillEvents ?? (shift.refillEvents || []);
  const breakdownEvents = overrides.breakdownEvents ?? (shift.breakdownEvents || []);
  const supportEvents = overrides.supportEvents ?? (shift.supportEvents || []);

  const t1Ms = t1At ? new Date(t1At).getTime() : NaN;
  const t2Ms = t2At ? new Date(t2At).getTime() : NaN;
  const t3Ms = t3At ? new Date(t3At).getTime() : NaN;
  const t4Ms = t4At ? new Date(t4At).getTime() : NaN;

  const status: DriverShiftStatus = t4At
    ? 'EN_BASE'
    : t3At
      ? 'FIN_RUTA'
      : t2At
        ? 'EN_RUTA'
        : 'EN_TURNO';

  const initialTransitMins =
    !Number.isNaN(t1Ms) && !Number.isNaN(t2Ms) && t2Ms >= t1Ms
      ? Math.round((t2Ms - t1Ms) / 60000)
      : null;

  const returnTransitMins =
    !Number.isNaN(t3Ms) && !Number.isNaN(t4Ms) && t4Ms >= t3Ms
      ? Math.round((t4Ms - t3Ms) / 60000)
      : null;

  const totalTransitMins =
    initialTransitMins !== null || returnTransitMins !== null
      ? (initialTransitMins ?? 0) + (returnTransitMins ?? 0)
      : null;

  let routeExecutionMins: number | null = null;
  let routeExecutionNetMins: number | null = null;
  if (!Number.isNaN(t2Ms) && !Number.isNaN(t3Ms) && t3Ms >= t2Ms) {
    const grossRouteMs = t3Ms - t2Ms;
    routeExecutionMins = Math.round(grossRouteMs / 60000);
    const unionRoutePauseMs = calcUnionEventsDurationMs(
      [refillEvents, breakdownEvents, supportEvents],
      t2Ms,
      t3Ms,
      t3Ms
    );
    routeExecutionNetMins = Math.max(0, Math.round((grossRouteMs - unionRoutePauseMs) / 60000));
  }

  let totalOperationMins: number | null = null;
  let totalOperationNetMins: number | null = null;
  if (!Number.isNaN(t1Ms) && !Number.isNaN(t4Ms) && t4Ms >= t1Ms) {
    const totalOpMs = t4Ms - t1Ms;
    totalOperationMins = Math.round(totalOpMs / 60000);
    const unionOpPauseMs = calcUnionEventsDurationMs(
      [refillEvents, breakdownEvents, supportEvents],
      t1Ms,
      t4Ms,
      t4Ms
    );
    totalOperationNetMins = Math.max(0, Math.round((totalOpMs - unionOpPauseMs) / 60000));
  }

  const refillTotalMins = Math.round(calcEventsDurationMs(refillEvents) / 60000);
  const mechanicalBreakdownTotalMins = Math.round(calcEventsDurationMs(breakdownEvents) / 60000);
  const supportTotalMins = Math.round(calcEventsDurationMs(supportEvents) / 60000);

  return {
    status,
    t1StartShiftAt: t1At,
    t2StartRouteAt: t2At,
    t3EndRouteAt: t3At,
    t4ArriveBaseAt: t4At,
    initialTransitMins,
    routeExecutionMins,
    routeExecutionNetMins,
    returnTransitMins,
    totalTransitMins,
    totalOperationMins,
    totalOperationNetMins,
    refillTotalMins,
    mechanicalBreakdownTotalMins,
    supportTotalMins,
  };
}

export async function fetchDriverShiftsClient(workGroupId?: string): Promise<{ shifts: DriverShift[] }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const requestedGroup = String(workGroupId || '').trim();

  if (user.role === 'supervisor') {
    if (!user.workGroupId) throw new Error('Supervisor sin grupo operativo asignado.');
    if (requestedGroup && requestedGroup !== user.workGroupId) {
      throw new Error('Acceso denegado: no puede consultar datos fuera de su grupo asignado.');
    }
  }
  if (user.role === 'conductor' && user.workGroupId && user.workGroupId !== 'ALL') {
    if (requestedGroup && requestedGroup !== user.workGroupId) {
      throw new Error('Acceso denegado fuera de su grupo operativo.');
    }
  }

  const snap = await getDocs(collection(db, 'driver_shifts'));
  let shifts = snap.docs.map(d => ({ ...(d.data() as Omit<DriverShift, 'id'>), id: d.id }));

  if (user.role === 'supervisor') {
    shifts = shifts.filter(s => s.workGroupId === user.workGroupId);
  } else if (user.role === 'conductor') {
    if (user.workGroupId && user.workGroupId !== 'ALL') {
      shifts = shifts.filter(s => s.workGroupId === user.workGroupId);
    }
    shifts = shifts.filter(
      s => s.createdByUserId === user.id || (user.employeeId && s.driverId === user.employeeId)
    );
  } else if (requestedGroup) {
    shifts = shifts.filter(s => s.workGroupId === requestedGroup);
  }

  shifts.sort((a, b) => (b.t1StartShiftAt || '').localeCompare(a.t1StartShiftAt || ''));
  return { shifts };
}

export async function startDriverShiftClient(payload: {
  workGroupId: string;
  workGroupName?: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  vehicleId?: string;
  routeId?: string;
  routeCode?: string;
  routeName?: string;
}): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();

  const workGroupId = String(payload.workGroupId || '').trim();
  const workGroupName = String(payload.workGroupName || '').trim().slice(0, 100);
  const driverId = String(payload.driverId || '').trim();
  const driverName = String(payload.driverName || '').trim().slice(0, 120);
  const vehicleNumber = String(payload.vehicleNumber || '').trim().slice(0, 50);
  const vehicleId = String(payload.vehicleId || '').trim().slice(0, 128);
  const routeId = String(payload.routeId || '').trim().slice(0, 128);
  const routeCode = String(payload.routeCode || '').trim().slice(0, 50);
  const routeName = String(payload.routeName || '').trim().slice(0, 100);

  if (!workGroupId || !driverId || !driverName || !vehicleNumber) {
    throw new Error('Grupo operativo, nombre del conductor y número de móvil son obligatorios.');
  }
  if (!canAccessGroup(user, workGroupId)) {
    throw new Error('Acceso denegado: no puede iniciar turno en otro grupo operativo.');
  }

  const now = new Date().toISOString();
  const todayDate = new Date().toLocaleDateString('en-CA');
  const docId = generateClientDocId('shift');

  const shiftDoc: Omit<DriverShift, 'id'> = {
    date: todayDate,
    workGroupId,
    workGroupName,
    driverId,
    driverName,
    vehicleNumber,
    vehicleId,
    routeId,
    routeCode,
    routeName,
    createdByUserId: user.id,
    createdByUsername: user.username,
    status: 'EN_TURNO',
    checklistConfirmed: false,
    checklistConfirmedAt: null,
    odometer: null,
    serviceTime: null,
    t1StartShiftAt: now,
    t2StartRouteAt: null,
    t3EndRouteAt: null,
    t4ArriveBaseAt: null,
    isPausedForRefill: false,
    activeRefillId: null,
    pausedPhase: null,
    refillEvents: [],
    isInBreakdown: false,
    activeBreakdownId: null,
    breakdownEvents: [],
    isSupportShift: false,
    parentShiftId: '',
    parentRouteCode: '',
    parentRouteName: '',
    isPausedForSupport: false,
    activeSupportShiftId: '',
    supportEvents: [],
    supportTotalMins: 0,
    initialTransitMins: null,
    routeExecutionMins: null,
    routeExecutionNetMins: null,
    returnTransitMins: null,
    totalTransitMins: null,
    totalOperationMins: null,
    totalOperationNetMins: null,
    refillTotalMins: 0,
    mechanicalBreakdownTotalMins: 0,
    weightTons: null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'driver_shifts', docId), shiftDoc);
  return { shift: { ...shiftDoc, id: docId } };
}

export async function confirmChecklistClient(
  shiftId: string,
  payload: { odometer: number; serviceTime: string }
): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }

  const parsedOdometer = Number(payload.odometer);
  if (
    payload.odometer === undefined ||
    payload.odometer === null ||
    String(payload.odometer).trim() === '' ||
    !Number.isFinite(parsedOdometer) ||
    parsedOdometer < 0
  ) {
    throw new Error('Debe ingresar un valor de Odómetro válido (mayor o igual a 0).');
  }

  const rawServiceTime = typeof payload.serviceTime === 'string' ? payload.serviceTime.trim() : '';
  if (!rawServiceTime || rawServiceTime.length > 50) {
    throw new Error('Debe ingresar el Tiempo de Servicio (máximo 50 caracteres).');
  }

  const cleanOdometer = Number(parsedOdometer.toFixed(2));
  const now = new Date().toISOString();
  const updates = {
    checklistConfirmed: true,
    checklistConfirmedAt: now,
    odometer: cleanOdometer,
    serviceTime: rawServiceTime,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function startRouteClient(shiftId: string): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (!shift.t1StartShiftAt || shift.status !== 'EN_TURNO') {
    throw new Error('Debe registrar primero "Inicio de Turno (T1)" antes de iniciar ruta.');
  }
  if (!shift.checklistConfirmed) {
    throw new Error('Debe confirmar el Checklist Preoperacional del vehículo antes de iniciar ruta.');
  }
  if (shift.isPausedForSupport) {
    throw new Error('La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.');
  }
  if (shift.isPausedForRefill) {
    throw new Error('Debe finalizar el tiempo de Relleno/Descargue antes de avanzar de etapa.');
  }

  const now = new Date().toISOString();
  const t1Ms = new Date(shift.t1StartShiftAt).getTime();
  const t2Ms = new Date(now).getTime();
  const initialTransitMins = Math.max(0, Math.round((t2Ms - t1Ms) / 60000));

  const updates = {
    status: 'EN_RUTA' as DriverShiftStatus,
    t2StartRouteAt: now,
    initialTransitMins,
    totalTransitMins: initialTransitMins,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function endRouteClient(shiftId: string): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (!shift.t2StartRouteAt || shift.status !== 'EN_RUTA') {
    throw new Error('No puede marcar "Fin de Ruta" sin haber marcado "Inicio de Ruta (T2)".');
  }
  if (shift.isPausedForSupport) {
    throw new Error('La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.');
  }
  if (shift.isPausedForRefill) {
    throw new Error('Finalice primero el "Fin de Descargue" para reanudar y cerrar la ruta.');
  }

  const now = new Date().toISOString();
  const t2Ms = new Date(shift.t2StartRouteAt).getTime();
  const t3Ms = new Date(now).getTime();
  const grossMs = Math.max(0, t3Ms - t2Ms);
  const routeExecutionMins = Math.round(grossMs / 60000);

  const unionPauseDuringRouteMs = calcUnionEventsDurationMs(
    [shift.refillEvents || [], shift.breakdownEvents || [], shift.supportEvents || []],
    t2Ms,
    t3Ms,
    t3Ms
  );
  const routeExecutionNetMins = Math.max(0, Math.round((grossMs - unionPauseDuringRouteMs) / 60000));

  const updates = {
    status: 'FIN_RUTA' as DriverShiftStatus,
    t3EndRouteAt: now,
    routeExecutionMins,
    routeExecutionNetMins,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function arriveBaseClient(
  shiftId: string,
  payload?: { weightTons?: number; requireWeight?: boolean }
): Promise<{ shift: DriverShift; parentShift?: DriverShift | null }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (!shift.t3EndRouteAt || shift.status !== 'FIN_RUTA') {
    throw new Error('No puede marcar "Llegada a Base" sin haber marcado "Fin de Ruta (T3)".');
  }
  if (shift.isPausedForSupport) {
    throw new Error('La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.');
  }
  if (shift.isPausedForRefill) {
    throw new Error('Tiene un Relleno/Descargue activo. Registre "Fin de Descargue" antes de finalizar jornada.');
  }
  if (shift.isInBreakdown) {
    throw new Error('Tiene una Avería Mecánica activa. Registre "Fin de Avería" antes de cerrar la jornada.');
  }

  const weightParsed = parseValidatedWeightTons(payload?.weightTons, Boolean(payload?.requireWeight));
  if (!weightParsed.ok) {
    throw new Error(weightParsed.error);
  }

  const now = new Date().toISOString();
  const t1Ms = new Date(shift.t1StartShiftAt).getTime();
  const t3Ms = new Date(shift.t3EndRouteAt).getTime();
  const t4Ms = new Date(now).getTime();

  const returnTransitMins = Math.max(0, Math.round((t4Ms - t3Ms) / 60000));
  const initialTransitVal =
    shift.initialTransitMins !== null && shift.initialTransitMins !== undefined
      ? shift.initialTransitMins
      : shift.t2StartRouteAt
        ? Math.max(0, Math.round((new Date(shift.t2StartRouteAt).getTime() - t1Ms) / 60000))
        : 0;
  const totalTransitMins = initialTransitVal + returnTransitMins;
  const totalOperationMs = Math.max(0, t4Ms - t1Ms);
  const totalOperationMins = Math.round(totalOperationMs / 60000);

  const unionOpPauseMs = calcUnionEventsDurationMs(
    [shift.refillEvents || [], shift.breakdownEvents || [], shift.supportEvents || []],
    t1Ms,
    t4Ms,
    t4Ms
  );
  const totalOperationNetMins = Math.max(0, Math.round((totalOperationMs - unionOpPauseMs) / 60000));

  const updates: Record<string, unknown> = {
    status: 'EN_BASE' as DriverShiftStatus,
    t4ArriveBaseAt: now,
    initialTransitMins: initialTransitVal,
    returnTransitMins,
    totalTransitMins,
    totalOperationMins,
    totalOperationNetMins,
    updatedAt: now,
  };
  if (weightParsed.value !== null) {
    updates.weightTons = weightParsed.value;
  }

  await updateDoc(shiftRef, updates);

  let updatedParentShift: DriverShift | null = null;
  if (shift.isSupportShift && shift.parentShiftId) {
    const parentRef = doc(db, 'driver_shifts', shift.parentShiftId);
    const parentSnap = await getDoc(parentRef);
    if (parentSnap.exists()) {
      const parent = parentSnap.data() as DriverShift;
      const supportEvents = (parent.supportEvents || []).map(ev => {
        if (ev.supportShiftId !== snap.id || ev.endAt) return ev;
        const startMs = new Date(ev.startAt).getTime();
        const diffMs = Math.max(0, t4Ms - startMs);
        return {
          ...ev,
          endAt: now,
          durationSeconds: Math.round(diffMs / 1000),
          durationMins: Math.round(diffMs / 60000),
        };
      });
      const supportTotalMins = Math.round(calcEventsDurationMs(supportEvents) / 60000);
      const parentUpdates = {
        isPausedForSupport: false,
        activeSupportShiftId: '',
        supportEvents,
        supportTotalMins,
        updatedAt: now,
      };
      await updateDoc(parentRef, parentUpdates);
      updatedParentShift = { ...parent, ...parentUpdates, id: parentSnap.id };
    }
  }

  return {
    shift: { ...shift, ...updates, id: snap.id } as DriverShift,
    parentShift: updatedParentShift,
  };
}

export async function startSupportShiftClient(
  parentShiftId: string,
  payload: { routeId?: string; routeCode?: string; routeName?: string }
): Promise<{ supportShift: DriverShift; parentShift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const parentRef = doc(db, 'driver_shifts', parentShiftId);
  const snap = await getDoc(parentRef);
  if (!snap.exists()) throw new Error('Jornada principal no encontrada.');
  const parent = snap.data() as DriverShift;
  if (!canAccessGroup(user, parent.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (parent.status === 'EN_BASE') throw new Error('La jornada principal ya finalizó.');
  if (parent.isSupportShift) throw new Error('Ya se encuentra operando una ruta de Apoyo.');
  if (parent.isPausedForSupport) throw new Error('La jornada actual ya tiene un Apoyo en curso.');
  if (parent.isInBreakdown) {
    throw new Error('Debe finalizar la Avería Mecánica activa antes de iniciar un Apoyo.');
  }
  if (parent.isPausedForRefill) {
    throw new Error('Debe finalizar el Relleno/Descargue activo antes de iniciar un Apoyo.');
  }

  const routeId = String(payload.routeId || '').trim().slice(0, 128);
  const routeCode = String(payload.routeCode || '').trim().slice(0, 50);
  const routeName = String(payload.routeName || '').trim().slice(0, 100);
  if (!routeCode && !routeName && !routeId) {
    throw new Error('Debe seleccionar o indicar la nueva ruta de apoyo.');
  }

  const now = new Date().toISOString();
  const supportShiftId = generateClientDocId('shift');
  const pauseEventId = generateClientDocId('sup');

  const supportShiftDoc: Omit<DriverShift, 'id'> = {
    date: parent.date || new Date().toLocaleDateString('en-CA'),
    workGroupId: parent.workGroupId,
    workGroupName: parent.workGroupName || '',
    driverId: parent.driverId,
    driverName: parent.driverName,
    vehicleNumber: parent.vehicleNumber,
    vehicleId: parent.vehicleId || '',
    routeId,
    routeCode: routeCode || routeName,
    routeName: routeName || routeCode,
    createdByUserId: user.id,
    createdByUsername: user.username,
    status: 'EN_TURNO',
    checklistConfirmed: parent.checklistConfirmed,
    checklistConfirmedAt: parent.checklistConfirmedAt || now,
    odometer: parent.odometer ?? null,
    serviceTime: parent.serviceTime ?? null,
    t1StartShiftAt: now,
    t2StartRouteAt: null,
    t3EndRouteAt: null,
    t4ArriveBaseAt: null,
    isPausedForRefill: false,
    activeRefillId: null,
    pausedPhase: null,
    refillEvents: [],
    isInBreakdown: false,
    activeBreakdownId: null,
    breakdownEvents: [],
    isSupportShift: true,
    parentShiftId: snap.id,
    parentRouteCode: parent.routeCode || '',
    parentRouteName: parent.routeName || '',
    isPausedForSupport: false,
    activeSupportShiftId: '',
    supportEvents: [],
    supportTotalMins: 0,
    initialTransitMins: null,
    routeExecutionMins: null,
    routeExecutionNetMins: null,
    returnTransitMins: null,
    totalTransitMins: null,
    totalOperationMins: null,
    totalOperationNetMins: null,
    refillTotalMins: 0,
    mechanicalBreakdownTotalMins: 0,
    weightTons: null,
    createdAt: now,
    updatedAt: now,
  };

  const newPauseEvent: SupportPauseEvent = {
    id: pauseEventId,
    supportShiftId,
    routeId,
    routeCode: routeCode || routeName,
    routeName: routeName || routeCode,
    startAt: now,
    endAt: null,
    durationMins: null,
    durationSeconds: null,
  };
  const supportEvents = [...(parent.supportEvents || []), newPauseEvent];
  const parentUpdates = {
    isPausedForSupport: true,
    activeSupportShiftId: supportShiftId,
    supportEvents,
    updatedAt: now,
  };

  await setDoc(doc(db, 'driver_shifts', supportShiftId), supportShiftDoc);
  await updateDoc(parentRef, parentUpdates);

  return {
    supportShift: { ...supportShiftDoc, id: supportShiftId },
    parentShift: { ...parent, ...parentUpdates, id: snap.id },
  };
}

export async function finalizePendingShiftClient(
  shiftId: string,
  payload?: { weightTons?: number; requireWeight?: boolean }
): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (shift.status === 'EN_BASE') {
    return { shift: { ...shift, id: snap.id } };
  }
  if (shift.isPausedForSupport) {
    throw new Error('Aún existe una ruta de Apoyo activa.');
  }
  if (shift.isPausedForRefill || shift.isInBreakdown) {
    throw new Error('Finalice cualquier pausa de Relleno o Avería activa antes de cerrar la jornada.');
  }

  const weightParsed = parseValidatedWeightTons(payload?.weightTons, Boolean(payload?.requireWeight));
  if (!weightParsed.ok) {
    throw new Error(weightParsed.error);
  }

  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const t1Ms = new Date(shift.t1StartShiftAt).getTime();
  const t2At = shift.t2StartRouteAt || now;
  const t2Ms = new Date(t2At).getTime();
  const t3At = shift.t3EndRouteAt || now;
  const t3Ms = new Date(t3At).getTime();

  const initialTransitMins =
    shift.initialTransitMins !== null && shift.initialTransitMins !== undefined
      ? shift.initialTransitMins
      : Math.max(0, Math.round((t2Ms - t1Ms) / 60000));

  const grossRouteMs = Math.max(0, t3Ms - t2Ms);
  const routeExecutionMins =
    shift.routeExecutionMins !== null && shift.routeExecutionMins !== undefined
      ? shift.routeExecutionMins
      : Math.round(grossRouteMs / 60000);

  const unionRoutePauseMs = calcUnionEventsDurationMs(
    [shift.refillEvents || [], shift.breakdownEvents || [], shift.supportEvents || []],
    t2Ms,
    t3Ms,
    t3Ms
  );
  const routeExecutionNetMins =
    shift.routeExecutionNetMins !== null && shift.routeExecutionNetMins !== undefined
      ? shift.routeExecutionNetMins
      : Math.max(0, Math.round((grossRouteMs - unionRoutePauseMs) / 60000));

  const returnTransitMins = Math.max(0, Math.round((nowMs - t3Ms) / 60000));
  const totalTransitMins = initialTransitMins + returnTransitMins;
  const totalOperationMs = Math.max(0, nowMs - t1Ms);
  const totalOperationMins = Math.round(totalOperationMs / 60000);
  const unionOpPauseMs = calcUnionEventsDurationMs(
    [shift.refillEvents || [], shift.breakdownEvents || [], shift.supportEvents || []],
    t1Ms,
    nowMs,
    nowMs
  );
  const totalOperationNetMins = Math.max(0, Math.round((totalOperationMs - unionOpPauseMs) / 60000));

  const updates: Record<string, unknown> = {
    status: 'EN_BASE' as DriverShiftStatus,
    t2StartRouteAt: t2At,
    t3EndRouteAt: t3At,
    t4ArriveBaseAt: now,
    initialTransitMins,
    routeExecutionMins,
    routeExecutionNetMins,
    returnTransitMins,
    totalTransitMins,
    totalOperationMins,
    totalOperationNetMins,
    updatedAt: now,
  };
  if (weightParsed.value !== null) {
    updates.weightTons = weightParsed.value;
  }

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } as DriverShift };
}

export async function startRefillClient(shiftId: string): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (shift.status === 'EN_BASE') throw new Error('La jornada ya finalizó en base.');
  if (shift.isPausedForRefill) throw new Error('Ya se encuentra en estado de Relleno/Descargue.');

  const now = new Date().toISOString();
  const eventId = generateClientDocId('refill');
  const newEvent: RefillEvent = {
    id: eventId,
    startAt: now,
    endAt: null,
    durationMins: null,
    durationSeconds: null,
    phaseAtPause: shift.status,
  };
  const refillEvents = [...(shift.refillEvents || []), newEvent];

  const updates = {
    isPausedForRefill: true,
    activeRefillId: eventId,
    pausedPhase: shift.status,
    refillEvents,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function endRefillClient(shiftId: string): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (!shift.isPausedForRefill || !shift.activeRefillId) {
    throw new Error('No hay un tiempo de Relleno/Descargue activo.');
  }

  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const refillEvents = (shift.refillEvents || []).map(ev => {
    if (ev.id !== shift.activeRefillId) return ev;
    const startMs = new Date(ev.startAt).getTime();
    const diffMs = Math.max(0, nowMs - startMs);
    return {
      ...ev,
      endAt: now,
      durationSeconds: Math.round(diffMs / 1000),
      durationMins: Math.round(diffMs / 60000),
    };
  });

  const refillTotalMins = Math.round(calcEventsDurationMs(refillEvents) / 60000);
  const updates = {
    isPausedForRefill: false,
    activeRefillId: null,
    pausedPhase: null,
    refillEvents,
    refillTotalMins,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function startBreakdownClient(
  shiftId: string,
  notes?: string,
  reportedByName?: string
): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }
  if (shift.status === 'EN_BASE') throw new Error('La jornada ya finalizó en base.');
  if (shift.isInBreakdown) throw new Error('Ya existe una avería mecánica activa en curso.');

  const now = new Date().toISOString();
  const eventId = generateClientDocId('brk');
  const cleanNotes = String(notes || '').trim().slice(0, 300);
  const cleanReporter = String(
    reportedByName || shift.driverName || user.fullName || user.username || ''
  )
    .trim()
    .slice(0, 120);

  const newEvent: BreakdownEvent = {
    id: eventId,
    startAt: now,
    endAt: null,
    durationMins: null,
    durationSeconds: null,
    phaseAtIncident: shift.status,
    notes: cleanNotes,
    reportedByName: cleanReporter,
  };
  const breakdownEvents = [...(shift.breakdownEvents || []), newEvent];

  const updates = {
    isInBreakdown: true,
    activeBreakdownId: eventId,
    breakdownEvents,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);

  const auditId = `audit_${eventId}`;
  const auditDoc: Omit<BreakdownAuditLog, 'id'> = {
    shiftId: snap.id,
    breakdownId: eventId,
    date: shift.date || new Date().toLocaleDateString('en-CA'),
    workGroupId: shift.workGroupId,
    workGroupName: shift.workGroupName || '',
    vehicleNumber: shift.vehicleNumber,
    routeCode: shift.routeCode || '',
    routeName: shift.routeName || '',
    driverId: shift.driverId || '',
    driverName: shift.driverName,
    incidentType: 'Avería Mecánica',
    notes: cleanNotes,
    reportedAt: now,
    reportedByUserId: user.id,
    reportedByUsername: user.username,
    reportedByName: cleanReporter,
    status: 'PENDIENTE',
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    acknowledgedByUsername: null,
    acknowledgedByFullName: null,
    acknowledgedByRole: null,
    acknowledgementNotes: null,
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByUsername: null,
    resolvedReportedBy: null,
    resolutionNotes: null,
    durationMins: null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'breakdown_audit_logs', auditId), auditDoc);

  return { shift: { ...shift, ...updates, id: snap.id } };
}

export async function endBreakdownClient(
  shiftId: string,
  payload?: {
    breakdownId?: string;
    resolvedReportedBy?: string;
    resolutionNotes?: string;
    requireReporter?: boolean;
  }
): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado fuera de su grupo.');
  }

  const targetBreakdownId = String(payload?.breakdownId || shift.activeBreakdownId || '').trim();
  const targetEvent = (shift.breakdownEvents || []).find(ev =>
    targetBreakdownId ? ev.id === targetBreakdownId : !ev.endAt
  );
  if (!targetEvent || targetEvent.endAt) {
    throw new Error('No hay una avería mecánica activa para finalizar.');
  }

  const reporterInput = String(payload?.resolvedReportedBy || '').trim().slice(0, 150);
  const resolutionNotes = String(payload?.resolutionNotes || '').trim().slice(0, 300);
  if (payload?.requireReporter && !reporterInput) {
    throw new Error('Debe ingresar el nombre de quien reportó la novedad.');
  }

  const finalReporter =
    reporterInput || targetEvent.reportedByName || shift.driverName || user.fullName || user.username;
  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  let closedDurationMins = 0;

  const breakdownEvents = (shift.breakdownEvents || []).map(ev => {
    if (ev.id !== targetEvent.id) return ev;
    const startMs = new Date(ev.startAt).getTime();
    const diffMs = Math.max(0, nowMs - startMs);
    closedDurationMins = Math.round(diffMs / 60000);
    return {
      ...ev,
      endAt: now,
      durationSeconds: Math.round(diffMs / 1000),
      durationMins: closedDurationMins,
      resolvedByUserId: user.id,
      resolvedByUsername: user.username,
      resolvedReportedBy: finalReporter,
      resolutionNotes: resolutionNotes || '',
    };
  });

  const remainingOpen = breakdownEvents.find(ev => !ev.endAt) || null;
  const mechanicalBreakdownTotalMins = Math.round(calcEventsDurationMs(breakdownEvents) / 60000);

  let updatedRouteExecutionNetMins = shift.routeExecutionNetMins ?? null;
  if (shift.t2StartRouteAt && shift.t3EndRouteAt) {
    const t2Ms = new Date(shift.t2StartRouteAt).getTime();
    const t3Ms = new Date(shift.t3EndRouteAt).getTime();
    if (!Number.isNaN(t2Ms) && !Number.isNaN(t3Ms) && t3Ms >= t2Ms) {
      const unionRoutePauseMs = calcUnionEventsDurationMs(
        [shift.refillEvents || [], breakdownEvents, shift.supportEvents || []],
        t2Ms,
        t3Ms,
        t3Ms
      );
      updatedRouteExecutionNetMins = Math.max(
        0,
        Math.round((t3Ms - t2Ms - unionRoutePauseMs) / 60000)
      );
    }
  }

  const updates: Record<string, unknown> = {
    isInBreakdown: Boolean(remainingOpen),
    activeBreakdownId: remainingOpen ? remainingOpen.id : null,
    breakdownEvents,
    mechanicalBreakdownTotalMins,
    routeExecutionNetMins: updatedRouteExecutionNetMins,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);

  const auditId = `audit_${targetEvent.id}`;
  const auditRef = doc(db, 'breakdown_audit_logs', auditId);
  const auditSnap = await getDoc(auditRef);
  if (auditSnap.exists()) {
    await updateDoc(auditRef, {
      resolvedAt: now,
      resolvedByUserId: user.id,
      resolvedByUsername: user.username,
      resolvedReportedBy: finalReporter,
      resolutionNotes: resolutionNotes || '',
      durationMins: closedDurationMins,
      updatedAt: now,
    });
  }

  return { shift: { ...shift, ...updates, id: snap.id } as DriverShift };
}

export async function acknowledgeBreakdownClient(
  shiftId: string,
  breakdownId: string,
  acknowledgementNotes?: string
): Promise<{ shift: DriverShift; auditLog: BreakdownAuditLog }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  requireRoles(user, ['admin', 'gestion', 'supervisor']);

  const cleanNotes = String(acknowledgementNotes || '').trim().slice(0, 300);
  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado: no puede gestionar alarmas de otro grupo.');
  }

  const targetEvent = (shift.breakdownEvents || []).find(ev => ev.id === breakdownId);
  if (!targetEvent) throw new Error('Evento de avería mecánica no encontrado.');

  const now = new Date().toISOString();
  const breakdownEvents = (shift.breakdownEvents || []).map(ev => {
    if (ev.id !== breakdownId) return ev;
    return {
      ...ev,
      acknowledgedAt: ev.acknowledgedAt || now,
      acknowledgedByUserId: ev.acknowledgedByUserId || user.id,
      acknowledgedByUsername: ev.acknowledgedByUsername || user.username,
      acknowledgedByFullName: ev.acknowledgedByFullName || user.fullName || user.username,
      acknowledgedByRole: ev.acknowledgedByRole || user.role,
      acknowledgementNotes: cleanNotes || ev.acknowledgementNotes || '',
    };
  });

  await updateDoc(shiftRef, {
    breakdownEvents,
    updatedAt: now,
  });

  const auditId = `audit_${breakdownId}`;
  const auditRef = doc(db, 'breakdown_audit_logs', auditId);
  const auditSnap = await getDoc(auditRef);
  let savedAudit: BreakdownAuditLog;

  if (auditSnap.exists()) {
    const existingAudit = auditSnap.data() as BreakdownAuditLog;
    const auditUpdates = {
      status: 'ACEPTADA' as const,
      acknowledgedAt: existingAudit.acknowledgedAt || now,
      acknowledgedByUserId: existingAudit.acknowledgedByUserId || user.id,
      acknowledgedByUsername: existingAudit.acknowledgedByUsername || user.username,
      acknowledgedByFullName: existingAudit.acknowledgedByFullName || user.fullName || user.username,
      acknowledgedByRole: existingAudit.acknowledgedByRole || user.role,
      acknowledgementNotes: cleanNotes || existingAudit.acknowledgementNotes || '',
      updatedAt: now,
    };
    await updateDoc(auditRef, auditUpdates);
    savedAudit = { ...existingAudit, ...auditUpdates, id: auditSnap.id };
  } else {
    const newAudit: Omit<BreakdownAuditLog, 'id'> = {
      shiftId: snap.id,
      breakdownId,
      date: shift.date || new Date().toLocaleDateString('en-CA'),
      workGroupId: shift.workGroupId,
      workGroupName: shift.workGroupName || '',
      vehicleNumber: shift.vehicleNumber,
      routeCode: shift.routeCode || '',
      routeName: shift.routeName || '',
      driverId: shift.driverId || '',
      driverName: shift.driverName,
      incidentType: 'Avería Mecánica',
      notes: targetEvent.notes || '',
      reportedAt: targetEvent.startAt,
      reportedByUserId: shift.createdByUserId,
      reportedByUsername: shift.createdByUsername,
      status: 'ACEPTADA',
      acknowledgedAt: now,
      acknowledgedByUserId: user.id,
      acknowledgedByUsername: user.username,
      acknowledgedByFullName: user.fullName || user.username,
      acknowledgedByRole: user.role,
      acknowledgementNotes: cleanNotes,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(auditRef, newAudit);
    savedAudit = { ...newAudit, id: auditId };
  }

  return {
    shift: { ...shift, breakdownEvents, updatedAt: now, id: snap.id },
    auditLog: savedAudit,
  };
}

export async function fetchBreakdownAuditLogsClient(
  workGroupId?: string
): Promise<{ logs: BreakdownAuditLog[] }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  requireRoles(user, ['admin', 'gestion', 'supervisor']);

  const requestedGroup = String(workGroupId || '').trim();
  if (user.role === 'supervisor') {
    if (!user.workGroupId) throw new Error('Supervisor sin grupo operativo asignado.');
    if (requestedGroup && requestedGroup !== user.workGroupId) {
      throw new Error('Acceso denegado fuera de su grupo asignado.');
    }
  }

  const snap = await getDocs(collection(db, 'breakdown_audit_logs'));
  let logs = snap.docs.map(d => ({ ...(d.data() as Omit<BreakdownAuditLog, 'id'>), id: d.id }));
  if (user.role === 'supervisor') {
    logs = logs.filter(l => l.workGroupId === user.workGroupId);
  } else if (requestedGroup) {
    logs = logs.filter(l => l.workGroupId === requestedGroup);
  }

  logs.sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''));
  return { logs };
}

export async function updateShiftTimesClient(
  shiftId: string,
  payload: {
    t1StartShiftAt?: string;
    t2StartRouteAt?: string | null;
    t3EndRouteAt?: string | null;
    t4ArriveBaseAt?: string | null;
    weightTons?: number | null;
  }
): Promise<{ shift: DriverShift }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  requireRoles(user, ['admin', 'gestion', 'supervisor']);

  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado: no puede modificar tiempos de otro grupo.');
  }

  const parseTimestampInput = (
    raw: unknown,
    fallback: string | null,
    allowClear: boolean,
    fieldLabel: string
  ): { ok: true; value: string | null; error?: string } | { ok: false; value?: string | null; error: string } => {
    if (raw === undefined) return { ok: true, value: fallback };
    if (raw === null || String(raw).trim() === '') {
      if (!allowClear) {
        return { ok: false, error: `${fieldLabel} es obligatorio y no puede quedar vacío.` };
      }
      return { ok: true, value: null };
    }
    const d = new Date(String(raw).trim());
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: `Formato de fecha/hora inválido para ${fieldLabel}.` };
    }
    return { ok: true, value: d.toISOString() };
  };

  const t1Parsed = parseTimestampInput(payload.t1StartShiftAt, shift.t1StartShiftAt, false, 'T1 Inicio Turno');
  if (!t1Parsed.ok) throw new Error(t1Parsed.error);

  const t2Parsed = parseTimestampInput(payload.t2StartRouteAt, shift.t2StartRouteAt ?? null, true, 'T2 Inicio Ruta');
  if (!t2Parsed.ok) throw new Error(t2Parsed.error);

  const t3Parsed = parseTimestampInput(payload.t3EndRouteAt, shift.t3EndRouteAt ?? null, true, 'T3 Fin Ruta');
  if (!t3Parsed.ok) throw new Error(t3Parsed.error);

  const t4Parsed = parseTimestampInput(payload.t4ArriveBaseAt, shift.t4ArriveBaseAt ?? null, true, 'T4 Llegada Base');
  if (!t4Parsed.ok) throw new Error(t4Parsed.error);

  const t1 = t1Parsed.value!;
  const t2 = t2Parsed.value;
  const t3 = t3Parsed.value;
  const t4 = t4Parsed.value;

  if (t3 && !t2) throw new Error('No puede definir T3 Fin de Ruta sin definir T2 Inicio de Ruta.');
  if (t4 && !t3) throw new Error('No puede definir T4 Llegada a Base sin definir T3 Fin de Ruta.');

  const t1Ms = new Date(t1).getTime();
  const t2Ms = t2 ? new Date(t2).getTime() : null;
  const t3Ms = t3 ? new Date(t3).getTime() : null;
  const t4Ms = t4 ? new Date(t4).getTime() : null;

  if (t2Ms !== null && t2Ms < t1Ms) {
    throw new Error('T2 Inicio de Ruta no puede ser anterior a T1 Inicio de Turno.');
  }
  if (t3Ms !== null && t2Ms !== null && t3Ms < t2Ms) {
    throw new Error('T3 Fin de Ruta no puede ser anterior a T2 Inicio de Ruta.');
  }
  if (t4Ms !== null && t3Ms !== null && t4Ms < t3Ms) {
    throw new Error('T4 Llegada a Base no puede ser anterior a T3 Fin de Ruta.');
  }

  let nextWeight = shift.weightTons ?? null;
  if (payload.weightTons !== undefined) {
    const weightParsed = parseValidatedWeightTons(payload.weightTons, false);
    if (!weightParsed.ok) throw new Error(weightParsed.error);
    nextWeight = weightParsed.value;
  }

  const now = new Date().toISOString();
  const recalculated = recalculateShiftDerivedMetrics(shift, {
    t1StartShiftAt: t1,
    t2StartRouteAt: t2,
    t3EndRouteAt: t3,
    t4ArriveBaseAt: t4,
  });

  const updates: Record<string, unknown> = {
    ...recalculated,
    weightTons: nextWeight,
    updatedAt: now,
  };

  await updateDoc(shiftRef, updates);
  return { shift: { ...shift, ...updates, id: snap.id } as DriverShift };
}

export async function addManualShiftEventClient(
  shiftId: string,
  payload: {
    type: 'breakdown' | 'refill';
    startAt: string;
    endAt?: string | null;
    notes?: string;
    reportedByName?: string;
  }
): Promise<{ shift: DriverShift; auditLog?: BreakdownAuditLog }> {
  ensureFirestoreReady();
  const user = await resolveActiveClientUser();
  requireRoles(user, ['admin', 'gestion', 'supervisor']);

  const shiftRef = doc(db, 'driver_shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Jornada no encontrada.');
  const shift = snap.data() as DriverShift;
  if (!canAccessGroup(user, shift.workGroupId)) {
    throw new Error('Acceso denegado: no puede registrar novedades fuera de su grupo.');
  }

  const eventType = String(payload.type || '').trim();
  if (eventType !== 'breakdown' && eventType !== 'refill') {
    throw new Error('El tipo de novedad debe ser "breakdown" (avería) o "refill" (relleno).');
  }

  const startRaw = String(payload.startAt || '').trim();
  if (!startRaw) throw new Error('Debe ingresar la fecha y hora de inicio del evento.');
  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('La hora de inicio ingresada no es válida.');
  }
  const startIso = startDate.toISOString();
  const startMs = startDate.getTime();

  const endRaw = payload.endAt !== undefined && payload.endAt !== null ? String(payload.endAt).trim() : '';
  let endIso: string | null = null;
  let durationSeconds: number | null = null;
  let durationMins: number | null = null;

  if (endRaw) {
    const endDate = new Date(endRaw);
    if (Number.isNaN(endDate.getTime())) {
      throw new Error('La hora de finalización ingresada no es válida.');
    }
    const endMs = endDate.getTime();
    if (endMs < startMs) {
      throw new Error('La hora de finalización no puede ser anterior a la hora de inicio.');
    }
    endIso = endDate.toISOString();
    const diffMs = Math.max(0, endMs - startMs);
    durationSeconds = Math.round(diffMs / 1000);
    durationMins = Math.round(diffMs / 60000);
  }

  const inferPhaseAt = (): DriverShiftStatus => {
    const t2Ms = shift.t2StartRouteAt ? new Date(shift.t2StartRouteAt).getTime() : NaN;
    const t3Ms = shift.t3EndRouteAt ? new Date(shift.t3EndRouteAt).getTime() : NaN;
    const t4Ms = shift.t4ArriveBaseAt ? new Date(shift.t4ArriveBaseAt).getTime() : NaN;
    if (!Number.isNaN(t4Ms) && startMs >= t4Ms) return 'EN_BASE';
    if (!Number.isNaN(t3Ms) && startMs >= t3Ms) return 'FIN_RUTA';
    if (!Number.isNaN(t2Ms) && startMs >= t2Ms) return 'EN_RUTA';
    return shift.status;
  };

  const phaseAtEvent = inferPhaseAt();
  const now = new Date().toISOString();
  const notes = String(payload.notes || '').trim().slice(0, 300);
  const reportedByName = String(
    payload.reportedByName || user.fullName || user.username || shift.driverName
  )
    .trim()
    .slice(0, 120);

  if (eventType === 'refill') {
    if (!endIso && shift.isPausedForRefill) {
      throw new Error(
        'El vehículo ya tiene un relleno activo en curso. Indique hora de fin o cierre el actual.'
      );
    }
    const eventId = generateClientDocId('refill');
    const newRefill: RefillEvent = {
      id: eventId,
      startAt: startIso,
      endAt: endIso,
      durationMins,
      durationSeconds,
      phaseAtPause: phaseAtEvent,
    };
    const refillEvents = [...(shift.refillEvents || []), newRefill].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    const openRefill = refillEvents.find(ev => !ev.endAt) || null;
    const recalculated = recalculateShiftDerivedMetrics(shift, { refillEvents });

    const updates: Record<string, unknown> = {
      refillEvents,
      isPausedForRefill: Boolean(openRefill),
      activeRefillId: openRefill ? openRefill.id : null,
      pausedPhase: openRefill ? shift.pausedPhase || shift.status : null,
      refillTotalMins: recalculated.refillTotalMins,
      routeExecutionNetMins: recalculated.routeExecutionNetMins,
      totalOperationNetMins: recalculated.totalOperationNetMins,
      updatedAt: now,
    };
    await updateDoc(shiftRef, updates);
    return { shift: { ...shift, ...updates, id: snap.id } as DriverShift };
  }

  if (!endIso && shift.isInBreakdown) {
    throw new Error(
      'El vehículo ya tiene una avería mecánica activa. Indique hora de fin o cierre la actual.'
    );
  }
  const eventId = generateClientDocId('brk');
  const newBreakdown: BreakdownEvent = {
    id: eventId,
    startAt: startIso,
    endAt: endIso,
    durationMins,
    durationSeconds,
    phaseAtIncident: phaseAtEvent,
    notes,
    reportedByName,
    acknowledgedAt: now,
    acknowledgedByUserId: user.id,
    acknowledgedByUsername: user.username,
    acknowledgedByFullName: user.fullName || user.username,
    acknowledgedByRole: user.role,
    acknowledgementNotes: 'Registrada manualmente desde Tablero en Vivo',
    ...(endIso
      ? {
          resolvedByUserId: user.id,
          resolvedByUsername: user.username,
          resolvedReportedBy: reportedByName,
          resolutionNotes: notes || 'Cierre registrado desde Tablero en Vivo',
        }
      : {}),
  };

  const breakdownEvents = [...(shift.breakdownEvents || []), newBreakdown].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const openBreakdown = breakdownEvents.find(ev => !ev.endAt) || null;
  const recalculated = recalculateShiftDerivedMetrics(shift, { breakdownEvents });

  const updates: Record<string, unknown> = {
    breakdownEvents,
    isInBreakdown: Boolean(openBreakdown),
    activeBreakdownId: openBreakdown ? openBreakdown.id : null,
    mechanicalBreakdownTotalMins: recalculated.mechanicalBreakdownTotalMins,
    routeExecutionNetMins: recalculated.routeExecutionNetMins,
    totalOperationNetMins: recalculated.totalOperationNetMins,
    updatedAt: now,
  };
  await updateDoc(shiftRef, updates);

  const auditId = `audit_${eventId}`;
  const auditDoc: Omit<BreakdownAuditLog, 'id'> = {
    shiftId: snap.id,
    breakdownId: eventId,
    date: shift.date || new Date().toLocaleDateString('en-CA'),
    workGroupId: shift.workGroupId,
    workGroupName: shift.workGroupName || '',
    vehicleNumber: shift.vehicleNumber,
    routeCode: shift.routeCode || '',
    routeName: shift.routeName || '',
    driverId: shift.driverId || '',
    driverName: shift.driverName,
    incidentType: 'Avería Mecánica',
    notes: notes || 'Registrada manualmente desde Tablero en Vivo',
    reportedAt: startIso,
    reportedByUserId: user.id,
    reportedByUsername: user.username,
    reportedByName,
    status: 'ACEPTADA',
    acknowledgedAt: now,
    acknowledgedByUserId: user.id,
    acknowledgedByUsername: user.username,
    acknowledgedByFullName: user.fullName || user.username,
    acknowledgedByRole: user.role,
    acknowledgementNotes: 'Registrada manualmente desde Tablero en Vivo',
    resolvedAt: endIso,
    resolvedByUserId: endIso ? user.id : null,
    resolvedByUsername: endIso ? user.username : null,
    resolvedReportedBy: endIso ? reportedByName : null,
    resolutionNotes: endIso ? notes || 'Cierre registrado desde Tablero en Vivo' : null,
    durationMins,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'breakdown_audit_logs', auditId), auditDoc);

  return {
    shift: { ...shift, ...updates, id: snap.id } as DriverShift,
    auditLog: { ...auditDoc, id: auditId },
  };
}
