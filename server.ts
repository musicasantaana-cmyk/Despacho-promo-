import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';

type UserRole = 'admin' | 'gestion' | 'supervisor' | 'conductor';
type DriverShiftStatus = 'EN_TURNO' | 'EN_RUTA' | 'FIN_RUTA' | 'EN_BASE';

interface RefillEvent {
  id: string;
  startAt: string;
  endAt: string | null;
  durationMins: number | null;
  durationSeconds: number | null;
  phaseAtPause: DriverShiftStatus;
}

interface BreakdownEvent {
  id: string;
  startAt: string;
  endAt: string | null;
  durationMins: number | null;
  durationSeconds: number | null;
  phaseAtIncident: DriverShiftStatus;
  notes?: string;
  reportedByName?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  acknowledgedByUsername?: string | null;
  acknowledgedByFullName?: string | null;
  acknowledgedByRole?: UserRole | null;
  acknowledgementNotes?: string | null;
  resolvedByUserId?: string | null;
  resolvedByUsername?: string | null;
  resolvedReportedBy?: string | null;
  resolutionNotes?: string | null;
}

interface SupportPauseEvent {
  id: string;
  supportShiftId: string;
  routeId?: string;
  routeCode?: string;
  routeName?: string;
  startAt: string;
  endAt: string | null;
  durationMins: number | null;
  durationSeconds: number | null;
}

interface DriverShiftDoc {
  id?: string;
  date: string;
  workGroupId: string;
  workGroupName: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  vehicleId: string;
  routeId?: string;
  routeCode?: string;
  routeName?: string;
  createdByUserId: string;
  createdByUsername: string;
  status: DriverShiftStatus;
  checklistConfirmed: boolean;
  checklistConfirmedAt: string | null;
  t1StartShiftAt: string;
  t2StartRouteAt: string | null;
  t3EndRouteAt: string | null;
  t4ArriveBaseAt: string | null;
  isPausedForRefill: boolean;
  activeRefillId: string | null;
  pausedPhase: DriverShiftStatus | null;
  refillEvents: RefillEvent[];
  isInBreakdown: boolean;
  activeBreakdownId: string | null;
  breakdownEvents: BreakdownEvent[];
  isSupportShift?: boolean;
  parentShiftId?: string;
  parentRouteCode?: string;
  parentRouteName?: string;
  isPausedForSupport?: boolean;
  activeSupportShiftId?: string;
  supportEvents?: SupportPauseEvent[];
  supportTotalMins?: number;
  initialTransitMins: number | null;
  routeExecutionMins: number | null;
  routeExecutionNetMins: number | null;
  returnTransitMins: number | null;
  totalTransitMins?: number | null;
  totalOperationMins: number | null;
  totalOperationNetMins: number | null;
  refillTotalMins: number;
  mechanicalBreakdownTotalMins: number;
  weightTons?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface BreakdownAuditLogDoc {
  id?: string;
  shiftId: string;
  breakdownId: string;
  date: string;
  workGroupId: string;
  workGroupName: string;
  vehicleNumber: string;
  routeCode: string;
  routeName: string;
  driverId: string;
  driverName: string;
  incidentType: string;
  notes: string;
  reportedAt: string;
  reportedByUserId: string;
  reportedByUsername: string;
  reportedByName?: string;
  status: 'PENDIENTE' | 'ACEPTADA';
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  acknowledgedByUsername: string | null;
  acknowledgedByFullName: string | null;
  acknowledgedByRole: string | null;
  acknowledgementNotes: string | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  resolvedByUsername?: string | null;
  resolvedReportedBy?: string | null;
  resolutionNotes?: string | null;
  durationMins?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionUser {
  id: string;
  username: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
}

interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto
        .createHash('sha256')
        .update(`${firebaseConfig.apiKey}:${firebaseConfig.appId}:promo-rbac-v1`)
        .digest('hex');

const MASTER_USERNAME = 'wefd';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'Sara0519';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'promo_session';

const VALID_ROLES: UserRole[] = ['admin', 'gestion', 'supervisor', 'conductor'];

function generateDocId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}_${Date.now().toString(36)}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string): { valid: boolean; needsMigration: boolean } {
  if (!stored) return { valid: false, needsMigration: false };
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsMigration: false };
    const [, salt, hexHash] = parts;
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hexHash, 'hex');
    if (derived.length !== storedBuf.length) return { valid: false, needsMigration: false };
    return { valid: crypto.timingSafeEqual(derived, storedBuf), needsMigration: false };
  }
  // Backward-compatible verification for legacy plaintext records in app_users
  const a = Buffer.from(password, 'utf-8');
  const b = Buffer.from(stored, 'utf-8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { valid, needsMigration: valid };
}

