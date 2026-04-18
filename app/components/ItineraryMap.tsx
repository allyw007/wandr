"use client";

import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "wandr-google-maps-script",
    googleMapsApiKey: googleMapsApiKey || "__MISSING__",
    libraries: ["places", "marker"],
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

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  const onMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  useEffect(() => {
    if (!map || geocoded === null || geocoded.length === 0) return;

    const infoWindow = new google.maps.InfoWindow();
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];

    for (const stop of geocoded) {
      const pin = new google.maps.marker.PinElement({
        background:
          stop.day === 1
            ? "#E8634A"
            : stop.day === 2
              ? "#0B7A8C"
              : "#2AB5A0",
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
      });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: stop.lat, lng: stop.lng },
        title: stop.name,
        content: pin.element,
      });

      const dayTheme =
        places.find((d) => Number(d.day) === stop.day)?.theme?.trim() ?? "";

      marker.addListener("click", () => {
        const root = document.createElement("div");
        root.style.padding = "8px";
        root.style.minWidth = "140px";
        root.style.color = "#102A43";
        root.style.fontFamily = "Georgia, 'Times New Roman', serif";
        root.style.fontSize = "14px";

        const dayEl = document.createElement("div");
        dayEl.style.fontWeight = "700";
        dayEl.style.marginBottom = "6px";
        dayEl.textContent = `Day ${stop.day}`;
        root.appendChild(dayEl);

        if (dayTheme) {
          const themeEl = document.createElement("div");
          themeEl.style.marginBottom = "6px";
          themeEl.style.color = "#0B7A8C";
          themeEl.textContent = dayTheme;
          root.appendChild(themeEl);
        }

        const nameEl = document.createElement("div");
        nameEl.textContent = stop.name;
        root.appendChild(nameEl);

        infoWindow.setContent(root);
        infoWindow.open({ map, anchor: marker });
      });

      markers.push(marker);
    }

    return () => {
      infoWindow.close();
      for (const m of markers) {
        m.map = null;
      }
    };
  }, [map, geocoded, places]);

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
