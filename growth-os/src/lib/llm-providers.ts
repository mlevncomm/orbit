export const LLM_PROVIDERS = [
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    hint: "aistudio.google.com/apikey — AIza… ile başlayan Google AI Studio anahtarı",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "platform.openai.com — ücretli",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free",
    hint: "openrouter.ai — ücretsiz modeller :free",
  },
  {
    id: "custom",
    label: "Özel / OpenAI uyumlu",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    hint: "Ollama, LM Studio, vLLM veya başka OpenAI uyumlu uç",
  },
] as const;

export const DEFAULT_LLM = LLM_PROVIDERS[0];

/**
 * Tried in order when Gemini returns 404 for a retired model id.
 * Google model list (Oct 2026): stable gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite;
 * gemini-3.7-flash and gemini-3.5-flash were never published, gemini-2.0-flash is shut down.
 */
export const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
] as const;

export function isRetiredGroqKey(key: string): boolean {
  return /^gsk_/i.test(key.trim());
}

export function isGeminiApiKey(key: string): boolean {
  return /^AIza/i.test(key.trim());
}

/** Shut down, never published, or older than the current default; such saved ids are bumped on read. */
export function isStaleGeminiModel(model: string): boolean {
  const m = model.trim();
  return (
    /^(gemini-2\.0-flash|gemini-2\.5-flash|gemini-1\.5-flash|gemini-pro)(-[a-z0-9]+)?$/i.test(m) ||
    /^gemini-3\.(5|7)-flash$/i.test(m) ||
    /^gemini-3\.1-flash-lite-preview$/i.test(m)
  );
}

export function isGeminiEndpoint(baseUrl: string, model: string, apiKey = ""): boolean {
  return (
    /generativelanguage\.googleapis\.com/i.test(baseUrl) ||
    /^gemini/i.test(model.trim()) ||
    isGeminiApiKey(apiKey)
  );
}

export function normalizeLlmConfig(input: {
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmProvider?: string;
}): {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmProvider: string;
} {
  const key = isRetiredGroqKey(input.llmApiKey || "") ? "" : (input.llmApiKey || "").trim();
  const provider = (input.llmProvider || "").trim();
  const baseUrl = (input.llmBaseUrl || "").trim();
  const groq = provider === "groq" || /api\.groq\.com/i.test(baseUrl);
  const geminiKey = isGeminiApiKey(key);
  if (groq || !provider || geminiKey) {
    const requested = (input.llmModel || "").trim();
    const keepModel =
      Boolean(requested) &&
      /gemini/i.test(requested) &&
      !isStaleGeminiModel(requested) &&
      !/gpt-oss|llama-3|mixtral|groq/i.test(requested);
    return {
      llmApiKey: key,
      llmProvider: DEFAULT_LLM.id,
      llmBaseUrl: DEFAULT_LLM.baseUrl,
      llmModel: keepModel ? requested : DEFAULT_LLM.model,
    };
  }
  const requested = (input.llmModel || "").trim();
  const geminiHost = provider === "gemini" || /generativelanguage\.googleapis\.com/i.test(baseUrl);
  return {
    llmApiKey: key,
    llmProvider: provider,
    llmBaseUrl: geminiHost ? DEFAULT_LLM.baseUrl : baseUrl || DEFAULT_LLM.baseUrl,
    llmModel:
      geminiHost && (!requested || isStaleGeminiModel(requested))
        ? DEFAULT_LLM.model
        : requested || DEFAULT_LLM.model,
  };
}
