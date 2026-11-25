import { AppUser, AuthSessionUser, BreakdownAuditLog, DriverShift, UserRole } from '../types';
import {
  auth,
  db,
  firebaseProjectId,
  firestoreDatabaseId,
  isFirebaseConfigured,
  missingFirebaseEnvVars,
} from './firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { hashPasswordBrowser, verifyPasswordBrowser } from './clientAuthCrypto';
import {
  acknowledgeBreakdownClient,
  addManualShiftEventClient,
  arriveBaseClient,
  confirmChecklistClient,
  endBreakdownClient,
  endRefillClient,
  endRouteClient,
  fetchBreakdownAuditLogsClient,
  fetchDriverShiftsClient,
  finalizePendingShiftClient,
  startBreakdownClient,
  startDriverShiftClient,
  startRefillClient,
  startRouteClient,
  startSupportShiftClient,
  updateShiftTimesClient,
} from './driverShiftsClient';

const TOKEN_STORAGE_KEY = 'PROMO_AUTH_TOKEN';
const CLIENT_USER_TOKEN_PREFIX = 'fb_user:';
const CLIENT_AUTH_TOKEN_PREFIX = 'fb_auth:';
const VALID_ROLES: ReadonlyArray<UserRole> = ['admin', 'gestion', 'supervisor', 'conductor'];

function shouldUseDirectFirebaseClient(): boolean {
  const isVercelHost =
    typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
  return Boolean(isVercelHost || import.meta.env.PROD);
}

async function useDirectFirestore(): Promise<boolean> {
  if (shouldUseDirectFirebaseClient()) return true;
  return !(await checkBackendHealthApi());
}

function normalizeRole(rawRole: unknown, fallback: UserRole = 'gestion'): UserRole {
  return VALID_ROLES.includes(rawRole as UserRole) ? (rawRole as UserRole) : fallback;
}

