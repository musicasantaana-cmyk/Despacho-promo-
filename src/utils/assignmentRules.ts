import {
  Assignment,
  AssignmentStatus,
  DriverShift,
  Employee,
  RouteDef,
  StatusHistoryItem,
  Vehicle,
} from '../types';

export const MAX_AUXILIARIES_PER_ROUTE = 3;

export function isConductorRole(role?: string): boolean {
  const normalized = String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return normalized.includes('conductor') || normalized.includes('chofer') || normalized.includes('driver');
}

export interface CrewBreakdown {
  driver: Employee | null;
  drivers: Employee[];
  assistants: Employee[];
  validEmployeeIds: string[];
}

export function getAssignmentCrewBreakdown(
  employeeIds: string[] = [],
  employees: Employee[] = []
): CrewBreakdown {
  const empById = new Map<string, Employee>(employees.map(e => [e.id, e]));
  const seen = new Set<string>();
  const drivers: Employee[] = [];
  const assistants: Employee[] = [];
  const validEmployeeIds: string[] = [];

  for (const id of employeeIds) {
    if (!id || seen.has(id)) continue;
    const emp = empById.get(id);
    if (!emp) continue;
    seen.add(id);
    validEmployeeIds.push(emp.id);
    if (isConductorRole(emp.role)) {
      drivers.push(emp);
    } else {
      assistants.push(emp);
    }
  }

  return {
    driver: drivers[0] || null,
    drivers,
    assistants,
    validEmployeeIds,
  };
}

export function resolveAssignmentDriver(
  assignment: Pick<Assignment, 'employeeIds'>,
  employees: Employee[] = []
): Employee | null {
  return getAssignmentCrewBreakdown(assignment.employeeIds || [], employees).driver;
}

export function validateAssignmentSelection(params: {
  routeId: string;
  vehicleId: string;
  employeeIds: string[];
  routes: RouteDef[];
  vehicles: Vehicle[];
  employees: Employee[];
  requireOperationalVehicle?: boolean;
}): {
  ok: boolean;
  error?: string;
  route?: RouteDef;
  vehicle?: Vehicle;
  driver?: Employee;
  assistants?: Employee[];
  normalizedEmployeeIds?: string[];
} {
  const {
    routeId,
    vehicleId,
    employeeIds,
    routes,
    vehicles,
    employees,
    requireOperationalVehicle = true,
  } = params;

  const route = routes.find(r => r.id === routeId);
  if (!route) {
    return { ok: false, error: 'Debe seleccionar una ruta existente en el catálogo.' };
  }

  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) {
    return { ok: false, error: 'Debe seleccionar un vehículo existente en el catálogo.' };
  }
  if (requireOperationalVehicle && vehicle.status !== 'Operativo') {
    return {
      ok: false,
      error: `El vehículo Móvil ${vehicle.internalNumber} (${vehicle.plate}) figura como Inoperativo.`,
    };
  }

  const breakdown = getAssignmentCrewBreakdown(employeeIds, employees);
  if (breakdown.drivers.length === 0) {
    return {
      ok: false,
      error: 'Debe asignar exactamente un (1) Conductor para la ruta.',
    };
  }
  if (breakdown.drivers.length > 1) {
    return {
      ok: false,
      error: 'Solo se puede asignar un (1) Conductor por ruta.',
    };
  }
  if (breakdown.assistants.length > MAX_AUXILIARIES_PER_ROUTE) {
    return {
      ok: false,
      error: `Solo se permiten máximo ${MAX_AUXILIARIES_PER_ROUTE} auxiliares por ruta.`,
    };
  }

  const driver = breakdown.drivers[0];
  const normalizedEmployeeIds = [driver.id, ...breakdown.assistants.map(a => a.id)];

  return {
    ok: true,
    route,
    vehicle,
    driver,
    assistants: breakdown.assistants,
    normalizedEmployeeIds,
  };
}

