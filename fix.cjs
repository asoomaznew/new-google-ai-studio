const fs = require('fs');
const file = 'services/smartMergeService.ts';
let code = fs.readFileSync(file, 'utf8');

const badPartStartIndex = code.indexOf('const genericWords =');
if (badPartStartIndex !== -1) {
  const badPartEndIndex = code.indexOf(".test(phrase);", badPartStartIndex);
  if (badPartEndIndex !== -1) {
    const goodReplacement = `const genericWords = "january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|year|month|company|co|ltd|wll|spc|est|trading|factory|\\\\d+";
      const isDateOrGeneric = new RegExp('^(' + genericWords + ')\\\\s+(' + genericWords + ')$', 'i').test(phrase);`;
      
    code = code.substring(0, badPartStartIndex) + goodReplacement + code.substring(badPartEndIndex + 14);
    fs.writeFileSync(file, code);
    console.log("Fixed successfully!");
  }
}
