const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

const groupSelectHtml = `
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Grupo de Trabajo</label>
            <select required value={form.workGroupId || ''} onChange={e => setForm({...form, workGroupId: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="">Seleccione grupo...</option>
              {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
            </select>
          </div>`;

// Vehicle
const oldVehicleStatus = `          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value as any})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="Operativo">Operativo</option>
              <option value="Inoperativo">Inoperativo</option>
            </select>
          </div>`;
code = code.replace(oldVehicleStatus, oldVehicleStatus + '\n' + groupSelectHtml);

// Route
const oldRouteTime = `          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tiempo Estimado (Horas)</label>
            <input type="number" min="0.5" step="0.5" value={form.estimatedHours} onChange={e => setForm({...form, estimatedHours: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>`;
const routeReplacement = `          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tiempo Estimado (Horas)</label>
              <input type="number" min="0.5" step="0.5" value={form.estimatedHours} onChange={e => setForm({...form, estimatedHours: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Grupo de Trabajo</label>
              <select required value={form.workGroupId || ''} onChange={e => setForm({...form, workGroupId: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="">Seleccione grupo...</option>
                {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
              </select>
            </div>
          </div>`;
code = code.replace(oldRouteTime, routeReplacement);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
