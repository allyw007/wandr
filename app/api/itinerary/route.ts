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

const TRIP_DURATIONS = [
  "Weekend",
  "3–4 Days",
  "1 Week",
  "2+ Weeks",
] as const;

type TripDuration = (typeof TRIP_DURATIONS)[number];

function normalizeDuration(raw: unknown): TripDuration {
  if (typeof raw !== "string") return "3–4 Days";
  if ((TRIP_DURATIONS as readonly string[]).includes(raw)) {
    return raw as TripDuration;
  }
  if (raw === "3-4 Days") return "3–4 Days";
  return "3–4 Days";
}

function durationStructureGuidance(duration: TripDuration): string {
  switch (duration) {
    case "Weekend":
      return `Structure the itinerary as exactly 2 days (Day 1 and Day 2). The places array must have 2 entries with day numbers 1 and 2.`;
    case "3–4 Days":
      return `Structure the itinerary as exactly 3 days. The places array must have 3 entries with day numbers 1, 2, and 3.`;
    case "1 Week":
      return `Structure the itinerary as exactly 6 days. The places array must have 6 entries with day numbers 1 through 6.`;
    case "2+ Weeks":
      return `This is a two-week trip: in the markdown, highlight key experiences across 14 days, grouped by region or theme with clear headings (not necessarily hour-by-hour for every moment). The places array should include 14 entries (day: 1 through day: 14), each with a theme aligned to that regional or thematic grouping, and stops with full geocodable addresses.`;
    default:
      return `Structure the itinerary as exactly 3 days. The places array must have 3 entries with day numbers 1, 2, and 3.`;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { destination, places } = body;
  const duration = normalizeDuration(body.duration);

  const userContent = `You are Wandr, a friendly travel curator. Create a ${duration} itinerary for ${destination} based on: ${places}.

${durationStructureGuidance(duration)}

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
