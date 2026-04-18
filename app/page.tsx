"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

import type { ItineraryMapDay } from "@/app/components/ItineraryMap";

const ItineraryMap = dynamic(() => import("@/app/components/ItineraryMap"), {
  ssr: false,
});

function itineraryHasMappableStops(places: ItineraryMapDay[] | null): boolean {
  if (!places?.length) return false;
  return places.some(
    (d) =>
      d != null &&
      typeof d.day === "number" &&
      Array.isArray(d.stops) &&
      d.stops.some(
        (s) =>
          s != null &&
          typeof s.address === "string" &&
          s.address.trim().length > 0
      )
  );
}

const itineraryMarkdownComponents: Components = {
  h2: ({ children }) => (
    <h2
      style={{
        color: "#0D3D56",
        fontFamily: "Georgia, 'Times New Roman', Times, serif",
        fontSize: "24px",
        marginTop: "24px",
        marginBottom: "10px",
        fontWeight: 700,
        lineHeight: 1.3,
      }}
    >
      {children}
    </h2>
  ),
  strong: ({ children }) => (
    <strong style={{ color: "#0B7A8C" }}>{children}</strong>
  ),
  p: ({ children }) => (
    <p
      style={{
        fontSize: "15px",
        color: "#1A2E38",
        lineHeight: 1.7,
        margin: "0 0 14px",
      }}
    >
      {children}
    </p>
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid rgba(13, 61, 86, 0.12)",
        margin: "22px 0",
      }}
    />
  ),
  ul: ({ children }) => (
    <ul
      style={{
        fontSize: "15px",
        color: "#1A2E38",
        lineHeight: 1.7,
        margin: "0 0 14px",
        paddingLeft: "22px",
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        fontSize: "15px",
        color: "#1A2E38",
        lineHeight: 1.7,
        margin: "0 0 14px",
        paddingLeft: "22px",
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: "6px" }}>{children}</li>
  ),
};

const VIBES = [
  {
    id: "wine-food",
    emoji: "🍷",
    title: "Wine & Food",
    blurb: "Local flavours, markets and memorable meals",
  },
  {
    id: "culture-art",
    emoji: "🏛️",
    title: "Culture & Art",
    blurb: "Museums, architecture and creative spaces",
  },
  {
    id: "nature-outdoors",
    emoji: "🌿",
    title: "Nature & Outdoors",
    blurb: "Hikes, parks and natural wonders",
  },
  {
    id: "luxury-shopping",
    emoji: "🛍️",
    title: "Luxury & Shopping",
    blurb: "Design, boutiques and indulgent experiences",
  },
  {
    id: "live-local",
    emoji: "🏘️",
    title: "Live Like a Local",
    blurb: "Neighbourhoods, cafés and hidden gems",
  },
  {
    id: "nightlife-music",
    emoji: "🎭",
    title: "Nightlife & Music",
    blurb: "Bars, venues and after-dark culture",
  },
] as const;

const TRIP_DURATIONS = [
  "Weekend",
  "3–4 Days",
  "1 Week",
  "2+ Weeks",
] as const;

type TripDuration = (typeof TRIP_DURATIONS)[number];

