import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  AppState,
  Employee,
  EmployeeRole,
  Vehicle,
  RouteDef,
  Assignment,
  Incident,
  WorkGroup,
  CrewTemplate,
  SyncStatus,
  Attendance,
  DriverShift,
  BreakdownAuditLog,
} from '../types';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import {
  checkBackendHealthApi,
  fetchSyncStateApi,
  getSyncStreamUrl,
  syncBulkEmployeesApi,
  syncCreateDocApi,
  syncDeleteAllEmployeesApi,
  syncDeleteDocApi,
  syncUpdateDocApi,
  updateShiftTimesApi,
} from '../lib/api';
import {
  findLinkedDriverShiftForAssignment,
  resolveUserConductorEmployee,
  validateAssignmentSelection,
  validateCrewSelection,
} from '../utils/assignmentRules';

interface AppContextProps {
  state: AppState;
  syncStatus: SyncStatus;
  useBackendSync: boolean;
  syncNow: () => Promise<void>;
  setLatencyInterval: (seconds: number) => void;
  addWorkGroup: (name: string) => Promise<void>;
  deleteWorkGroup: (id: string) => Promise<void>;
  setActiveWorkGroup: (id: string | null) => void;
  addEmployee: (emp: Omit<Employee, 'id'>) => Promise<void>;
  updateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  deleteAllEmployees: () => Promise<void>;
  importEmployeesBulk: (rawRows: any[]) => Promise<void>;
  addVehicle: (veh: Omit<Vehicle, 'id'>) => Promise<void>;
  updateVehicle: (id: string, veh: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  addRoute: (route: Omit<RouteDef, 'id'>) => Promise<void>;
  updateRoute: (id: string, route: Partial<RouteDef>) => Promise<void>;
  deleteRoute: (id: string) => Promise<void>;
  addCrew: (crew: Omit<CrewTemplate, 'id'>) => Promise<void>;
  updateCrew: (id: string, crew: Partial<CrewTemplate>) => Promise<void>;
  deleteCrew: (id: string) => Promise<void>;
  addAssignment: (assignment: Omit<Assignment, 'id' | 'status' | 'incidents'>) => Promise<void>;
  updateAssignmentStatus: (id: string, status: Assignment['status'], weightTons?: number, customTimestamp?: string) => Promise<void>;
  updateAssignmentResources: (id: string, updates: { vehicleId?: string; employeeIds?: string[]; statusTimestamps?: Record<string, string> }) => Promise<void>;
  addIncident: (assignmentId: string, incident: Omit<Incident, 'id' | 'timestamp'>) => Promise<void>;
  saveAttendance: (attendance: Omit<Attendance, 'id'>) => Promise<void>;
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
  attendances: [],
  driverShifts: [],
  breakdownAuditLogs: [],
  backupEmail: null,
  lastBackupDate: null,
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, canManageAllGroups, lockedWorkGroupId, isConductor } = useAuth();

  const [rawState, setRawState] = useState<AppState>(() => {
    const active = localStorage.getItem('PROMO_ACTIVE_GROUP');
    const backupEmail = localStorage.getItem('PROMO_BACKUP_EMAIL');
    const lastBackupDate = localStorage.getItem('PROMO_LAST_BACKUP');
    return {
      ...defaultState,
      activeWorkGroupId: active || null,
      backupEmail: backupEmail || null,
      lastBackupDate: lastBackupDate || null,
    };
  });

