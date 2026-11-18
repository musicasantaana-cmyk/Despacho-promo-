export type EmployeeRole = 'Conductor' | 'Ayudante' | 'Coordinador';
export type VehicleStatus = 'Operativo' | 'Inoperativo';
export type AssignmentStatus = 'Pendiente' | 'Salida de Base' | 'Inicio de Ruta' | 'Fin de Ruta' | 'Relleno' | 'Base' | 'Cancelado';
export type IncidentType = 'Retraso' | 'Mecánico' | 'Personal' | 'Clima' | 'Otro';

export type UserRole = 'admin' | 'gestion' | 'supervisor' | 'conductor';

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

export type DriverShiftStatus = 'EN_TURNO' | 'EN_RUTA' | 'FIN_RUTA' | 'EN_BASE';

export interface RefillEvent {
  id: string;
  startAt: string;
  endAt: string | null;
  durationMins: number | null;
  durationSeconds: number | null;
  phaseAtPause: DriverShiftStatus;
}

export interface BreakdownEvent {
  id: string;
  startAt: string;
  endAt: string | null;
  durationMins: number | null;
  durationSeconds: number | null;
  phaseAtIncident: DriverShiftStatus;
  notes?: string;
}

export interface DriverShift {
  id: string;
  date: string; // YYYY-MM-DD
  workGroupId: string;
  workGroupName?: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  vehicleId?: string;
  createdByUserId: string;
  createdByUsername: string;
  status: DriverShiftStatus;

  checklistConfirmed: boolean;
  checklistConfirmedAt?: string | null;

  t1StartShiftAt: string;
  t2StartRouteAt?: string | null;
  t3EndRouteAt?: string | null;
  t4ArriveBaseAt?: string | null;

  isPausedForRefill: boolean;
  activeRefillId?: string | null;
  pausedPhase?: DriverShiftStatus | null;
  refillEvents: RefillEvent[];

  isInBreakdown: boolean;
  activeBreakdownId?: string | null;
  breakdownEvents: BreakdownEvent[];

  initialTransitMins?: number | null;
  routeExecutionMins?: number | null;
  routeExecutionNetMins?: number | null;
  returnTransitMins?: number | null;
  totalOperationMins?: number | null;
  totalOperationNetMins?: number | null;
  refillTotalMins: number;
  mechanicalBreakdownTotalMins: number;

  createdAt: string;
  updatedAt: string;
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
  password?: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSessionUser {
  id: string;
  username: string;
  fullName?: string;
  role: UserRole;
  workGroupId?: string;
  employeeId?: string;
}
