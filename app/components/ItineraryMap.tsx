"use client";

import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ItineraryMapStop = { name: string; address: string };

export type ItineraryMapDay = {
  day: number;
  theme?: string;
  stops: ItineraryMapStop[];
};

const LIBRARIES: ["marker"] = ["marker"];

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

export default function ItineraryMap(props: Props) {
  const { places, googleMapsApiKey } = props;

  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: props.googleMapsApiKey,
    libraries: LIBRARIES,
    version: "beta",
    id: "wandr-google-maps-script",
  });

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

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  const onMapUnmount = useCallback(() => {
    mapRef.current = null;
    setMapReady(false);
  }, []);

  useEffect(() => {
    if (!isLoaded || !mapReady || !mapRef.current || !googleMapsApiKey) {
      return;
    }
    if (flatStops.length === 0) {
      return;
    }

    const map = mapRef.current;
    let cancelled = false;
    const markersRef: google.maps.marker.AdvancedMarkerElement[] = [];
    const infoWindow = new google.maps.InfoWindow();

    void (async () => {
      type Geocoded = {
        lat: number;
        lng: number;
        day: number;
        name: string;
        theme: string;
      };

      const geocoded: Geocoded[] = [];

      for (const stop of flatStops) {
        if (cancelled) return;
        const coords = await geocodeWithFetch(stop.address, googleMapsApiKey);
        if (cancelled || !coords) continue;

        const theme =
          places
            .find((d) => Number(d.day) === stop.day)
            ?.theme?.trim() ?? "";

        geocoded.push({
          lat: coords.lat,
          lng: coords.lng,
          day: stop.day,
          name: stop.name,
          theme,
        });
      }

      if (cancelled || geocoded.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      for (const item of geocoded) {
        bounds.extend({ lat: item.lat, lng: item.lng });
      }
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });

      for (const item of geocoded) {
        if (cancelled) return;

        const pin = new window.google.maps.marker.PinElement({
          background: DAY_COLORS[item.day] ?? "#2AB5A0",
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
        });

        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: item.lat, lng: item.lng },
          title: item.name,
          content: pin.element,
        });

        marker.addEventListener("gmp-click", () => {
          const root = document.createElement("div");
          root.style.padding = "8px";
          root.style.minWidth = "140px";
          root.style.color = "#102A43";
          root.style.fontFamily = "Georgia, 'Times New Roman', serif";
          root.style.fontSize = "14px";

          const dayLine = document.createElement("div");
          dayLine.style.fontWeight = "700";
          dayLine.style.marginBottom = "6px";
          dayLine.textContent = `Day ${item.day}`;
          root.appendChild(dayLine);

          if (item.theme) {
            const themeLine = document.createElement("div");
            themeLine.style.marginBottom = "6px";
            themeLine.style.color = "#0B7A8C";
            themeLine.textContent = item.theme;
            root.appendChild(themeLine);
          }

          const nameLine = document.createElement("div");
          nameLine.textContent = item.name;
          root.appendChild(nameLine);

          infoWindow.setContent(root);
          infoWindow.open({ map, anchor: marker });
        });

        markersRef.push(marker);
      }
    })();

    return () => {
      cancelled = true;
      infoWindow.close();
      for (const m of markersRef) {
        m.map = null;
      }
      markersRef.length = 0;
    };
  }, [isLoaded, mapReady, flatStops, googleMapsApiKey, places]);

  if (!googleMapsApiKey || flatStops.length === 0) {
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

  return (
    <div style={{ width: "100%" }}>
      {!isLoaded && (
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
          height: 450,
          borderRadius: 12,
          overflow: "hidden",
          background: isLoaded ? "#E8EEF2" : "rgba(255,255,255,0.06)",
        }}
      >
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={{
              width: "100%",
              height: "100%",
              borderRadius: 12,
            }}
            center={{ lat: 20, lng: 0 }}
            zoom={3}
            onLoad={onMapLoad}
            onUnmount={onMapUnmount}
            options={{
              mapId: "DEMO_MAP_ID",
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
