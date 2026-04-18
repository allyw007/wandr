"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ItineraryMapStop = { name: string; address: string };

export type ItineraryMapDay = {
  day: number;
  theme?: string;
  stops: ItineraryMapStop[];
};

const DAY_COLORS: Record<number, string> = {
  1: "#E8634A",
  2: "#0B7A8C",
  3: "#2AB5A0",
};

type FlatStop = {
  id: string;
  day: number;
  name: string;
  address: string;
};

async function geocodeWithFetch(
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

type Props = {
  places: ItineraryMapDay[];
  googleMapsApiKey: string;
};

function mapsApiReady(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.google?.maps?.Map &&
      window.google?.maps?.marker?.PinElement &&
      window.google?.maps?.marker?.AdvancedMarkerElement
  );
}

export default function ItineraryMap({
  places,
  googleMapsApiKey,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const scriptWeAddedRef = useRef<HTMLScriptElement | null>(null);
  const [mapUiReady, setMapUiReady] = useState(false);

  const flatStops = useMemo(() => {
    const out: FlatStop[] = [];
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
    return () => {
      const script = scriptWeAddedRef.current;
      if (script?.parentNode) {
        script.remove();
      }
      scriptWeAddedRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!googleMapsApiKey || flatStops.length === 0) return;

    const container = mapDivRef.current;
    if (!container) return;

    let cancelled = false;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];

    const scriptSrc = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey
    )}&v=beta&libraries=marker`;

    const initAfterLoad = () => {
      if (cancelled) return;
      const el = mapDivRef.current;
      if (!el) return;

      setMapUiReady(false);
      el.replaceChildren();

      const map = new window.google.maps.Map(el, {
        zoom: 12,
        center: { lat: 0, lng: 0 },
        mapId: "DEMO_MAP_ID",
      });

      setMapUiReady(true);

      void (async () => {
        type Geocoded = {
          lat: number;
          lng: number;
          day: number;
          name: string;
        };

        const geocoded: Geocoded[] = [];

        for (const stop of flatStops) {
          if (cancelled) return;
          const result = await geocodeWithFetch(
            stop.address,
            googleMapsApiKey
          );
          if (cancelled || !result) continue;
          geocoded.push({
            lat: result.lat,
            lng: result.lng,
            day: stop.day,
            name: stop.name,
          });
        }

        if (cancelled || geocoded.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();

        for (const item of geocoded) {
          if (cancelled) return;

          const color = DAY_COLORS[item.day] ?? "#2AB5A0";
          const pin = new window.google.maps.marker.PinElement({
            background: color,
            borderColor: "#ffffff",
            glyphColor: "#ffffff",
          });

          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: item.lat, lng: item.lng },
            title: item.name,
            content: pin.element,
          });

          markers.push(marker);
          bounds.extend({ lat: item.lat, lng: item.lng });
        }

        map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
      })();
    };

    const scheduleInit = () => {
      queueMicrotask(() => {
        if (!cancelled) initAfterLoad();
      });
    };

    if (mapsApiReady()) {
      scheduleInit();
    } else {
      const scripts = document.querySelectorAll<HTMLScriptElement>(
        "script[src]"
      );
      let existing: HTMLScriptElement | null = null;
      for (const s of scripts) {
        if (s.src === scriptSrc) {
          existing = s;
          break;
        }
      }

      if (existing) {
        existing.addEventListener(
          "load",
          () => {
            if (!cancelled) scheduleInit();
          },
          { once: true }
        );
        if (mapsApiReady()) {
          scheduleInit();
        }
      } else {
        const script = document.createElement("script");
        script.src = scriptSrc;
        script.async = true;
        script.onload = () => {
          if (!cancelled) scheduleInit();
        };
        document.head.appendChild(script);
        scriptWeAddedRef.current = script;
      }
    }

    return () => {
      cancelled = true;
      for (const m of markers) {
        m.map = null;
      }
      markers.length = 0;
      container.replaceChildren();
    };
  }, [flatStops, googleMapsApiKey]);

  if (!googleMapsApiKey || flatStops.length === 0) {
    return null;
  }

  return (
    <div style={{ width: "100%" }}>
      {!mapUiReady && (
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
        ref={mapDivRef}
        style={{
          width: "100%",
          height: 450,
          borderRadius: 12,
          overflow: "hidden",
          background: mapUiReady ? "#E8EEF2" : "rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}
