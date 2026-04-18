"use client";

import {
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";

export type ItineraryMapStop = { name: string; address: string };

export type ItineraryMapDay = {
  day: number;
  theme?: string;
  stops: ItineraryMapStop[];
};

type GeocodedStop = {
  id: string;
  day: number;
  name: string;
  lat: number;
  lng: number;
};

const DAY_COLORS: Record<number, string> = {
  1: "#E8634A",
  2: "#0B7A8C",
  3: "#2AB5A0",
};

function colorForDay(day: number): string {
  return DAY_COLORS[day] ?? "#2AB5A0";
}

async function geocodeViaRest(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    results?: { geometry: { location: { lat: number; lng: number } } }[];
  };
  if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

function geocodeViaJsApi(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else resolve(null);
    });
  });
}

async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const fromRest = await geocodeViaRest(address, apiKey);
    if (fromRest) return fromRest;
  } catch {
    // CORS, network, or non-OK HTTP — try JS Geocoder when available
  }
  if (typeof google !== "undefined" && google.maps) {
    return geocodeViaJsApi(address);
  }
  return null;
}

type Props = {
  places: ItineraryMapDay[];
  googleMapsApiKey: string;
};

export default function ItineraryMap({ places, googleMapsApiKey }: Props) {
  /** null = still loading script or geocoding; array = done (may be empty) */
  const [geocoded, setGeocoded] = useState<GeocodedStop[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "wandr-google-maps-script",
    googleMapsApiKey: googleMapsApiKey || "__MISSING__",
  });

  const flatStops = useMemo(() => {
    const out: { id: string; day: number; name: string; address: string }[] =
      [];
    for (const dayBlock of places) {
      const dayNum = Number(dayBlock.day);
      if (!Number.isFinite(dayNum) || !Array.isArray(dayBlock.stops)) continue;
      dayBlock.stops.forEach((stop, idx) => {
        const address =
          typeof stop.address === "string" ? stop.address.trim() : "";
        const name =
          typeof stop.name === "string" ? stop.name.trim() : "Stop";
        if (!address) return;
        out.push({
          id: `${dayNum}-${idx}-${name}`,
          day: dayNum,
          name: name || "Stop",
          address,
        });
      });
    }
    return out;
  }, [places]);

  useEffect(() => {
    if (!isLoaded || !googleMapsApiKey || flatStops.length === 0) return;

    let cancelled = false;

    void (async () => {
      if (!cancelled) setGeocoded(null);
      const results: GeocodedStop[] = [];
      for (const stop of flatStops) {
        if (cancelled) return;
        const coords = await geocodeAddress(stop.address, googleMapsApiKey);
        if (cancelled) return;
        if (coords) {
          results.push({
            id: stop.id,
            day: stop.day,
            name: stop.name,
            lat: coords.lat,
            lng: coords.lng,
          });
        }
      }
      if (!cancelled) setGeocoded(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, flatStops, googleMapsApiKey]);

  const center = useMemo(() => {
    if (geocoded === null || geocoded.length === 0) return { lat: 0, lng: 0 };
    let lat = 0;
    let lng = 0;
    for (const s of geocoded) {
      lat += s.lat;
      lng += s.lng;
    }
    return { lat: lat / geocoded.length, lng: lng / geocoded.length };
  }, [geocoded]);

  if (flatStops.length === 0 || !googleMapsApiKey) {
    return null;
  }

  if (loadError) {
    return (
      <div
        style={{
          padding: 16,
          color: "#1A2E38",
          background: "#F6FBFF",
          borderRadius: 12,
        }}
      >
        Could not load Google Maps.
      </div>
    );
  }

  const showLoading = !isLoaded || geocoded === null;
  const showMap = isLoaded && geocoded !== null && geocoded.length > 0;

  return (
    <div style={{ width: "100%" }}>
      {showLoading && (
        <p
          style={{
            textAlign: "center",
            color: "#2AB5A0",
            margin: "0 0 12px",
            fontSize: "16px",
          }}
        >
          Loading map...
        </p>
      )}
      <div
        style={{
          width: "100%",
          height: 400,
          borderRadius: 12,
          overflow: "hidden",
          background: showMap ? "#E8EEF2" : "rgba(255,255,255,0.06)",
        }}
      >
        {showMap && (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={13}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: true,
            }}
          >
            {geocoded.map((stop) => (
              <Marker
                key={stop.id}
                position={{ lat: stop.lat, lng: stop.lng }}
                onClick={() => setActiveId(stop.id)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: colorForDay(stop.day),
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                }}
              >
                {activeId === stop.id && (
                  <InfoWindow onCloseClick={() => setActiveId(null)}>
                    <div
                      style={{
                        padding: 4,
                        minWidth: 120,
                        color: "#102A43",
                        fontFamily:
                          "Georgia, 'Times New Roman', Times, serif",
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        Day {stop.day}
                      </div>
                      <div>{stop.name}</div>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            ))}
          </GoogleMap>
        )}
      </div>
      {isLoaded &&
        geocoded !== null &&
        geocoded.length === 0 &&
        flatStops.length > 0 && (
          <p
            style={{
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              marginTop: 12,
              fontSize: 15,
            }}
          >
            Could not plot stops on the map.
          </p>
        )}
    </div>
  );
}
