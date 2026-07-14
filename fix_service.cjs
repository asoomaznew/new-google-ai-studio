const fs = require('fs');
const file = 'services/bahrainCustPaymentService.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the GoogleGenAI import
code = code.replace("import { GoogleGenAI } from '@google/genai';", "import { generateContentWithRetry } from './geminiService';");

// Replace the ai instantiation and call
const oldLogic = `      // Call Gemini API
      const apiKey = process.env.API_KEY || "DUMMY_KEY_FOR_BUILD";
      if (!process.env.API_KEY) {
        console.warn("API key might be missing, falling back to dummy key for build. Actual calls may fail.");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = \`You are an expert at extracting payment advice information from emails.
Analyze the following email text and extract the payment breakdown.

Email Text:
\${fullText}

Available Customer Master (Unit -> Code/Name):
\${JSON.stringify(CUSTOMER_MASTER, null, 2)}

Instructions:
1. Identify the Customer Name and the Unit number/ID.
2. Match the Unit with the exact key in the Available Customer Master (e.g. "BHW1-C-9"). If the text just says "unit 9" and the company is Waed Industrial, it maps to "BHW1-C-9". If the text mentions the company and unit, figure out the key from the master list.
3. Extract each line item (usually Rent and EWA).
4. For each item, extract the amount (number), the date (format DD-MM-YYYY, e.g. "07-07-2026", convert month names to numbers if necessary), and the description.
5. Set 'force' to "Rent" or "EWA" based on the description.

Return ONLY a valid JSON object matching this schema:
{
  "rows": [
    {
      "pdate": "07-07-2026", // payment date (DD-MM-YYYY)
      "unit": "BHW1-C-9", // matched key from CUSTOMER_MASTER
      "ccode": "24-000053", // matched code from CUSTOMER_MASTER
      "cname": "WAED INDUSTRIAL INNOVATION COMPANY W.L.L", // matched name from CUSTOMER_MASTER
      "desc": "Rent July 2026 Billing", // Description of payment
      "amt": 1188.00, // Amount as a number
      "force": "Rent" // "Rent" or "EWA"
    }
  ]
}\`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
      });`;

const newLogic = `      // Call Gemini API via service
      const prompt = \`You are an expert at extracting payment advice information from emails.
Analyze the following email text and extract the payment breakdown.

Email Text:
\${fullText}

Available Customer Master (Unit -> Code/Name):
\${JSON.stringify(CUSTOMER_MASTER, null, 2)}

Instructions:
1. Identify the Customer Name and the Unit number/ID.
2. Match the Unit with the exact key in the Available Customer Master (e.g. "BHW1-C-9"). If the text just says "unit 9" and the company is Waed Industrial, it maps to "BHW1-C-9". If the text mentions the company and unit, figure out the key from the master list.
3. Extract each line item (usually Rent and EWA).
4. For each item, extract the amount (number), the date (format DD-MM-YYYY, e.g. "07-07-2026", convert month names to numbers if necessary), and the description.
5. Set 'force' to "Rent" or "EWA" based on the description.

Return ONLY a valid JSON object matching this schema:
{
  "rows": [
    {
      "pdate": "07-07-2026", // payment date (DD-MM-YYYY)
      "unit": "BHW1-C-9", // matched key from CUSTOMER_MASTER
      "ccode": "24-000053", // matched code from CUSTOMER_MASTER
      "cname": "WAED INDUSTRIAL INNOVATION COMPANY W.L.L", // matched name from CUSTOMER_MASTER
      "desc": "Rent July 2026 Billing", // Description of payment
      "amt": 1188.00, // Amount as a number
      "force": "Rent" // "Rent" or "EWA"
    }
  ]
}\`;

      const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
      });`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync(file, code);
console.log("Patched to use generateContentWithRetry");
