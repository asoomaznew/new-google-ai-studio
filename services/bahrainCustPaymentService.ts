import { generateContentWithRetry } from './geminiService';
import * as pdfjsLib from 'pdfjs-dist';

export interface ExtractedRow {
  pdate: string;
  unit: string;
  ccode: string;
  cname: string;
  desc: string;
  amt: number;
  force: "Rent" | "EWA";
}

export interface ExtractedData {
  rows: ExtractedRow[];
}

export interface ProcessingResult {
  fileName: string;
  success: boolean;
  extractedData?: ExtractedData;
  error?: string;
}

const CUSTOMER_MASTER: Record<string, { code: string, name: string }> = {
  "BHW1-C-12": { code: "24-000033", name: "Savon Company WLL" },
  "BHW1-C-25": { code: "24-000032", name: "Crown Gold W.L.L" },
  "BHW1-C-21": { code: "24-000035", name: "Baraka Sweets Factory" },
  "BHW1-B-14": { code: "24-000037", name: "Rare Fitness Equipment Co." },
  "BHW1-C-11": { code: "24-000039", name: "Sofia Industrial Company" },
  "BHW1-C-1": { code: "24-000001", name: "Red Finishing W.L.L." },
  "BHW1-C-10": { code: "24-000028", name: "Unigulf Air-Conditioning Trading Co." },
  "BHW1-C-3": { code: "24-000042", name: "Al-Hosn Trading Est." },
  "BHW1-B-2": { code: "24-000044", name: "Upstream Global For Technical Solutions" },
  "BHW1-A-5": { code: "24-000045", name: "Blue Line Factory W.L.L" },
  "BHW1-C-26": { code: "24-000023", name: "Naffco" },
  "BHW1-B-15": { code: "24-000020", name: "Majestic Cars Center" },
  "BHW1-C-22": { code: "24-000020", name: "Majestic Cars Center" },
  "BHW1-A-6": { code: "24-000010", name: "Shahia Food Limited Company W.L.L." },
  "BHW1-C-23": { code: "24-000028", name: "Unigulf Air-Conditioning Trading Co." },
  "BHW1-B-8": { code: "24-000005", name: "Mira Packaging Factory" },
  "BHW1-B-4": { code: "24-000045", name: "Blue Line Factory W.L.L" },
  "BHW1-B-20": { code: "24-000048", name: "MADI INTERNATIONAL CO LLC" },
  "BHW1-B-19": { code: "24-000034", name: "Lalaplast Manufacturing Biodegradable Plastics" },
  "BHW1-C-7": { code: "24-000030", name: "Abbas Hassan Ali Bin Saleh (Bin Saleh Industrial Service)" },
  "bhw1-b-36&37": { code: "24-000050", name: "German Standard Veterinary Medicines Trading Co., W.L.L." },
  "BHW1-C-13": { code: "24-000047", name: "SAMAR MARINE SERVICES W.L.L" },
  "BHW1-C-9": { code: "24-000053", name: "WAED INDUSTRIAL INNOVATION COMPANY W.L.L" }
};

export async function processBahrainFiles(
  files: File[],
  onProgress: (msg: string) => void
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(`Processing ${i+1}/${files.length}: ${file.name}`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = "";
      for (let j = 1; j <= pdf.numPages; j++) {
        const page = await pdf.getPage(j);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(" ") + "\\n";
      }
      
      onProgress(`Analyzing ${file.name} with AI...`);
      
      // Call Gemini API
      const prompt = `
You are an expert at extracting payment advice information from emails.
Analyze the following email text and extract the payment breakdown.

Email Text:
${fullText}

Available Customer Master (Unit -> Code/Name):
${JSON.stringify(CUSTOMER_MASTER, null, 2)}

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
}
`;

      const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
      });
      
      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from Gemini");
      
      const data = JSON.parse(responseText);
      
      results.push({
        fileName: file.name,
        success: true,
        extractedData: data
      });
      
    } catch (err: any) {
      console.error(`Error processing ${file.name}:`, err);
      results.push({
        fileName: file.name,
        success: false,
        error: err.message
      });
    }
  }
  
  return results;
}
