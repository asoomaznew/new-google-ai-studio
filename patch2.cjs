const fs = require('fs');
const file = 'services/smartMergeService.ts';
let code = fs.readFileSync(file, 'utf8');

const oldRegexLine = "const isDateOrGeneric = /^(january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|202\\d|\\d{4})\\s+(january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|202\\d|\\d{4})$/i.test(phrase);";

const newRegexLine = `const genericWords = "january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|year|month|company|co|ltd|wll|spc|est|trading|factory|\\\\d+";
      const isDateOrGeneric = new RegExp(\`^(\${genericWords})\\\\s+(\${genericWords})$\`, 'i').test(phrase);`;

if (code.includes(oldRegexLine)) {
  code = code.replace(oldRegexLine, newRegexLine);
  fs.writeFileSync(file, code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find old regex line.");
}
