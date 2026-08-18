import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppState, Employee, EmployeeRole, Vehicle, RouteDef, Assignment, Incident, WorkGroup, CrewTemplate, SyncStatus } from '../types';

interface AppContextProps {
  state: AppState;
  syncStatus: SyncStatus;
  syncNow: () => Promise<void>;
  setLatencyInterval: (seconds: number) => void;
  addWorkGroup: (name: string) => void;
  deleteWorkGroup: (id: string) => void;
  setActiveWorkGroup: (id: string) => void;
  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: string, emp: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  deleteAllEmployees: () => void;
  importEmployeesBulk: (rawRows: any[]) => void;
  addVehicle: (veh: Omit<Vehicle, 'id'>) => void;
  updateVehicle: (id: string, veh: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  addRoute: (route: Omit<RouteDef, 'id'>) => void;
  updateRoute: (id: string, route: Partial<RouteDef>) => void;
  deleteRoute: (id: string) => void;
  addCrew: (crew: Omit<CrewTemplate, 'id'>) => void;
  updateCrew: (id: string, crew: Partial<CrewTemplate>) => void;
  deleteCrew: (id: string) => void;
  addAssignment: (assignment: Omit<Assignment, 'id' | 'status' | 'incidents'>) => void;
  updateAssignmentStatus: (id: string, status: Assignment['status']) => void;
  addIncident: (assignmentId: string, incident: Omit<Incident, 'id' | 'timestamp'>) => void;
  setBackupEmail: (email: string) => void;
  triggerManualBackup: () => void;
}

const defaultState: AppState = {
  workGroups: [],
  activeWorkGroupId: null,
  employees: [],
  vehicles: [],
  routes: [],
  assignments: [],
  crews: [],
  backupEmail: null,
  lastBackupDate: null,
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

const generateId = () => Math.random().toString(36).substring(2, 9);

const getDeviceId = () => {
  let id = localStorage.getItem('PROMODESPACHO_deviceId');
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('PROMODESPACHO_deviceId', id);
  }
  return id;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('PROMODESPACHO_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure workGroups exists for legacy data
        if (!parsed.workGroups) parsed.workGroups = [];
        const clearedFlag = localStorage.getItem('PROMODESPACHO_cleared_personnel_v1');
        if (!clearedFlag) {
          parsed.employees = [];
          localStorage.setItem('PROMODESPACHO_cleared_personnel_v1', 'true');
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse local data', e);
      }
    } else {
      localStorage.setItem('PROMODESPACHO_cleared_personnel_v1', 'true');
    }
    return defaultState;
  });

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSyncTime: null,
    latencyInterval: 15, // 15 seconds heartbeat default
    serverVersion: 1,
    deviceId: getDeviceId(),
    syncProtocol: 'HTTP-Gateway-Heartbeat-15s / BroadcastChannel',
  });

  const localVersionRef = useRef<number>(1);
  const isPushingRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // BroadcastChannel for instant local inter-tab synchronization
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('PROMODESPACHO_SYNC_BUS');
        broadcastChannelRef.current = channel;

        channel.onmessage = (event) => {
          if (event.data && event.data.type === 'STATE_UPDATE' && event.data.deviceId !== getDeviceId()) {
            console.log('[Sync Bus] Instant update from sister tab');
            setState(event.data.state);
            localVersionRef.current = event.data.version || (localVersionRef.current + 1);
            setSyncStatus(prev => ({
              ...prev,
              lastSyncTime: new Date().toLocaleTimeString(),
              serverVersion: localVersionRef.current,
            }));
          }
        };

        return () => {
          channel.close();
        };
      }
    } catch (err) {
      console.warn('[Sync Bus] BroadcastChannel warning:', err);
    }
  }, []);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setSyncStatus(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setSyncStatus(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Helper to push state to Server Gateway
  const pushStateToServer = useCallback(async (stateToPush: AppState) => {
    if (isPushingRef.current) return;
    try {
      isPushingRef.current = true;
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          clientVersion: localVersionRef.current,
          state: stateToPush,
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        localVersionRef.current = data.version;
        setSyncStatus(prev => ({
          ...prev,
          isSyncing: false,
          isOnline: true,
          lastSyncTime: new Date().toLocaleTimeString(),
          serverVersion: data.version,
        }));

        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            deviceId: getDeviceId(),
            version: data.version,
            state: stateToPush,
          });
        }
      }
    } catch (err) {
      console.warn('[Sync Gateway] Push failed (working offline):', err);
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
    } finally {
      isPushingRef.current = false;
    }
  }, []);

  // Helper to pull from server
  const fetchServerState = useCallback(async () => {
    try {
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
          localVersionRef.current = data.version;
          setSyncStatus(prev => ({
            ...prev,
            isSyncing: false,
            isOnline: true,
            lastSyncTime: new Date().toLocaleTimeString(),
            serverVersion: data.version,
          }));
        }
      }
    } catch (err) {
      console.warn('[Sync Gateway] Fetch failed:', err);
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
    }
  }, []);

  // 15-second Heartbeat Polling Protocol (Multi-device synchronizer)
  useEffect(() => {
    const checkServerHeartbeat = async () => {
      if (isPushingRef.current) return;
      try {
        const statusRes = await fetch('/api/sync/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          setSyncStatus(prev => ({ ...prev, isOnline: true }));
          if (status.version > localVersionRef.current) {
            console.log(`[Sync Gateway] Server newer version (${status.version} > ${localVersionRef.current}). Pulling...`);
            const syncRes = await fetch('/api/sync');
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              if (syncData.state) {
                setState(syncData.state);
                localVersionRef.current = syncData.version;
                setSyncStatus(prev => ({
                  ...prev,
                  lastSyncTime: new Date().toLocaleTimeString(),
                  serverVersion: syncData.version,
                }));
              }
            }
          }
        }
      } catch (err) {
        setSyncStatus(prev => ({ ...prev, isOnline: false }));
      }
    };

    // Initial check on mount
    checkServerHeartbeat();

    // 15s timer
    const intervalMs = (syncStatus.latencyInterval || 15) * 1000;
    const heartbeatTimer = setInterval(checkServerHeartbeat, intervalMs);

    return () => clearInterval(heartbeatTimer);
  }, [syncStatus.latencyInterval]);

  // Persist locally and trigger push debounce
  useEffect(() => {
    localStorage.setItem('PROMODESPACHO_data', JSON.stringify(state));
    const timer = setTimeout(() => {
      pushStateToServer(state);
    }, 400);

    return () => clearTimeout(timer);
  }, [state, pushStateToServer]);

  // Set Latency Interval
  const setLatencyInterval = (seconds: number) => {
    const validSec = Math.max(5, Math.min(120, seconds));
    setSyncStatus(prev => ({ ...prev, latencyInterval: validSec }));
  };

  const syncNow = async () => {
    await pushStateToServer(state);
    await fetchServerState();
  };

  const triggerManualBackup = () => {
    if (state.backupEmail) {
      setState((prev) => ({
        ...prev,
        lastBackupDate: new Date().toISOString(),
      }));
    }
    syncNow();
  };

  const addWorkGroup = (name: string) => {
    const newGroup = { id: generateId(), name };
    setState(prev => ({
      ...prev,
      workGroups: [...prev.workGroups, newGroup],
      activeWorkGroupId: prev.activeWorkGroupId || newGroup.id
    }));
  };

  const deleteWorkGroup = (id: string) => {
    setState(prev => ({
      ...prev,
      workGroups: prev.workGroups.filter(g => g.id !== id),
      activeWorkGroupId: prev.activeWorkGroupId === id ? (prev.workGroups.find(g => g.id !== id)?.id || null) : prev.activeWorkGroupId
    }));
  };

  const setActiveWorkGroup = (id: string) => {
    setState(prev => ({ ...prev, activeWorkGroupId: id }));
  };

  const addEmployee = (emp: Omit<Employee, 'id'>) => {
    setState((prev) => ({
      ...prev,
      employees: [...prev.employees, { ...emp, id: generateId(), workGroupId: emp.workGroupId || prev.activeWorkGroupId || undefined }],
    }));
  };

  const updateEmployee = (id: string, emp: Partial<Employee>) => {
    setState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, ...emp } : e)),
    }));
  };

  const deleteEmployee = (id: string) => {
    setState((prev) => ({ ...prev, employees: prev.employees.filter((e) => e.id !== id) }));
  };

  const deleteAllEmployees = () => {
    setState((prev) => ({ ...prev, employees: [] }));
  };

  const importEmployeesBulk = (rawRows: any[]) => {
    setState((prev) => {
      let currentWorkGroups = [...prev.workGroups];
      const newEmployees: Employee[] = [];

      const normalizeRole = (val: any): EmployeeRole => {
        const str = String(val || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (str.includes('conduct') || str.includes('chofer') || str.includes('driver')) return 'Conductor';
        if (str.includes('ayud') || str.includes('auxil') || str.includes('peon') || str.includes('asist')) return 'Ayudante';
        if (str.includes('coord') || str.includes('superv') || str.includes('lider') || str.includes('jefe') || str.includes('admin')) return 'Coordinador';
        return 'Conductor';
      };

      rawRows.forEach((row) => {
        const lastName = String(row.apellido || row.apellidos || row.lastname || row.last_name || '').trim();
        const firstName = String(row.nombre || row.nombres || row.firstname || row.first_name || row.name || '').trim();
        const rawRole = row.roll || row.rol || row.cargo || row.puesto || row.funcion || row.role || '';
        const role = normalizeRole(rawRole);
        const phone = String(row.telefono || row.telefonos || row.celular || row.tel || row.phone || row.movil || '').trim();
        const rawGroup = String(row.grupo || row.grupos || row.group || row.area || row.zona || '').trim();

        let assignedGroupId = prev.activeWorkGroupId || undefined;

        if (rawGroup) {
          let foundGroup = currentWorkGroups.find(
            (g) => g.name.trim().toLowerCase() === rawGroup.toLowerCase()
          );
          if (!foundGroup) {
            foundGroup = { id: generateId(), name: rawGroup };
            currentWorkGroups.push(foundGroup);
          }
          assignedGroupId = foundGroup.id;
        }

        const fullName = `${firstName} ${lastName}`.trim() || firstName || lastName || 'Sin Nombre';

        newEmployees.push({
          id: generateId(),
          name: fullName,
          firstName: firstName,
          lastName: lastName,
          role,
          phone,
          workGroup: rawGroup,
          workGroupId: assignedGroupId,
        });
      });

      const nextActiveGroupId = prev.activeWorkGroupId || (currentWorkGroups[0]?.id ?? null);

      return {
        ...prev,
        workGroups: currentWorkGroups,
        activeWorkGroupId: nextActiveGroupId,
        employees: [...prev.employees, ...newEmployees],
      };
    });
  };

  const addVehicle = (veh: Omit<Vehicle, 'id'>) => {
    setState((prev) => ({
      ...prev,
      vehicles: [...prev.vehicles, { ...veh, id: generateId(), workGroupId: veh.workGroupId || prev.activeWorkGroupId || undefined }],
    }));
  };

  const updateVehicle = (id: string, veh: Partial<Vehicle>) => {
    setState((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, ...veh } : v)),
    }));
  };

  const deleteVehicle = (id: string) => {
    setState((prev) => ({ ...prev, vehicles: prev.vehicles.filter((v) => v.id !== id) }));
  };

  const addRoute = (route: Omit<RouteDef, 'id'>) => {
    setState((prev) => ({
      ...prev,
      routes: [...prev.routes, { ...route, id: generateId(), workGroupId: route.workGroupId || prev.activeWorkGroupId || undefined }],
    }));
  };

  const updateRoute = (id: string, route: Partial<RouteDef>) => {
    setState((prev) => ({
      ...prev,
      routes: prev.routes.map((r) => (r.id === id ? { ...r, ...route } : r)),
    }));
  };

  const deleteRoute = (id: string) => {
    setState((prev) => ({ ...prev, routes: prev.routes.filter((r) => r.id !== id) }));
  };

  const addCrew = (crew: Omit<CrewTemplate, 'id'>) => {
    setState((prev) => ({
      ...prev,
      crews: [...(prev.crews || []), { ...crew, id: generateId(), workGroupId: prev.activeWorkGroupId || undefined }],
    }));
  };

  const updateCrew = (id: string, crew: Partial<CrewTemplate>) => {
    setState((prev) => ({
      ...prev,
      crews: (prev.crews || []).map((c) => (c.id === id ? { ...c, ...crew } : c)),
    }));
  };

  const deleteCrew = (id: string) => {
    setState((prev) => ({ ...prev, crews: (prev.crews || []).filter((c) => c.id !== id) }));
  };

  const addAssignment = (assignment: Omit<Assignment, 'id' | 'status' | 'incidents'>) => {
    setState((prev) => ({
      ...prev,
      assignments: [
        ...prev.assignments,
        { ...assignment, id: generateId(), status: 'Pendiente', incidents: [], workGroupId: prev.activeWorkGroupId || undefined },
      ],
    }));
  };

  const updateAssignmentStatus = (id: string, status: Assignment['status']) => {
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) => (a.id === id ? { ...a, status } : a)),
    }));
  };

  const addIncident = (assignmentId: string, incident: Omit<Incident, 'id' | 'timestamp'>) => {
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              incidents: [
                ...a.incidents,
                { ...incident, id: generateId(), timestamp: new Date().toISOString() },
              ],
            }
          : a
      ),
    }));
  };

  const setBackupEmail = (email: string) => {
    setState((prev) => ({ ...prev, backupEmail: email }));
  };

  return (
    <AppContext.Provider
      value={{
        state,
        syncStatus,
        syncNow,
        setLatencyInterval,
        addWorkGroup,
        deleteWorkGroup,
        setActiveWorkGroup,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        deleteAllEmployees,
        importEmployeesBulk,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addRoute,
        updateRoute,
        deleteRoute,
        addCrew,
        updateCrew,
        deleteCrew,
        addAssignment,
        updateAssignmentStatus,
        addIncident,
        setBackupEmail,
        triggerManualBackup,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
