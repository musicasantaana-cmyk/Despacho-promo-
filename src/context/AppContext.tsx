import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Employee, EmployeeRole, Vehicle, RouteDef, Assignment, Incident, WorkGroup, CrewTemplate, SyncStatus, Attendance } from '../types';
import { db, auth } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';

interface AppContextProps {
  state: AppState;
  syncStatus: SyncStatus;
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
  backupEmail: null,
  lastBackupDate: null,
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(() => {
    // Try to load active group & backup preferences from local storage
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

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: null,
    latencyInterval: 15,
    serverVersion: 2,
    deviceId: 'FB-SYNC-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    syncProtocol: 'Firestore Realtime',
  });

  useEffect(() => {
    setSyncStatus(prev => ({ ...prev, isOnline: true }));

    const unsubWorkGroups = onSnapshot(collection(db, 'workGroups'), snap => {
      const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkGroup));
      setState(prev => {
        let nextActive = prev.activeWorkGroupId;
        if (!nextActive && docs.length > 0) nextActive = docs[0].id;
        if (nextActive && !docs.find(g => g.id === nextActive)) nextActive = docs.length > 0 ? docs[0].id : null;
        if (nextActive) localStorage.setItem('PROMO_ACTIVE_GROUP', nextActive);
        return { ...prev, workGroups: docs, activeWorkGroupId: nextActive };
      });
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error workGroups", err));

    const unsubEmployees = onSnapshot(collection(db, 'employees'), snap => {
      setState(prev => ({ ...prev, employees: snap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error employees", err));

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), snap => {
      setState(prev => ({ ...prev, vehicles: snap.docs.map(d => ({ ...d.data(), id: d.id } as Vehicle)) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error vehicles", err));

    const unsubRoutes = onSnapshot(collection(db, 'routes'), snap => {
      setState(prev => ({ ...prev, routes: snap.docs.map(d => ({ ...d.data(), id: d.id } as RouteDef)) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error routes", err));

    const unsubAssignments = onSnapshot(collection(db, 'assignments'), snap => {
      setState(prev => ({ ...prev, assignments: snap.docs.map(d => {
        const data = d.data();
        let finalData = { ...data, id: d.id } as Assignment;
        const metaIncident = finalData.incidents?.find(i => i.id === 'SYS_META');
        if (metaIncident) {
          try {
            const meta = JSON.parse(metaIncident.description);
            finalData = { ...finalData, ...meta, incidents: finalData.incidents.filter(i => i.id !== 'SYS_META') };
          } catch(e) {}
        }
        return finalData;
      }) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error assignments", err));

    const unsubCrews = onSnapshot(collection(db, 'crews'), snap => {
      setState(prev => ({ ...prev, crews: snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewTemplate)) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error crews", err));

    const unsubAttendances = onSnapshot(collection(db, 'attendances'), snap => {
      setState(prev => ({ ...prev, attendances: snap.docs.map(d => ({ ...d.data(), id: d.id } as Attendance)) }));
      setSyncStatus(prev => ({ ...prev, lastSyncTime: new Date().toLocaleTimeString() }));
    }, (err) => console.error("Firestore error attendances", err));

    return () => {
      unsubWorkGroups(); unsubEmployees(); unsubVehicles(); unsubRoutes(); unsubAssignments(); unsubCrews(); unsubAttendances();
    };
  }, []);

  const syncNow = async () => {
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    // Realtime listener handles updates automatically; simulate brief sync indicator
    await new Promise(r => setTimeout(r, 400));
    setSyncStatus(prev => ({ 
      ...prev, 
      isSyncing: false, 
      lastSyncTime: new Date().toLocaleTimeString() 
    }));
  };

  const setLatencyInterval = (seconds: number) => {
    setSyncStatus(prev => ({ ...prev, latencyInterval: seconds }));
  };

  const setBackupEmail = (email: string) => {
    localStorage.setItem('PROMO_BACKUP_EMAIL', email);
    setState(prev => ({ ...prev, backupEmail: email }));
  };

  const triggerManualBackup = () => {
    const now = new Date().toISOString();
    localStorage.setItem('PROMO_LAST_BACKUP', now);
    setState(prev => ({ ...prev, lastBackupDate: now }));
  };

  const setActiveWorkGroup = (id: string | null) => {
    if (id) {
      localStorage.setItem('PROMO_ACTIVE_GROUP', id);
    } else {
      localStorage.removeItem('PROMO_ACTIVE_GROUP');
    }
    setState(prev => ({ ...prev, activeWorkGroupId: id }));
  };

  const addWorkGroup = async (name: string) => {
    try {
      const docRef = doc(collection(db, 'workGroups'));
      await setDoc(docRef, { name });
      setActiveWorkGroup(docRef.id);
    } catch (e) { console.error(e); }
  };

  const deleteWorkGroup = async (id: string) => {
    try { await deleteDoc(doc(db, 'workGroups', id)); } catch (e) { console.error(e); }
  };

  const addEmployee = async (emp: Omit<Employee, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'employees'));
      await setDoc(docRef, { ...emp, workGroupId: emp.workGroupId || state.activeWorkGroupId || '' });
    } catch (e) { console.error(e); }
  };

  const updateEmployee = async (id: string, emp: Partial<Employee>) => {
    try { await updateDoc(doc(db, 'employees', id), emp); } catch (e) { console.error(e); }
  };

  const deleteEmployee = async (id: string) => {
    try { await deleteDoc(doc(db, 'employees', id)); } catch (e) { console.error(e); }
  };

  const deleteAllEmployees = async () => {
    try {
      const batch = writeBatch(db);
      state.employees.forEach(e => batch.delete(doc(db, 'employees', e.id)));
      await batch.commit();
    } catch (e) { console.error(e); }
  };

  const importEmployeesBulk = async (rawRows: any[]) => {
    try {
      const batch = writeBatch(db);
      let currentWorkGroups = [...state.workGroups];
      
      const normalizeRole = (val: any): EmployeeRole => {
        const str = String(val || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
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

        let assignedGroupId = state.activeWorkGroupId || '';

        if (rawGroup) {
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
          firstName: firstName,
          lastName: lastName,
          role,
          phone,
          workGroup: rawGroup,
          workGroupId: assignedGroupId,
        });
      }
      await batch.commit();
    } catch (e) { console.error(e); }
  };

  const addVehicle = async (veh: Omit<Vehicle, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'vehicles'));
      await setDoc(docRef, { ...veh, workGroupId: veh.workGroupId || state.activeWorkGroupId || '' });
    } catch (e) { console.error(e); }
  };

  const updateVehicle = async (id: string, veh: Partial<Vehicle>) => {
    try { await updateDoc(doc(db, 'vehicles', id), veh); } catch (e) { console.error(e); }
  };

  const deleteVehicle = async (id: string) => {
    try { await deleteDoc(doc(db, 'vehicles', id)); } catch (e) { console.error(e); }
  };

  const addRoute = async (route: Omit<RouteDef, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'routes'));
      await setDoc(docRef, { ...route, workGroupId: route.workGroupId || state.activeWorkGroupId || '' });
    } catch (e) { console.error(e); }
  };

  const updateRoute = async (id: string, route: Partial<RouteDef>) => {
    try { await updateDoc(doc(db, 'routes', id), route); } catch (e) { console.error(e); }
  };

  const deleteRoute = async (id: string) => {
    try { await deleteDoc(doc(db, 'routes', id)); } catch (e) { console.error(e); }
  };

  const addCrew = async (crew: Omit<CrewTemplate, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'crews'));
      await setDoc(docRef, { ...crew, workGroupId: crew.workGroupId || state.activeWorkGroupId || '' });
    } catch (e) { console.error(e); }
  };

  const updateCrew = async (id: string, crew: Partial<CrewTemplate>) => {
    try { await updateDoc(doc(db, 'crews', id), crew); } catch (e) { console.error(e); }
  };

  const deleteCrew = async (id: string) => {
    try { await deleteDoc(doc(db, 'crews', id)); } catch (e) { console.error(e); }
  };

  const addAssignment = async (assignment: Omit<Assignment, 'id' | 'status' | 'incidents'>) => {
    try {
      const nowIso = new Date().toISOString();
      const createdAt = assignment.date || nowIso;
      
      const meta = {
        createdAt,
        statusHistory: [{ status: 'Pendiente', timestamp: createdAt }]
      };

      const metaIncident: Incident = {
        id: 'SYS_META',
        timestamp: nowIso,
        type: 'Otro',
        description: JSON.stringify(meta),
        startTime: '',
        endTime: ''
      };

      const docRef = doc(collection(db, 'assignments'));
      await setDoc(docRef, {
        routeId: assignment.routeId,
        vehicleId: assignment.vehicleId,
        employeeIds: assignment.employeeIds,
        date: assignment.date,
        status: 'Pendiente',
        incidents: [metaIncident],
        workGroupId: assignment.workGroupId || state.activeWorkGroupId || '',
        weightTons: assignment.weightTons || 0
      });
    } catch (e) { console.error(e); }
  };

  const updateAssignmentStatus = async (id: string, status: Assignment['status'], weightTons?: number, customTimestamp?: string) => {
    try { 
      const assignment = state.assignments.find(a => a.id === id);
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
        endTime: ''
      };

      const baseIncidents = (assignment?.incidents || []).filter(i => i.id !== 'SYS_META');
      updateData.incidents = [...baseIncidents, metaIncident];

      await updateDoc(doc(db, 'assignments', id), updateData); 
    } catch (e) { console.error(e); }
  };

  const updateAssignmentResources = async (id: string, updates: { vehicleId?: string; employeeIds?: string[]; statusTimestamps?: Record<string, string> }) => {
    try {
      const assignment = state.assignments.find(a => a.id === id);
      if (!assignment) return;
      const updateData: any = {};
      if (updates.vehicleId !== undefined) updateData.vehicleId = updates.vehicleId;
      if (updates.employeeIds !== undefined) updateData.employeeIds = updates.employeeIds;
      if (updates.statusTimestamps) {
        const meta: any = {
          salidaBaseAt: assignment.salidaBaseAt,
          inicioRutaAt: assignment.inicioRutaAt,
          finRutaAt: assignment.finRutaAt,
          llegadaBaseAt: assignment.llegadaBaseAt,
          createdAt: assignment.createdAt,
        };

        const newHistory = (assignment.statusHistory || []).map(h => ({
          ...h,
          timestamp: updates.statusTimestamps![h.status] || h.timestamp
        }));
        meta.statusHistory = newHistory;

        if (updates.statusTimestamps['Salida de Base']) meta.salidaBaseAt = new Date(updates.statusTimestamps['Salida de Base']).toISOString();
        if (updates.statusTimestamps['Inicio de Ruta']) meta.inicioRutaAt = new Date(updates.statusTimestamps['Inicio de Ruta']).toISOString();
        if (updates.statusTimestamps['Fin de Ruta']) meta.finRutaAt = new Date(updates.statusTimestamps['Fin de Ruta']).toISOString();
        if (updates.statusTimestamps['Base']) meta.llegadaBaseAt = new Date(updates.statusTimestamps['Base']).toISOString();
        if (updates.statusTimestamps['Pendiente']) meta.createdAt = new Date(updates.statusTimestamps['Pendiente']).toISOString();

        const metaIncident: Incident = {
          id: 'SYS_META',
          timestamp: new Date().toISOString(),
          type: 'Otro',
          description: JSON.stringify(meta),
          startTime: '',
          endTime: ''
        };
        const baseIncidents = (assignment.incidents || []).filter(i => i.id !== 'SYS_META');
        updateData.incidents = [...baseIncidents, metaIncident];
      }
      await updateDoc(doc(db, 'assignments', id), updateData);
    } catch (e) { console.error(e); }
  };

  const addIncident = async (assignmentId: string, incident: Omit<Incident, 'id' | 'timestamp'>) => {
    try {
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) return;
      
      const newIncident: Incident = {
        ...incident,
        id: generateId(),
        timestamp: new Date().toISOString()
      };
      
      const meta: any = {
        salidaBaseAt: assignment.salidaBaseAt,
        inicioRutaAt: assignment.inicioRutaAt,
        finRutaAt: assignment.finRutaAt,
        llegadaBaseAt: assignment.llegadaBaseAt,
        createdAt: assignment.createdAt,
        statusHistory: assignment.statusHistory
      };

      const metaIncident: Incident = {
        id: 'SYS_META',
        timestamp: new Date().toISOString(),
        type: 'Otro',
        description: JSON.stringify(meta),
        startTime: '',
        endTime: ''
      };

      const updatedIncidents = [...(assignment.incidents || []), newIncident, metaIncident];
      await updateDoc(doc(db, 'assignments', assignmentId), { incidents: updatedIncidents });
    } catch (e) { console.error(e); }
  };

  const saveAttendance = async (attendance: Omit<Attendance, 'id'>) => {
    try {
      const docId = `${attendance.employeeId}_${attendance.date}`;
      await setDoc(doc(db, 'attendances', docId), attendance);
    } catch (e) { console.error(e); }
  };

  return (
    <AppContext.Provider value={{
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
      updateAssignmentResources,
      addIncident,
      saveAttendance,
      setBackupEmail,
      triggerManualBackup,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
