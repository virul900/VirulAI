import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const _filename = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : "";

const _dirname = _filename ? path.dirname(_filename) : "";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper function for retry and fallback to alternate models in case a model is unavailable (503) or rate-limited (429)
async function runWithFallback<T>(
  apiCall: (model: string) => Promise<T>,
  models: string[] = ["gemini-3.5-flash", "gemini-3.1-flash-lite"]
): Promise<T> {
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await apiCall(model);
      } catch (error: any) {
        lastError = error;
        
        let errorText = "";
        try {
          errorText = [
            error?.message,
            error?.status,
            error?.statusCode,
            error?.error?.status,
            error?.error?.message,
            error?.error?.code,
            error?.toString?.(),
            error?.statusText
          ].filter(Boolean).join(" ").toLowerCase();
        } catch (e) {
          errorText = String(error).toLowerCase();
        }
        
        const is503 = error?.status === 503 || 
                      error?.statusCode === 503 || 
                      error?.error?.code === 503 ||
                      errorText.includes("503") || 
                      errorText.includes("unavailable") ||
                      errorText.includes("high demand") ||
                      errorText.includes("temporary");

        const is429 = error?.status === 429 ||
                      error?.statusCode === 429 ||
                      error?.error?.code === 429 ||
                      error?.status === "RESOURCE_EXHAUSTED" ||
                      error?.error?.status === "RESOURCE_EXHAUSTED" ||
                      errorText.includes("429") ||
                      errorText.includes("resource_exhausted") ||
                      errorText.includes("quota") ||
                      errorText.includes("limit") ||
                      errorText.includes("rate");
                      
        if (is503) {
          console.warn(`Model ${model} (attempt ${attempt}/2) failed with 503 High Demand: ${error?.message || error}.`);
          if (attempt < 2) {
            // Wait 500ms before retrying
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          console.warn(`Switching/falling back from ${model} to next model...`);
          break; // Break out of attempts, go to next model
        } else if (is429) {
          console.warn(`Model ${model} rate limited or quota exceeded (429): ${error?.message || error}.`);
          console.warn(`Switching/falling back from ${model} to next model immediately...`);
          break; // Don't bother retrying the same rate-limited model, switch automatically
        }
        
        throw error; // Rethrow other errors immediately (e.g. invalid parameters)
      }
    }
  }
  throw lastError;
}

const ALLOWED_MIME_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif", "image/gif", "image/bmp",
  "audio/mp3", "audio/mpeg", "audio/wav", "audio/flac", "audio/aac", "audio/ogg", "audio/webm", "audio/x-m4a", "audio/m4a", "audio/opus",
  "video/mp4", "video/webm", "video/quicktime", "video/mpeg", "video/avi", "video/x-flv", "video/x-matroska", "video/3gpp",
  "application/pdf",
  "text/plain", "text/csv", "application/json", "text/html", "text/css", "text/javascript", "text/markdown"
];

