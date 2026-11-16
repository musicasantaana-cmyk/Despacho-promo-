import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  getDocFromServer,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AuthSession, SafeAppUser, UserRole } from '../types';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// ─── Structured Firestore Error Handling ───────────────────────────────────────
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Por favor verifique su configuración de Firebase. El cliente está sin conexión.');
    }
  }
}
testConnection();

// ─── Master Credentials (Preserved for existing operations) ───────────────────
export const MASTER_USER = {
  id: 'master_wefd',
  username: 'wefd',
  password: 'Sara0519',
  fullName: 'Administrador Maestro',
  role: 'admin' as UserRole,
};

// ─── Cryptographic Password Hashing (Web Crypto SHA-256 + Per-User Salt) ──────
function generateSalt(byteLength = 16): string {
  const arr = new Uint8Array(byteLength);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}:${password}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback only if Web Crypto subtle is unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}

const VALID_ROLES: UserRole[] = ['admin', 'gestion', 'supervisor', 'conductor'];

export function normalizeUserRole(rawRole: unknown): UserRole {
  if (typeof rawRole === 'string' && VALID_ROLES.includes(rawRole as UserRole)) {
    return rawRole as UserRole;
  }
  // Legacy accounts created prior to RBAC default to 'gestion' so operations remain uninterrupted
  return 'gestion';
}

