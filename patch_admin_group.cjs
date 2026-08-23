const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// 1. Add groupFilter state to EmployeesTab
code = code.replace(
  "  const [roleFilter, setRoleFilter] = useState<string>('Todos');\n  const [editingId, setEditingId] = useState<string | null>(null);",
  "  const [roleFilter, setRoleFilter] = useState<string>('Todos');\n  const [groupFilter, setGroupFilter] = useState<string>(state.activeWorkGroupId || 'Todos');\n  useEffect(() => { setGroupFilter(state.activeWorkGroupId || 'Todos'); }, [state.activeWorkGroupId]);\n  const [editingId, setEditingId] = useState<string | null>(null);"
);

// 2. Modify filtering logic
code = code.replace(
  "  const activeGroupEmps = state.employees.filter(e => {\n    if (e.workGroupId !== state.activeWorkGroupId) return false;\n    if (roleFilter === 'Todos') return true;",
  "  const activeGroupEmps = state.employees.filter(e => {\n    if (groupFilter !== 'Todos' && e.workGroupId !== groupFilter) return false;\n    if (roleFilter === 'Todos') return true;"
);

// 3. Remove ContextRequiredMessage from EmployeesTab
code = code.replace(
  "  if (!state.activeWorkGroupId) {\n    return <ContextRequiredMessage />;\n  }",
  ""
);

// 4. Update table headers
code = code.replace(
  "              <th className=\"px-4 py-3 font-medium\">Nombre</th>\n              <th className=\"px-4 py-3 font-medium text-center\">Contacto</th>",
  "              <th className=\"px-4 py-3 font-medium\">Nombre</th>\n              <th className=\"px-4 py-3 font-medium\">Grupo</th>\n              <th className=\"px-4 py-3 font-medium text-center\">Contacto</th>"
);

// 5. Update table rows
code = code.replace(
  "                <td className=\"px-4 py-3 font-medium text-slate-800\">{emp.name}</td>\n                <td className=\"px-4 py-3\">",
  "                <td className=\"px-4 py-3 font-medium text-slate-800\">{emp.name}</td>\n                <td className=\"px-4 py-3 text-slate-600\">{state.workGroups.find(wg => wg.id === emp.workGroupId)?.name || '-'}</td>\n                <td className=\"px-4 py-3\">"
);

// 6. Update the "No results" message
code = code.replace(
  "                  {state.employees.filter(e => e.workGroupId === state.activeWorkGroupId).length === 0 \n                    ? \"No hay personal registrado en este grupo\"\n                    : \"No hay resultados para el filtro seleccionado\"}",
  "                  {state.employees.filter(e => groupFilter !== 'Todos' ? e.workGroupId === groupFilter : true).length === 0 \n                    ? \"No hay personal registrado en este grupo\"\n                    : \"No hay resultados para el filtro seleccionado\"}"
);

// 7. Add group filter select next to role filter
const roleFilterHtml = `<select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 outline-none"
            >
              <option value="Todos">Todos los roles</option>
              <option value="Conductor">Conductores</option>
              <option value="Auxiliar">Ayudantes/Auxiliares</option>
              <option value="Coordinador">Coordinadores</option>
            </select>`;

const newFiltersHtml = `${roleFilterHtml}
            <select 
              value={groupFilter} 
              onChange={(e) => setGroupFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 outline-none"
            >
              <option value="Todos">Todos los grupos</option>
              {state.workGroups.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
            </select>`;

code = code.replace(roleFilterHtml, newFiltersHtml);

// Save
fs.writeFileSync('src/pages/AdminPage.tsx', code);
