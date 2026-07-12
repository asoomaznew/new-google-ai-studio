export const getLLMConfig = () => {
    try {
        const provider = localStorage.getItem('llm_provider') || 'gemini';
        let baseUrl = localStorage.getItem('llm_base_url') || 'http://localhost:11434/v1';
        // if user entered trailing slash, remove it
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        const modelName = localStorage.getItem('llm_model') || 'llama3';
        return { provider, baseUrl, modelName };
    } catch {
        return { provider: 'gemini', baseUrl: 'http://localhost:11434/v1', modelName: 'llama3' };
    }
};

export const callLocalLLM = async (prompt: string, schema: any, modelName: string, baseUrl: string) => {
    let systemMessage = "You are an expert AI extraction assistant. Follow instructions perfectly.";
    
    // Convert gemini schema to simplified JSON string representation for the prompt if needed
    if (schema) {
        systemMessage += `\nYou must return ONLY valid JSON matching the following schema. Do not output anything else (no markdown blocks, no commentary).\nSchema:\n${JSON.stringify(schema, null, 2)}`;
    }

    const payload = {
        model: modelName,
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: prompt }
        ],
        temperature: 0.1,
    };

    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Local LLM Error: ${res.status} ${res.statusText} - ${text}`);
        }

        const data = await res.json();
        let content = data.choices?.[0]?.message?.content || "";
        
        // robust JSON cleanup
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            content = jsonMatch[1];
        } else {
            // Just in case there is no markdown but conversational text around it, try to find first { and last }
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                content = content.substring(firstBrace, lastBrace + 1);
            }
        }
        
        return { text: content };
    } catch (e: any) {
        if (e.message.includes("Failed to fetch") || e.message.includes("Load failed")) {
            throw new Error("Could not connect to Local LLM. Please make sure Ollama/LM Studio is running and CORS is enabled (OLLAMA_ORIGINS=\"*\").");
        }
        throw e;
    }
};
