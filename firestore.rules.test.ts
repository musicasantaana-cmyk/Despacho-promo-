// Security regression assertions for RBAC & DriverShift state machine
export const DIRTY_DOZEN_CASES = [
  { name: 'Invalid ID path traversal', id: '../evil', expectRejected: true },
  { name: 'Oversized ID (>128 chars)', id: 'a'.repeat(129), expectRejected: true },
  { name: 'Privilege escalation role', payload: { username: 'u1', password: 'h', role: 'superadmin' }, expectRejected: true },
  { name: 'AppUser shadow field injection', payload: { username: 'u1', password: 'h', role: 'conductor', isRoot: true }, expectRejected: true },
  { name: 'Oversized username', payload: { username: 'x'.repeat(101), password: 'h', role: 'conductor' }, expectRejected: true },
  { name: 'DriverShift invalid status', payload: { status: 'COMPLETED_FAKE' }, expectRejected: true },
  { name: 'DriverShift shadow field', payload: { status: 'EN_TURNO', bypass: true }, expectRejected: true },
  { name: 'DriverShift unbounded refillEvents', payload: { refillEvents: new Array(51).fill({}) }, expectRejected: true },
  { name: 'DriverShift unbounded breakdownEvents', payload: { breakdownEvents: new Array(51).fill({}) }, expectRejected: true },
  { name: 'DriverShift missing t1StartShiftAt', payload: { status: 'EN_TURNO' }, expectRejected: true },
  { name: 'Skip T2 -> T3 transition', endpoint: '/api/driver-shifts/:id/end-route', expectStatus: 409 },
  { name: 'Supervisor cross-group query', endpoint: '/api/driver-shifts?workGroupId=other', expectStatus: 403 }
];
