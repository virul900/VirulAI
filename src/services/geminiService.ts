export interface MessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  parts: MessagePart[];
  thought?: string;
}

export async function* streamChat(
  history: ChatMessage[],
  currentMessage: MessagePart[],
  virulSearch?: boolean,
  virulThinks?: boolean
) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, currentMessage, virulSearch, virulThinks }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to communicate with Virul.");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response stream available.");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          let data: any = null;
          try {
            data = JSON.parse(line.slice(6));
          } catch (jsonErr) {
            console.error("Error parsing stream line JSON:", jsonErr);
            continue;
          }
          if (data && data.error) {
            throw new Error(data.error);
          }
          if (data) {
            yield data;
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Streaming Error:", error);
    throw error;
  }
}

export async function getSuggestions(input: string, history: ChatMessage[]): Promise<string[]> {
  if (!input || input.trim().length < 1) return [];
  
  try {
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, history }),
    });

    if (!response.ok) {
      throw new Error(`Suggestions endpoint returned status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("Suggestions error:", error);
    throw error;
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result?.toString().split(",")[1];
      if (base64String) resolve(base64String);
      else reject(new Error("Failed to convert file to base64"));
    };
    reader.onerror = error => reject(error);
  });
}

export async function generateTopicTitle(messageText: string): Promise<string> {
  if (!messageText || messageText.trim().length === 0) return "New Topic";
  try {
    const response = await fetch("/api/generate-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageText }),
    });
    if (!response.ok) {
      throw new Error(`Title generation returned status ${response.status}`);
    }
    const data = await response.json();
    return data.title || "New Topic";
  } catch (error) {
    console.warn("Title generation failed, falling back:", error);
    return messageText.slice(0, 35);
  }
}
