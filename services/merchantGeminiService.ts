
import { GoogleGenAI, Type } from "@google/genai";
import { getLLMConfig, callLocalLLM } from "./localLlmService";
import { ExtractedData } from '../types';

let aiInstance: GoogleGenAI | null = null;
const getAi = (): GoogleGenAI => {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || "DUMMY_KEY_FOR_BUILD";
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const modelsChain = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

const generateContentWithRetry = async (aiParams: any, maxRetries = 3): Promise<any> => {
    const config = typeof window !== 'undefined' ? getLLMConfig() : { provider: 'gemini', baseUrl: '', modelName: '' };
    if (config.provider === 'local') {
        return callLocalLLM(aiParams.contents, aiParams.config?.responseSchema, config.modelName, config.baseUrl);
    }

    let attempt = 0;
    let modelIndex = 0;
    while (attempt < maxRetries) {
        const originalModel = aiParams.model;
        let currentModel = originalModel;
        
        if (modelsChain.includes(originalModel)) {
            currentModel = modelsChain[Math.min(modelIndex, modelsChain.length - 1)];
        }
        
        const params = { ...aiParams, model: currentModel };
        
        try {
            return await getAi().models.generateContent(params);
        } catch (error: any) {
            console.error(`Gemini call failed with model ${currentModel}:`, error);
            
            const isPermissionOrNotFound = error?.status === 403 || 
                                          error?.code === 403 || 
                                          error?.message?.includes('403') || 
                                          error?.message?.includes('permission') ||
                                          error?.message?.includes('PERMISSION_DENIED') ||
                                          error?.status === 404 ||
                                          error?.code === 404 ||
                                          error?.message?.includes('404') ||
                                          error?.message?.includes('not found') ||
                                          error?.message?.includes('NOT_FOUND');
            
            if (isPermissionOrNotFound) {
                if (modelsChain.includes(originalModel) && modelIndex < modelsChain.length - 1) {
                    modelIndex++;
                    console.warn(`Permission or Not Found error on model ${currentModel}. Switching to next fallback model: ${modelsChain[modelIndex]}`);
                    continue; // Immediately try with the next model
                }
            }
            
            if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded') || error?.message?.includes('prepayment credits') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
                // If it's a prepayment depletion error, try falling back to next model (in case smaller models are free)
                if (error?.message?.includes('prepayment credits') || error?.message?.includes('billing')) {
                    if (modelsChain.includes(originalModel) && modelIndex < modelsChain.length - 1) {
                        modelIndex++;
                        console.warn(`Billing error on model ${currentModel}. Switching to next fallback model: ${modelsChain[modelIndex]}`);
                        continue; // Try next model immediately
                    } else {
                        throw new Error("Your Gemini API credits are depleted. Please update your API key or configure a Local LLM Provider in Settings.");
                    }
                }

                const match = error?.message?.match(/Please retry in (\d+\.?\d*)s/);
                const waitSeconds = match ? parseFloat(match[1]) : Math.pow(2, attempt) * 10;
                console.warn(`Rate limit hit. Retrying in ${waitSeconds} seconds... (Attempt ${attempt + 1}/${maxRetries})`);
                await delay(waitSeconds * 1000 + 1000); // Add 1 second buffer
                attempt++;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries exceeded for Gemini API.');
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    accountName: {
      type: Type.STRING,
      description: "The primary account holder's name or company name found in the statement.",
    },
    accountNumber: {
      type: Type.STRING,
      description: "The bank account number found in the statement. This can be a long numeric string or a shorter alphanumeric identifier (e.g., 'KIBXX-1234'). Extract whichever is present.",
    },
    transactions: {
      type: Type.ARRAY,
      description: "A list of all credit transactions (deposits) and debit transactions (withdrawals, payments).",
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: "Transaction date in YYYY-MM-DD format.",
          },
          description: {
            type: Type.STRING,
            description: "The full, original transaction description.",
          },
          amount: {
            type: Type.NUMBER,
            description: "The numeric transaction amount.",
          },
          type: {
            type: Type.STRING,
            description: "The type of transaction, must be either 'credit' or 'debit'.",
            enum: ['credit', 'debit'],
          },
        },
        required: ["date", "description", "amount", "type"],
      },
    },
  },
  required: ["accountName", "accountNumber", "transactions"],
};

export async function extractTransactionsFromText(text: string): Promise<ExtractedData> {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
  }
  
  // Using Flash model to handle larger volumes of files without hitting the Pro tier's tighter rate limits.
  const truncatedText = text.substring(0, 100000);
  const prompt = `
    You are an expert financial data extraction API.
    Analyze the following bank statement text. Your task is to:
    1. Identify the primary account holder's name (e.g., "YARROW POLYCLINIC").
    2. Identify the bank Account Number for the statement (e.g., "KIBXX-1234" or "011010198602").
    3. Extract ALL transactions, both CREDIT (deposits, incoming funds) and DEBIT (withdrawals, payments made, fees).
    4. For each transaction, you must identify its type as either 'credit' or 'debit'. Pay close attention to keywords. For example, 'PURCHASE', 'WITHDRAWAL', 'FEE', 'PAYMENT', or 'CHARGE' usually indicate a 'debit'. Conversely, 'DEPOSIT' or 'TRANSFER FROM' usually indicate a 'credit'.
    5. Format the extracted data into a JSON object that strictly follows the provided schema.
    6. Ensure dates are standardized to YYYY-MM-DD format if possible. If year is ambiguous, assume the current year.

    Bank Statement Text:
    ---
    ${truncatedText}
    ---
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const rawText = response.text?.trim();

    if (!rawText) {
        throw new Error("The AI model returned an empty response.");
    }

    let parsedData;
    try {
        const cleanedJsonText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        parsedData = JSON.parse(cleanedJsonText);
    } catch (e) {
        console.error("Failed to parse AI response as JSON.", "Raw response:", rawText, "Error:", e);
        if (rawText.toLowerCase() === 'undefined') {
             throw new Error("The AI failed to extract data. Document may be invalid or contains no transactions.");
        }
        throw new Error("The AI returned data in an unexpected format.");
    }
    
    if (!parsedData || typeof parsedData !== 'object' || !parsedData.accountName || !parsedData.accountNumber || !Array.isArray(parsedData.transactions)) {
        throw new Error("AI response is missing required data fields.");
    }
    
    return parsedData as ExtractedData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unexpected error occurred while communicating with the AI.");
  }
}
