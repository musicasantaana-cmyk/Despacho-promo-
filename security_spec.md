# Security Specification — LogisTrack RBAC & Driver Operational Control

## 1. Data Invariants
1. **RBAC Role Integrity (`AppUser`)**: A user record must have a valid `role` in `['admin', 'gestion', 'supervisor', 'conductor']`, a non-empty `username` (<= 100 chars), and a `password` hash (<= 256 chars). Only `admin` endpoints in `server.ts` may create, list, modify, or delete `app_users`.
2. **Supervisor Group Isolation**: A `supervisor` MUST have a `workGroupId` bound to their account and cannot view, create, update, or export data outside that `workGroupId`.
3. **Driver Exclusive Scope**: A `conductor` has access ONLY to the Driver Operational Control module (`driver_shifts`) and cannot access Administration, Assignment, Tracking, Reports, or User Administration endpoints.
4. **Driver Shift State Machine (`DriverShift`)**:
   - A shift cannot record `T2` (`Inicio de Ruta`) before `T1` (`Inicio de Turno`).
   - A shift cannot record `T3` (`Fin de Ruta`) before `T2` (`Inicio de Ruta`).
   - A shift cannot record `T4` (`Llegada a Base`) before `T3` (`Fin de Ruta`).
   - `T2`, `T3`, and `T4` transitions are blocked while an active `Relleno` pause is open until `Fin de Descargue` resumes normal flow.
   - All document IDs must match `^[a-zA-Z0-9_\\-]+$` and stay <= 128 characters.
5. **Route Assignment Crew & Catalog Integrity (`Assignment`)**:
   - `routeId` MUST reference an existing document in `routes`.
   - `vehicleId` MUST reference an existing document in `vehicles` (and `status == 'Operativo'` on creation or vehicle reassignment).
   - `employeeIds` MUST contain between 1 and 4 unique IDs: `employeeIds[0]` MUST exist in `employees` with `role == 'Conductor'`, and indices `1..3` (maximum 3 auxiliaries) MUST exist in `employees` with `role in ['Ayudante', 'Coordinador']`.
6. **Crew Template Integrity (`CrewTemplate`)**:
   - `driverId` MUST reference an existing employee with `role == 'Conductor'`.
   - `assistantIds` MUST contain 0 to 3 unique IDs referencing existing employees with `role in ['Ayudante', 'Coordinador']` distinct from `driverId`.

## 2. Dirty Dozen Payloads (Rejected by Rules & Backend)
1. Invalid document ID containing path traversal (`../admin`) -> Rejected by `isValidId`.
2. Oversized 2KB ID string -> Rejected by `id.size() <= 128`.
3. `AppUser` with escalated invalid role (`superadmin`) -> Rejected by `role in ['admin', 'gestion', 'supervisor', 'conductor']`.
4. `AppUser` with shadow field (`isVerified: true`) -> Rejected by `keys().hasOnly(...)`.
5. `AppUser` with oversized username (>100 chars) -> Rejected by `username.size() <= 100`.
6. `DriverShift` with invalid status (`SKIPPED_STEP`) -> Rejected by `status in ['EN_TURNO', 'EN_RUTA', 'FIN_RUTA', 'EN_BASE']`.
7. `DriverShift` with shadow field (`overrideAdmin: true`) -> Rejected by `keys().hasOnly(...)`.
8. `DriverShift` with unbounded `refillEvents` (>50 items) -> Rejected by `refillEvents.size() <= 50`.
9. `DriverShift` with unbounded `breakdownEvents` (>50 items) -> Rejected by `breakdownEvents.size() <= 50`.
10. `DriverShift` missing required `t1StartShiftAt` -> Rejected by `keys().hasAll(...)`.
11. `DriverShift` API call skipping `T2` and posting `end-route` (`T3`) directly -> Rejected `409 Conflict` by backend state machine.
12. `Supervisor` querying `/api/driver-shifts?workGroupId=OTHER_GROUP` or `Gestion` calling `POST /api/users` -> Rejected `403 Forbidden` by RBAC middleware.
13. `Assignment` with `employeeIds: []` (0 conductors) or 2 conductors in `employeeIds` -> Rejected by `isValidAssignment` & `isValidAssignmentCrewRefs`.
14. `Assignment` with 5 `employeeIds` (1 conductor + 4 auxiliaries) or duplicate IDs -> Rejected by `employeeIds.size() <= 4` & pairwise uniqueness check.
15. `Assignment` referencing non-existent `routeId`/`vehicleId` or an `Inoperativo` vehicle -> Rejected by `isValidAssignmentRouteAndVehicleRefs`.
16. `CrewTemplate` with 4 `assistantIds` or a `Conductor` listed in `assistantIds` -> Rejected by `isValidCrew` & `isValidCrewRefs`.