function generateClientDocId(prefix: string): string {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}_${Date.now().toString(36)}`;
}

function mapFirebaseClientError(err: any, fallbackMessage: string): Error {
  const code = String(err?.code || '').trim();
  const msg = String(err?.message || '').trim();
  if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
    return new Error(
      `Permisos insuficientes en Firestore (app_users): ${msg || code}`
    );
  }
  if (code === 'unavailable' || msg.toLowerCase().includes('client is offline')) {
    return new Error(
      `No se pudo conectar con Firestore (${firebaseProjectId || 'sin proyecto'} / ${firestoreDatabaseId}): ${msg || code}`
    );
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-email'
  ) {
    return new Error('Usuario o contraseña incorrectos.');
  }
  if (code === 'auth/user-disabled') {
    return new Error('Usuario deshabilitado. Contacte al administrador.');
  }
  if (code === 'auth/too-many-requests') {
    return new Error('Demasiados intentos fallidos. Intente nuevamente en unos minutos.');
  }
  if (code === 'auth/operation-not-allowed') {
    return new Error('El inicio de sesión con Correo/Contraseña no está habilitado en Firebase Auth.');
  }
  return new Error(msg ? (code && !msg.includes(code) ? `${msg} (${code})` : msg) : fallbackMessage);
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 405) {
    cachedHealthResult = false;
    throw new Error(
      'Error 405: El servidor actual es estático (sin backend Express). Recargue la aplicación para operar directamente contra Firestore.'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data as T;
}

async function loginWithFirebaseClient(
  username: string,
  password: string
): Promise<{ token: string; user: AuthSessionUser }> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    throw new Error('Usuario y contraseña obligatorios.');
  }
  if (!isFirebaseConfigured || !db) {
    const missingList =
      missingFirebaseEnvVars.length > 0 ? ` (${missingFirebaseEnvVars.join(', ')})` : '';
    throw new Error(
      `Firebase no está configurado${missingList}. Configura las variables VITE_FIREBASE_* en tu entorno o en Vercel.`
    );
  }

  let allUsersSnap;
  try {
    allUsersSnap = await getDocsFromServer(collection(db, 'app_users'));
  } catch (err: any) {
    console.error('[loginWithFirebaseClient] Error en getDocsFromServer(app_users):', err);
    const realMessage = String(err?.message || '').trim();
    const realCode = String(err?.code || '').trim();
    throw new Error(
      realMessage
        ? realCode && !realMessage.includes(realCode)
          ? `${realMessage} (${realCode})`
          : realMessage
        : realCode || 'Error desconocido al consultar app_users en Firestore.'
    );
  }

  try {
    const normalizedInput = cleanUsername.toLowerCase();
    const userDoc = allUsersSnap.docs.find(
      d => String(d.data().username ?? '').trim().toLowerCase() === normalizedInput
    );

    if (userDoc) {
      const data = userDoc.data();

      if (data.active === false) {
        throw new Error('Usuario deshabilitado. Contacte al administrador.');
      }

      const check = await verifyPasswordBrowser(password, String(data.password || ''));
      if (!check.valid) {
        throw new Error('Usuario o contraseña incorrectos.');
      }

      if (check.needsMigration) {
        try {
          const hashed = await hashPasswordBrowser(password);
          await updateDoc(doc(db, 'app_users', userDoc.id), {
            password: hashed,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Non-fatal if client update is skipped
        }
      }

      const user: AuthSessionUser = {
        id: userDoc.id,
        username: String(data.username || cleanUsername).trim(),
        fullName: String(data.fullName || data.username || cleanUsername),
        role: normalizeRole(data.role, 'gestion'),
        workGroupId: String(data.workGroupId || ''),
        employeeId: String(data.employeeId || ''),
      };

      return {
        token: `${CLIENT_USER_TOKEN_PREFIX}${userDoc.id}`,
        user,
      };
    }

    // Fallback to Firebase Authentication when user enters an email/password account
    if (cleanUsername.includes('@') && auth) {
      const cred = await signInWithEmailAndPassword(auth, cleanUsername, password);
      const fbUser = cred.user;

      // Enrich role/workGroup from app_users if a matching profile doc exists by uid or email
      let matchedData: Record<string, any> | null = null;
      let matchedId = fbUser.uid;
      const uidDoc = await getDocFromServer(doc(db, 'app_users', fbUser.uid)).catch(() => null);
      if (uidDoc && uidDoc.exists()) {
        matchedData = uidDoc.data();
        matchedId = uidDoc.id;
      }

      if (matchedData && matchedData.active === false) {
        await signOut(auth).catch(() => {});
        throw new Error('Usuario deshabilitado. Contacte al administrador.');
      }

      const user: AuthSessionUser = {
        id: matchedId,
        username: String(matchedData?.username || fbUser.email || cleanUsername),
        fullName: String(
          matchedData?.fullName || fbUser.displayName || fbUser.email || cleanUsername
        ),
        role: normalizeRole(matchedData?.role, 'admin'),
        workGroupId: String(matchedData?.workGroupId || ''),
        employeeId: String(matchedData?.employeeId || ''),
      };

      return {
        token: `${CLIENT_AUTH_TOKEN_PREFIX}${fbUser.uid}`,
        user,
      };
    }

    if (allUsersSnap.empty) {
      throw new Error(
        `No hay usuarios registrados en Firestore (proyecto: ${firebaseProjectId || 'no definido'}, base: ${firestoreDatabaseId}, colección: app_users).`
      );
    }

    throw new Error('Usuario o contraseña incorrectos.');
  } catch (err: any) {
    throw mapFirebaseClientError(err, 'Error al verificar credenciales en Firebase.');
  }
}

async function fetchSessionFromFirebaseClient(token: string): Promise<{ user: AuthSessionUser }> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase no configurado.');
  }

  if (token.startsWith(CLIENT_USER_TOKEN_PREFIX)) {
    const docId = token.slice(CLIENT_USER_TOKEN_PREFIX.length);
    if (!docId) throw new Error('Sesión inválida.');
    const userSnap = await getDoc(doc(db, 'app_users', docId));
    if (!userSnap.exists()) throw new Error('Usuario no encontrado.');
    const data = userSnap.data();
    if (data.active === false) throw new Error('Usuario deshabilitado.');

    return {
      user: {
        id: userSnap.id,
        username: String(data.username || ''),
        fullName: String(data.fullName || data.username || ''),
        role: normalizeRole(data.role, 'gestion'),
        workGroupId: String(data.workGroupId || ''),
        employeeId: String(data.employeeId || ''),
      },
    };
  }

  if (token.startsWith(CLIENT_AUTH_TOKEN_PREFIX)) {
    const uid = token.slice(CLIENT_AUTH_TOKEN_PREFIX.length);
    if (!auth) throw new Error('Firebase Auth no disponible.');
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const fbUser = auth.currentUser;
    if (!fbUser || fbUser.uid !== uid) {
      throw new Error('Sesión expirada.');
    }

    let matchedData: Record<string, any> | null = null;
    const uidDoc = await getDoc(doc(db, 'app_users', fbUser.uid)).catch(() => null);
    if (uidDoc && uidDoc.exists()) {
      matchedData = uidDoc.data();
    } else if (fbUser.email) {
      const emailSnap = await getDocs(
        query(collection(db, 'app_users'), where('username', '==', fbUser.email))
      ).catch(() => null);
      if (emailSnap && !emailSnap.empty) {
        matchedData = emailSnap.docs[0].data();
      }
    }

    if (matchedData && matchedData.active === false) {
      throw new Error('Usuario deshabilitado.');
    }

    return {
      user: {
        id: fbUser.uid,
        username: String(matchedData?.username || fbUser.email || fbUser.uid),
        fullName: String(
          matchedData?.fullName || fbUser.displayName || fbUser.email || 'Usuario Firebase'
        ),
        role: normalizeRole(matchedData?.role, 'admin'),
        workGroupId: String(matchedData?.workGroupId || ''),
        employeeId: String(matchedData?.employeeId || ''),
      },
    };
  }

  throw new Error('Sesión no válida en modo estático.');
}

async function fetchUsersFromFirebaseClient(): Promise<{ users: AppUser[] }> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase no está configurado.');
  }
  const snap = await getDocs(collection(db, 'app_users'));
  const users: AppUser[] = snap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        username: String(data.username || ''),
        fullName: String(data.fullName || data.username || ''),
        role: normalizeRole(data.role, 'gestion'),
        workGroupId: String(data.workGroupId || ''),
        employeeId: String(data.employeeId || ''),
        active: data.active !== false,
        createdAt: String(data.createdAt || ''),
        updatedAt: String(data.updatedAt || ''),
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
  return { users };
}

async function createUserInFirebaseClient(payload: {
  username: string;
  password: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
}): Promise<{ user: AppUser }> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase no está configurado.');
  }

  const cleanUsername = payload.username.trim();
  if (!cleanUsername || !payload.password) {
    throw new Error('El usuario y la contraseña son obligatorios.');
  }
  const existing = await getDocs(
    query(collection(db, 'app_users'), where('username', '==', cleanUsername))
  );
  if (!existing.empty) {
    throw new Error('Ya existe un usuario con ese nombre.');
  }

  const now = new Date().toISOString();
  const id = generateClientDocId('user');
  const hashedPassword = await hashPasswordBrowser(payload.password);
  const role = normalizeRole(payload.role, 'gestion');
  const docData = {
    username: cleanUsername,
    password: hashedPassword,
    fullName: (payload.fullName || cleanUsername).trim(),
    role,
    workGroupId: payload.workGroupId || '',
    employeeId: payload.employeeId || '',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'app_users', id), docData);

  return {
    user: {
      id,
      username: docData.username,
      fullName: docData.fullName,
      role: docData.role,
      workGroupId: docData.workGroupId,
      employeeId: docData.employeeId,
      active: docData.active,
      createdAt: docData.createdAt,
      updatedAt: docData.updatedAt,
    },
  };
}

async function updateUserInFirebaseClient(
  id: string,
  payload: {
    fullName?: string;
    role?: UserRole;
    workGroupId?: string;
    employeeId?: string;
    active?: boolean;
    password?: string;
  }
): Promise<{ user: AppUser }> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase no está configurado.');
  }

  const userRef = doc(db, 'app_users', id);
  const currentSnap = await getDoc(userRef);
  if (!currentSnap.exists()) {
    throw new Error('Usuario no encontrado.');
  }

  const current = currentSnap.data();
  const updates: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };
  if (payload.fullName !== undefined) updates.fullName = payload.fullName.trim();
  if (payload.role !== undefined) updates.role = normalizeRole(payload.role, 'gestion');
  if (payload.workGroupId !== undefined) updates.workGroupId = payload.workGroupId;
  if (payload.employeeId !== undefined) updates.employeeId = payload.employeeId;
  if (payload.active !== undefined) updates.active = payload.active;
  if (payload.password && payload.password.trim() !== '') {
    updates.password = await hashPasswordBrowser(payload.password);
  }

  await updateDoc(userRef, updates);

  const merged = { ...current, ...updates };
  return {
    user: {
      id,
      username: String(merged.username || ''),
      fullName: String(merged.fullName || merged.username || ''),
      role: normalizeRole(merged.role, 'gestion'),
      workGroupId: String(merged.workGroupId || ''),
      employeeId: String(merged.employeeId || ''),
      active: merged.active !== false,
      createdAt: String(merged.createdAt || ''),
      updatedAt: String(merged.updatedAt || ''),
    },
  };
}

async function deleteUserInFirebaseClient(id: string): Promise<{ ok: boolean }> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase no está configurado.');
  }
  await deleteDoc(doc(db, 'app_users', id));
  return { ok: true };
}

export async function loginApi(
  username: string,
  password: string
): Promise<{ token: string; user: AuthSessionUser }> {
  if (shouldUseDirectFirebaseClient()) {
    return loginWithFirebaseClient(username, password);
  }
  const hasBackend = await checkBackendHealthApi();
  if (!hasBackend) {
    return loginWithFirebaseClient(username, password);
  }
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutApi(): Promise<void> {
  const token = getAuthToken();
  if (auth?.currentUser) {
    await signOut(auth).catch(() => {});
  }
  if (shouldUseDirectFirebaseClient()) {
    setAuthToken(null);
    return;
  }
  const isClientToken =
    Boolean(token?.startsWith(CLIENT_USER_TOKEN_PREFIX)) ||
    Boolean(token?.startsWith(CLIENT_AUTH_TOKEN_PREFIX));
  if (!isClientToken && (await checkBackendHealthApi())) {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
  setAuthToken(null);
}

export async function fetchSessionApi(): Promise<{ user: AuthSessionUser }> {
  const token = getAuthToken();
  if (
    token &&
    (token.startsWith(CLIENT_USER_TOKEN_PREFIX) || token.startsWith(CLIENT_AUTH_TOKEN_PREFIX))
  ) {
    return fetchSessionFromFirebaseClient(token);
  }
  if (shouldUseDirectFirebaseClient()) {
    throw new Error('Sesión expirada.');
  }
  const hasBackend = await checkBackendHealthApi();
  if (!hasBackend) {
    throw new Error('Sesión expirada.');
  }
  return apiFetch('/api/auth/me');
}

// ── Admin User Management APIs ────────────────────────────────────────────────
export async function fetchUsersApi(): Promise<{ users: AppUser[] }> {
  if (shouldUseDirectFirebaseClient()) {
    return fetchUsersFromFirebaseClient();
  }
  const hasBackend = await checkBackendHealthApi();
  if (hasBackend) {
    return apiFetch('/api/users');
  }
  return fetchUsersFromFirebaseClient();
}

export async function createUserApi(payload: {
  username: string;
  password: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
}): Promise<{ user: AppUser }> {
  if (shouldUseDirectFirebaseClient()) {
    return createUserInFirebaseClient(payload);
  }
  const hasBackend = await checkBackendHealthApi();
  if (hasBackend) {
    return apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  return createUserInFirebaseClient(payload);
}

export async function updateUserApi(
  id: string,
  payload: {
    fullName?: string;
    role?: UserRole;
    workGroupId?: string;
    employeeId?: string;
    active?: boolean;
    password?: string;
  }
): Promise<{ user: AppUser }> {
  if (shouldUseDirectFirebaseClient()) {
    return updateUserInFirebaseClient(id, payload);
  }
  const hasBackend = await checkBackendHealthApi();
  if (hasBackend) {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }
  return updateUserInFirebaseClient(id, payload);
}

export async function deleteUserApi(id: string): Promise<{ ok: boolean }> {
  if (shouldUseDirectFirebaseClient()) {
    return deleteUserInFirebaseClient(id);
  }
  const hasBackend = await checkBackendHealthApi();
  if (hasBackend) {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  return deleteUserInFirebaseClient(id);
}

// ── Driver Operational Time Control APIs ──────────────────────────────────────
export async function fetchDriverShiftsApi(workGroupId?: string): Promise<{ shifts: DriverShift[] }> {
  if (await useDirectFirestore()) {
    return fetchDriverShiftsClient(workGroupId);
  }
  const qs = workGroupId ? `?workGroupId=${encodeURIComponent(workGroupId)}` : '';
  return apiFetch(`/api/driver-shifts${qs}`);
}

export async function startDriverShiftApi(payload: {
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
  if (await useDirectFirestore()) {
    return startDriverShiftClient(payload);
  }
  return apiFetch('/api/driver-shifts/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmChecklistApi(
  shiftId: string,
  payload: { odometer: number; serviceTime: string }
): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return confirmChecklistClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/checklist-ack`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function startRouteApi(shiftId: string): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return startRouteClient(shiftId);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/start-route`, {
    method: 'POST',
  });
}

export async function endRouteApi(shiftId: string): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return endRouteClient(shiftId);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/end-route`, {
    method: 'POST',
  });
}

