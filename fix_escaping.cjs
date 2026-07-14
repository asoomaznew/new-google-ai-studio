const fs = require('fs');
const file1 = 'components/BahrainCustPaymentAutomation.tsx';
let code1 = fs.readFileSync(file1, 'utf8');

code1 = code1.replace(/\\`/g, '`');
fs.writeFileSync(file1, code1);

const file2 = 'services/bahrainCustPaymentService.ts';
let code2 = fs.readFileSync(file2, 'utf8');
code2 = code2.replace(/\\`/g, '`');
fs.writeFileSync(file2, code2);

console.log("Escaping fixed");