  const [backendMode, setBackendMode] = useState<boolean | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: null,
    latencyInterval: 15,
    serverVersion: 3,
    deviceId: 'FB-SYNC-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    syncProtocol: 'Firestore Realtime',
  });

  // Detect whether the Express backend sync bridge is active (AI Studio / full-stack)
  useEffect(() => {
    let active = true;
    checkBackendHealthApi().then(ok => {
      if (active) {
        setBackendMode(ok);
        if (ok) {
          setSyncStatus(prev => ({ ...prev, syncProtocol: 'Backend Realtime SSE' }));
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshFromBackend = useCallback(async () => {
    if (!user) return;
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const job = (async () => {
      try {
        const snapshot = await fetchSyncStateApi();
        setRawState(prev => {
          const docs = snapshot.workGroups || [];
          let nextActive = lockedWorkGroupId || prev.activeWorkGroupId;
          if (!nextActive && docs.length > 0) nextActive = docs[0].id;
          if (nextActive && docs.length > 0 && !docs.find(g => g.id === nextActive)) {
            nextActive = lockedWorkGroupId || docs[0].id;
          }
          if (nextActive) localStorage.setItem('PROMO_ACTIVE_GROUP', nextActive);
          return {
            ...prev,
            workGroups: docs,
            activeWorkGroupId: nextActive,
            employees: snapshot.employees || [],
            vehicles: snapshot.vehicles || [],
            routes: snapshot.routes || [],
            assignments: snapshot.assignments || [],
            crews: snapshot.crews || [],
            attendances: snapshot.attendances || [],
            driverShifts: snapshot.driverShifts || [],
            breakdownAuditLogs: snapshot.breakdownAuditLogs || [],
          };
        });
        setSyncStatus(prev => ({
          ...prev,
          isOnline: true,
          lastSyncTime: new Date().toLocaleTimeString(),
        }));
      } catch (err) {
        console.warn('Error sincronizando estado con servidor:', err);
        setSyncStatus(prev => ({ ...prev, isOnline: false }));
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = job;
    return job;
  }, [user, lockedWorkGroupId]);

  // Unified real-time subscription: direct Firestore onSnapshot listeners whenever Firebase is configured
  useEffect(() => {
    if (!user) {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
      return;
    }

    if (isFirebaseConfigured && db) {
      setSyncStatus(prev => ({ ...prev, isOnline: true, syncProtocol: 'Firestore Realtime' }));

      const logSnapshotError = (err: unknown, path: string) => {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {
          // handleFirestoreError already logs structured FirestoreErrorInfo
        }
        setSyncStatus(prev => ({ ...prev, isOnline: false }));
      };

      const unsubWorkGroups = onSnapshot(
        collection(db, 'workGroups'),
        snap => {
          const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkGroup));
          setRawState(prev => {
            let nextActive = lockedWorkGroupId || prev.activeWorkGroupId;
            if (!nextActive && docs.length > 0) nextActive = docs[0].id;
            if (nextActive && !docs.find(g => g.id === nextActive)) {
              nextActive = lockedWorkGroupId || (docs.length > 0 ? docs[0].id : null);
            }
            if (nextActive) localStorage.setItem('PROMO_ACTIVE_GROUP', nextActive);
            return { ...prev, workGroups: docs, activeWorkGroupId: nextActive };
          });
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'workGroups')
      );

      const unsubEmployees = onSnapshot(
        collection(db, 'employees'),
        snap => {
          setRawState(prev => ({ ...prev, employees: snap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)) }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'employees')
      );

      const unsubVehicles = onSnapshot(
        collection(db, 'vehicles'),
        snap => {
          setRawState(prev => ({ ...prev, vehicles: snap.docs.map(d => ({ ...d.data(), id: d.id } as Vehicle)) }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'vehicles')
      );

      const unsubRoutes = onSnapshot(
        collection(db, 'routes'),
        snap => {
          setRawState(prev => ({ ...prev, routes: snap.docs.map(d => ({ ...d.data(), id: d.id } as RouteDef)) }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'routes')
      );

      const unsubAssignments = onSnapshot(
        collection(db, 'assignments'),
        snap => {
          setRawState(prev => ({
            ...prev,
            assignments: snap.docs.map(d => {
              const data = d.data();
              let finalData = { ...data, id: d.id } as Assignment;
              const metaIncident = finalData.incidents?.find(i => i.id === 'SYS_META');
              if (metaIncident) {
                try {
                  const meta = JSON.parse(metaIncident.description);
                  finalData = { ...finalData, ...meta, incidents: finalData.incidents.filter(i => i.id !== 'SYS_META') };
                } catch {}
              }
              return finalData;
            }),
          }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'assignments')
      );

      const unsubCrews = onSnapshot(
        collection(db, 'crews'),
        snap => {
          setRawState(prev => ({ ...prev, crews: snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewTemplate)) }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'crews')
      );

      const unsubAttendances = onSnapshot(
        collection(db, 'attendances'),
        snap => {
          setRawState(prev => ({ ...prev, attendances: snap.docs.map(d => ({ ...d.data(), id: d.id } as Attendance)) }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'attendances')
      );

      const unsubDriverShifts = onSnapshot(
        collection(db, 'driver_shifts'),
        snap => {
          const docs = snap.docs
            .map(d => ({ ...d.data(), id: d.id } as DriverShift))
            .sort((a, b) => (b.t1StartShiftAt || '').localeCompare(a.t1StartShiftAt || ''));
          setRawState(prev => ({ ...prev, driverShifts: docs }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'driver_shifts')
      );

      const unsubBreakdownAuditLogs = onSnapshot(
        collection(db, 'breakdown_audit_logs'),
        snap => {
          const docs = snap.docs
            .map(d => ({ ...d.data(), id: d.id } as BreakdownAuditLog))
            .sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''));
          setRawState(prev => ({ ...prev, breakdownAuditLogs: docs }));
          setSyncStatus(prev => ({ ...prev, isOnline: true, lastSyncTime: new Date().toLocaleTimeString() }));
        },
        err => logSnapshotError(err, 'breakdown_audit_logs')
      );

      return () => {
        unsubWorkGroups();
        unsubEmployees();
        unsubVehicles();
        unsubRoutes();
        unsubAssignments();
        unsubCrews();
        unsubAttendances();
        unsubDriverShifts();
        unsubBreakdownAuditLogs();
      };
    }

    if (backendMode === true) {
      setSyncStatus(prev => ({ ...prev, isOnline: true, syncProtocol: 'Backend Realtime SSE' }));
      void refreshFromBackend();

      let es: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const connectStream = () => {
        if (closed) return;
        try {
          es = new EventSource(getSyncStreamUrl(), { withCredentials: true });
          es.onmessage = event => {
            try {
              const payload = JSON.parse(event.data);
              if (payload?.type === 'sync') {
                void refreshFromBackend();
              }
            } catch {
              // ignore heartbeat/invalid frames
            }
          };
          es.onerror = () => {
            es?.close();
            es = null;
            if (!closed && !reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectStream();
              }, 3000);
            }
          };
        } catch {
          // fallback polling handles updates
        }
      };

      connectStream();

      const fallbackMs = Math.max(5, syncStatus.latencyInterval || 15) * 1000;
      const pollTimer = setInterval(() => {
        void refreshFromBackend();
      }, fallbackMs);

      return () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        clearInterval(pollTimer);
        es?.close();
      };
    }

    setSyncStatus(prev => ({ ...prev, isOnline: false }));
  }, [user, lockedWorkGroupId, backendMode, refreshFromBackend, syncStatus.latencyInterval]);

  // Enforce RBAC & Group Isolation on the exposed state
  const state = useMemo<AppState>(() => {
    if (!user) return defaultState;

    const resolvedConductorId = isConductor
      ? user.employeeId || resolveUserConductorEmployee(user, rawState.employees)?.id || ''
      : '';

    if (lockedWorkGroupId) {
      const lockedGroup = rawState.workGroups.find(wg => wg.id === lockedWorkGroupId);
      const lockedGroupName = lockedGroup?.name?.trim().toLowerCase();

      const matchesGroup = (wgId?: string, legacyWgName?: string) => {
        if (wgId === lockedWorkGroupId) return true;
        if (!wgId && legacyWgName && lockedGroupName && legacyWgName.trim().toLowerCase() === lockedGroupName) return true;
        return false;
      };

      const filteredShifts = rawState.driverShifts
        .filter(s => s.workGroupId === lockedWorkGroupId)
        .filter(s => !isConductor || s.createdByUserId === user.id || (resolvedConductorId && s.driverId === resolvedConductorId));

      return {
        ...rawState,
        workGroups: rawState.workGroups.filter(wg => wg.id === lockedWorkGroupId),
        activeWorkGroupId: lockedWorkGroupId,
        employees: rawState.employees.filter(e => matchesGroup(e.workGroupId, e.workGroup)),
        vehicles: rawState.vehicles.filter(v => v.workGroupId === lockedWorkGroupId),
        routes: rawState.routes.filter(r => r.workGroupId === lockedWorkGroupId),
        assignments: rawState.assignments.filter(a => a.workGroupId === lockedWorkGroupId),
        crews: rawState.crews.filter(c => c.workGroupId === lockedWorkGroupId),
        attendances: rawState.attendances.filter(att => att.workGroupId === lockedWorkGroupId),
        driverShifts: filteredShifts,
        breakdownAuditLogs: isConductor
          ? []
          : rawState.breakdownAuditLogs.filter(l => l.workGroupId === lockedWorkGroupId),
      };
    }

    if (isConductor) {
      return {
        ...rawState,
        driverShifts: rawState.driverShifts.filter(
          s => s.createdByUserId === user.id || (resolvedConductorId && s.driverId === resolvedConductorId)
        ),
        breakdownAuditLogs: [],
      };
    }

    return rawState;
  }, [rawState, user, lockedWorkGroupId, isConductor]);

  const useBackendSync = backendMode === true;

  const syncNow = useCallback(async () => {
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    try {
      if (useBackendSync) {
        await refreshFromBackend();
      } else {
        await new Promise(r => setTimeout(r, 350));
      }
    } finally {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date().toLocaleTimeString(),
      }));
    }
  }, [useBackendSync, refreshFromBackend]);

  const setLatencyInterval = (seconds: number) => {
    setSyncStatus(prev => ({ ...prev, latencyInterval: seconds }));
  };

  const setBackupEmail = (email: string) => {
    localStorage.setItem('PROMO_BACKUP_EMAIL', email);
    setRawState(prev => ({ ...prev, backupEmail: email }));
  };

  const triggerManualBackup = () => {
    const now = new Date().toISOString();
    localStorage.setItem('PROMO_LAST_BACKUP', now);
    setRawState(prev => ({ ...prev, lastBackupDate: now }));
  };

  const setActiveWorkGroup = (id: string | null) => {
    if (lockedWorkGroupId) {
      localStorage.setItem('PROMO_ACTIVE_GROUP', lockedWorkGroupId);
      setRawState(prev => ({ ...prev, activeWorkGroupId: lockedWorkGroupId }));
      return;
    }
    if (id) {
      localStorage.setItem('PROMO_ACTIVE_GROUP', id);
    } else {
      localStorage.removeItem('PROMO_ACTIVE_GROUP');
    }
    setRawState(prev => ({ ...prev, activeWorkGroupId: id }));
  };

  const addWorkGroup = async (name: string) => {
    if (!canManageAllGroups) return;
    try {
      if (useBackendSync) {
        const { id } = await syncCreateDocApi('workGroups', { name });
        await refreshFromBackend();
        setActiveWorkGroup(id);
        return;
      }
      const docRef = doc(collection(db, 'workGroups'));
      await setDoc(docRef, { name });
      setActiveWorkGroup(docRef.id);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteWorkGroup = async (id: string) => {
    if (!canManageAllGroups) return;
    try {
      if (useBackendSync) {
        await syncDeleteDocApi('workGroups', id);
        await refreshFromBackend();
        return;
      }
      await deleteDoc(doc(db, 'workGroups', id));
    } catch (e) {
      console.error(e);
    }
  };

  const resolveScopedWorkGroupId = (requestedId?: string) => {
    if (lockedWorkGroupId) return lockedWorkGroupId;
    return requestedId || state.activeWorkGroupId || '';
  };

  const addEmployee = async (emp: Omit<Employee, 'id'>) => {
    try {
      const payload = { ...emp, workGroupId: resolveScopedWorkGroupId(emp.workGroupId) };
      if (useBackendSync) {
        await syncCreateDocApi('employees', payload);
        await refreshFromBackend();
        return;
      }
      const docRef = doc(collection(db, 'employees'));
      await setDoc(docRef, payload);
    } catch (e) {
      console.error(e);
    }
  };

  const updateEmployee = async (id: string, emp: Partial<Employee>) => {
    try {
      const safeEmp = lockedWorkGroupId ? { ...emp, workGroupId: lockedWorkGroupId } : emp;
      if (useBackendSync) {
        await syncUpdateDocApi('employees', id, safeEmp);
        await refreshFromBackend();
        return;
      }
      await updateDoc(doc(db, 'employees', id), safeEmp);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      if (useBackendSync) {
        await syncDeleteDocApi('employees', id);
        await refreshFromBackend();
        return;
      }
      await deleteDoc(doc(db, 'employees', id));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteAllEmployees = async () => {
    if (!canManageAllGroups) return;
    try {
      if (useBackendSync) {
        await syncDeleteAllEmployeesApi();
        await refreshFromBackend();
        return;
      }
      const batch = writeBatch(db);
      state.employees.forEach(e => batch.delete(doc(db, 'employees', e.id)));
      await batch.commit();
    } catch (e) {
      console.error(e);
    }
  };

  const importEmployeesBulk = async (rawRows: any[]) => {
    try {
      if (useBackendSync) {
        await syncBulkEmployeesApi(rawRows, state.activeWorkGroupId);
        await refreshFromBackend();
        return;
      }
      const batch = writeBatch(db);
      let currentWorkGroups = [...rawState.workGroups];

      const normalizeRole = (val: any): EmployeeRole => {
        const str = String(val || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (str.includes('conduct') || str.includes('chofer') || str.includes('driver')) return 'Conductor';
        if (str.includes('ayud') || str.includes('auxil') || str.includes('peon') || str.includes('asist')) return 'Ayudante';
        if (str.includes('coord') || str.includes('superv') || str.includes('lider') || str.includes('jefe') || str.includes('admin')) return 'Coordinador';
        return 'Conductor';
      };

      for (const row of rawRows) {
        const lastName = String(row.apellido || row.apellidos || row.lastname || row.last_name || '').trim();
        const firstName = String(row.nombre || row.nombres || row.firstname || row.first_name || row.name || '').trim();
        const rawRole = row.roll || row.rol || row.cargo || row.puesto || row.funcion || row.role || '';
        const role = normalizeRole(rawRole);
        const phone = String(row.telefono || row.telefonos || row.celular || row.tel || row.phone || row.movil || '').trim();
        const rawGroup = String(row.grupo || row.grupos || row.group || row.area || row.zona || '').trim();

        let assignedGroupId = lockedWorkGroupId || state.activeWorkGroupId || '';

        if (!lockedWorkGroupId && rawGroup) {
          let foundGroup = currentWorkGroups.find(g => g.name.trim().toLowerCase() === rawGroup.toLowerCase());
          if (!foundGroup) {
            const wgRef = doc(collection(db, 'workGroups'));
            foundGroup = { id: wgRef.id, name: rawGroup };
            currentWorkGroups.push(foundGroup);
            batch.set(wgRef, { name: rawGroup });
          }
          assignedGroupId = foundGroup.id;
        }

        const fullName = `${firstName} ${lastName}`.trim() || firstName || lastName || 'Sin Nombre';
        const empRef = doc(collection(db, 'employees'));
        batch.set(empRef, {
          name: fullName,
          firstName,
          lastName,
          role,
          phone,
          workGroup: rawGroup,
          workGroupId: assignedGroupId,
        });
      }
      await batch.commit();
    } catch (e) {
      console.error(e);
    }
  };

  const addVehicle = async (veh: Omit<Vehicle, 'id'>) => {
    try {
      const payload = { ...veh, workGroupId: resolveScopedWorkGroupId(veh.workGroupId) };
      if (useBackendSync) {
        await syncCreateDocApi('vehicles', payload);
        await refreshFromBackend();
        return;
      }
      const docRef = doc(collection(db, 'vehicles'));
      await setDoc(docRef, payload);
    } catch (e) {
      console.error(e);
    }
  };

  const updateVehicle = async (id: string, veh: Partial<Vehicle>) => {
    try {
      const safeVeh = lockedWorkGroupId ? { ...veh, workGroupId: lockedWorkGroupId } : veh;
      if (useBackendSync) {
        await syncUpdateDocApi('vehicles', id, safeVeh);
        await refreshFromBackend();
        return;
      }
      await updateDoc(doc(db, 'vehicles', id), safeVeh);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      if (useBackendSync) {
        await syncDeleteDocApi('vehicles', id);
        await refreshFromBackend();
        return;
      }
      await deleteDoc(doc(db, 'vehicles', id));
    } catch (e) {
      console.error(e);
    }
  };

  const addRoute = async (route: Omit<RouteDef, 'id'>) => {
    try {
      const payload = { ...route, workGroupId: resolveScopedWorkGroupId(route.workGroupId) };
      if (useBackendSync) {
        await syncCreateDocApi('routes', payload);
        await refreshFromBackend();
        return;
      }
      const docRef = doc(collection(db, 'routes'));
      await setDoc(docRef, payload);
    } catch (e) {
      console.error(e);
    }
  };

  const updateRoute = async (id: string, route: Partial<RouteDef>) => {
    try {
      const safeRoute = lockedWorkGroupId ? { ...route, workGroupId: lockedWorkGroupId } : route;
      if (useBackendSync) {
        await syncUpdateDocApi('routes', id, safeRoute);
        await refreshFromBackend();
        return;
      }
      await updateDoc(doc(db, 'routes', id), safeRoute);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRoute = async (id: string) => {
    try {
      if (useBackendSync) {
        await syncDeleteDocApi('routes', id);
        await refreshFromBackend();
        return;
      }
      await deleteDoc(doc(db, 'routes', id));
    } catch (e) {
      console.error(e);
    }
  };

  const addCrew = async (crew: Omit<CrewTemplate, 'id'>) => {
    const check = validateCrewSelection({
      driverId: crew.driverId,
      assistantIds: crew.assistantIds || [],
      employees: rawState.employees,
    });
    if (!check.ok) {
      throw new Error(check.error || 'Configuración de tripulación inválida.');
    }

    try {
      const payload = {
        ...crew,
        assistantIds: check.normalizedAssistantIds || [],
        workGroupId: resolveScopedWorkGroupId(crew.workGroupId),
      };
      if (useBackendSync) {
        await syncCreateDocApi('crews', payload);
        if (!isFirebaseConfigured || !db) await refreshFromBackend();
        return;
      }
      const docRef = doc(collection(db, 'crews'));
      try {
        await setDoc(docRef, payload);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, `crews/${docRef.id}`);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const updateCrew = async (id: string, crew: Partial<CrewTemplate>) => {
    const existing = rawState.crews.find(c => c.id === id);
    const nextDriverId = crew.driverId ?? existing?.driverId ?? '';
    const nextAssistants = crew.assistantIds ?? existing?.assistantIds ?? [];
    const check = validateCrewSelection({
      driverId: nextDriverId,
      assistantIds: nextAssistants,
      employees: rawState.employees,
    });
    if (!check.ok) {
      throw new Error(check.error || 'Configuración de tripulación inválida.');
    }

    try {
      const safeCrew = lockedWorkGroupId
        ? { ...crew, assistantIds: check.normalizedAssistantIds, workGroupId: lockedWorkGroupId }
        : { ...crew, assistantIds: check.normalizedAssistantIds };
      if (useBackendSync) {
        await syncUpdateDocApi('crews', id, safeCrew);
        if (!isFirebaseConfigured || !db) await refreshFromBackend();
        return;
      }
      try {
        await updateDoc(doc(db, 'crews', id), safeCrew);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.UPDATE, `crews/${id}`);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const deleteCrew = async (id: string) => {
    try {
      if (useBackendSync) {
        await syncDeleteDocApi('crews', id);
        await refreshFromBackend();
        return;
      }
      await deleteDoc(doc(db, 'crews', id));
    } catch (e) {
      console.error(e);
    }
  };

  const addAssignment = async (assignment: Omit<Assignment, 'id' | 'status' | 'incidents'>) => {
    const check = validateAssignmentSelection({
      routeId: assignment.routeId,
      vehicleId: assignment.vehicleId,
      employeeIds: assignment.employeeIds || [],
      routes: rawState.routes,
      vehicles: rawState.vehicles,
      employees: rawState.employees,
      requireOperationalVehicle: true,
    });
    if (!check.ok || !check.normalizedEmployeeIds) {
      throw new Error(check.error || 'Datos de asignación inválidos.');
    }

    const scopedGroupId = resolveScopedWorkGroupId(assignment.workGroupId);
    if (check.route?.workGroupId && scopedGroupId && check.route.workGroupId !== scopedGroupId) {
      throw new Error('La ruta seleccionada no pertenece al grupo de trabajo activo.');
    }
    if (check.vehicle?.workGroupId && scopedGroupId && check.vehicle.workGroupId !== scopedGroupId) {
      throw new Error('El vehículo seleccionado no pertenece al grupo de trabajo activo.');
    }

    try {
      const nowIso = new Date().toISOString();
      const createdAt = assignment.date || nowIso;

      const meta = {
        createdAt,
        statusHistory: [{ status: 'Pendiente', timestamp: createdAt }],
      };

      const metaIncident: Incident = {
        id: 'SYS_META',
        timestamp: nowIso,
        type: 'Otro',
        description: JSON.stringify(meta),
        startTime: '',
        endTime: '',
      };

      const payload = {
        routeId: assignment.routeId,
        vehicleId: assignment.vehicleId,
        employeeIds: check.normalizedEmployeeIds,
        date: assignment.date,
        status: 'Pendiente',
        incidents: [metaIncident],
        workGroupId: scopedGroupId,
        weightTons: assignment.weightTons || 0,
      };

      if (useBackendSync) {
        await syncCreateDocApi('assignments', payload);
        if (!isFirebaseConfigured || !db) await refreshFromBackend();
        return;
      }

      const docRef = doc(collection(db, 'assignments'));
      try {
        await setDoc(docRef, payload);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, `assignments/${docRef.id}`);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const updateAssignmentStatus = async (id: string, status: Assignment['status'], weightTons?: number, customTimestamp?: string) => {
    try {
      const assignment = state.assignments.find(a => a.id === id);
      if (!assignment) return;
      const tsIso = customTimestamp ? new Date(customTimestamp).toISOString() : new Date().toISOString();
      const updateData: any = { status };
      if (weightTons !== undefined) {
        updateData.weightTons = weightTons;
      }

      const meta: any = {
        salidaBaseAt: assignment?.salidaBaseAt,
        inicioRutaAt: assignment?.inicioRutaAt,
        finRutaAt: assignment?.finRutaAt,
        llegadaBaseAt: assignment?.llegadaBaseAt,
        createdAt: assignment?.createdAt,
      };

      if (status === 'Salida de Base') meta.salidaBaseAt = tsIso;
      if (status === 'Inicio de Ruta') meta.inicioRutaAt = tsIso;
      if (status === 'Fin de Ruta') meta.finRutaAt = tsIso;
      if (status === 'Base') meta.llegadaBaseAt = tsIso;

      const currentHistory = assignment?.statusHistory || [];
      meta.statusHistory = [...currentHistory, { status, timestamp: tsIso }];

      const metaIncident: Incident = {
        id: 'SYS_META',
        timestamp: tsIso,
        type: 'Otro',
        description: JSON.stringify(meta),
        startTime: '',
        endTime: '',
      };

      const baseIncidents = (assignment?.incidents || []).filter(i => i.id !== 'SYS_META');
      updateData.incidents = [...baseIncidents, metaIncident];

      if (useBackendSync) {
        await syncUpdateDocApi('assignments', id, updateData);
        await refreshFromBackend();
      } else {
        await updateDoc(doc(db, 'assignments', id), updateData);
      }

      // Sync milestone timestamps/weight to linked primary DriverShift if supervisor/admin/gestion
      if (user && ['admin', 'gestion', 'supervisor'].includes(user.role)) {
        const linkedShift = findLinkedDriverShiftForAssignment(
          assignment,
          rawState.driverShifts,
          rawState.vehicles,
          rawState.employees
        );
        if (linkedShift) {
          try {
            const t1 = meta.salidaBaseAt || linkedShift.t1StartShiftAt;
            const t2 = meta.inicioRutaAt ?? linkedShift.t2StartRouteAt ?? null;
            const t3 = meta.finRutaAt ?? linkedShift.t3EndRouteAt ?? null;
            const t4 = meta.llegadaBaseAt ?? linkedShift.t4ArriveBaseAt ?? null;
            await updateShiftTimesApi(linkedShift.id, {
              t1StartShiftAt: t1,
              t2StartRouteAt: t2,
              t3EndRouteAt: t3,
              t4ArriveBaseAt: t4,
              ...(weightTons !== undefined ? { weightTons } : {}),
            });
            if (useBackendSync) await refreshFromBackend();
          } catch (syncErr) {
            console.warn('No se pudo sincronizar cambio de estado con jornada de conductor:', syncErr);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateAssignmentResources = async (
    id: string,
    updates: { vehicleId?: string; employeeIds?: string[]; statusTimestamps?: Record<string, string> }
  ) => {
    const assignment = state.assignments.find(a => a.id === id);
    if (!assignment) return;

    const targetVehicleId = updates.vehicleId ?? assignment.vehicleId;
    const targetEmployeeIds = updates.employeeIds ?? assignment.employeeIds;
    const vehicleChanged = updates.vehicleId !== undefined && updates.vehicleId !== assignment.vehicleId;
    const crewChanged = updates.employeeIds !== undefined;

    let normalizedEmployeeIds = assignment.employeeIds;
    if (crewChanged) {
      const check = validateAssignmentSelection({
        routeId: assignment.routeId,
        vehicleId: targetVehicleId,
        employeeIds: targetEmployeeIds,
        routes: rawState.routes,
        vehicles: rawState.vehicles,
        employees: rawState.employees,
        requireOperationalVehicle: vehicleChanged,
      });
      if (!check.ok || !check.normalizedEmployeeIds) {
        throw new Error(check.error || 'Los recursos asignados no cumplen con las reglas (1 Conductor y máximo 3 Auxiliares).');
      }
      normalizedEmployeeIds = check.normalizedEmployeeIds;
    } else if (vehicleChanged) {
      const routeMatch = rawState.routes.find(r => r.id === assignment.routeId);
      const vehicleMatch = rawState.vehicles.find(v => v.id === targetVehicleId);
      if (!routeMatch) {
        throw new Error('La ruta asociada a la asignación no existe en el catálogo.');
      }
      if (!vehicleMatch) {
        throw new Error('Debe seleccionar un vehículo existente en el catálogo.');
      }
      if (vehicleMatch.status !== 'Operativo') {
        throw new Error(`El vehículo Móvil ${vehicleMatch.internalNumber} (${vehicleMatch.plate}) figura como Inoperativo.`);
      }
    }

    try {
      const updateData: any = {};
      if (updates.vehicleId !== undefined) updateData.vehicleId = updates.vehicleId;
      if (updates.employeeIds !== undefined) updateData.employeeIds = normalizedEmployeeIds;

      const meta: any = {
        salidaBaseAt: assignment.salidaBaseAt,
        inicioRutaAt: assignment.inicioRutaAt,
        finRutaAt: assignment.finRutaAt,
        llegadaBaseAt: assignment.llegadaBaseAt,
        createdAt: assignment.createdAt,
      };

      if (updates.statusTimestamps) {
        const newHistory = (assignment.statusHistory || []).map(h => ({
          ...h,
          timestamp: updates.statusTimestamps![h.status] || h.timestamp,
        }));
        meta.statusHistory = newHistory;

        if (updates.statusTimestamps['Salida de Base'])
          meta.salidaBaseAt = new Date(updates.statusTimestamps['Salida de Base']).toISOString();
        if (updates.statusTimestamps['Inicio de Ruta'])
          meta.inicioRutaAt = new Date(updates.statusTimestamps['Inicio de Ruta']).toISOString();
        if (updates.statusTimestamps['Fin de Ruta'])
          meta.finRutaAt = new Date(updates.statusTimestamps['Fin de Ruta']).toISOString();
        if (updates.statusTimestamps['Base'])
          meta.llegadaBaseAt = new Date(updates.statusTimestamps['Base']).toISOString();
        if (updates.statusTimestamps['Pendiente'])
          meta.createdAt = new Date(updates.statusTimestamps['Pendiente']).toISOString();

        const metaIncident: Incident = {
          id: 'SYS_META',
          timestamp: new Date().toISOString(),
          type: 'Otro',
          description: JSON.stringify(meta),
          startTime: '',
          endTime: '',
        };
        const baseIncidents = (assignment.incidents || []).filter(i => i.id !== 'SYS_META');
        updateData.incidents = [...baseIncidents, metaIncident];
      }

      if (useBackendSync) {
        await syncUpdateDocApi('assignments', id, updateData);
        if (!isFirebaseConfigured || !db) await refreshFromBackend();
      } else {
        try {
          await updateDoc(doc(db, 'assignments', id), updateData);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.UPDATE, `assignments/${id}`);
        }
      }

      if (updates.statusTimestamps && user && ['admin', 'gestion', 'supervisor'].includes(user.role)) {
        const linkedShift = findLinkedDriverShiftForAssignment(
          assignment,
          rawState.driverShifts,
          rawState.vehicles,
          rawState.employees
        );
        if (linkedShift) {
          try {
            await updateShiftTimesApi(linkedShift.id, {
              t1StartShiftAt: meta.salidaBaseAt || linkedShift.t1StartShiftAt,
              t2StartRouteAt: meta.inicioRutaAt ?? linkedShift.t2StartRouteAt ?? null,
              t3EndRouteAt: meta.finRutaAt ?? linkedShift.t3EndRouteAt ?? null,
              t4ArriveBaseAt: meta.llegadaBaseAt ?? linkedShift.t4ArriveBaseAt ?? null,
            });
            if (useBackendSync && (!isFirebaseConfigured || !db)) await refreshFromBackend();
          } catch (syncErr) {
            console.warn('No se pudo sincronizar tiempos con jornada de conductor:', syncErr);
          }
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const addIncident = async (assignmentId: string, incident: Omit<Incident, 'id' | 'timestamp'>) => {
    try {
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) return;

      const newIncident: Incident = {
        ...incident,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };

      const meta: any = {
        salidaBaseAt: assignment.salidaBaseAt,
        inicioRutaAt: assignment.inicioRutaAt,
        finRutaAt: assignment.finRutaAt,
        llegadaBaseAt: assignment.llegadaBaseAt,
        createdAt: assignment.createdAt,
        statusHistory: assignment.statusHistory,
      };

      const metaIncident: Incident = {
        id: 'SYS_META',
        timestamp: new Date().toISOString(),
        type: 'Otro',
        description: JSON.stringify(meta),
        startTime: '',
        endTime: '',
      };

      const updatedIncidents = [...(assignment.incidents || []), newIncident, metaIncident];

      if (useBackendSync) {
        await syncUpdateDocApi('assignments', assignmentId, { incidents: updatedIncidents });
        await refreshFromBackend();
        return;
      }

      await updateDoc(doc(db, 'assignments', assignmentId), { incidents: updatedIncidents });
    } catch (e) {
      console.error(e);
    }
  };

  const saveAttendance = async (attendance: Omit<Attendance, 'id'>) => {
    try {
      const docId = `${attendance.employeeId}_${attendance.date}`;
      const payload = {
        ...attendance,
        workGroupId: resolveScopedWorkGroupId(attendance.workGroupId),
      };
      if (useBackendSync) {
        await syncCreateDocApi('attendances', payload, docId);
        await refreshFromBackend();
        return;
      }
      await setDoc(doc(db, 'attendances', docId), payload);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppContext.Provider
      value={{
        state,
        syncStatus,
        useBackendSync,
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
        updateAssignmentResources,
        addIncident,
        saveAttendance,
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
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