function mapDocToSafeUser(docId: string, data: Record<string, any>): SafeAppUser {
  return {
    id: docId,
    username: String(data.username || ''),
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    role: normalizeUserRole(data.role),
    workGroupId: typeof data.workGroupId === 'string' && data.workGroupId.trim() !== '' ? data.workGroupId : null,
    isActive: data.isActive !== false,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

// ─── Authentication & Session Validation ───────────────────────────────────────
export async function authenticateAppUser(
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; username: string; session?: AuthSession; error?: string }> {
  const cleanUsername = usernameInput.trim();
  if (!cleanUsername || !passwordInput) {
    return { success: false, username: cleanUsername, error: 'Ingrese usuario y contraseña.' };
  }

  // 1. Check Master user
  if (cleanUsername === MASTER_USER.username && passwordInput === MASTER_USER.password) {
    const session: AuthSession = {
      id: MASTER_USER.id,
      username: MASTER_USER.username,
      fullName: MASTER_USER.fullName,
      role: 'admin',
      workGroupId: null,
      isActive: true,
      isMaster: true,
      loggedAt: Date.now(),
    };
    return { success: true, username: MASTER_USER.username, session };
  }

  // 2. Check in Firestore app_users collection by username
  try {
    const q = query(
      collection(db, 'app_users'),
      where('username', '==', cleanUsername)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { success: false, username: cleanUsername, error: 'Usuario o contraseña incorrectos.' };
    }

    for (const userDoc of snap.docs) {
      const data = userDoc.data();
      let passwordMatches = false;

      if (typeof data.passwordHash === 'string' && data.passwordHash && typeof data.passwordSalt === 'string') {
        const computed = await hashPassword(passwordInput, data.passwordSalt);
        passwordMatches = computed === data.passwordHash;
      } else if (typeof data.password === 'string' && data.password.length > 0) {
        // Legacy plaintext fallback for pre-existing users
        passwordMatches = data.password === passwordInput;
      }

      if (passwordMatches) {
        if (data.isActive === false) {
          return {
            success: false,
            username: cleanUsername,
            error: 'Esta cuenta se encuentra desactivada. Contacte al Administrador.',
          };
        }

        const safeUser = mapDocToSafeUser(userDoc.id, data);
        const session: AuthSession = {
          id: safeUser.id,
          username: safeUser.username,
          fullName: safeUser.fullName,
          role: safeUser.role,
          workGroupId: safeUser.workGroupId,
          isActive: safeUser.isActive,
          isMaster: false,
          loggedAt: Date.now(),
        };
        return { success: true, username: safeUser.username, session };
      }
    }

    return { success: false, username: cleanUsername, error: 'Usuario o contraseña incorrectos.' };
  } catch (err: any) {
    console.error('Auth check error:', err);
    return { success: false, username: cleanUsername, error: 'Error al verificar credenciales.' };
  }
}

export async function refreshUserSession(session: AuthSession): Promise<AuthSession | null> {
  if (session.isMaster && session.username === MASTER_USER.username) {
    return { ...session, role: 'admin', isActive: true, isMaster: true };
  }

  try {
    if (session.id && session.id !== MASTER_USER.id) {
      const docRef = doc(db, 'app_users', session.id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      const safe = mapDocToSafeUser(snap.id, snap.data());
      if (!safe.isActive) return null;
      return {
        ...session,
        id: safe.id,
        username: safe.username,
        fullName: safe.fullName,
        role: safe.role,
        workGroupId: safe.workGroupId,
        isActive: safe.isActive,
      };
    }

    const q = query(collection(db, 'app_users'), where('username', '==', session.username));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    const safe = mapDocToSafeUser(first.id, first.data());
    if (!safe.isActive) return null;
    return {
      ...session,
      id: safe.id,
      username: safe.username,
      fullName: safe.fullName,
      role: safe.role,
      workGroupId: safe.workGroupId,
      isActive: safe.isActive,
    };
  } catch (error) {
    console.error('Error refreshing user session:', error);
    return session;
  }
}

// ─── User Administration CRUD (Admin Only) ────────────────────────────────────
export function subscribeAppUsers(
  onData: (users: SafeAppUser[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'app_users'),
    (snap) => {
      const users = snap.docs
        .map((d) => mapDocToSafeUser(d.id, d.data()))
        .sort((a, b) => a.username.localeCompare(b.username));
      onData(users);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, 'app_users');
    }
  );
}

export interface CreateAppUserInput {
  username: string;
  password: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string | null;
  isActive?: boolean;
}

export async function createAppUser(
  usernameOrInput: string | CreateAppUserInput,
  legacyPassword?: string
): Promise<{ success: boolean; message: string }> {
  const input: CreateAppUserInput =
    typeof usernameOrInput === 'string'
      ? {
          username: usernameOrInput,
          password: legacyPassword || '',
          role: 'gestion',
          workGroupId: null,
          isActive: true,
        }
      : usernameOrInput;

  const cleanUsername = input.username.trim().slice(0, 100);
  const cleanFullName = (input.fullName || '').trim().slice(0, 120);
  const role = normalizeUserRole(input.role);
  const workGroupId = input.workGroupId ? input.workGroupId.trim().slice(0, 128) : null;
  const isActive = input.isActive !== false;

  if (!cleanUsername || !input.password) {
    return { success: false, message: 'Usuario y contraseña son obligatorios.' };
  }
  if (input.password.length < 6) {
    return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  if (cleanUsername.toLowerCase() === MASTER_USER.username.toLowerCase()) {
    return { success: false, message: 'No se puede duplicar el usuario maestro del sistema.' };
  }
  if (role === 'supervisor' && !workGroupId) {
    return { success: false, message: 'El rol Supervisor requiere un grupo operativo asignado.' };
  }

  try {
    const q = query(collection(db, 'app_users'), where('username', '==', cleanUsername));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { success: false, message: 'El nombre de usuario ya existe.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(input.password, salt);
    const nowIso = new Date().toISOString();
    const docId = 'user_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

    await setDoc(doc(db, 'app_users', docId), {
      username: cleanUsername,
      fullName: cleanFullName,
      role,
      workGroupId: workGroupId,
      isActive,
      passwordHash,
      passwordSalt: salt,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return { success: true, message: `Usuario "${cleanUsername}" creado exitosamente.` };
  } catch (err: any) {
    console.error('Error creating app user:', err);
    return { success: false, message: 'Error al guardar el usuario en la base de datos.' };
  }
}

export interface UpdateAppUserInput {
  fullName?: string;
  role: UserRole;
  workGroupId?: string | null;
  isActive: boolean;
  newPassword?: string;
}

export async function updateAppUser(
  userId: string,
  updates: UpdateAppUserInput
): Promise<{ success: boolean; message: string }> {
  const role = normalizeUserRole(updates.role);
  const workGroupId = updates.workGroupId ? updates.workGroupId.trim().slice(0, 128) : null;

  if (role === 'supervisor' && !workGroupId) {
    return { success: false, message: 'El rol Supervisor requiere un grupo operativo asignado.' };
  }

  if (updates.newPassword && updates.newPassword.length > 0 && updates.newPassword.length < 6) {
    return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  }

  try {
    const payload: Record<string, any> = {
      fullName: (updates.fullName || '').trim().slice(0, 120),
      role,
      workGroupId,
      isActive: updates.isActive,
      updatedAt: new Date().toISOString(),
    };

    if (updates.newPassword && updates.newPassword.trim().length > 0) {
      const salt = generateSalt();
      payload.passwordHash = await hashPassword(updates.newPassword, salt);
      payload.passwordSalt = salt;
      payload.password = '';
    }

    await updateDoc(doc(db, 'app_users', userId), payload);
    return { success: true, message: 'Usuario actualizado correctamente.' };
  } catch (err: any) {
    console.error('Error updating app user:', err);
    return { success: false, message: 'Error al actualizar el usuario.' };
  }
}

export async function deleteAppUser(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    await deleteDoc(doc(db, 'app_users', userId));
    return { success: true, message: 'Usuario eliminado.' };
  } catch (err: any) {
    console.error('Error deleting app user:', err);
    return { success: false, message: 'Error al eliminar el usuario.' };
  }
}
