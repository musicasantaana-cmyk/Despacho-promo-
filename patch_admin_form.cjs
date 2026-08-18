const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

const oldForm = `<form onSubmit={handleSubmit} className="space-y-4">
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
          </div>
          <div className="pt-2">`;

const newForm = `<form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Apellido</label>
            <input required type="text" value={form.lastName || ''} onChange={e => setForm({...form, lastName: e.target.value})} placeholder="Ej. Pérez" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input required type="text" value={form.firstName || ''} onChange={e => setForm({...form, firstName: e.target.value})} placeholder="Ej. Juan" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
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
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Opcional" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div className="pt-2">`;

code = code.replace(oldForm, newForm);
fs.writeFileSync('src/pages/AdminPage.tsx', code);
