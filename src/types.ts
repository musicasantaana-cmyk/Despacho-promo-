export type EmployeeRole = 'Conductor' | 'Ayudante' | 'Coordinador';
export type VehicleStatus = 'Operativo' | 'Inoperativo';
export type AssignmentStatus = 'Pendiente' | 'Salida de Base' | 'Inicio de Ruta' | 'Fin de Ruta' | 'Relleno' | 'Base' | 'Cancelado';
export type IncidentType = 'Retraso' | 'Mecánico' | 'Personal' | 'Clima' | 'Otro';

export interface WorkGroup {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
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

export interface AppState {
  workGroups: WorkGroup[];
  activeWorkGroupId: string | null;
  employees: Employee[];
  vehicles: Vehicle[];
  routes: RouteDef[];
  assignments: Assignment[];
  backupEmail: string | null;
  lastBackupDate: string | null;
}