function signSessionToken(user: SessionUser): string {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    workGroupId: user.workGroupId || '',
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): { sub: string; username: string; role: UserRole; workGroupId: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig, 'utf-8');
    const b = Buffer.from(expectedSig, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!payload || !payload.sub || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión no iniciada o token ausente.' });
    return;
  }

  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
    return;
  }

  if (verified.sub === 'master_wefd') {
    req.user = {
      id: 'master_wefd',
      username: MASTER_USERNAME,
      fullName: 'Administrador Maestro',
      role: 'admin',
      workGroupId: '',
    };
    next();
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, 'app_users', verified.sub));
    if (!userSnap.exists()) {
      res.status(401).json({ error: 'El usuario ya no existe.' });
      return;
    }
    const data = userSnap.data();
    if (data.active === false) {
      res.status(403).json({ error: 'Usuario desactivado por el administrador.' });
      return;
    }
    const role: UserRole = VALID_ROLES.includes(data.role) ? data.role : 'gestion';
    req.user = {
      id: userSnap.id,
      username: data.username,
      fullName: data.fullName || data.username,
      role,
      workGroupId: data.workGroupId || '',
      employeeId: data.employeeId || '',
    };
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(500).json({ error: 'Error verificando sesión.' });
  }
}

function requireRole(allowed: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: 'No tiene permisos suficientes para realizar esta acción.' });
      return;
    }
    next();
  };
}

