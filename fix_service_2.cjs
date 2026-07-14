const fs = require('fs');
const file = 'services/bahrainCustPaymentService.ts';
let code = fs.readFileSync(file, 'utf8');

// The file has this content:
//       // Call Gemini API      const apiKey = process.env.API_KEY || "DUMMY_KEY_FOR_BUILD";      if (!process.env.API_KEY) {        console.warn("API key might be missing, falling back to dummy key for build. Actual calls may fail.");      }            const ai = new GoogleGenAI({ apiKey });            const prompt = `You are an expert...
//       const response = await ai.models.generateContent({        model: 'gemini-3.5-flash',        contents: prompt,        config: {            temperature: 0.1,            responseMimeType: "application/json"        }      });

code = code.replace(/const apiKey = process\.env\.API_KEY \|\| "DUMMY_KEY_FOR_BUILD";\s*if \(\!process\.env\.API_KEY\) \{\s*console\.warn\("API key might be missing, falling back to dummy key for build\. Actual calls may fail\."\);\s*\}\s*const ai = new GoogleGenAI\(\{ apiKey \}\);\s*/, "");
code = code.replace(/const response = await ai\.models\.generateContent\(\{/g, "const response = await generateContentWithRetry({");

fs.writeFileSync(file, code);
console.log("Patched correctly");
