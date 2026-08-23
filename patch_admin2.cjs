const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// Vehicle Form state update
code = code.replace(
  "const [form, setForm] = useState<Omit<Vehicle, 'id'>>({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo' });",
  "const [form, setForm] = useState<Omit<Vehicle, 'id'>>({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);"
);

// Vehicle handleEdit
code = code.replace(
  "const handleEdit = (veh: Vehicle) => {\n    setForm({ plate: veh.plate, internalNumber: veh.internalNumber, capacity: veh.capacity, status: veh.status, workGroup: veh.workGroup });",
  "const handleEdit = (veh: Vehicle) => {\n    setForm({ plate: veh.plate, internalNumber: veh.internalNumber, capacity: veh.capacity, status: veh.status, workGroupId: veh.workGroupId || state.activeWorkGroupId || '' });"
);

// Vehicle handleSubmit
code = code.replace(
  "if (!form.plate || !state.activeWorkGroupId) return;",
  "if (!form.plate || !form.workGroupId) return;"
);
code = code.replace(
  "setForm({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo' });",
  "setForm({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo', workGroupId: state.activeWorkGroupId || '' });"
);

// Route Form state update
code = code.replace(
  "const [form, setForm] = useState<Omit<RouteDef, 'id'>>({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0 });",
  "const [form, setForm] = useState<Omit<RouteDef, 'id'>>({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0, workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);"
);

// Route handleEdit
code = code.replace(
  "setForm({ name: route.name, code: route.code, operatingDays: route.operatingDays || [], origin: route.origin, destination: route.destination, estimatedHours: route.estimatedHours, workGroup: route.workGroup });",
  "setForm({ name: route.name, code: route.code, operatingDays: route.operatingDays || [], origin: route.origin, destination: route.destination, estimatedHours: route.estimatedHours, workGroupId: route.workGroupId || state.activeWorkGroupId || '' });"
);

// Route handleSubmit
code = code.replace(
  "if (!form.name || !form.origin || !form.destination || !state.activeWorkGroupId) return;",
  "if (!form.name || !form.origin || !form.destination || !form.workGroupId) return;"
);
code = code.replace(
  "setForm({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0 });",
  "setForm({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0, workGroupId: state.activeWorkGroupId || '' });"
);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
