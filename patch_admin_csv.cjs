const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// The original import might just be `import { parseCsvFile, ... }`
// The actual logic is inside handleFileUpload inside BulkActionModal.
const oldLogic = `            if (record.nombre) {
              const roleVal = record.rol || 'Conductor';
              const nameStr = record.apellido ? \`\${record.nombre} \${record.apellido}\` : record.nombre;
              addEmployee({ 
                name: nameStr, 
                role: roleVal as any, 
                phone: record.telefono || record.celular || '', 
                workGroup: '', 
                workGroupId: state.activeWorkGroupId || undefined 
              });
              count++;
            }`;

const newLogic = `            if (record.nombre) {
              const roleVal = record.rol || 'Conductor';
              const nameStr = record.apellido ? \`\${record.nombre} \${record.apellido}\` : record.nombre;
              addEmployee({ 
                name: nameStr,
                firstName: record.nombre,
                lastName: record.apellido || '',
                role: roleVal as any, 
                phone: record.telefono || record.celular || '', 
                workGroup: '', 
                workGroupId: state.activeWorkGroupId || undefined 
              });
              count++;
            }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/pages/AdminPage.tsx', code);
