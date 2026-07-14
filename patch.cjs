const fs = require('fs');
const file = 'services/smartMergeService.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/function extractAmounts[\s\S]*?return amounts;\n\}/, `function extractAmounts(text: string): number[] {
  const matches = text.match(/\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,3})?\\b/g);
  if (!matches) return [];
  
  const amounts: number[] = [];
  for (const m of matches) {
    const val = parseFloat(m.replace(/,/g, ''));
    if (isNaN(val)) continue;
    
    // Filter out years
    if (val >= 2020 && val <= 2030) continue; 
    
    // If it's a whole number, it needs to be reasonably large but not huge (like an account number)
    if (!m.includes('.')) {
      if (val < 50 || val > 50000) continue; 
    }
    
    amounts.push(val);
  }
  return amounts;
}`);

// Inject amountMatch at the top of isEmailPdfMatch
const amountMatchLogic = `
  const emailTextLower = emailText.toLowerCase();
  const emailFileNameLower = emailFileName.toLowerCase();
  const fullTextLower = fullText.toLowerCase();

  // 0. Strong Amount Match Filter
  const journalAmounts = extractAmounts(fullTextLower);
  const emailAmounts = extractAmounts(emailTextLower);
  
  let amountMatch = false;
  if (journalAmounts.length > 0 && emailAmounts.length > 0) {
    for (const ja of journalAmounts) {
       for (const ea of emailAmounts) {
         if (Math.abs(ja - ea) < 1.0) {
           amountMatch = true;
           break;
         }
       }
       if (amountMatch) break;
    }
  } else {
    // If no valid amounts found in either, allow it to proceed to text matching
    amountMatch = true;
  }
  
  if (!amountMatch) return false;
`;

code = code.replace(/const emailTextLower = emailText\.toLowerCase\(\);\n\s*const emailFileNameLower = emailFileName\.toLowerCase\(\);\n\s*const fullTextLower = fullText\.toLowerCase\(\);/, amountMatchLogic);

// Remove the old amountMatch logic from section 3
code = code.replace(/\/\/ Amount match check[\s\S]*?\/\/ If clinic name matches, check if we find any specific reference number/, '// If clinic name matches, check if we find any specific reference number');

fs.writeFileSync(file, code);
