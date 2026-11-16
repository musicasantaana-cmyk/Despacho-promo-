const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// 1. In EmployeesTab: ActiveGroupEmps filter
code = code.replace(
  "    if (filterNorm === 'auxiliar' && (empRole.includes('ayudante') || empRole.includes('auxiliar'))) return true;",
  "    if (filterNorm === 'ayudante' && (empRole.includes('ayudante') || empRole.includes('auxiliar'))) return true;"
);

// 2. In the dropdown select
code = code.replace(
  '<option value="Auxiliar">Ayudantes/Auxiliares</option>',
  '<option value="Ayudante">Ayudantes</option>'
);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
