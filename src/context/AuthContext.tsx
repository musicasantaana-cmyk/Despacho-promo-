import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AuthSession, UserRole } from '../types';
import {
  authenticateAppUser,
  db,
  MASTER_USER,
  normalizeUserRole,
  refreshUserSession,
} from '../lib/firebase';

const SESSION_STORAGE_KEY = 'PROMO_USER_SESSION';

export type AppModuleView = 'admin' | 'assign' | 'tracking' | 'reports' | 'drivers' | 'users';

interface AuthContextProps {
  user: AuthSession | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; session?: AuthSession }>;
  logout: () => void;
  isAdmin: boolean;
  isGestion: boolean;
  isSupervisor: boolean;
  isConductor: boolean;
  canAccessModule: (view: string) => boolean;
  canAccessSystemConfig: boolean;
  canManageUsers: boolean;
  lockedWorkGroupId: string | null;
  getDefaultViewForRole: (role?: UserRole) => AppModuleView;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function getDefaultViewForRole(role?: UserRole): AppModuleView {
  if (role === 'conductor') return 'drivers';
  return 'tracking';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback((session: AuthSession | null) => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setUser(session);
  }, []);

  // Load and validate saved session on mount
  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const saved = localStorage.getItem(SESSION_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.username) {
            const isMaster = parsed.username === MASTER_USER.username;
            const initialSession: AuthSession = {
              id: parsed.id || (isMaster ? MASTER_USER.id : ''),
              username: parsed.username,
              fullName: parsed.fullName || (isMaster ? MASTER_USER.fullName : ''),
              role: isMaster ? 'admin' : normalizeUserRole(parsed.role),
              workGroupId: isMaster ? null : (parsed.workGroupId || null),
              isActive: parsed.isActive !== false,
              isMaster,
              loggedAt: parsed.loggedAt || Date.now(),
            };

            const refreshed = await refreshUserSession(initialSession);
            if (active) {
              persistSession(refreshed);
            }
          }
        }
      } catch (e) {
        console.error('Error loading session:', e);
        if (active) persistSession(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, [persistSession]);

  // Real-time permission sync: if an admin deactivates or changes role/group of logged-in user
  useEffect(() => {
    if (!user || user.isMaster || !user.id || user.id === MASTER_USER.id) return;

    const unsub = onSnapshot(
      doc(db, 'app_users', user.id),
      (snap) => {
        if (!snap.exists()) {
          persistSession(null);
          return;
        }
        const data = snap.data();
        if (data.isActive === false) {
          persistSession(null);
          return;
        }
        const nextRole = normalizeUserRole(data.role);
        const nextWorkGroupId = typeof data.workGroupId === 'string' && data.workGroupId.trim() !== '' ? data.workGroupId : null;
        const nextFullName = typeof data.fullName === 'string' ? data.fullName : '';

        if (
          nextRole !== user.role ||
          nextWorkGroupId !== user.workGroupId ||
          nextFullName !== (user.fullName || '')
        ) {
          persistSession({
            ...user,
            role: nextRole,
            workGroupId: nextWorkGroupId,
            fullName: nextFullName,
          });
        }
      },
      (err) => {
        console.error('Error syncing active user session:', err);
      }
    );

    return () => unsub();
  }, [user, persistSession]);

  const login = async (username: string, password: string) => {
    const result = await authenticateAppUser(username, password);
    if (result.success && result.session) {
      persistSession(result.session);
      return { success: true, session: result.session };
    }
    return { success: false, error: result.error || 'Usuario o contraseña incorrectos.' };
  };

  const logout = () => {
    persistSession(null);
  };

  const isAdmin = user?.role === 'admin';
  const isGestion = user?.role === 'gestion';
  const isSupervisor = user?.role === 'supervisor';
  const isConductor = user?.role === 'conductor';
  const lockedWorkGroupId = isSupervisor ? (user?.workGroupId || null) : null;

  const canAccessModule = useCallback(
    (view: string): boolean => {
      if (!user) return false;
      if (user.role === 'conductor') {
        return view === 'drivers';
      }
      if (user.role === 'supervisor' || user.role === 'gestion') {
        return ['admin', 'assign', 'tracking', 'reports', 'drivers'].includes(view);
      }
      if (user.role === 'admin') {
        return ['admin', 'assign', 'tracking', 'reports', 'drivers', 'users'].includes(view);
      }
      return false;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin,
        isGestion,
        isSupervisor,
        isConductor,
        canAccessModule,
        canAccessSystemConfig: isAdmin,
        canManageUsers: isAdmin,
        lockedWorkGroupId,
        getDefaultViewForRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