export async function arriveBaseApi(
  shiftId: string,
  payload?: { weightTons?: number; requireWeight?: boolean }
): Promise<{ shift: DriverShift; parentShift?: DriverShift | null }> {
  if (await useDirectFirestore()) {
    return arriveBaseClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/arrive-base`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function startSupportShiftApi(
  parentShiftId: string,
  payload: { routeId?: string; routeCode?: string; routeName?: string }
): Promise<{ supportShift: DriverShift; parentShift: DriverShift }> {
  if (await useDirectFirestore()) {
    return startSupportShiftClient(parentShiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(parentShiftId)}/support/start`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function finalizePendingShiftApi(
  shiftId: string,
  payload?: { weightTons?: number; requireWeight?: boolean }
): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return finalizePendingShiftClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/finalize-pending`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function startRefillApi(shiftId: string): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return startRefillClient(shiftId);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/refill/start`, {
    method: 'POST',
  });
}

export async function endRefillApi(shiftId: string): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return endRefillClient(shiftId);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/refill/end`, {
    method: 'POST',
  });
}

export async function startBreakdownApi(
  shiftId: string,
  notes?: string,
  reportedByName?: string
): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return startBreakdownClient(shiftId, notes, reportedByName);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/breakdown/start`, {
    method: 'POST',
    body: JSON.stringify({ notes, reportedByName }),
  });
}

