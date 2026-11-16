const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminPage.tsx', 'utf8');

// Update palette
code = code.replace(/bg-amber-500/g, 'bg-emerald-500');
code = code.replace(/bg-amber-600/g, 'bg-emerald-600');
code = code.replace(/text-amber-500/g, 'text-emerald-500');
code = code.replace(/text-amber-600/g, 'text-emerald-600');
code = code.replace(/ring-amber-500/g, 'ring-emerald-500');

// Toucan accents
code = code.replace(/emerald-500\/20/g, 'amber-500/20'); // swap some accents back if needed, but let's just make sure we have emerald and amber.
// Actually, let's keep the main color as Emerald, but use Amber for some icons and highlights.

fs.writeFileSync('src/pages/AdminPage.tsx', code);
