const fs = require('fs');
const file = 'services/geminiService.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("const generateContentWithRetry", "export const generateContentWithRetry");
fs.writeFileSync(file, code);
console.log("Exported generateContentWithRetry");
