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
  startTime?: string;
  endTime?: string;
}

export interface StatusHistoryItem {
  status: AssignmentStatus;
  timestamp: string;
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
  weightTons?: number;
  statusHistory?: StatusHistoryItem[];
  createdAt?: string;
  salidaBaseAt?: string;
  inicioRutaAt?: string;
  finRutaAt?: string;
  llegadaBaseAt?: string;
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

export type AttendanceStatus = 'OK' | 'RTM' | 'AUS' | 'PNR' | 'MED' | 'PRL' | 'ACC' | 'INC' | 'PXC' | 'FAM' | 'NDL' | 'SAN' | 'VAC' | 'LCL' | 'RETIRO' | 'TRASLADO' | 'VACANTES';

export const NOVELTY_TYPES = [
  { code: 'OK', label: 'OPERATIVOS (Trabajó sin novedad)' },
  { code: 'RTM', label: 'RTM - RESTRICCIONES' },
  { code: 'AUS', label: 'AUS - AUSENCIA SIN JUSTIFICAR' },
  { code: 'PNR', label: 'PNR - PERMISO NO REMUNERADO' },
  { code: 'MED', label: 'MED - PERMISO MEDICO' },
  { code: 'PRL', label: 'PRL - PERMISO LABORAL' },
  { code: 'ACC', label: 'ACC - INCAP. POR ACCIDENTE DE TRABAJO' },
  { code: 'INC', label: 'INC - INCAP. POR ENFERMEDAD GENERAL' },
  { code: 'PXC', label: 'PXC - PERMISO POR CALAMIDAD' },
  { code: 'FAM', label: 'FAM - PERMISO POR DÍA DE LA FAMILIA' },
  { code: 'NDL', label: 'NDL - NO DEBÍA LABORAR' },
  { code: 'SAN', label: 'SAN - SANCIÓN' },
  { code: 'VAC', label: 'VAC - VACACIONES' },
  { code: 'LCL', label: 'LCL - LICENCIA DE LUTO' },
  { code: 'RETIRO', label: 'RETIRO' },
  { code: 'TRASLADO', label: 'TRASLADO' },
  { code: 'VACANTES', label: 'VACANTES' }
] as const;

export interface Attendance {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD format expected
  status: AttendanceStatus;
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
  attendances: Attendance[];
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

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  createdAt?: string;
}