function canAccessGroup(user: SessionUser, targetGroupId: string): boolean {
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
  shift: DriverShiftDoc,
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
  const t2At = overrides.t2StartRouteAt !== undefined ? overrides.t2StartRouteAt : (shift.t2StartRouteAt ?? null);
  const t3At = overrides.t3EndRouteAt !== undefined ? overrides.t3EndRouteAt : (shift.t3EndRouteAt ?? null);
  const t4At = overrides.t4ArriveBaseAt !== undefined ? overrides.t4ArriveBaseAt : (shift.t4ArriveBaseAt ?? null);

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

function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ── Health Check ────────────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // ── Auth Routes ─────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const rawUsername = String(req.body?.username || '').trim();
    const rawPassword = String(req.body?.password || '');

    if (!rawUsername || !rawPassword) {
      res.status(400).json({ error: 'Usuario y contraseña obligatorios.' });
      return;
    }

    if (rawUsername === MASTER_USERNAME && rawPassword === MASTER_PASSWORD) {
      const user: SessionUser = {
        id: 'master_wefd',
        username: MASTER_USERNAME,
        fullName: 'Administrador Maestro',
        role: 'admin',
        workGroupId: '',
      };
      const token = signSessionToken(user);
      setSessionCookie(res, token);
      res.json({ token, user });
      return;
    }

    try {
      const q = query(collection(db, 'app_users'), where('username', '==', rawUsername));
      const snap = await getDocs(q);
      if (snap.empty) {
        res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        return;
      }

      const userDoc = snap.docs[0];
      const data = userDoc.data();

      if (data.active === false) {
        res.status(403).json({ error: 'Usuario deshabilitado. Contacte al administrador.' });
        return;
      }

      const check = verifyPassword(rawPassword, String(data.password || ''));
      if (!check.valid) {
        res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        return;
      }

      // Seamlessly upgrade legacy plaintext passwords to salted scrypt hash
      if (check.needsMigration) {
        await updateDoc(doc(db, 'app_users', userDoc.id), {
          password: hashPassword(rawPassword),
          updatedAt: new Date().toISOString(),
        });
      }

      const role: UserRole = VALID_ROLES.includes(data.role) ? data.role : 'gestion';
      const user: SessionUser = {
        id: userDoc.id,
        username: data.username,
        fullName: data.fullName || data.username,
        role,
        workGroupId: data.workGroupId || '',
        employeeId: data.employeeId || '',
      };

      const token = signSessionToken(user);
      setSessionCookie(res, token);
      res.json({ token, user });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Error al verificar credenciales.' });
    }
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'none', secure: true });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // ── System Config Endpoint (Admin ONLY) ─────────────────────────────────────
  app.get('/api/system/config', authenticate, requireRole(['admin']), (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      rbacEnabled: true,
      roles: VALID_ROLES,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    });
  });

  // ── User Administration Endpoints (Admin ONLY) ──────────────────────────────
  app.get('/api/users', authenticate, requireRole(['admin']), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const snap = await getDocs(collection(db, 'app_users'));
      const users = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          username: data.username,
          fullName: data.fullName || data.username,
          role: VALID_ROLES.includes(data.role) ? data.role : 'gestion',
          workGroupId: data.workGroupId || '',
          employeeId: data.employeeId || '',
          active: data.active !== false,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
        };
      });
      res.json({ users });
    } catch (err) {
      console.error('GET /api/users error:', err);
      res.status(500).json({ error: 'Error al consultar usuarios.' });
    }
  });

  app.post('/api/users', authenticate, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const fullName = String(req.body?.fullName || username).trim();
      const role = req.body?.role as UserRole;
      const workGroupId = String(req.body?.workGroupId || '').trim();
      const employeeId = String(req.body?.employeeId || '').trim();

      if (!username || username.length > 100) {
        res.status(400).json({ error: 'El nombre de usuario es obligatorio (máx. 100 caracteres).' });
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
      }
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: 'Rol inválido.' });
        return;
      }
      if (role === 'supervisor' && !workGroupId) {
        res.status(400).json({ error: 'Un Supervisor debe estar vinculado a un grupo operativo específico.' });
        return;
      }
      if (username === MASTER_USERNAME) {
        res.status(409).json({ error: 'No se puede duplicar el usuario maestro.' });
        return;
      }

      const existing = await getDocs(query(collection(db, 'app_users'), where('username', '==', username)));
      if (!existing.empty) {
        res.status(409).json({ error: 'El nombre de usuario ya existe.' });
        return;
      }

      const now = new Date().toISOString();
      const docId = generateDocId('user');
      const newDoc = {
        username,
        password: hashPassword(password),
        fullName: fullName.slice(0, 120),
        role,
        workGroupId: role === 'admin' || role === 'gestion' ? workGroupId : workGroupId,
        employeeId,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'app_users', docId), newDoc);
      res.status(201).json({
        user: {
          id: docId,
          username: newDoc.username,
          fullName: newDoc.fullName,
          role: newDoc.role,
          workGroupId: newDoc.workGroupId,
          employeeId: newDoc.employeeId,
          active: newDoc.active,
          createdAt: newDoc.createdAt,
          updatedAt: newDoc.updatedAt,
        },
      });
    } catch (err) {
      console.error('POST /api/users error:', err);
      res.status(500).json({ error: 'Error al crear usuario.' });
    }
  });

  app.patch('/api/users/:id', authenticate, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userRef = doc(db, 'app_users', id);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }
      const existingData = snap.data();

      const nextRole: UserRole = req.body?.role ? req.body.role : existingData.role || 'gestion';
      if (!VALID_ROLES.includes(nextRole)) {
        res.status(400).json({ error: 'Rol inválido.' });
        return;
      }

      const nextWorkGroupId =
        req.body?.workGroupId !== undefined ? String(req.body.workGroupId).trim() : existingData.workGroupId || '';
      if (nextRole === 'supervisor' && !nextWorkGroupId) {
        res.status(400).json({ error: 'Un Supervisor debe estar vinculado a un grupo operativo específico.' });
        return;
      }

      const fullName =
        req.body?.fullName !== undefined ? String(req.body.fullName).trim().slice(0, 120) : existingData.fullName || existingData.username;
      const employeeId =
        req.body?.employeeId !== undefined ? String(req.body.employeeId).trim() : existingData.employeeId || '';
      const active = req.body?.active !== undefined ? Boolean(req.body.active) : existingData.active !== false;

      const updatedFields: Record<string, unknown> = {
        fullName,
        role: nextRole,
        workGroupId: nextWorkGroupId,
        employeeId,
        active,
        updatedAt: new Date().toISOString(),
      };

      if (req.body?.password) {
        const pw = String(req.body.password);
        if (pw.length < 6) {
          res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
          return;
        }
        updatedFields.password = hashPassword(pw);
      }

      await updateDoc(userRef, updatedFields);
      res.json({
        user: {
          id,
          username: existingData.username,
          fullName,
          role: nextRole,
          workGroupId: nextWorkGroupId,
          employeeId,
          active,
          createdAt: existingData.createdAt || '',
          updatedAt: updatedFields.updatedAt,
        },
      });
    } catch (err) {
      console.error('PATCH /api/users/:id error:', err);
      res.status(500).json({ error: 'Error al actualizar usuario.' });
    }
  });

  app.delete('/api/users/:id', authenticate, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userRef = doc(db, 'app_users', id);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }
      await deleteDoc(userRef);
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/users/:id error:', err);
      res.status(500).json({ error: 'Error al eliminar usuario.' });
    }
  });

  // ── Driver Operational Shifts (Módulo Conductores) ──────────────────────────
  app.get('/api/driver-shifts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const requestedGroup = String(req.query.workGroupId || '').trim();

      if (user.role === 'supervisor') {
        if (!user.workGroupId) {
          res.status(403).json({ error: 'Supervisor sin grupo operativo asignado.' });
          return;
        }
        if (requestedGroup && requestedGroup !== user.workGroupId) {
          res.status(403).json({ error: 'Acceso denegado: no puede consultar datos fuera de su grupo asignado.' });
          return;
        }
      }

      if (user.role === 'conductor' && user.workGroupId && user.workGroupId !== 'ALL') {
        if (requestedGroup && requestedGroup !== user.workGroupId) {
          res.status(403).json({ error: 'Acceso denegado fuera de su grupo operativo.' });
          return;
        }
      }

      const snap = await getDocs(collection(db, 'driver_shifts'));
      let shifts = snap.docs.map(d => ({ ...(d.data() as DriverShiftDoc), id: d.id }));

      if (user.role === 'supervisor') {
        shifts = shifts.filter(s => s.workGroupId === user.workGroupId);
      } else if (user.role === 'conductor') {
        if (user.workGroupId && user.workGroupId !== 'ALL') {
          shifts = shifts.filter(s => s.workGroupId === user.workGroupId);
        }
        shifts = shifts.filter(s => s.createdByUserId === user.id || (user.employeeId && s.driverId === user.employeeId));
      } else if (requestedGroup) {
        shifts = shifts.filter(s => s.workGroupId === requestedGroup);
      }

      shifts.sort((a, b) => (b.t1StartShiftAt || '').localeCompare(a.t1StartShiftAt || ''));
      res.json({ shifts });
    } catch (err) {
      console.error('GET /api/driver-shifts error:', err);
      res.status(500).json({ error: 'Error al obtener jornadas de conductores.' });
    }
  });

  // Button 1: Inicio de Turno (T1)
  app.post('/api/driver-shifts/start', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const workGroupId = String(req.body?.workGroupId || '').trim();
      const workGroupName = String(req.body?.workGroupName || '').trim().slice(0, 100);
      const driverId = String(req.body?.driverId || '').trim();
      const driverName = String(req.body?.driverName || '').trim().slice(0, 120);
      const vehicleNumber = String(req.body?.vehicleNumber || '').trim().slice(0, 50);
      const vehicleId = String(req.body?.vehicleId || '').trim().slice(0, 128);
      const routeId = String(req.body?.routeId || '').trim().slice(0, 128);
      const routeCode = String(req.body?.routeCode || '').trim().slice(0, 50);
      const routeName = String(req.body?.routeName || '').trim().slice(0, 100);

      if (!workGroupId || !driverId || !driverName || !vehicleNumber) {
        res.status(400).json({ error: 'Grupo operativo, nombre del conductor y número de móvil son obligatorios.' });
        return;
      }

      if (!canAccessGroup(user, workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado: no puede iniciar turno en otro grupo operativo.' });
        return;
      }

      const now = new Date().toISOString();
      const todayDate = new Date().toLocaleDateString('en-CA');
      const docId = generateDocId('shift');

      const shiftDoc: Omit<DriverShiftDoc, 'id'> = {
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
      res.status(201).json({ shift: { ...shiftDoc, id: docId } });
    } catch (err) {
      console.error('POST /api/driver-shifts/start error:', err);
      res.status(500).json({ error: 'Error al registrar inicio de turno.' });
    }
  });

  // Checklist Preoperacional Confirmation
  app.post('/api/driver-shifts/:id/checklist-ack', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }

      const now = new Date().toISOString();
      await updateDoc(shiftRef, {
        checklistConfirmed: true,
        checklistConfirmedAt: now,
        updatedAt: now,
      });

      res.json({ shift: { ...shift, id: snap.id, checklistConfirmed: true, checklistConfirmedAt: now, updatedAt: now } });
    } catch (err) {
      console.error('checklist-ack error:', err);
      res.status(500).json({ error: 'Error al confirmar checklist preoperacional.' });
    }
  });

  // Button 2: Inicio de Ruta (T2)
  app.post('/api/driver-shifts/:id/start-route', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (!shift.t1StartShiftAt || shift.status !== 'EN_TURNO') {
        res.status(409).json({ error: 'Debe registrar primero "Inicio de Turno (T1)" antes de iniciar ruta.' });
        return;
      }
      if (!shift.checklistConfirmed) {
        res.status(409).json({ error: 'Debe confirmar el Checklist Preoperacional del vehículo antes de iniciar ruta.' });
        return;
      }
      if (shift.isPausedForSupport) {
        res.status(409).json({ error: 'La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.' });
        return;
      }
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Debe finalizar el tiempo de Relleno/Descargue antes de avanzar de etapa.' });
        return;
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
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('start-route error:', err);
      res.status(500).json({ error: 'Error al registrar inicio de ruta.' });
    }
  });

  // Button 3: Fin de Ruta (T3)
  app.post('/api/driver-shifts/:id/end-route', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (!shift.t2StartRouteAt || shift.status !== 'EN_RUTA') {
        res.status(409).json({ error: 'No puede marcar "Fin de Ruta" sin haber marcado "Inicio de Ruta (T2)".' });
        return;
      }
      if (shift.isPausedForSupport) {
        res.status(409).json({ error: 'La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.' });
        return;
      }
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Finalice primero el "Fin de Descargue" para reanudar y cerrar la ruta.' });
        return;
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
      const routeExecutionNetMins = Math.max(
        0,
        Math.round((grossMs - unionPauseDuringRouteMs) / 60000)
      );

      const updates = {
        status: 'FIN_RUTA' as DriverShiftStatus,
        t3EndRouteAt: now,
        routeExecutionMins,
        routeExecutionNetMins,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('end-route error:', err);
      res.status(500).json({ error: 'Error al registrar fin de ruta.' });
    }
  });

  // Button 4: Llegada a Base (T4)
  app.post('/api/driver-shifts/:id/arrive-base', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (!shift.t3EndRouteAt || shift.status !== 'FIN_RUTA') {
        res.status(409).json({ error: 'No puede marcar "Llegada a Base" sin haber marcado "Fin de Ruta (T3)".' });
        return;
      }
      if (shift.isPausedForSupport) {
        res.status(409).json({ error: 'La ruta actual está pausada por un Apoyo activo. Finalice el Apoyo primero.' });
        return;
      }
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Tiene un Relleno/Descargue activo. Registre "Fin de Descargue" antes de finalizar jornada.' });
        return;
      }
      if (shift.isInBreakdown) {
        res.status(409).json({ error: 'Tiene una Avería Mecánica activa. Registre "Fin de Avería" antes de cerrar la jornada.' });
        return;
      }

      const weightParsed = parseValidatedWeightTons(
        req.body?.weightTons,
        Boolean(req.body?.requireWeight)
      );
      if (!weightParsed.ok) {
        res.status(400).json({ error: weightParsed.error });
        return;
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
      const totalOperationNetMins = Math.max(
        0,
        Math.round((totalOperationMs - unionOpPauseMs) / 60000)
      );

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

      let updatedParentShift: DriverShiftDoc | null = null;
      if (shift.isSupportShift && shift.parentShiftId) {
        const parentRef = doc(db, 'driver_shifts', shift.parentShiftId);
        const parentSnap = await getDoc(parentRef);
        if (parentSnap.exists()) {
          const parent = parentSnap.data() as DriverShiftDoc;
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

      res.json({
        shift: { ...shift, ...updates, id: snap.id },
        parentShift: updatedParentShift,
      });
    } catch (err) {
      console.error('arrive-base error:', err);
      res.status(500).json({ error: 'Error al registrar llegada a base.' });
    }
  });

  // Start Support Route ("APOYO"): pauses active primary shift and launches linked support shift
  app.post('/api/driver-shifts/:id/support/start', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const parentRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada principal no encontrada.' });
        return;
      }
      const parent = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, parent.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (parent.status === 'EN_BASE') {
        res.status(409).json({ error: 'La jornada principal ya finalizó.' });
        return;
      }
      if (parent.isSupportShift) {
        res.status(409).json({ error: 'Ya se encuentra operando una ruta de Apoyo.' });
        return;
      }
      if (parent.isPausedForSupport) {
        res.status(409).json({ error: 'La jornada actual ya tiene un Apoyo en curso.' });
        return;
      }
      if (parent.isInBreakdown) {
        res.status(409).json({ error: 'Debe finalizar la Avería Mecánica activa antes de iniciar un Apoyo.' });
        return;
      }
      if (parent.isPausedForRefill) {
        res.status(409).json({ error: 'Debe finalizar el Relleno/Descargue activo antes de iniciar un Apoyo.' });
        return;
      }

      const routeId = String(req.body?.routeId || '').trim().slice(0, 128);
      const routeCode = String(req.body?.routeCode || '').trim().slice(0, 50);
      const routeName = String(req.body?.routeName || '').trim().slice(0, 100);
      if (!routeCode && !routeName && !routeId) {
        res.status(400).json({ error: 'Debe seleccionar o indicar la nueva ruta de apoyo.' });
        return;
      }

      const now = new Date().toISOString();
      const supportShiftId = generateDocId('shift');
      const pauseEventId = generateDocId('sup');

      const supportShiftDoc: Omit<DriverShiftDoc, 'id'> = {
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

      res.status(201).json({
        supportShift: { ...supportShiftDoc, id: supportShiftId },
        parentShift: { ...parent, ...parentUpdates, id: snap.id },
      });
    } catch (err) {
      console.error('support/start error:', err);
      res.status(500).json({ error: 'Error al iniciar la ruta de apoyo.' });
    }
  });

  // Finalize pending primary shift directly after returning from a Support shift
  app.post('/api/driver-shifts/:id/finalize-pending', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (shift.status === 'EN_BASE') {
        res.json({ shift: { ...shift, id: snap.id } });
        return;
      }
      if (shift.isPausedForSupport) {
        res.status(409).json({ error: 'Aún existe una ruta de Apoyo activa.' });
        return;
      }
      if (shift.isPausedForRefill || shift.isInBreakdown) {
        res.status(409).json({ error: 'Finalice cualquier pausa de Relleno o Avería activa antes de cerrar la jornada.' });
        return;
      }

      const weightParsed = parseValidatedWeightTons(
        req.body?.weightTons,
        Boolean(req.body?.requireWeight)
      );
      if (!weightParsed.ok) {
        res.status(400).json({ error: weightParsed.error });
        return;
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
      const totalOperationNetMins = Math.max(
        0,
        Math.round((totalOperationMs - unionOpPauseMs) / 60000)
      );

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
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('finalize-pending error:', err);
      res.status(500).json({ error: 'Error al finalizar la jornada pendiente.' });
    }
  });

  // Control 5: Inicio de Relleno / Descargue (Pause)
  app.post('/api/driver-shifts/:id/refill/start', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (shift.status === 'EN_BASE') {
        res.status(409).json({ error: 'La jornada ya finalizó en base.' });
        return;
      }
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Ya se encuentra en estado de Relleno/Descargue.' });
        return;
      }

      const now = new Date().toISOString();
      const eventId = generateDocId('refill');
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
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('refill/start error:', err);
      res.status(500).json({ error: 'Error al iniciar tiempo de relleno.' });
    }
  });

  // Control 5: Fin de Descargue (Resume)
  app.post('/api/driver-shifts/:id/refill/end', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (!shift.isPausedForRefill || !shift.activeRefillId) {
        res.status(409).json({ error: 'No hay un tiempo de Relleno/Descargue activo.' });
        return;
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

      const totalRefillMs = calcEventsDurationMs(refillEvents);
      const refillTotalMins = Math.round(totalRefillMs / 60000);

      const updates = {
        isPausedForRefill: false,
        activeRefillId: null,
        pausedPhase: null,
        refillEvents,
        refillTotalMins,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('refill/end error:', err);
      res.status(500).json({ error: 'Error al finalizar descargue.' });
    }
  });

  // Control 6: Reportar Avería Mecánica
  app.post('/api/driver-shifts/:id/breakdown/start', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }
      if (shift.status === 'EN_BASE') {
        res.status(409).json({ error: 'La jornada ya finalizó en base.' });
        return;
      }
      if (shift.isInBreakdown) {
        res.status(409).json({ error: 'Ya existe una avería mecánica activa en curso.' });
        return;
      }

      const now = new Date().toISOString();
      const eventId = generateDocId('brk');
      const notes = String(req.body?.notes || '').trim().slice(0, 300);
      const reportedByName = String(req.body?.reportedByName || shift.driverName || user.fullName || user.username || '')
        .trim()
        .slice(0, 120);
      const newEvent: BreakdownEvent = {
        id: eventId,
        startAt: now,
        endAt: null,
        durationMins: null,
        durationSeconds: null,
        phaseAtIncident: shift.status,
        notes,
        reportedByName,
      };
      const breakdownEvents = [...(shift.breakdownEvents || []), newEvent];

      const updates = {
        isInBreakdown: true,
        activeBreakdownId: eventId,
        breakdownEvents,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);

      // Persist initial audit entry for mechanical breakdown alarm
      const auditId = `audit_${eventId}`;
      const auditDoc: Omit<BreakdownAuditLogDoc, 'id'> = {
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
        notes,
        reportedAt: now,
        reportedByUserId: user.id,
        reportedByUsername: user.username,
        reportedByName,
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

      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('breakdown/start error:', err);
      res.status(500).json({ error: 'Error al reportar avería mecánica.' });
    }
  });

  // Control 6: Fin de Avería / Vehículo Operativo (Conductor o Controlador/Supervisor en Tablero)
  app.post('/api/driver-shifts/:id/breakdown/end', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const shiftRef = doc(db, 'driver_shifts', req.params.id);
      const snap = await getDoc(shiftRef);
      if (!snap.exists()) {
        res.status(404).json({ error: 'Jornada no encontrada.' });
        return;
      }
      const shift = snap.data() as DriverShiftDoc;
      if (!canAccessGroup(user, shift.workGroupId)) {
        res.status(403).json({ error: 'Acceso denegado fuera de su grupo.' });
        return;
      }

      const targetBreakdownId = String(req.body?.breakdownId || shift.activeBreakdownId || '').trim();
      const targetEvent = (shift.breakdownEvents || []).find(
        ev => (targetBreakdownId ? ev.id === targetBreakdownId : !ev.endAt)
      );
      if (!targetEvent || targetEvent.endAt) {
        res.status(409).json({ error: 'No hay una avería mecánica activa para finalizar.' });
        return;
      }

      const reporterInput = String(req.body?.resolvedReportedBy || req.body?.reportedBy || '').trim().slice(0, 150);
      const resolutionNotes = String(req.body?.resolutionNotes || '').trim().slice(0, 300);
      const requireReporter = Boolean(req.body?.requireReporter);
      if (requireReporter && !reporterInput) {
        res.status(400).json({ error: 'Debe ingresar el nombre de quien reportó la novedad.' });
        return;
      }

      const finalReporter = reporterInput || targetEvent.reportedByName || shift.driverName || user.fullName || user.username;
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
      const totalBreakdownMs = calcEventsDurationMs(breakdownEvents);
      const mechanicalBreakdownTotalMins = Math.round(totalBreakdownMs / 60000);

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
          updatedRouteExecutionNetMins = Math.max(0, Math.round((t3Ms - t2Ms - unionRoutePauseMs) / 60000));
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

      // Sync closure details to breakdown_audit_logs
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

      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('breakdown/end error:', err);
      res.status(500).json({ error: 'Error al finalizar avería mecánica.' });
    }
  });

  // Acknowledge mechanical breakdown alarm (Controller / Supervisor / Gestión / Admin) & record audit log
  app.post(
    '/api/driver-shifts/:id/breakdown/:breakdownId/acknowledge',
    authenticate,
    requireRole(['admin', 'gestion', 'supervisor']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const { id: shiftId, breakdownId } = req.params;
        const acknowledgementNotes = String(req.body?.acknowledgementNotes || '').trim().slice(0, 300);

        const shiftRef = doc(db, 'driver_shifts', shiftId);
        const snap = await getDoc(shiftRef);
        if (!snap.exists()) {
          res.status(404).json({ error: 'Jornada no encontrada.' });
          return;
        }
        const shift = snap.data() as DriverShiftDoc;
        if (!canAccessGroup(user, shift.workGroupId)) {
          res.status(403).json({ error: 'Acceso denegado: no puede gestionar alarmas de otro grupo.' });
          return;
        }

        const targetEvent = (shift.breakdownEvents || []).find(ev => ev.id === breakdownId);
        if (!targetEvent) {
          res.status(404).json({ error: 'Evento de avería mecánica no encontrado.' });
          return;
        }

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
            acknowledgementNotes: acknowledgementNotes || ev.acknowledgementNotes || '',
          };
        });

        await updateDoc(shiftRef, {
          breakdownEvents,
          updatedAt: now,
        });

        const auditId = `audit_${breakdownId}`;
        const auditRef = doc(db, 'breakdown_audit_logs', auditId);
        const auditSnap = await getDoc(auditRef);
        let savedAudit: BreakdownAuditLogDoc;

        if (auditSnap.exists()) {
          const existingAudit = auditSnap.data() as BreakdownAuditLogDoc;
          const auditUpdates = {
            status: 'ACEPTADA' as const,
            acknowledgedAt: existingAudit.acknowledgedAt || now,
            acknowledgedByUserId: existingAudit.acknowledgedByUserId || user.id,
            acknowledgedByUsername: existingAudit.acknowledgedByUsername || user.username,
            acknowledgedByFullName: existingAudit.acknowledgedByFullName || user.fullName || user.username,
            acknowledgedByRole: existingAudit.acknowledgedByRole || user.role,
            acknowledgementNotes: acknowledgementNotes || existingAudit.acknowledgementNotes || '',
            updatedAt: now,
          };
          await updateDoc(auditRef, auditUpdates);
          savedAudit = { ...existingAudit, ...auditUpdates, id: auditSnap.id };
        } else {
          const newAudit: Omit<BreakdownAuditLogDoc, 'id'> = {
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
            acknowledgementNotes,
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(auditRef, newAudit);
          savedAudit = { ...newAudit, id: auditId };
        }

        res.json({
          shift: { ...shift, breakdownEvents, updatedAt: now, id: snap.id },
          auditLog: savedAudit,
        });
      } catch (err) {
        console.error('breakdown acknowledge error:', err);
        res.status(500).json({ error: 'Error al aceptar la novedad mecánica.' });
      }
    }
  );

  // List Breakdown Audit Logs (RBAC + Group Isolated)
  app.get(
    '/api/breakdown-audit-logs',
    authenticate,
    requireRole(['admin', 'gestion', 'supervisor']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const requestedGroup = String(req.query.workGroupId || '').trim();
        if (user.role === 'supervisor') {
          if (!user.workGroupId) {
            res.status(403).json({ error: 'Supervisor sin grupo operativo asignado.' });
            return;
          }
          if (requestedGroup && requestedGroup !== user.workGroupId) {
            res.status(403).json({ error: 'Acceso denegado fuera de su grupo asignado.' });
            return;
          }
        }

        const snap = await getDocs(collection(db, 'breakdown_audit_logs'));
        let logs = snap.docs.map(d => ({ ...(d.data() as BreakdownAuditLogDoc), id: d.id }));
        if (user.role === 'supervisor') {
          logs = logs.filter(l => l.workGroupId === user.workGroupId);
        } else if (requestedGroup) {
          logs = logs.filter(l => l.workGroupId === requestedGroup);
        }

        logs.sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''));
        res.json({ logs });
      } catch (err) {
        console.error('GET /api/breakdown-audit-logs error:', err);
        res.status(500).json({ error: 'Error al obtener auditoría de novedades.' });
      }
    }
  );

  // Controller / Supervisor: Modify shift timestamps (T1..T4) & weightTons with full validation and recalculation
  app.patch(
    '/api/driver-shifts/:id/times',
    authenticate,
    requireRole(['admin', 'gestion', 'supervisor']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const shiftRef = doc(db, 'driver_shifts', req.params.id);
        const snap = await getDoc(shiftRef);
        if (!snap.exists()) {
          res.status(404).json({ error: 'Jornada no encontrada.' });
          return;
        }
        const shift = snap.data() as DriverShiftDoc;
        if (!canAccessGroup(user, shift.workGroupId)) {
          res.status(403).json({ error: 'Acceso denegado: no puede modificar tiempos de otro grupo.' });
          return;
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

        const t1Parsed = parseTimestampInput(req.body?.t1StartShiftAt, shift.t1StartShiftAt, false, 'T1 Inicio Turno');
        if (!t1Parsed.ok) { res.status(400).json({ error: t1Parsed.error }); return; }

        const t2Parsed = parseTimestampInput(req.body?.t2StartRouteAt, shift.t2StartRouteAt ?? null, true, 'T2 Inicio Ruta');
        if (!t2Parsed.ok) { res.status(400).json({ error: t2Parsed.error }); return; }

        const t3Parsed = parseTimestampInput(req.body?.t3EndRouteAt, shift.t3EndRouteAt ?? null, true, 'T3 Fin Ruta');
        if (!t3Parsed.ok) { res.status(400).json({ error: t3Parsed.error }); return; }

        const t4Parsed = parseTimestampInput(req.body?.t4ArriveBaseAt, shift.t4ArriveBaseAt ?? null, true, 'T4 Llegada Base');
        if (!t4Parsed.ok) { res.status(400).json({ error: t4Parsed.error }); return; }

        const t1 = t1Parsed.value!;
        const t2 = t2Parsed.value;
        const t3 = t3Parsed.value;
        const t4 = t4Parsed.value;

        if (t3 && !t2) {
          res.status(400).json({ error: 'No puede definir T3 Fin de Ruta sin definir T2 Inicio de Ruta.' });
          return;
        }
        if (t4 && !t3) {
          res.status(400).json({ error: 'No puede definir T4 Llegada a Base sin definir T3 Fin de Ruta.' });
          return;
        }

        const t1Ms = new Date(t1).getTime();
        const t2Ms = t2 ? new Date(t2).getTime() : null;
        const t3Ms = t3 ? new Date(t3).getTime() : null;
        const t4Ms = t4 ? new Date(t4).getTime() : null;

        if (t2Ms !== null && t2Ms < t1Ms) {
          res.status(400).json({ error: 'T2 Inicio de Ruta no puede ser anterior a T1 Inicio de Turno.' });
          return;
        }
        if (t3Ms !== null && t2Ms !== null && t3Ms < t2Ms) {
          res.status(400).json({ error: 'T3 Fin de Ruta no puede ser anterior a T2 Inicio de Ruta.' });
          return;
        }
        if (t4Ms !== null && t3Ms !== null && t4Ms < t3Ms) {
          res.status(400).json({ error: 'T4 Llegada a Base no puede ser anterior a T3 Fin de Ruta.' });
          return;
        }

        let nextWeight = shift.weightTons ?? null;
        if (req.body?.weightTons !== undefined) {
          const weightParsed = parseValidatedWeightTons(req.body.weightTons, false);
          if (!weightParsed.ok) {
            res.status(400).json({ error: weightParsed.error });
            return;
          }
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
        res.json({ shift: { ...shift, ...updates, id: snap.id } });
      } catch (err) {
        console.error('PATCH /api/driver-shifts/:id/times error:', err);
        res.status(500).json({ error: 'Error al modificar los tiempos de la jornada.' });
      }
    }
  );

  // Controller / Supervisor: Manually add a Mechanical Breakdown or Refill/Discharge event from Live Board
  app.post(
    '/api/driver-shifts/:id/manual-event',
    authenticate,
    requireRole(['admin', 'gestion', 'supervisor']),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const shiftRef = doc(db, 'driver_shifts', req.params.id);
        const snap = await getDoc(shiftRef);
        if (!snap.exists()) {
          res.status(404).json({ error: 'Jornada no encontrada.' });
          return;
        }
        const shift = snap.data() as DriverShiftDoc;
        if (!canAccessGroup(user, shift.workGroupId)) {
          res.status(403).json({ error: 'Acceso denegado: no puede registrar novedades fuera de su grupo.' });
          return;
        }

        const eventType = String(req.body?.type || '').trim();
        if (eventType !== 'breakdown' && eventType !== 'refill') {
          res.status(400).json({ error: 'El tipo de novedad debe ser "breakdown" (avería) o "refill" (relleno).' });
          return;
        }

        const startRaw = String(req.body?.startAt || '').trim();
        if (!startRaw) {
          res.status(400).json({ error: 'Debe ingresar la fecha y hora de inicio del evento.' });
          return;
        }
        const startDate = new Date(startRaw);
        if (Number.isNaN(startDate.getTime())) {
          res.status(400).json({ error: 'La hora de inicio ingresada no es válida.' });
          return;
        }
        const startIso = startDate.toISOString();
        const startMs = startDate.getTime();

        const endRaw = req.body?.endAt !== undefined && req.body?.endAt !== null ? String(req.body.endAt).trim() : '';
        let endIso: string | null = null;
        let durationSeconds: number | null = null;
        let durationMins: number | null = null;

        if (endRaw) {
          const endDate = new Date(endRaw);
          if (Number.isNaN(endDate.getTime())) {
            res.status(400).json({ error: 'La hora de finalización ingresada no es válida.' });
            return;
          }
          const endMs = endDate.getTime();
          if (endMs < startMs) {
            res.status(400).json({ error: 'La hora de finalización no puede ser anterior a la hora de inicio.' });
            return;
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
        const notes = String(req.body?.notes || '').trim().slice(0, 300);
        const reportedByName = String(req.body?.reportedByName || user.fullName || user.username || shift.driverName)
          .trim()
          .slice(0, 120);

        if (eventType === 'refill') {
          if (!endIso && shift.isPausedForRefill) {
            res.status(409).json({ error: 'El vehículo ya tiene un relleno activo en curso. Indique hora de fin o cierre el actual.' });
            return;
          }
          const eventId = generateDocId('refill');
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
            pausedPhase: openRefill ? (shift.pausedPhase || shift.status) : null,
            refillTotalMins: recalculated.refillTotalMins,
            routeExecutionNetMins: recalculated.routeExecutionNetMins,
            totalOperationNetMins: recalculated.totalOperationNetMins,
            updatedAt: now,
          };
          await updateDoc(shiftRef, updates);
          res.status(201).json({ shift: { ...shift, ...updates, id: snap.id } });
          return;
        }

        // Breakdown event
        if (!endIso && shift.isInBreakdown) {
          res.status(409).json({ error: 'El vehículo ya tiene una avería mecánica activa. Indique hora de fin o cierre la actual.' });
          return;
        }
        const eventId = generateDocId('brk');
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
        const auditDoc: Omit<BreakdownAuditLogDoc, 'id'> = {
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
          resolutionNotes: endIso ? (notes || 'Cierre registrado desde Tablero en Vivo') : null,
          durationMins,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'breakdown_audit_logs', auditId), auditDoc);

        res.status(201).json({
          shift: { ...shift, ...updates, id: snap.id },
          auditLog: { ...auditDoc, id: auditId },
        });
      } catch (err) {
        console.error('POST /api/driver-shifts/:id/manual-event error:', err);
        res.status(500).json({ error: 'Error al registrar novedad manual.' });
      }
    }
  );

  // ── Vite Middleware (Dev) or Static Assets (Prod) ───────────────────────────
  const isProd = process.env.NODE_ENV === 'production' || (fs.existsSync(path.join(__dirname, 'dist')) && process.env.npm_lifecycle_event === 'start');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
