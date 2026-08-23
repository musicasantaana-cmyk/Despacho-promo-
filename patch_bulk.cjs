const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// Update CSV import logic for Employees
const oldBulkLogic = `      if (bulkType === 'employees') {
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

const newBulkLogic = `      if (bulkType === 'employees') {
        data.forEach(row => {
          const groupIdToUse = row.grupo 
            ? state.workGroups.find(wg => wg.name.toLowerCase() === String(row.grupo).trim().toLowerCase())?.id || state.activeWorkGroupId
            : state.activeWorkGroupId;
            
          addEmployee({
            name: \`\${row.nombre || ''} \${row.apellido || ''}\`.trim() || 'Sin Nombre',
            firstName: row.nombre || '',
            lastName: row.apellido || '',
            role: (row.rol as any) || 'Conductor',
            phone: row.telefono || '',
            workGroup: '',
            workGroupId: groupIdToUse || undefined
          });
        });`;
code = code.replace(oldBulkLogic, newBulkLogic);

// Update CSV export logic for Employees
const oldExport = `    if (bulkType === 'employees') {
      const data = state.employees
        .filter(e => e.workGroupId === state.activeWorkGroupId)
        .map(e => ({ Nombre: e.name, Rol: e.role, Telefono: e.phone }));`;

const newExport = `    if (bulkType === 'employees') {
      const data = state.employees
        .filter(e => e.workGroupId === state.activeWorkGroupId)
        .map(e => ({ Apellido: e.lastName || '', Nombre: e.firstName || e.name, Rol: e.role, Grupo: state.workGroups.find(wg => wg.id === e.workGroupId)?.name || '', Telefono: e.phone }));`;
code = code.replace(oldExport, newExport);

fs.writeFileSync('src/pages/AdminPage.tsx', code);
