const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// EmployeesTab
code = code.replace(
  "  const [form, setForm] = useState<Omit<Employee, 'id'> & { firstName?: string, lastName?: string }>({ name: '', firstName: '', lastName: '', role: 'Conductor', phone: '', workGroup: '', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);\n  const [editingId, setEditingId] = useState<string | null>(null);",
  "  const [editingId, setEditingId] = useState<string | null>(null);\n  const [form, setForm] = useState<Omit<Employee, 'id'> & { firstName?: string, lastName?: string }>({ name: '', firstName: '', lastName: '', role: 'Conductor', phone: '', workGroup: '', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);"
);

// VehiclesTab
code = code.replace(
  "  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);\n  const [form, setForm] = useState<Omit<Vehicle, 'id'>>({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);",
  "  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);\n  const [form, setForm] = useState<Omit<Vehicle, 'id'>>({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);" // wait, editingId is BEFORE form in Vehicles? Let's check the grep.
);

fs.writeFileSync('patch_admin_editingId.js', code); // just dummy, I'll use regex.
