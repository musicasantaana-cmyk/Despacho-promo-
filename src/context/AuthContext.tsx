import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthSessionUser } from '../types';
import { fetchSessionApi, getAuthToken, loginApi, logoutApi, setAuthToken } from '../lib/api';

interface AuthContextValue {
  user: AuthSessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isAdmin: boolean;
  isGestion: boolean;
  isSupervisor: boolean;
  isConductor: boolean;
  canManageUsers: boolean;
  canAccessSystemConfig: boolean;
  canManageAllGroups: boolean;
  lockedWorkGroupId: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { user: verifiedUser } = await fetchSessionApi();
      setUser(verifiedUser);
      localStorage.setItem('PROMO_USER_SESSION', JSON.stringify(verifiedUser));
    } catch {
      setAuthToken(null);
      localStorage.removeItem('PROMO_USER_SESSION');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (username: string, password: string) => {
    try {
      const { token, user: sessionUser } = await loginApi(username, password);
      setAuthToken(token);
      localStorage.setItem('PROMO_USER_SESSION', JSON.stringify(sessionUser));
      setUser(sessionUser);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Usuario o contraseña incorrectos.' };
    }
  };

  const logout = async () => {
    await logoutApi();
    localStorage.removeItem('PROMO_USER_SESSION');
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isGestion = user?.role === 'gestion';
  const isSupervisor = user?.role === 'supervisor';
  const isConductor = user?.role === 'conductor';

  const lockedWorkGroupId =
    user && user.role === 'supervisor' && user.workGroupId
      ? user.workGroupId
      : user && user.role === 'conductor' && user.workGroupId && user.workGroupId !== 'ALL'
        ? user.workGroupId
        : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshSession,
        isAdmin,
        isGestion,
        isSupervisor,
        isConductor,
        canManageUsers: isAdmin,
        canAccessSystemConfig: isAdmin,
        canManageAllGroups: isAdmin || isGestion,
        lockedWorkGroupId,
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
