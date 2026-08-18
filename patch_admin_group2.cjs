const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// The first patch didn't properly add the columns to the TH and TD because the replace matched loosely.
// Let's do it precisely using regex.

code = code.replace(
  /<th className="px-4 py-3 font-medium">Nombre<\/th>\s*<th className="px-4 py-3 font-medium text-center">Contacto<\/th>/g,
  '<th className="px-4 py-3 font-medium">Nombre</th>\n              <th className="px-4 py-3 font-medium">Grupo</th>\n              <th className="px-4 py-3 font-medium text-center">Contacto</th>'
);

code = code.replace(
  /<td className="px-4 py-3 font-medium text-slate-800">\{emp\.name\}<\/td>\s*<td className="px-4 py-3">/g,
  '<td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>\n                <td className="px-4 py-3 text-slate-600">{state.workGroups.find(wg => wg.id === emp.workGroupId)?.name || \'-\'}</td>\n                <td className="px-4 py-3">'
);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