function sanitizePart(p: any): any {
  if (!p) return { text: "" };
  if (p.text) {
    return { text: p.text };
  }
  if (p.inlineData) {
    let mime = p.inlineData.mimeType || "";
    // Normalize image/jpg to image/jpeg to prevent model decoding errors
    if (mime.toLowerCase() === "image/jpg") {
      mime = "image/jpeg";
    }
    const isAllowed = ALLOWED_MIME_TYPES.some(type => mime.toLowerCase().startsWith(type.split("/*")[0]) || mime.toLowerCase() === type);
    if (isAllowed && p.inlineData.data) {
      let cleanData = p.inlineData.data;
      if (cleanData.includes(",")) {
        cleanData = cleanData.split(",")[1];
      }
      cleanData = cleanData.replace(/[\s\r\n]+/g, "");
      return {
        inlineData: {
          mimeType: mime,
          data: cleanData
        }
      };
    } else {
      return { text: `[Attached local document: ${mime || "unknown file type"}]` };
    }
  }
  return { text: "" };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for large payloads (multimodal)
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/chat", async (req, res) => {
    const { history, currentMessage, virulSearch, virulThinks } = req.body;
    
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Instruct Nginx/Cloud Run reverse proxies to stream chunks instantly without buffering

      // Adjust message if it's only multimodal without text to ensure model response
      let processedCurrentMessage = [...currentMessage];
      const hasText = processedCurrentMessage.some(p => p.text && p.text.trim().length > 0);
      const hasMultimodal = processedCurrentMessage.some(p => p.inlineData);
      
      if (!hasText && hasMultimodal) {
        processedCurrentMessage.push({ text: "Please analyze the uploaded content and respond." });
      }

      // Check if user is asking who made the assistant
      const lowercaseUserText = processedCurrentMessage
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join(" ")
        .toLowerCase();

      const isWhoMadeYou = lowercaseUserText.includes("who made you") || 
                           lowercaseUserText.includes("who created you") ||
                           lowercaseUserText.includes("who is your creator") ||
                           (lowercaseUserText.includes("who") && lowercaseUserText.includes("made") && lowercaseUserText.includes("you"));

      if (isWhoMadeYou) {
        res.write(`data: ${JSON.stringify({ text: "I am made by Virul", thought: "" })}\n\n`);
        res.end();
        return;
      }

      // Slice history to the last 30 messages for extremely fast context parsing and ultra-low time-to-first-token latency
      const contents = [
        ...history.slice(-30).map((m: any) => ({
          role: m.role,
          parts: m.parts.map(sanitizePart)
        })),
        {
          role: "user",
          parts: processedCurrentMessage.map(sanitizePart)
        }
      ];

      // Prioritize the ultra-fast gemini-3.1-flash-lite model for normal fast queries, and gemini-3.5-flash for deep thinking
      const models = virulThinks 
        ? ["gemini-3.5-flash", "gemini-3.1-flash-lite"] 
        : ["gemini-3.1-flash-lite", "gemini-3.5-flash"];

      const responseStream = await runWithFallback((model) => 
        ai.models.generateContentStream({
          model,
          contents,
          config: {
             systemInstruction: "You are Virul, an advanced, highly intelligent, and articulate professional AI assistant that always gives lightning-fast, straightforward, quick, precise, and clean answers. Get straight to the point immediately without any preambles, introductory filler, or conversational fluff. Maintain absolute technical precision, logical clarity, and elegant conciseness. Keep your answers straight to the point, brief, and extremely direct to ensure fastest reply times. You should ONLY organize your response with structured formats (such as bullet points, numbered lists, key-value tables, or neat sections) if the user explicitly asks for structure, lists, or detailed organization. Otherwise, write straightforward, highly quick, and highly precise responses to deliver the answer instantly and cleanly. Always pay close attention to the historical chat logs to remember user names, specific requests, previously written code, preferences, files uploaded, calculations, and topics with deep professional recall, as you have an extraordinarily high and precise memory capacity. Make sure you remember previous context deeply and refer back to it naturally. Maintain a polite and friendly but highly capable and objective demeanor. Only if the user explicitly asks who made you or about your creator, respond with 'I am made by Virul'. Do not append or mention this statement under any other circumstances. Analyze text, images, and videos with sophisticated, logical, step-by-step reasoning. Crucial: When answering mathematical, calculation, logic, or engineering questions with numbers or formula expressions, you MUST format equations beautifully using standard LaTeX delimiters so they render properly: use $$ ... $$ on a new line for display equations and formulas, and $ ... $ for inline variables, numbers, equations, and mathematical notations. Never write raw unformatted equations as plain typed text.",
            tools: virulSearch ? [{ googleSearch: {} }] : undefined,
            thinkingConfig: { 
              thinkingLevel: virulThinks ? ThinkingLevel.HIGH : ThinkingLevel.MINIMAL 
            }
          },
        }),
        models
      );

      req.on('close', () => {
        // Handle client disconnect if needed
      });

      for await (const chunk of responseStream) {
        const c = chunk as any;
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify({ text: c.text || "", thought: c.thought || "" })}\n\n`);
      }
      if (!res.writableEnded) res.end();
    } catch (error: any) {
      console.error("Server AI Error:", error);
      
      let errorText = "";
      try {
        errorText = [
          error?.message,
          error?.status,
          error?.statusCode,
          error?.error?.status,
          error?.error?.message,
          error?.error?.code,
          error?.toString?.(),
          error?.statusText
        ].filter(Boolean).join(" ").toLowerCase();
      } catch (e) {
        errorText = String(error).toLowerCase();
      }

      const isQuotaOrRateLimit = error?.status === 429 ||
                                 error?.statusCode === 429 ||
                                 error?.error?.code === 429 ||
                                 error?.status === "RESOURCE_EXHAUSTED" ||
                                 error?.error?.status === "RESOURCE_EXHAUSTED" ||
                                 errorText.includes("429") ||
                                 errorText.includes("resource_exhausted") ||
                                 errorText.includes("quota") ||
                                 errorText.includes("limit") ||
                                 errorText.includes("rate");

      const is503 = error?.status === 503 || 
                    error?.statusCode === 503 || 
                    error?.error?.code === 503 ||
                    errorText.includes("503") || 
                    errorText.includes("unavailable") ||
                    errorText.includes("high demand") ||
                    errorText.includes("temporary");

      let errorMessage = "An error occurred with the AI service. Please retry or verify your request details.";
      if (isQuotaOrRateLimit) {
        errorMessage = "Virul has exceeded the Gemini API free-tier quota limits (429: RESOURCE_EXHAUSTED). To continue without interruptions, you can easily add your own Gemini API key in Google AI Studio under Settings > Secrets. Alternatively, please wait a moment and retry.";
      } else if (is503) {
        errorMessage = "The Gemini models are currently experiencing extremely high demand on the free tier (503 Service Unavailable). Please wait a moment and click retry, or add your own premium Gemini API key in Settings > Secrets to resume.";
      }

      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  });

  app.post("/api/suggestions", async (req, res) => {
    const { input, history } = req.body;
    
    try {
      const contents = [
        ...history.slice(-3).map((m: any) => ({
          role: m.role,
          parts: m.parts.map((p: any) => ({ text: p.text || "" }))
        })),
        {
          role: "user",
          parts: [{ text: `You are a text completion engine. Based on the history and current input, provide 3 short, meaningful, and contextually relevant completions. 
          Focus on completing the user's current word or sentence fragment to guess what they are typing. The suggestions MUST start with or directly follow the input "${input}".
          Current Input: "${input}"
          Return ONLY a JSON array of strings. Do not include any other text.` }]
        }
      ];

      const response = await runWithFallback((model) =>
        ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 60,
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
          }
        })
      );

      const text = response.text;
      const parsed = text ? JSON.parse(text) : [];
      res.json(Array.isArray(parsed) ? parsed.map((s: string) => s.trim()).filter((s: string) => s.length > 0).slice(0, 3) : []);
    } catch (error: any) {
      console.warn("Server Suggestions info/rate-limit:", error?.message || error);
      res.status(error?.status || error?.statusCode || 429).json([]);
    }
  });

  app.post("/api/generate-title", async (req, res) => {
    const { messageText } = req.body;
    if (!messageText || typeof messageText !== "string") {
      return res.status(400).json({ error: "messageText is required and must be a string." });
    }
    try {
      const prompt = `Based on the following user message, generate an extremely concise and natural-sounding topic/chat title (exactly 2 to 5 words) that summarizes what they want to discuss. Do not include quotes, prefixes, suffixes, punctuation, preamble, or explanations. Just return the raw title.
User Message: "${messageText}"`;

      const response = await runWithFallback((model) =>
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            maxOutputTokens: 20,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
          }
        })
      );

      const title = response.text?.trim() || "";
      // Strip any surrounding quotes if returned
      const cleanTitle = title.replace(/^["']|["']$/g, "").trim();
      res.json({ title: cleanTitle });
    } catch (error: any) {
      console.warn("Server title generation error:", error?.message || error);
      res.status(500).json({ error: "Failed to generate title" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
