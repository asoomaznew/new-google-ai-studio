const fs = require('fs');
const file = 'services/bahrainCustPaymentService.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("gemini-2.5-flash", "gemini-3.5-flash");
fs.writeFileSync(file, code);
console.log("Model patched to 3.5-flash");