export async function endBreakdownApi(
  shiftId: string,
  payload?: {
    breakdownId?: string;
    resolvedReportedBy?: string;
    resolutionNotes?: string;
    requireReporter?: boolean;
  }
): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return endBreakdownClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/breakdown/end`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function acknowledgeBreakdownApi(
  shiftId: string,
  breakdownId: string,
  acknowledgementNotes?: string
): Promise<{ shift: DriverShift; auditLog: BreakdownAuditLog }> {
  if (await useDirectFirestore()) {
    return acknowledgeBreakdownClient(shiftId, breakdownId, acknowledgementNotes);
  }
  return apiFetch(
    `/api/driver-shifts/${encodeURIComponent(shiftId)}/breakdown/${encodeURIComponent(breakdownId)}/acknowledge`,
    {
      method: 'POST',
      body: JSON.stringify({ acknowledgementNotes }),
    }
  );
}

export async function fetchBreakdownAuditLogsApi(workGroupId?: string): Promise<{ logs: BreakdownAuditLog[] }> {
  if (await useDirectFirestore()) {
    return fetchBreakdownAuditLogsClient(workGroupId);
  }
  const qs = workGroupId ? `?workGroupId=${encodeURIComponent(workGroupId)}` : '';
  return apiFetch(`/api/breakdown-audit-logs${qs}`);
}

export async function updateShiftTimesApi(
  shiftId: string,
  payload: {
    t1StartShiftAt?: string;
    t2StartRouteAt?: string | null;
    t3EndRouteAt?: string | null;
    t4ArriveBaseAt?: string | null;
    weightTons?: number | null;
  }
): Promise<{ shift: DriverShift }> {
  if (await useDirectFirestore()) {
    return updateShiftTimesClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/times`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function addManualShiftEventApi(
  shiftId: string,
  payload: {
    type: 'breakdown' | 'refill';
    startAt: string;
    endAt?: string | null;
    notes?: string;
    reportedByName?: string;
  }
): Promise<{ shift: DriverShift; auditLog?: BreakdownAuditLog }> {
  if (await useDirectFirestore()) {
    return addManualShiftEventClient(shiftId, payload);
  }
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/manual-event`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Unified Real-Time Sync APIs (Server Bridge + SSE) ─────────────────────────
let cachedHealthResult: boolean | null = null;

export async function checkBackendHealthApi(force = false): Promise<boolean> {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    cachedHealthResult = false;
    return false;
  }
  if (!force && cachedHealthResult !== null) return cachedHealthResult;
  try {
    const res = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      cachedHealthResult = false;
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      cachedHealthResult = false;
      return false;
    }
    const data = await res.json().catch(() => null);
    cachedHealthResult = Boolean(data && data.ok === true);
    return cachedHealthResult;
  } catch {
    cachedHealthResult = false;
    return false;
  }
}

export interface SyncStatePayload {
  workGroups: any[];
  employees: any[];
  vehicles: any[];
  routes: any[];
  assignments: any[];
  crews: any[];
  attendances: any[];
  driverShifts: DriverShift[];
  breakdownAuditLogs: BreakdownAuditLog[];
  serverTs: string;
}

export async function fetchSyncStateApi(): Promise<SyncStatePayload> {
  return apiFetch('/api/sync/state');
}

export async function syncCreateDocApi<T = any>(
  col: string,
  data: Record<string, any>,
  id?: string
): Promise<{ id: string; doc: T }> {
  return apiFetch(`/api/sync/${encodeURIComponent(col)}`, {
    method: 'POST',
    body: JSON.stringify({ data, ...(id ? { id } : {}) }),
  });
}

export async function syncUpdateDocApi(
  col: string,
  id: string,
  data: Record<string, any>
): Promise<{ id: string; ok: boolean }> {
  return apiFetch(`/api/sync/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  });
}

export async function syncDeleteDocApi(col: string, id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/sync/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function syncBulkEmployeesApi(
  rows: any[],
  activeWorkGroupId?: string | null
): Promise<{ ok: boolean; count: number }> {
  return apiFetch('/api/sync/employees/bulk', {
    method: 'POST',
    body: JSON.stringify({ rows, activeWorkGroupId: activeWorkGroupId || '' }),
  });
}

export async function syncDeleteAllEmployeesApi(): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch('/api/sync/employees/all', {
    method: 'DELETE',
  });
}

export function getSyncStreamUrl(): string {
  const token = getAuthToken();
  return token ? `/api/sync/stream?token=${encodeURIComponent(token)}` : '/api/sync/stream';
}

