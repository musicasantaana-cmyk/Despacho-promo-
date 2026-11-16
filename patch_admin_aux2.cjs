const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

code = code.replace(
  "            {['Todos', 'Conductor', 'Auxiliar', 'Coordinador'].map(role => (",
  "            {['Todos', 'Conductor', 'Ayudante', 'Coordinador'].map(role => ("
);

code = code.replace(
  "    if (role.includes('ayudante') || role.includes('auxiliar')) return <HardHat className=\"h-5 w-5 text-emerald-500\" title=\"Auxiliar / Ayudante\" />;",
  "    if (role.includes('ayudante') || role.includes('auxiliar')) return <HardHat className=\"h-5 w-5 text-emerald-500\" title=\"Ayudante\" />;"
);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
