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
  initialTransitMins: number | null;
  routeExecutionMins: number | null;
  routeExecutionNetMins: number | null;
  returnTransitMins: number | null;
  totalOperationMins: number | null;
  totalOperationNetMins: number | null;
  refillTotalMins: number;
  mechanicalBreakdownTotalMins: number;
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
  windowEndMs?: number
): number {
  let total = 0;
  for (const ev of events) {
    if (!ev.startAt || !ev.endAt) continue;
    const s = new Date(ev.startAt).getTime();
    const e = new Date(ev.endAt).getTime();
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
        initialTransitMins: null,
        routeExecutionMins: null,
        routeExecutionNetMins: null,
        returnTransitMins: null,
        totalOperationMins: null,
        totalOperationNetMins: null,
        refillTotalMins: 0,
        mechanicalBreakdownTotalMins: 0,
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
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Finalice primero el "Fin de Descargue" para reanudar y cerrar la ruta.' });
        return;
      }

      const now = new Date().toISOString();
      const t2Ms = new Date(shift.t2StartRouteAt).getTime();
      const t3Ms = new Date(now).getTime();
      const grossMs = Math.max(0, t3Ms - t2Ms);
      const routeExecutionMins = Math.round(grossMs / 60000);

      const refillDuringRouteMs = calcEventsDurationMs(shift.refillEvents || [], t2Ms, t3Ms);
      const breakdownDuringRouteMs = calcEventsDurationMs(shift.breakdownEvents || [], t2Ms, t3Ms);
      const routeExecutionNetMins = Math.max(
        0,
        Math.round((grossMs - refillDuringRouteMs - breakdownDuringRouteMs) / 60000)
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
      if (shift.isPausedForRefill) {
        res.status(409).json({ error: 'Tiene un Relleno/Descargue activo. Registre "Fin de Descargue" antes de finalizar jornada.' });
        return;
      }
      if (shift.isInBreakdown) {
        res.status(409).json({ error: 'Tiene una Avería Mecánica activa. Registre "Fin de Avería" antes de cerrar la jornada.' });
        return;
      }

      const now = new Date().toISOString();
      const t1Ms = new Date(shift.t1StartShiftAt).getTime();
      const t3Ms = new Date(shift.t3EndRouteAt).getTime();
      const t4Ms = new Date(now).getTime();

      const returnTransitMins = Math.max(0, Math.round((t4Ms - t3Ms) / 60000));
      const totalOperationMs = Math.max(0, t4Ms - t1Ms);
      const totalOperationMins = Math.round(totalOperationMs / 60000);

      const totalRefillMs = calcEventsDurationMs(shift.refillEvents || []);
      const totalBreakdownMs = calcEventsDurationMs(shift.breakdownEvents || []);
      const totalOperationNetMins = Math.max(
        0,
        Math.round((totalOperationMs - totalRefillMs - totalBreakdownMs) / 60000)
      );

      const updates = {
        status: 'EN_BASE' as DriverShiftStatus,
        t4ArriveBaseAt: now,
        returnTransitMins,
        totalOperationMins,
        totalOperationNetMins,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('arrive-base error:', err);
      res.status(500).json({ error: 'Error al registrar llegada a base.' });
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
      const newEvent: BreakdownEvent = {
        id: eventId,
        startAt: now,
        endAt: null,
        durationMins: null,
        durationSeconds: null,
        phaseAtIncident: shift.status,
        notes,
      };
      const breakdownEvents = [...(shift.breakdownEvents || []), newEvent];

      const updates = {
        isInBreakdown: true,
        activeBreakdownId: eventId,
        breakdownEvents,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('breakdown/start error:', err);
      res.status(500).json({ error: 'Error al reportar avería mecánica.' });
    }
  });

  // Control 6: Fin de Avería / Vehículo Operativo
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
      if (!shift.isInBreakdown || !shift.activeBreakdownId) {
        res.status(409).json({ error: 'No hay una avería mecánica activa.' });
        return;
      }

      const now = new Date().toISOString();
      const nowMs = new Date(now).getTime();
      const breakdownEvents = (shift.breakdownEvents || []).map(ev => {
        if (ev.id !== shift.activeBreakdownId) return ev;
        const startMs = new Date(ev.startAt).getTime();
        const diffMs = Math.max(0, nowMs - startMs);
        return {
          ...ev,
          endAt: now,
          durationSeconds: Math.round(diffMs / 1000),
          durationMins: Math.round(diffMs / 60000),
        };
      });

      const totalBreakdownMs = calcEventsDurationMs(breakdownEvents);
      const mechanicalBreakdownTotalMins = Math.round(totalBreakdownMs / 60000);

      const updates = {
        isInBreakdown: false,
        activeBreakdownId: null,
        breakdownEvents,
        mechanicalBreakdownTotalMins,
        updatedAt: now,
      };
      await updateDoc(shiftRef, updates);
      res.json({ shift: { ...shift, ...updates, id: snap.id } });
    } catch (err) {
      console.error('breakdown/end error:', err);
      res.status(500).json({ error: 'Error al finalizar avería mecánica.' });
    }
  });

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
