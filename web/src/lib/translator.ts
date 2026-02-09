import type { Language } from "./translations";

const DEFAULT_TRANSLATE_URL = "https://libretranslate.de/translate";
const CACHE_LIMIT = 400;

const translationCache = new Map<string, string>();

function cacheKey(text: string, target: Language, source?: string | null) {
  return `${target}::${source || "auto"}::${text}`;
}

function remember(key: string, value: string) {
  translationCache.set(key, value);
  if (translationCache.size > CACHE_LIMIT) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) {
      translationCache.delete(firstKey);
    }
  }
}

async function translateOne(text: string, target: Language, source?: string | null): Promise<string> {
  const apiUrl = process.env.TRANSLATE_API_URL || DEFAULT_TRANSLATE_URL;
  const body: Record<string, any> = {
    q: text,
    target,
    source: source || "auto",
    format: "text",
  };

  if (process.env.TRANSLATE_API_KEY) {
    body.api_key = process.env.TRANSLATE_API_KEY;
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Translation request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json().catch(() => null);
  if (data && typeof data.translatedText === "string" && data.translatedText.length > 0) {
    return data.translatedText;
  }

  const maybeArray = Array.isArray(data) ? data : data?.data;
  if (Array.isArray(maybeArray) && maybeArray.length > 0 && typeof maybeArray[0]?.translatedText === "string") {
    return maybeArray[0].translatedText as string;
  }

  if (typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }

  return text;
}

export async function translateTexts(
  texts: string[],
  target: Language,
  options?: { sourceLang?: string | null }
): Promise<string[]> {
  const results = new Array(texts.length).fill("");
  const pending: Array<{ idx: number; text: string; key: string }> = [];

  texts.forEach((raw, idx) => {
    const text = (raw ?? "").toString();
    if (!text.trim()) {
      results[idx] = text;
      return;
    }
    const key = cacheKey(text, target, options?.sourceLang);
    if (translationCache.has(key)) {
      results[idx] = translationCache.get(key) as string;
      return;
    }
    pending.push({ idx, text, key });
  });

  if (pending.length === 0) {
    return results;
  }

  await Promise.all(
    pending.map(async ({ idx, text, key }) => {
      const translatedText = await translateOne(text, target, options?.sourceLang);
      remember(key, translatedText);
      results[idx] = translatedText;
    })
  );

  return results;
}
