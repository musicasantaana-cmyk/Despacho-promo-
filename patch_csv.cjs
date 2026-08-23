const fs = require('fs');
let code = fs.readFileSync('src/utils/csvHelper.ts', 'utf8');

code = code.replace(
  "content = 'Nombre,Apellido,Rol,Telefono\\nJuan,Perez,Conductor,555123456\\nMaria,Gomez,Ayudante,555987654';",
  "content = 'Apellido,Nombre,Rol,Grupo,Telefono\\nPerez,Juan,Conductor,Principal,555123456\\nGomez,Maria,Ayudante,Principal,555987654';"
);

fs.writeFileSync('src/utils/csvHelper.ts', code);
