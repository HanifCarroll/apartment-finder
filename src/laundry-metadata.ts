import type { LaundryMetadataSignal } from "./types";

export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#xF1;/gi, "ñ")
    .replace(/&#xE1;/gi, "á")
    .replace(/&#xE9;/gi, "é")
    .replace(/&#xED;/gi, "í")
    .replace(/&#xF3;/gi, "ó")
    .replace(/&#xFA;/gi, "ú")
    .replace(/\\u0026/g, "&");
}

export function cleanMetadataText(text: string): string {
  return decodeBasicHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTagText(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match ? cleanMetadataText(match[1] || "") : "";
}

export function nearbyLaundrySnippets(text: string): string[] {
  const cleaned = cleanMetadataText(text);
  const snippets = new Set<string>();
  const pattern = /.{0,90}(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine).{0,130}/gi;
  for (const match of cleaned.matchAll(pattern)) {
    snippets.add(cleanMetadataText(match[0] || ""));
  }
  return Array.from(snippets).slice(0, 8);
}

export function classifyLaundryMetadataSignal(
  source: LaundryMetadataSignal["source"],
  text: string,
): LaundryMetadataSignal | null {
  const cleaned = cleanMetadataText(text);
  const lower = cleaned.toLowerCase();
  if (!/(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine)/i.test(cleaned)) return null;

  if (/(in building|lavadero com[uú]n|laundry|lavander[ií]a|amenit|sum|gimnasio|pileta|solarium)/i.test(cleaned)) {
    return {
      source,
      classification: "SHARED_BUILDING",
      strength: /(in building|lavadero com[uú]n|laundry|lavander[ií]a)/i.test(cleaned) ? "strong" : "medium",
      text: cleaned,
    };
  }

  if (
    /(in unit|lavadero.*lavarropas|lavarropas.*lavadero|cocina.*lavarropas|lavarropas.*cocina|departamento.*lavarropas|unidad.*lavarropas)/i
      .test(lower)
  ) {
    return {
      source,
      classification: "IN_UNIT",
      strength: "medium",
      text: cleaned,
    };
  }

  if (/(lavarropas|washer|washing machine)/i.test(cleaned)) {
    return {
      source,
      classification: "WASHER_PRESENT",
      strength: "weak",
      text: cleaned,
    };
  }

  return {
    source,
    classification: "AMBIGUOUS",
    strength: "weak",
    text: cleaned,
  };
}

export function collectLaundryMetadataSignals(input: {
  title?: string;
  description?: string;
  amenities?: string[];
  pageText?: string;
}): LaundryMetadataSignal[] {
  const signals: LaundryMetadataSignal[] = [];
  const seen = new Set<string>();
  const add = (signal: LaundryMetadataSignal | null) => {
    if (!signal) return;
    const key = `${signal.source}:${signal.classification}:${signal.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    signals.push(signal);
  };

  if (input.title) add(classifyLaundryMetadataSignal("title", input.title));
  if (input.description) {
    for (const snippet of nearbyLaundrySnippets(input.description)) {
      add(classifyLaundryMetadataSignal("description", snippet));
    }
  }
  for (const amenity of input.amenities || []) {
    add(classifyLaundryMetadataSignal("amenities", amenity));
  }
  if (input.pageText && signals.length === 0) {
    for (const snippet of nearbyLaundrySnippets(input.pageText)) {
      add(classifyLaundryMetadataSignal("page_text", snippet));
    }
  }

  return signals;
}
