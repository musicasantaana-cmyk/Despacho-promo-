import { AppUser, AuthSessionUser, DriverShift, UserRole } from '../types';

const TOKEN_STORAGE_KEY = 'PROMO_AUTH_TOKEN';

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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data as T;
}

export async function loginApi(
  username: string,
  password: string
): Promise<{ token: string; user: AuthSessionUser }> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutApi(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setAuthToken(null);
}

export async function fetchSessionApi(): Promise<{ user: AuthSessionUser }> {
  return apiFetch('/api/auth/me');
}

// ── Admin User Management APIs ────────────────────────────────────────────────
export async function fetchUsersApi(): Promise<{ users: AppUser[] }> {
  return apiFetch('/api/users');
}

export async function createUserApi(payload: {
  username: string;
  password: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
}): Promise<{ user: AppUser }> {
  return apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
  return apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteUserApi(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ── Driver Operational Time Control APIs ──────────────────────────────────────
export async function fetchDriverShiftsApi(workGroupId?: string): Promise<{ shifts: DriverShift[] }> {
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
}): Promise<{ shift: DriverShift }> {
  return apiFetch('/api/driver-shifts/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmChecklistApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/checklist-ack`, {
    method: 'POST',
  });
}

export async function startRouteApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/start-route`, {
    method: 'POST',
  });
}

export async function endRouteApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/end-route`, {
    method: 'POST',
  });
}

export async function arriveBaseApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/arrive-base`, {
    method: 'POST',
  });
}

export async function startRefillApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/refill/start`, {
    method: 'POST',
  });
}

export async function endRefillApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/refill/end`, {
    method: 'POST',
  });
}

export async function startBreakdownApi(shiftId: string, notes?: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/breakdown/start`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function endBreakdownApi(shiftId: string): Promise<{ shift: DriverShift }> {
  return apiFetch(`/api/driver-shifts/${encodeURIComponent(shiftId)}/breakdown/end`, {
    method: 'POST',
  });
}
