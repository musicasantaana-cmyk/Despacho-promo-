export type EmployeeRole = 'Conductor' | 'Ayudante' | 'Coordinador';
export type VehicleStatus = 'Operativo' | 'Inoperativo';
export type AssignmentStatus = 'Pendiente' | 'Salida de Base' | 'Inicio de Ruta' | 'Fin de Ruta' | 'Relleno' | 'Base' | 'Cancelado';
export type IncidentType = 'Retraso' | 'Mecánico' | 'Personal' | 'Clima' | 'Otro';

export type UserRole = 'admin' | 'gestion' | 'supervisor' | 'conductor';

export const USER_ROLE_META: Record<UserRole, { level: number; label: string; shortLabel: string; description: string }> = {
  admin: {
    level: 1,
    label: 'Nivel 1 · Administrador',
    shortLabel: 'Administrador',
    description: 'Acceso total: ver, crear, editar, eliminar y configurar toda la aplicación, incluyendo gestión de usuarios.'
  },
  gestion: {
    level: 2,
    label: 'Nivel 2 · Admin. de Gestión',
    shortLabel: 'Gestión',
    description: 'Puede ver, agregar y modificar registros y operaciones, excepto configuración global y panel de usuarios.'
  },
  supervisor: {
    level: 3,
    label: 'Nivel 3 · Supervisor',
    shortLabel: 'Supervisor',
    description: 'Acceso segmentado exclusivamente a los datos y operaciones de su grupo operativo asignado.'
  },
  conductor: {
    level: 4,
    label: 'Nivel 4 · Conductor',
    shortLabel: 'Conductor',
    description: 'Acceso restringido únicamente al módulo de Conductores para control de tiempos operativos.'
  }
};

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

export type DriverShiftStatus = 'en_turno' | 'en_ruta' | 'ruta_finalizada' | 'completado';

export interface DriverShift {
  id: string;
  workGroupId: string;
  workGroupName: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  vehicleId?: string | null;
  date: string; // YYYY-MM-DD
  status: DriverShiftStatus;
  t1InicioTurno: string; // ISO string
  t2InicioRuta?: string | null;
  t3FinRuta?: string | null;
  t4LlegadaBase?: string | null;
  routeExecutionMs?: number | null; // T3 - T2
  totalOperationMs?: number | null; // T4 - T1
  checklistConfirmed: boolean;
  checklistConfirmedAt?: string | null;
  createdByUsername: string;
  createdAt?: string;
  updatedAt?: string;
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
  driverShifts: DriverShift[];
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
  fullName?: string;
  role?: UserRole;
  workGroupId?: string | null;
  isActive?: boolean;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SafeAppUser {
  id: string;
  username: string;
  fullName?: string;
  role: UserRole;
  workGroupId: string | null;
  isActive: boolean;
  isMaster?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  id: string;
  username: string;
  fullName?: string;
  role: UserRole;
  workGroupId: string | null;
  isActive: boolean;
  isMaster?: boolean;
  loggedAt: number;
}
