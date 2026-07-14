const fs = require('fs');
const file = 'services/bahrainCustPaymentService.ts';
let code = fs.readFileSync(file, 'utf8');

const oldKeyLogic = `const apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key is required");
      }
      
      const ai = new GoogleGenAI({ apiKey });`;

const newKeyLogic = `const apiKey = process.env.API_KEY || "DUMMY_KEY_FOR_BUILD";
      if (!process.env.API_KEY) {
        console.warn("API key might be missing, falling back to dummy key for build. Actual calls may fail.");
      }
      
      const ai = new GoogleGenAI({ apiKey });`;

if (code.includes(oldKeyLogic)) {
  code = code.replace(oldKeyLogic, newKeyLogic);
  fs.writeFileSync(file, code);
  console.log("Patched API key logic");
} else {
  console.log("Could not find old API key logic");
}
