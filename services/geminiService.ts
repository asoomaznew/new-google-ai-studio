
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

export const generateContentWithRetry = async (aiParams: any, maxRetries = 3): Promise<any> => {
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

export const getAiName = async (text: string, instructions: string): Promise<string | null> => {
  if (!process.env.API_KEY) {
      throw new Error("Google Gemini API key is not configured.");
  }

  const model = "gemini-3.5-flash";
  // Increased limit to 100,000 characters to provide more context to the model while keeping it fast.
  const truncatedText = text.substring(0, 100000);

  const prompt = `
    ${instructions}
    
    Analyze the following document text and extract only the identifier based on the instructions.
    The output should be a single, clean string suitable for a file name. Do not include any explanation, context, or file extension.

    Document Text:
    ---
    ${truncatedText}
    ---
  `;

  try {
    const response = await generateContentWithRetry({
      model: model,
      contents: prompt,
    });
    
    const resultText = response.text;

    if (resultText) {
      // Clean up the response to make it a valid filename, removing any potential file extension
      return resultText.trim().replace(/\.[^/.]+$/, '');
    }
    
    return null;
  } catch (error) {
    console.error("Gemini AI extraction error:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the Gemini API.");
  }
};

export const getMedicalStatementFilename = async (text: string): Promise<string | null> => {
  if (!process.env.API_KEY) {
    throw new Error("Google Gemini API key is not configured.");
  }

  // Switched to Flash to avoid high quota consumption for bulk processing
  const model = "gemini-3.5-flash";

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "The patient or clinic name. If the name contains the word 'Clinic', it must be removed.",
      },
      accountNumber: {
        type: Type.STRING,
        description: "The full account number.",
      },
      toDate: {
        type: Type.STRING,
        description: "The end date of the statement period, formatted as DD-MMM (e.g., 20-Jul). The year must be omitted.",
      },
    },
    required: ["name", "accountNumber", "toDate"],
  };

  const prompt = `
    From the provided medical statement text, extract three specific pieces of information:
    1.  **Name**: Find the primary name on the statement. If this name includes the word "Clinic", you must remove "Clinic" from the output.
    2.  **Account Number**: Extract the complete account number.
    3.  **To Date**: Identify the end date of the statement period. Format this date as DD-MMM (example: 20-Jul), ensuring the year is excluded.
    
    Return these details in a JSON object.

    Document Text:
    ---
    ${text}
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
    const { name, accountNumber, toDate } = parsed;

    if (!name || !accountNumber || !toDate) {
      return null;
    }

    const last4 = accountNumber.slice(-4);
    
    const filename = `${name}-${last4}-${toDate}`;

    return filename;

  } catch (error) {
    console.error("Gemini AI medical statement extraction error:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the Gemini API.");
  }
};


export const getShortenedSuffix = async (suffixText: string): Promise<string> => {
    if (!process.env.API_KEY) {
      throw new Error("Google Gemini API key is not configured.");
    }
    if (!suffixText.trim()) {
        return "";
    }

    const model = "gemini-3.5-flash";
    const prompt = `
      You are an expert in formatting date ranges for filenames.
      Convert the following text into a specific, readable date range format, omitting the year.
      
      The target format is "DD-Mon to DD Month". 
      - The start date should be "DD-Mon" (e.g., "01-Jul"). Use a leading zero for the day.
      - The end date should be "DD Month" (e.g., "20 July"). Use a space between the day and the full month name.
      - Use " to " as the separator between the start and end dates.
      - Always omit the year, even if it is present in the input.

      Example Input: "from 1-July to 20-july-2025"
      Example Output: "01-Jul to 20 July"
      
      Example Input: "Meeting from 5th of Aug 2024 to 10th of Aug 2024"
      Example Output: "05-Aug to 10 August"

      Provide ONLY the formatted string in your response. Do not include any explanation.

      Original Text to convert: "${suffixText}"
    `;

    try {
        const response = await generateContentWithRetry({
            model: model,
            contents: prompt,
        });

        const resultText = response.text;
        // Fallback to original text if AI fails to return anything
        return resultText ? resultText.trim() : suffixText; 
    } catch (error) {
        console.error("Gemini AI suffix shortening error:", error);
        // Fallback to original text on error to not block the renaming process
        return suffixText;
    }
};

export const getAnswerFromText = async (pagesText: { pageNum: number; text: string }[], question: string): Promise<{ answer: string; pages: number[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("Google Gemini API key is not configured.");
  }

  const formattedPages = pagesText.map(p => `Page ${p.pageNum}:\n${p.text}`).join('\n---\n');
  const maxChars = 300000; // High limit for Gemini 3 Flash.
  const truncatedText = formattedPages.length > maxChars ? formattedPages.substring(0, maxChars) + "\n... (document truncated)" : formattedPages;

  const prompt = `
    You are an expert document analysis assistant.
    Carefully read the provided document text, which includes page numbers.
    Answer the user's question based *only* on the information within the text.
    Your answer should be concise and directly address the question.
    After your answer, you MUST include a list of the page numbers that contain the relevant information, in the format [p. 1, 5, 10].
    If the answer cannot be found in the document, you MUST respond with "I could not find an answer to that question in the document." and do not provide any page numbers.

    User's Question: "${question}"

    Document Text:
    ---
    ${truncatedText}
    ---
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    
    const resultText = response.text.trim();
    
    // Parse the response to separate answer and pages
    const pageMatch = resultText.match(/\[p\.\s*([\d,\s]+)\]\s*$/);
    let answer = resultText;
    let pages: number[] = [];

    if (pageMatch && pageMatch[1]) {
      answer = resultText.substring(0, pageMatch.index).trim();
      pages = pageMatch[1].split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    }

    return { answer, pages };

  } catch (error) {
    console.error("Gemini AI Q&A error:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the AI.");
  }
};