export default function HomePage() {
  const [flow, setFlow] = useState<"saves" | "inspire" | null>(null);
  const [destination, setDestination] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [tripDuration, setTripDuration] = useState<TripDuration>("3–4 Days");
  const [itinerary, setItinerary] = useState("");
  const [itineraryPlaces, setItineraryPlaces] = useState<
    ItineraryMapDay[] | null
  >(null);
  const [loading, setLoading] = useState(false);

  const googleMapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const cardBase: React.CSSProperties = {
    flex: "1 1 300px",
    maxWidth: "420px",
    minWidth: "min(100%, 280px)",
    borderRadius: "16px",
    border: "1px solid rgba(42, 181, 160, 0.45)",
    background:
      "linear-gradient(165deg, rgba(255,255,255,0.08) 0%, rgba(13,61,86,0.5) 100%)",
    boxShadow: "0 24px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
    padding: "32px 28px 28px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
  };

  const mutedBlue = "#9BC9D9";
  const coral = "#E8634A";
  const mint = "#2AB5A0";

  const resetToStart = () => {
    setFlow(null);
    setDestination("");
    setSelectedVibes([]);
    setTripDuration("3–4 Days");
    setItinerary("");
    setItineraryPlaces(null);
    setLoading(false);
  };

  const inspireCanSubmit =
    Boolean(destination.trim()) && selectedVibes.length > 0;

  const handleCurateTrip = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!destination.trim() || selectedVibes.length === 0) {
      setItineraryPlaces(null);
      setItinerary(
        !destination.trim()
          ? "Please enter where you’re headed."
          : "Please select at least one vibe to curate your trip."
      );
      return;
    }

    const themeJoined = VIBES.filter((v) => selectedVibes.includes(v.id))
      .map((v) => v.title)
      .join(" + ");
    const places = `Duration: ${tripDuration}. Theme: ${themeJoined}. Curate based on these themes only, no specific saved places.`;

    setLoading(true);
    setItinerary("");
    setItineraryPlaces(null);

    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: destination.trim(),
          duration: tripDuration,
          places,
        }),
      });

      if (!response.ok) throw new Error("Failed to build itinerary");

      const data = await response.json();
      setItinerary(data.itinerary ?? "No itinerary returned.");
      setItineraryPlaces(
        Array.isArray(data.places) ? (data.places as ItineraryMapDay[]) : null
      );
    } catch {
      setItineraryPlaces(null);
      setItinerary(
        "Something went wrong while building your itinerary. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0D3D56",
        fontFamily: "Georgia, 'Times New Roman', Times, serif",
        padding: "48px 24px 64px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            textAlign: "center",
            marginBottom: "40px",
          }}
        >
          <h1
            style={{
              margin: 0,
              color: "#FFFFFF",
              fontSize: "48px",
              letterSpacing: "8px",
              fontWeight: 400,
              lineHeight: 1.15,
            }}
          >
            WANDR
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              color: "#2AB5A0",
              fontSize: "22px",
              fontStyle: "italic",
              fontWeight: 400,
              lineHeight: 1.4,
            }}
          >
            From saved to unforgettable.
          </p>
          <p
            style={{
              margin: "28px 0 0",
              color: "rgba(255, 255, 255, 0.72)",
              fontSize: "18px",
              letterSpacing: "0.02em",
            }}
          >
            How would you like to start?
          </p>
        </header>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "24px",
            justifyContent: "center",
            alignItems: "stretch",
          }}
        >
          <article
            style={cardBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(42, 181, 160, 0.75)";
              e.currentTarget.style.boxShadow =
                "0 28px 56px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(42, 181, 160, 0.45)";
              e.currentTarget.style.boxShadow =
                "0 24px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <span
              style={{
                fontSize: "52px",
                lineHeight: 1,
                marginBottom: "20px",
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))",
              }}
              aria-hidden
            >
              📍
            </span>
            <h2
              style={{
                margin: "0 0 14px",
                color: "#FFFFFF",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              I have saved places
            </h2>
            <p
              style={{
                margin: "0 0 28px",
                color: mutedBlue,
                fontSize: "16px",
                lineHeight: 1.65,
                flexGrow: 1,
              }}
            >
              Import places you&apos;ve saved on Instagram, Pinterest, or anywhere
              else — we&apos;ll turn them into your perfect trip.
            </p>
            <button
              type="button"
              onClick={() => setFlow("saves")}
              style={{
                width: "100%",
                padding: "14px 20px",
                border: "none",
                borderRadius: "12px",
                backgroundColor: coral,
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 8px 20px rgba(232, 99, 74, 0.35)",
              }}
            >
              Start with my saves →
            </button>
          </article>

          <article
            style={cardBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(42, 181, 160, 0.75)";
              e.currentTarget.style.boxShadow =
                "0 28px 56px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(42, 181, 160, 0.45)";
              e.currentTarget.style.boxShadow =
                "0 24px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <span
              style={{
                fontSize: "52px",
                lineHeight: 1,
                marginBottom: "20px",
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))",
              }}
              aria-hidden
            >
              ✨
            </span>
            <h2
              style={{
                margin: "0 0 14px",
                color: "#FFFFFF",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              Inspire me
            </h2>
            <p
              style={{
                margin: "0 0 28px",
                color: mutedBlue,
                fontSize: "16px",
                lineHeight: 1.65,
                flexGrow: 1,
              }}
            >
              Tell us where you&apos;re going and what you&apos;re into — we&apos;ll
              curate the whole experience for you.
            </p>
            <button
              type="button"
              onClick={() => setFlow("inspire")}
              style={{
                width: "100%",
                padding: "14px 20px",
                border: "none",
                borderRadius: "12px",
                backgroundColor: coral,
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 8px 20px rgba(232, 99, 74, 0.35)",
              }}
            >
              Find my vibe →
            </button>
          </article>
        </div>

        {flow === "saves" && (
          <p
            style={{
              marginTop: "40px",
              textAlign: "center",
              color: "#2AB5A0",
              fontSize: "18px",
              fontStyle: "italic",
              letterSpacing: "0.02em",
            }}
          >
            Saves flow coming soon
          </p>
        )}

        {flow === "inspire" && (
          <section
            style={{
              marginTop: "48px",
              maxWidth: "640px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <form onSubmit={handleCurateTrip} style={{ display: "grid", gap: "28px" }}>
              <div>
                <label
                  htmlFor="inspire-destination"
                  style={{
                    display: "block",
                    color: "rgba(255, 255, 255, 0.9)",
                    fontSize: "17px",
                    marginBottom: "10px",
                    letterSpacing: "0.02em",
                  }}
                >
                  Where are you headed?
                </label>
                <input
                  id="inspire-destination"
                  type="text"
                  placeholder="e.g. Tokyo, Japan"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: "1px solid rgba(42, 181, 160, 0.4)",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    color: "#FFFFFF",
                    fontSize: "16px",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 10px",
                    color: "rgba(255, 255, 255, 0.9)",
                    fontSize: "17px",
                    letterSpacing: "0.02em",
                  }}
                >
                  How long is your trip?
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  {TRIP_DURATIONS.map((d) => {
                    const selected = tripDuration === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setTripDuration(d)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "999px",
                          border: selected
                            ? "1px solid #2AB5A0"
                            : "1px solid rgba(255, 255, 255, 0.35)",
                          backgroundColor: selected ? mint : "transparent",
                          color: selected ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)",
                          fontSize: "14px",
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition:
                            "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 14px",
                    color: "rgba(255, 255, 255, 0.72)",
                    fontSize: "15px",
                    textAlign: "center",
                  }}
                >
                  Pick your vibe (select any that apply)
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "12px",
                  }}
                >
                  {VIBES.map((v) => {
                    const selected = selectedVibes.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVibes((prev) =>
                            prev.includes(v.id)
                              ? prev.filter((id) => id !== v.id)
                              : [...prev, v.id]
                          );
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          padding: "16px 14px",
                          borderRadius: "14px",
                          border: selected
                            ? "2px solid rgba(255,255,255,0.35)"
                            : "1px solid rgba(42, 181, 160, 0.35)",
                          backgroundColor: selected
                            ? coral
                            : "rgba(13, 61, 86, 0.65)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                          transition: "background-color 0.15s ease, border-color 0.15s ease",
                          boxShadow: selected
                            ? "0 10px 24px rgba(232, 99, 74, 0.35)"
                            : "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "28px",
                            lineHeight: 1,
                            marginBottom: "8px",
                          }}
                          aria-hidden
                        >
                          {v.emoji}
                        </span>
                        <span
                          style={{
                            color: "#FFFFFF",
                            fontWeight: 700,
                            fontSize: "15px",
                            marginBottom: "6px",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {v.title}
                        </span>
                        <span
                          style={{
                            color: selected
                              ? "rgba(255,255,255,0.92)"
                              : mutedBlue,
                            fontSize: "13px",
                            lineHeight: 1.5,
                          }}
                        >
                          {v.blurb}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !inspireCanSubmit}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  border: "none",
                  borderRadius: "12px",
                  backgroundColor: coral,
                  color: "#FFFFFF",
                  fontSize: "15px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor:
                    loading || !inspireCanSubmit ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 8px 20px rgba(232, 99, 74, 0.35)",
                  opacity: loading || !inspireCanSubmit ? 0.55 : 1,
                }}
              >
                {loading ? "Curating your trip..." : "Curate my trip →"}
              </button>
            </form>

            {itinerary && (
              <div
                style={{
                  marginTop: "28px",
                  backgroundColor: "#F6FBFF",
                  borderRadius: "14px",
                  padding: "24px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <ReactMarkdown components={itineraryMarkdownComponents}>
                    {itinerary}
                  </ReactMarkdown>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginTop: "24px",
                    justifyContent: "flex-start",
                  }}
                >
                  <button
                    type="button"
                    onClick={resetToStart}
                    style={{
                      padding: "12px 20px",
                      border: "none",
                      borderRadius: "10px",
                      backgroundColor: coral,
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 6px 16px rgba(232, 99, 74, 0.3)",
                    }}
                  >
                    Start over
                  </button>
                  <button
                    type="button"
                    onClick={() => alert("Export coming soon!")}
                    style={{
                      padding: "12px 20px",
                      border: "none",
                      borderRadius: "10px",
                      backgroundColor: mint,
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 6px 16px rgba(42, 181, 160, 0.3)",
                    }}
                  >
                    Export as PDF
                  </button>
                </div>
              </div>
            )}

            {itinerary &&
              itineraryHasMappableStops(itineraryPlaces) &&
              googleMapsApiKey && (
                <div style={{ marginTop: "28px" }}>
                  <ItineraryMap
                    places={itineraryPlaces!}
                    googleMapsApiKey={googleMapsApiKey}
                  />
                </div>
              )}
          </section>
        )}
      </div>
    </main>
  );
}
