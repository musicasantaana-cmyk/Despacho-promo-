const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

const oldLogic = `      if (bulkType === 'employees') {
        data.forEach(row => {
          addEmployee({
            name: \`\${row.nombre || ''} \${row.apellido || ''}\`.trim() || 'Sin Nombre',
            role: (row.rol as any) || 'Conductor',
            phone: row.telefono || '',
            workGroup: '',
          });
        });`;

const newLogic = `      if (bulkType === 'employees') {
        data.forEach(row => {
          addEmployee({
            name: \`\${row.nombre || ''} \${row.apellido || ''}\`.trim() || 'Sin Nombre',
            firstName: row.nombre || '',
            lastName: row.apellido || '',
            role: (row.rol as any) || 'Conductor',
            phone: row.telefono || '',
            workGroup: '',
            workGroupId: state.activeWorkGroupId || undefined
          });
        });`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/pages/AdminPage.tsx', code);