export function validateCrewSelection(params: {
  driverId: string;
  assistantIds: string[];
  employees: Employee[];
}): {
  ok: boolean;
  error?: string;
  driver?: Employee;
  normalizedAssistantIds?: string[];
} {
  const { driverId, assistantIds, employees } = params;
  const driver = employees.find(e => e.id === driverId);
  if (!driver || !isConductorRole(driver.role)) {
    return { ok: false, error: 'Debe seleccionar un (1) Conductor válido para la tripulación.' };
  }

  const empById = new Map<string, Employee>(employees.map(e => [e.id, e]));
  const seen = new Set<string>();
  const validAssistants: string[] = [];

  for (const id of assistantIds) {
    if (!id || id === driverId || seen.has(id)) continue;
    const emp = empById.get(id);
    if (!emp) continue;
    if (isConductorRole(emp.role)) {
      return {
        ok: false,
        error: 'Los auxiliares de una tripulación no pueden tener rol Conductor (solo 1 conductor por ruta).',
      };
    }
    seen.add(id);
    validAssistants.push(emp.id);
  }

  if (validAssistants.length > MAX_AUXILIARIES_PER_ROUTE) {
    return {
      ok: false,
      error: `Solo se permiten máximo ${MAX_AUXILIARIES_PER_ROUTE} auxiliares por tripulación.`,
    };
  }

  return {
    ok: true,
    driver,
    normalizedAssistantIds: validAssistants,
  };
}

export function mapDriverShiftToAssignmentStatus(shift: DriverShift): AssignmentStatus {
  if (shift.status === 'EN_BASE') return 'Base';
  if (shift.status === 'FIN_RUTA') return 'Fin de Ruta';
  if (shift.isPausedForRefill) return 'Relleno';
  if (shift.status === 'EN_RUTA') return 'Inicio de Ruta';
  return 'Salida de Base';
}

export function findLinkedDriverShiftForAssignment(
  assignment: Assignment,
  driverShifts: DriverShift[],
  vehicles: Vehicle[],
  employees: Employee[] = []
): DriverShift | null {
  if (assignment.status === 'Cancelado') return null;
  const asigDate = (assignment.date || '').slice(0, 10);
  const vehicle = vehicles.find(v => v.id === assignment.vehicleId);
  const driver = resolveAssignmentDriver(assignment, employees);

  const candidates = driverShifts.filter(s => {
    if (s.isSupportShift) return false;
    if (s.date !== asigDate) return false;
    if (assignment.workGroupId && s.workGroupId !== assignment.workGroupId) return false;

    const matchDriver =
      (driver && s.driverId === driver.id) ||
      (s.driverId && (assignment.employeeIds || []).includes(s.driverId));
    const matchVehicle =
      (s.vehicleId && s.vehicleId === assignment.vehicleId) ||
      (Boolean(vehicle?.internalNumber) &&
        s.vehicleNumber.trim().toLowerCase() === vehicle!.internalNumber.trim().toLowerCase());

    return Boolean(matchDriver || matchVehicle);
  });

  if (candidates.length === 0) return null;

  // Prefer exact route + driver match, then route match, then driver match, then vehicle match
  candidates.sort((a, b) => {
    const score = (s: DriverShift) => {
      let sc = 0;
      if (assignment.routeId && s.routeId === assignment.routeId) sc += 8;
      if (driver && s.driverId === driver.id) sc += 4;
      if (s.vehicleId && s.vehicleId === assignment.vehicleId) sc += 2;
      if (s.status !== 'EN_BASE') sc += 1;
      return sc;
    };
    return score(b) - score(a);
  });

  return candidates[0];
}

