import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Employee, Vehicle, RouteDef, Assignment, Incident, WorkGroup } from '../types';

interface AppContextProps {
  state: AppState;
  addWorkGroup: (name: string) => void;
  deleteWorkGroup: (id: string) => void;
  setActiveWorkGroup: (id: string) => void;
  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: string, emp: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  addVehicle: (veh: Omit<Vehicle, 'id'>) => void;
  updateVehicle: (id: string, veh: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  addRoute: (route: Omit<RouteDef, 'id'>) => void;
  updateRoute: (id: string, route: Partial<RouteDef>) => void;
  deleteRoute: (id: string) => void;
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
  backupEmail: null,
  lastBackupDate: null,
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

const generateId = () => Math.random().toString(36).substring(2, 9);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('logistrack_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure workGroups exists for legacy data
        if (!parsed.workGroups) parsed.workGroups = [];
        return parsed;
      } catch (e) {
        console.error('Failed to parse local data', e);
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem('logistrack_data', JSON.stringify(state));
    // Simulate automatic background backup if email is set
    if (state.backupEmail) {
      const interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          lastBackupDate: new Date().toISOString(),
        }));
        console.log(`[Backup System] Copia de seguridad sincronizada con: ${state.backupEmail}`);
      }, 60000); // simulate sync every minute for demo purposes
      return () => clearInterval(interval);
    }
  }, [state, state.backupEmail]);

  const triggerManualBackup = () => {
    if (state.backupEmail) {
      setState((prev) => ({
        ...prev,
        lastBackupDate: new Date().toISOString(),
      }));
    }
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
      employees: [...prev.employees, { ...emp, id: generateId(), workGroupId: prev.activeWorkGroupId || undefined }],
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

  const addVehicle = (veh: Omit<Vehicle, 'id'>) => {
    setState((prev) => ({
      ...prev,
      vehicles: [...prev.vehicles, { ...veh, id: generateId(), workGroupId: prev.activeWorkGroupId || undefined }],
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
      routes: [...prev.routes, { ...route, id: generateId(), workGroupId: prev.activeWorkGroupId || undefined }],
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
        addWorkGroup,
        deleteWorkGroup,
        setActiveWorkGroup,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addRoute,
        updateRoute,
        deleteRoute,
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
