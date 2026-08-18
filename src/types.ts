export type EmployeeRole = 'Conductor' | 'Ayudante' | 'Coordinador';
export type VehicleStatus = 'Operativo' | 'Inoperativo';
export type AssignmentStatus = 'Pendiente' | 'Salida de Base' | 'Inicio de Ruta' | 'Fin de Ruta' | 'Relleno' | 'Base' | 'Cancelado';
export type IncidentType = 'Retraso' | 'Mecánico' | 'Personal' | 'Clima' | 'Otro';

export interface WorkGroup {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
}

export interface Employee {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: EmployeeRole;
  phone: string;
  workGroup: string; // legacy string
  workGroupId?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  internalNumber: string;
  capacity: number;
  status: VehicleStatus;
  workGroupId?: string;
}

export interface RouteDef {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  code: string;
  operatingDays: number[];
  origin: string;
  destination: string;
  estimatedHours: number;
  workGroupId?: string;
}

export interface Incident {
  id: string;
  timestamp: string;
  type: IncidentType;
  description: string;
}

export interface Assignment {
  id: string;
  routeId: string;
  vehicleId: string;
  employeeIds: string[];
  date: string;
  status: AssignmentStatus;
  incidents: Incident[];
  workGroupId?: string;
}

export interface CrewTemplate {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  driverId: string;
  assistantIds: string[];
  workGroupId?: string;
}

export interface AppState {
  workGroups: WorkGroup[];
  activeWorkGroupId: string | null;
  employees: Employee[];
  vehicles: Vehicle[];
  routes: RouteDef[];
  assignments: Assignment[];
  crews: CrewTemplate[];
  backupEmail: string | null;
  lastBackupDate: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  latencyInterval: number; // in seconds
  serverVersion: number;
  deviceId: string;
  syncProtocol: string;
}