export function findMatchingAssignmentForShift(
  shift: DriverShift,
  assignments: Assignment[],
  vehicles: Vehicle[]
): Assignment | null {
  if (shift.isSupportShift) return null;
  const candidates = assignments.filter(a => {
    if (a.status === 'Cancelado') return false;
    if ((a.date || '').slice(0, 10) !== shift.date) return false;
    if (shift.workGroupId && a.workGroupId && a.workGroupId !== shift.workGroupId) return false;

    const matchDriver = Boolean(shift.driverId && (a.employeeIds || []).includes(shift.driverId));
    const vehicle = vehicles.find(v => v.id === a.vehicleId);
    const matchVehicle =
      (shift.vehicleId && a.vehicleId === shift.vehicleId) ||
      (Boolean(vehicle?.internalNumber) &&
        vehicle!.internalNumber.trim().toLowerCase() === shift.vehicleNumber.trim().toLowerCase());

    return matchDriver || matchVehicle;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const score = (item: Assignment) => {
      let sc = 0;
      if (shift.routeId && item.routeId === shift.routeId) sc += 8;
      if (shift.driverId && (item.employeeIds || []).includes(shift.driverId)) sc += 4;
      if (shift.vehicleId && item.vehicleId === shift.vehicleId) sc += 2;
      if (item.status !== 'Base') sc += 1;
      return sc;
    };
    return score(b) - score(a);
  });

  return candidates[0];
}

