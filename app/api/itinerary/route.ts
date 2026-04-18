import { NextResponse } from "next/server";

/**
 * Remove markdown code fences: leading ```json / ``` and trailing ```.
 * Also handles optional prose before/after a fenced block.
 */
function stripMarkdownCodeFences(text: string): string {
  const t = text.trim();
  const open = t.match(/```(?:json)?\s*\n?/i);
  if (open && open.index !== undefined) {
    const afterOpen = t.slice(open.index + open[0].length);
    const closeIdx = afterOpen.lastIndexOf("```");
    if (closeIdx !== -1) {
      return afterOpen.slice(0, closeIdx).trim();
    }
  }
  return t;
}

/** Fallback: slice from first { to last } (helps with stray preamble/postamble). */
function sliceLikelyJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function tryParseItineraryPayload(
  text: string
): { markdown: string; places: unknown[] } | null {
  const trimmed = text.trim();
  const unfenced = stripMarkdownCodeFences(trimmed).trim();

  const candidates: string[] = [];
  const add = (s: string | null | undefined) => {
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  add(trimmed);
  add(unfenced);
  add(sliceLikelyJsonObject(trimmed));
  add(sliceLikelyJsonObject(unfenced));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const markdown =
        typeof record.markdown === "string" ? record.markdown : null;
      const places = Array.isArray(record.places) ? record.places : null;
      if (markdown === null || places === null) continue;
      return { markdown, places };
    } catch {
      continue;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const { destination, places } = await request.json();

  const userContent = `You are Wandr, a friendly travel curator. Create a 2-3 day itinerary for ${destination} based on: ${places}.

Return ONLY a JSON object with exactly two fields:
1. markdown: the full itinerary as beautiful markdown with emoji day 
   headings and activity descriptions, written like a friend planned it
2. places: array of days, each with day number, theme string, and stops 
   array where each stop has name and full address suitable for geocoding

No other text. No code fences. Raw JSON only.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system:
        "Your entire reply must be one valid JSON object with exactly the two fields described in the user message: markdown (string) and places (array). No text before or after. No markdown code fences. Raw JSON only.",
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  const data = await response.json();

  console.log("Claude API response:", JSON.stringify(data, null, 2));

  if (!data.content || !data.content[0]) {
    return NextResponse.json(
      { error: data.error?.message || "Unknown error", full: data },
      { status: 500 }
    );
  }

  const rawText =
    typeof data.content[0].text === "string" ? data.content[0].text : "";

  console.log(
    "Claude assistant text (first 200 chars):",
    rawText.slice(0, 200)
  );

  const parsed = tryParseItineraryPayload(rawText);

  if (!parsed) {
    console.log(
      "Failed to parse itinerary JSON; raw text length:",
      rawText.length,
      "raw text:",
      rawText
    );
    return NextResponse.json({
      itinerary: rawText,
      places: [],
    });
  }

  return NextResponse.json({
    itinerary: parsed.markdown,
    places: parsed.places,
  });
}
