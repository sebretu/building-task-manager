import { franc } from "franc-min";
import type { Language } from "./translations";

const DEFAULT_LIBRETRANSLATE_URL = "https://libretranslate.com/translate";
const DEFAULT_MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const CACHE_LIMIT = 400;

const translationCache = new Map<string, string>();

const ISO3_TO_ISO2: Record<string, string> = {
  eng: "en",
  pol: "pl",
  deu: "de",
  ger: "de",
  slk: "sk",
  slo: "sk",
};

type TranslationProvider = "libretranslate" | "mymemory";

const translationProvider: TranslationProvider = (() => {
  const explicit = (process.env.TRANSLATE_PROVIDER || "").toLowerCase();
  if (explicit === "libretranslate") return "libretranslate";
  if (explicit === "mymemory") return "mymemory";
  if (process.env.TRANSLATE_API_URL || process.env.TRANSLATE_API_KEY) {
    return "libretranslate";
  }
  return "mymemory";
})();

function cacheKey(text: string, target: Language, source?: string | null) {
  return `${translationProvider}::${target}::${source || "auto"}::${text}`;
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

function detectLanguageCode(text: string): string | null {
  if (!text || text.trim().length < 4) return null;
  try {
    const code = franc(text, { minLength: 4, only: Object.keys(ISO3_TO_ISO2) });
    if (!code || code === "und") return null;
    return ISO3_TO_ISO2[code] || null;
  } catch {
    return null;
  }
}

async function translateWithLibreTranslate(text: string, target: Language, source?: string | null): Promise<string> {
  const apiUrl = process.env.TRANSLATE_API_URL || DEFAULT_LIBRETRANSLATE_URL;
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

function normalizeLangTag(value?: string | null) {
  if (!value) return "auto";
  return value.split("-")[0]?.toLowerCase() || value.toLowerCase();
}

async function translateWithMyMemory(text: string, target: Language, source?: string | null): Promise<string> {
  const apiUrl = process.env.MYMEMORY_API_URL || DEFAULT_MYMEMORY_URL;
  const fallbackSource = normalizeLangTag(process.env.MYMEMORY_FALLBACK_SOURCE || "en");
  const fromRaw = normalizeLangTag(source);
  const detected = detectLanguageCode(text);
  const fromCandidate = fromRaw === "auto" ? null : fromRaw;
  const from = fromCandidate || detected || fallbackSource;
  const to = target.toLowerCase();
  const params = new URLSearchParams({
    q: text,
    langpair: `${from}|${to}`,
  });

  if (process.env.MYMEMORY_EMAIL) {
    params.set("de", process.env.MYMEMORY_EMAIL);
  }

  const res = await fetch(`${apiUrl}?${params.toString()}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MyMemory request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json().catch(() => null);
  const translated = data?.responseData?.translatedText;
  if (typeof translated === "string" && translated.trim()) {
    return translated;
  }

  const fallback = data?.matches?.find((match: any) => typeof match?.translation === "string" && match.match >= 0.75)?.translation;
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }

  throw new Error("Empty translation result");
}

async function translateOne(text: string, target: Language, source?: string | null): Promise<string> {
  if (translationProvider === "libretranslate") {
    return translateWithLibreTranslate(text, target, source);
  }
  return translateWithMyMemory(text, target, source);
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