export function buildMergedStatusHistoryFromShift(
  existingHistory: StatusHistoryItem[] = [],
  shift: DriverShift
): StatusHistoryItem[] {
  const byStatus = new Map<AssignmentStatus, string>();
  existingHistory.forEach(h => {
    if (h.status && h.timestamp) byStatus.set(h.status, h.timestamp);
  });

  if (shift.t1StartShiftAt) byStatus.set('Salida de Base', shift.t1StartShiftAt);
  if (shift.t2StartRouteAt) byStatus.set('Inicio de Ruta', shift.t2StartRouteAt);
  if (shift.t3EndRouteAt) byStatus.set('Fin de Ruta', shift.t3EndRouteAt);
  if (shift.t4ArriveBaseAt) byStatus.set('Base', shift.t4ArriveBaseAt);

  if (shift.isPausedForRefill) {
    const openRefill = (shift.refillEvents || []).find(ev => !ev.endAt);
    if (openRefill?.startAt) byStatus.set('Relleno', openRefill.startAt);
  }

  return Array.from(byStatus.entries())
    .map(([status, timestamp]) => ({ status, timestamp }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function getEffectiveAssignmentWithShift(
  assignment: Assignment,
  driverShifts: DriverShift[],
  vehicles: Vehicle[],
  employees: Employee[] = []
): {
  assignment: Assignment;
  linkedShift: DriverShift | null;
  effectiveStatus: AssignmentStatus;
  effectiveWeightTons: number | undefined;
} {
  const linkedShift = findLinkedDriverShiftForAssignment(assignment, driverShifts, vehicles, employees);
  if (!linkedShift || assignment.status === 'Cancelado') {
    return {
      assignment,
      linkedShift: null,
      effectiveStatus: assignment.status,
      effectiveWeightTons: assignment.weightTons,
    };
  }

  const effectiveStatus = mapDriverShiftToAssignmentStatus(linkedShift);
  const effectiveWeightTons =
    linkedShift.weightTons !== null && linkedShift.weightTons !== undefined
      ? linkedShift.weightTons
      : assignment.weightTons;

  const mergedAssignment: Assignment = {
    ...assignment,
    status: effectiveStatus,
    weightTons: effectiveWeightTons,
    salidaBaseAt: linkedShift.t1StartShiftAt || assignment.salidaBaseAt,
    inicioRutaAt: linkedShift.t2StartRouteAt || assignment.inicioRutaAt,
    finRutaAt: linkedShift.t3EndRouteAt || assignment.finRutaAt,
    llegadaBaseAt: linkedShift.t4ArriveBaseAt || assignment.llegadaBaseAt,
    statusHistory: buildMergedStatusHistoryFromShift(assignment.statusHistory || [], linkedShift),
  };

  return {
    assignment: mergedAssignment,
    linkedShift,
    effectiveStatus,
    effectiveWeightTons,
  };
}

function normalizeMatchText(value?: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveUserConductorEmployee(
  user: { employeeId?: string; workGroupId?: string; fullName?: string; username?: string } | null | undefined,
  employees: Employee[] = []
): Employee | null {
  if (!user || employees.length === 0) return null;

  if (user.employeeId) {
    const exactById = employees.find(e => e.id === user.employeeId);
    if (exactById) return exactById;
  }

  const scoped =
    user.workGroupId && user.workGroupId !== 'ALL'
      ? employees.filter(e => e.workGroupId === user.workGroupId)
      : employees;
  const driverCandidates = scoped.filter(e => isConductorRole(e.role));
  const pool = driverCandidates.length > 0 ? driverCandidates : scoped;

  const userNormCandidates = [normalizeMatchText(user.fullName), normalizeMatchText(user.username)].filter(Boolean);
  if (userNormCandidates.length === 0) return null;

  // 1. Exact normalized full-name match
  const exactMatches = pool.filter(e => {
    const empNorm = normalizeMatchText(e.name);
    return Boolean(empNorm) && userNormCandidates.includes(empNorm);
  });
  if (exactMatches.length === 1) return exactMatches[0];

  // 2. Unambiguous compact match (handles usernames like "RISCANEVOJUAN" -> "RISCANEVO COTRINA JUAN PABLO")
  const userCompacts = userNormCandidates.map(s => s.replace(/\s+/g, '')).filter(s => s.length >= 6);
  const scored = pool
    .map(emp => {
      const tokens = normalizeMatchText(emp.name)
        .split(' ')
        .filter(t => t.length >= 3);
      if (tokens.length === 0) return { emp, score: 0 };

      let bestScore = 0;
      for (const compact of userCompacts) {
        if (compact === tokens.join('')) {
          bestScore = Math.max(bestScore, 100);
          continue;
        }
        const matchedTokens = tokens.filter(t => compact.includes(t));
        const matchedLen = matchedTokens.reduce((acc, t) => acc + t.length, 0);
        if (matchedTokens.length >= 2 && matchedLen >= compact.length * 0.75) {
          bestScore = Math.max(bestScore, matchedTokens.length * 10 + matchedLen);
        }
      }
      return { emp, score: bestScore };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0].emp;
  if (scored.length > 1 && scored[0].score > scored[1].score + 5) {
    return scored[0].emp;
  }

  return null;
}

export function findTodayPredefinedAssignment(params: {
  driverId?: string;
  vehicleId?: string;
  workGroupId?: string;
  assignments: Assignment[];
  employees?: Employee[];
  todayStr: string;
}): Assignment | null {
  const { driverId, vehicleId, workGroupId, assignments, employees = [], todayStr } = params;
  if (!driverId && !vehicleId) return null;

  const candidates = assignments.filter(a => {
    if (!a.date || a.date.slice(0, 10) !== todayStr) return false;
    if (a.status === 'Cancelado' || a.status === 'Base') return false;
    if (workGroupId && a.workGroupId && a.workGroupId !== workGroupId) return false;

    const assignedDriver = resolveAssignmentDriver(a, employees);
    const matchesDriver = Boolean(
      driverId && ((a.employeeIds || []).includes(driverId) || assignedDriver?.id === driverId)
    );
    const matchesVehicle = Boolean(vehicleId && a.vehicleId === vehicleId);

    if (driverId) return matchesDriver;
    return matchesVehicle;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const score = (item: Assignment) => {
      let sc = 0;
      const assignedDriver = resolveAssignmentDriver(item, employees);
      if (driverId && assignedDriver?.id === driverId) sc += 20;
      if (driverId && (item.employeeIds || []).includes(driverId)) sc += 10;
      if (item.status === 'Pendiente') sc += 8;
      if (vehicleId && item.vehicleId === vehicleId) sc += 4;
      return sc;
    };
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return (b.date || '').localeCompare(a.date || '');
  });

  return candidates[0];
}

export function formatFirestoreRuleError(err: unknown, fallbackMessage: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  let detail = raw;
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) detail = String(parsed.error);
    } catch {
      // ignore JSON parse errors
    }
  }
  const lower = detail.toLowerCase();
  if (
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions')
  ) {
    return 'Validación de Firestore: la ruta requiere exactamente 1 Conductor, máximo 3 Auxiliares sin duplicados, y una ruta/vehículo operativos existentes.';
  }
  return detail || fallbackMessage;
}


