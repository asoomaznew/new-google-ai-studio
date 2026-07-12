import { GoogleGenAI, Type } from "@google/genai";
import { getLLMConfig, callLocalLLM } from "./localLlmService";

if (!process.env.API_KEY) {
  console.error("API_KEY environment variable not set.");
}

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

export const getEndingBalanceFromText = async (
  text: string,
): Promise<{
  corporateName: string;
  accountNumber: string;
  endBalance: string;
  documentType: 'statement' | 'reconciliation' | 'unknown';
} | null> => {
  if (!process.env.API_KEY) {
    throw new Error("Google Gemini API key is not configured.");
  }

  const model = "gemini-3.5-flash";

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      corporateName: {
        type: Type.STRING,
        description:
          "The corporate name, account holder's name, or company name.",
      },
      accountNumber: {
        type: Type.STRING,
        description: "The full account number. E.g., '011010232380' or 'KIBAA-2380'.",
      },
      endBalance: {
        type: Type.STRING,
        description:
          "The ending balance, closing balance, statement balance, book balance, or balance after the last transaction. E.g. '150,000.00'",
      },
      documentType: {
        type: Type.STRING,
        description: "The type of document: 'statement' if it's a bank statement, 'reconciliation' if it's a bank reconciliation form/document, or 'unknown'.",
      }
    },
    required: ["corporateName", "accountNumber", "endBalance", "documentType"],
  };

  const truncatedText = text.substring(0, 150000);

  const prompt = `
    Analyze the following document text and extract four pieces of information:
    1.  **Corporate Name**: The company name, account name, or corporate name.
    2.  **Account Number**: The complete bank account number. (Often formatted like '0110xxxxxxxx' or a mapped name like 'KIBAA-2380'). If you see patterns like that, pull them exactly.
    3.  **End Balance**: The final ending balance, closing balance, or the balance for the bank/book reconciliation.
    4.  **Document Type**: Is this a Bank Statement ('statement') or a Bank Reconciliation ('reconciliation')?

    Return these details in a JSON object.

    Document Text:
    ---
    ${truncatedText}
    ---
  `;

  try {
    const response = await generateContentWithRetry({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const jsonString = response.text.trim();
    if (!jsonString) {
      return null;
    }

    const parsed = JSON.parse(jsonString);
    const { corporateName, accountNumber, endBalance, documentType } = parsed;

    if (!corporateName || !accountNumber) {
      return null;
    }

    return { corporateName, accountNumber, endBalance: endBalance || '0.00', documentType: documentType || 'unknown' };
  } catch (error) {
    console.error("Gemini AI ending balance extraction error:", error);
    if (error instanceof Error) {
      throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error(
      "An unknown error occurred while communicating with the Gemini API.",
    );
  }
};
