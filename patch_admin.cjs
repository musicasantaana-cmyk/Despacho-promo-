const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// 1. Employee Form state update
code = code.replace(
  "const [form, setForm] = useState<Omit<Employee, 'id'>>({ name: '', role: 'Conductor', phone: '', workGroup: '' });",
  "const [form, setForm] = useState<Omit<Employee, 'id'> & { firstName?: string, lastName?: string }>({ name: '', firstName: '', lastName: '', role: 'Conductor', phone: '', workGroup: '', workGroupId: state.activeWorkGroupId || '' });\n  useEffect(() => { if (!editingId) setForm(f => ({...f, workGroupId: state.activeWorkGroupId || ''})); }, [state.activeWorkGroupId, editingId]);"
);

// Employee handleEdit
code = code.replace(
  "const handleEdit = (emp: Employee) => {\n    setForm({ name: emp.name, role: emp.role, phone: emp.phone, workGroup: emp.workGroup });",
  "const handleEdit = (emp: Employee) => {\n    setForm({ name: emp.name, firstName: emp.firstName || emp.name.split(' ')[0], lastName: emp.lastName || emp.name.split(' ').slice(1).join(' '), role: emp.role, phone: emp.phone, workGroup: emp.workGroup, workGroupId: emp.workGroupId || state.activeWorkGroupId || '' });"
);

// Employee handleSubmit
code = code.replace(
  "if (!form.name || !form.role || !state.activeWorkGroupId) return;",
  "if (!form.firstName || !form.lastName || !form.role || !form.workGroupId) return;\n    const updatedForm = { ...form, name: `${form.firstName} ${form.lastName}` };"
);
code = code.replace(
  "updateEmployee(editingId, form);",
  "updateEmployee(editingId, updatedForm);"
);
code = code.replace(
  "addEmployee(form);",
  "addEmployee(updatedForm);"
);
code = code.replace(
  "setForm({ name: '', role: 'Conductor', phone: '', workGroup: '' });",
  "setForm({ name: '', firstName: '', lastName: '', role: 'Conductor', phone: '', workGroup: '', workGroupId: state.activeWorkGroupId || '' });"
);

// Update Employee Form HTML
const employeeFormHtml = `
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
              <input required type="text" value={form.firstName || ''} onChange={e => setForm({...form, firstName: e.target.value})} placeholder="Ej. Juan" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Apellido</label>
              <input required type="text" value={form.lastName || ''} onChange={e => setForm({...form, lastName: e.target.value})} placeholder="Ej. Pérez" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Rol</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value as EmployeeRole})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="Conductor">Conductor</option>
                <option value="Ayudante">Ayudante</option>
                <option value="Coordinador">Coordinador</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Grupo de Trabajo</label>
              <select required value={form.workGroupId || ''} onChange={e => setForm({...form, workGroupId: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="">Seleccione grupo...</option>
                {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Opcional" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>`;
code = code.replace(
  /<form onSubmit=\{handleSubmit\} className="space-y-4">[\s\S]*?<div className="pt-2">/m,
  `<form onSubmit={handleSubmit} className="space-y-4">${employeeFormHtml}\n          <div className="pt-2">`
);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
