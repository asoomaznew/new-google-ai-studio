import express from "express";
import path from "path";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Shared server-side gemini client
  let ai: GoogleGenAI;
  const getAi = () => {
    if (!ai) {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required");
      }
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
    }
    return ai;
  };

  // API endpoint for Gemini Generation
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { model, contents, config } = req.body;
      const client = getAi();
      const response = await client.models.generateContent({
        model,
        contents,
        config,
      });
      res.json({ text: response.text, functionCalls: response.functionCalls, candidates: response.candidates });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message || "Failed to generate content", status: error.status });
    }
  });

  // API endpoint for Chat
  const activeChats = new Map<string, any>();
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { chatId, message, model, systemInstruction } = req.body;
      const client = getAi();
      let chat = activeChats.get(chatId);
      if (!chat) {
        chat = client.chats.create({
          model: model || "gemini-3.5-flash",
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        activeChats.set(chatId, chat);
      }
      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini Chat API error:", error);
      res.status(500).json({ error: error.message || "Failed to chat", status: error.status });
    }
  });

  // API endpoint for deleting chat history
  app.delete("/api/gemini/chat/:chatId", (req, res) => {
    activeChats.delete(req.params.chatId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For Express 4 use '*', for Express 5 use '*all' if we upgraded, but express is 4.x
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
