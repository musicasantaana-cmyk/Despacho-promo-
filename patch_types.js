const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace(
  "  name: string;\n  role: EmployeeRole;",
  "  name: string;\n  firstName?: string;\n  lastName?: string;\n  role: EmployeeRole;"
);
fs.writeFileSync('src/types.ts', code);
