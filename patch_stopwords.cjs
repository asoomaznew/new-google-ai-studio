const fs = require('fs');
const file = 'services/smartMergeService.ts';
let code = fs.readFileSync(file, 'utf8');

const oldLine = "const descWords = descIdClean.split(/\\s+/).filter(w => w.length > 2);";
const newLine = `const stopwords = new Set(['for', 'the', 'and', 'with', 'from', 'month', 'year', 'rent', 'billing', 'invoice']);
    const descWords = descIdClean.split(/\\s+/).filter(w => w.length > 2 && !stopwords.has(w));`;

if (code.includes(oldLine)) {
  code = code.replace(oldLine, newLine);
  fs.writeFileSync(file, code);
  console.log("Patched stopwords successfully!");
} else {
  console.log("Could not find old descWords line.");
}
