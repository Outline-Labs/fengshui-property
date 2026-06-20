"use client";

import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Coords,
  FengshuiFactor,
  FormSchoolAnalysis,
  OneMapSearchResult,
} from "@/lib/types";

import { analyzeProperty, getAddress, searchAddresses, submitLead } from "./actions";

const SG_CENTER: [number, number] = [103.8198, 1.3521];
const SG_BOUNDS: [[number, number], [number, number]] = [
  [103.59, 1.2],
  [104.06, 1.48],
];

// OneMap's "Default" colored basemap — Singapore Land Authority's official
// detailed SG tiles (building footprints, local labels). Covers Singapore only,
// which is fine: the map is already locked to SG_BOUNDS. Attribution per OneMap
// terms (OneMap + SLA). The basemap tiles are public (no token needed).
const BASEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="OneMap" style="height:16px;width:16px;vertical-align:middle"/> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> · © <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>';

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: BASEMAP_ATTRIBUTION,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "basemap-onemap",
      type: "raster",
      source: "basemap",
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

type Status = "idle" | "loading" | "brief" | "full" | "error";

export function MapClient({ initialQuery = "" }: { initialQuery?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // True only while the user is actively typing — suppresses the dropdown
  // re-opening when we set the query programmatically after a selection.
  const typingRef = useRef(false);
  // Monotonic id per selection — lets a late async result (the address) bail out
  // if the user has already clicked a different spot, so a stale address can't
  // attach to the wrong reading.
  const selectionIdRef = useRef(0);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [analysis, setAnalysis] = useState<FormSchoolAnalysis | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OneMapSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // localStorage is client-only; read once after hydration to set the badge.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlocked(localStorage.getItem("fengshui:unlocked") === "1");
  }, []);

  const selectLocation = useCallback(async (next: Coords, fly = false) => {
    const map = mapRef.current;
    if (markerRef.current) markerRef.current.remove();
    if (map) {
      markerRef.current = createMarker(next).addTo(map);
      if (fly) {
        map.flyTo({ center: [next.lon, next.lat], zoom: 16, duration: 1100 });
      }
    }
    const selectionId = ++selectionIdRef.current;
    setCoords(next);
    setStatus("loading");
    setError(null);
    setAnalysis(null);
    try {
      // The reading is a fast, pure server compute (no OneMap). Retry once on a
      // transient RPC drop — a flaky mobile connection is the usual cause, not a
      // real error — before surfacing a failure.
      let result: FormSchoolAnalysis;
      try {
        result = await analyzeProperty(next);
      } catch {
        await new Promise((r) => setTimeout(r, 400));
        result = await analyzeProperty(next);
      }
      if (selectionId !== selectionIdRef.current) return; // superseded
      setAnalysis(result);
      setStatus(
        localStorage.getItem("fengshui:unlocked") === "1" ? "full" : "brief",
      );
      posthog.capture("property_analyzed", {
        lat: next.lat,
        lon: next.lon,
        score: result.score,
        unlocked: localStorage.getItem("fengshui:unlocked") === "1",
      });
      // Address is a best-effort label — OneMap is slow / rate-limits, so it
      // loads separately and its failure never affects the reading.
      void getAddress(next)
        .then((addr) => {
          if (addr && selectionId === selectionIdRef.current) {
            setAnalysis((a) => (a ? { ...a, address: addr } : a));
          }
        })
        .catch(() => {});
    } catch (err) {
      if (selectionId !== selectionIdRef.current) return; // superseded
      setStatus("error");
      setError("The reading couldn't be drawn just now. Try another spot.");
      posthog.captureException(err);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: BASEMAP_STYLE,
      center: SG_CENTER,
      zoom: 11,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: SG_BOUNDS,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("click", (e) => {
      void selectLocation({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    mapRef.current = map;

    // Keep the canvas matched to the container. Flex/`svh` sizing settles after
    // mount and shifts on orientation / the mobile URL-bar, and MapLibre does not
    // observe its container — so without this the canvas can be left mis-sized
    // (blank / clipped), exactly the mobile bug. ResizeObserver fires once on
    // observe, giving an immediate correct sizing too.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    // Arrived via the homepage search box (/map?q=…) — resolve and fly there.
    if (initialQuery.trim()) {
      void (async () => {
        let r: OneMapSearchResult[] = [];
        try {
          r = await searchAddresses(initialQuery);
        } catch {
          // search failed — leave the map at the default view
        }
        if (r[0]) {
          typingRef.current = false;
          setQuery(r[0].label);
          await selectLocation({ lat: r[0].lat, lon: r[0].lon }, true);
        }
      })();
    }

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [initialQuery, selectLocation]);

  // Debounced address autocomplete. Results are display-gated on query length
  // in render, so no synchronous clear is needed here.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !typingRef.current) return;
    let active = true;
    const t = setTimeout(async () => {
      setSearching(true);
      let r: OneMapSearchResult[] = [];
      try {
        r = await searchAddresses(q);
      } catch {
        // transient — show no results rather than throwing
      }
      if (active) {
        setResults(r);
        setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  const handleSelectResult = (r: OneMapSearchResult) => {
    typingRef.current = false;
    setQuery(r.label);
    setResults([]);
    void selectLocation({ lat: r.lat, lon: r.lon }, true);
  };

  const handleUnlock = async (email: string) => {
    if (!coords) return { ok: false as const, error: "No reading yet." };
    const result = await submitLead(email);
    if (result.ok) {
      localStorage.setItem("fengshui:unlocked", "1");
      setUnlocked(true);
      setStatus("full");
      posthog.identify(email, { email });
      posthog.capture("map_reading_unlocked", {
        lat: coords.lat,
        lon: coords.lon,
        address: analysis?.address?.formatted,
        score: analysis?.score,
      });
    }
    return result;
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <div className="relative flex-1 min-h-[60svh] lg:min-h-0 bg-bg-warm">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
        <SearchBox
          query={query}
          results={query.trim().length >= 2 ? results : []}
          searching={searching}
          onChange={(v) => {
            typingRef.current = true;
            setQuery(v);
          }}
          onSelect={handleSelectResult}
          onClear={() => {
            typingRef.current = false;
            setQuery("");
            setResults([]);
          }}
        />
        <MapHint visible={status === "idle"} />
      </div>
      <aside className="w-full lg:w-[440px] xl:w-[480px] border-t lg:border-t-0 lg:border-l border-line bg-surface overflow-y-auto">
        <ReadingPanel
          status={status}
          coords={coords}
          analysis={analysis}
          error={error}
          unlocked={unlocked}
          onUnlock={handleUnlock}
        />
      </aside>
    </div>
  );
}

function SearchBox({
  query,
  results,
  searching,
  onChange,
  onSelect,
  onClear,
}: {
  query: string;
  results: OneMapSearchResult[];
  searching: boolean;
  onChange: (v: string) => void;
  onSelect: (r: OneMapSearchResult) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[24rem] z-10">
      <div className="bg-surface border border-line shadow-[0_8px_28px_-12px_rgba(28,20,14,0.35)]">
        <div className="flex items-center px-4">
          <svg
            className="w-4 h-4 text-cinnabar shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search any block, street, or condo…"
            className="flex-1 bg-transparent py-3 pl-3 text-sm placeholder:text-muted focus:outline-none"
            aria-label="Search Singapore address"
          />
          {query && (
            <button
              onClick={onClear}
              className="text-muted hover:text-cinnabar text-xl leading-none px-1"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {results.length > 0 && (
          <ul className="border-t border-line-soft max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <li key={`${r.label}-${i}`}>
                <button
                  onClick={() => onSelect(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-bg-warm transition-colors border-b border-line-soft last:border-0"
                >
                  <div className="text-sm text-ink leading-tight">
                    {r.building && r.building !== r.label ? r.building : r.label}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">
                    {r.address}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searching && results.length === 0 && query.trim().length >= 2 && (
          <div className="border-t border-line-soft px-4 py-2.5 text-[10px] tracking-[0.3em] uppercase text-muted">
            Searching…
          </div>
        )}
      </div>
    </div>
  );
}

function createMarker(coords: Coords): maplibregl.Marker {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = "#8b2c1c";
  el.style.border = "2px solid #f5efe6";
  el.style.boxShadow =
    "0 0 0 1px rgba(28,20,14,0.4), 0 4px 12px -2px rgba(139,44,28,0.5)";
  return new maplibregl.Marker({ element: el }).setLngLat([
    coords.lon,
    coords.lat,
  ]);
}

function MapHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none px-4 w-full max-w-md">
      <div className="bg-surface/95 border border-line px-5 py-3 shadow-[0_8px_24px_-12px_rgba(28,20,14,0.25)] text-center">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-1">
          To begin
        </div>
        <div className="font-display text-lg leading-tight">
          Search above, or click anywhere to{" "}
          <em className="text-cinnabar italic">read its qi.</em>
        </div>
      </div>
    </div>
  );
}

function ReadingPanel({
  status,
  coords,
  analysis,
  error,
  unlocked,
  onUnlock,
}: {
  status: Status;
  coords: Coords | null;
  analysis: FormSchoolAnalysis | null;
  error: string | null;
  unlocked: boolean;
  onUnlock: (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  if (status === "idle") {
    return <IdlePanel />;
  }

  if (status === "loading") {
    return <LoadingPanel />;
  }

  if (status === "error") {
    return <ErrorPanel message={error ?? "Something went wrong."} />;
  }

  if (!analysis || !coords) return null;

  return (
    <ReadingBody
      analysis={analysis}
      coords={coords}
      revealed={status === "full"}
      unlocked={unlocked}
      onUnlock={onUnlock}
    />
  );
}

function IdlePanel() {
  return (
    <div className="p-8 lg:p-10 h-full flex flex-col">
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
        Volume 01 · Reading Room
      </div>
      <h2 className="font-display text-3xl sm:text-4xl leading-[0.95] tracking-[-0.02em] mb-8">
        Each property has{" "}
        <em className="text-cinnabar italic font-normal">a reading.</em>
      </h2>
      <div className="space-y-5 text-ink-soft leading-relaxed text-sm">
        <p>
          Click anywhere on the map to read the qi of that spot. We measure
          the surrounding form — water, mountains, roads, neighbours — against
          classical fengshui principles.
        </p>
        <p>
          Every factor cites its source. Every number traces back to a
          measurement, not an intuition.
        </p>
      </div>
      <div className="mt-auto pt-10">
        <div className="border-t border-line pt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <PanelStat label="POIs catalogued" value="3,678" />
          <PanelStat label="Classical schools" value="3" />
          <PanelStat label="Current period" value="九 · 9" />
          <PanelStat label="Free, no signup" value="✓" />
        </div>
      </div>
    </div>
  );
}

function PanelStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted">
        {label}
      </div>
      <div className="font-display text-lg mt-0.5">{value}</div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="p-8 lg:p-10 h-full flex flex-col items-start">
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
        Reading…
      </div>
      <h2 className="font-display text-3xl tracking-[-0.02em] mb-6">
        Drawing the lines.
      </h2>
      <div className="space-y-2 w-full max-w-xs">
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
        <SkeletonLine width="70%" />
      </div>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="h-3 bg-line-soft animate-pulse"
      style={{ width, animationDuration: "1.6s" }}
    />
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="p-8 lg:p-10">
      <div className="text-[10px] tracking-[0.35em] uppercase text-cinnabar mb-3">
        A note
      </div>
      <p className="font-display text-2xl leading-tight">{message}</p>
    </div>
  );
}

function ReadingBody({
  analysis,
  coords,
  revealed,
  unlocked,
  onUnlock,
}: {
  analysis: FormSchoolAnalysis;
  coords: Coords;
  revealed: boolean;
  unlocked: boolean;
  onUnlock: (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const positives = analysis.factors.filter((f) => f.type === "positive");
  const negatives = analysis.factors.filter((f) => f.type === "negative");
  const shownPos = revealed ? positives : positives.slice(0, 1);
  const shownNeg = revealed ? negatives : negatives.slice(0, 1);
  const hiddenCount =
    !revealed && positives.length + negatives.length > shownPos.length + shownNeg.length
      ? positives.length + negatives.length - shownPos.length - shownNeg.length
      : 0;

  return (
    <div className="p-8 lg:p-10 space-y-10">
      <div>
        <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3 flex items-center justify-between">
          <span>A reading</span>
          {unlocked && (
            <span className="text-jade tracking-wide">● Unlocked</span>
          )}
        </div>
        <ScoreDisplay value={analysis.score} />
        <LandmarkCaption analysis={analysis} coords={coords} />
      </div>

      <FactorSection
        title="What gathers here"
        cn="得"
        factors={shownPos}
        emptyText="No notable positive factors within range."
        accent="jade"
      />

      <FactorSection
        title="What scatters here"
        cn="散"
        factors={shownNeg}
        emptyText="No notable concerns within range."
        accent="cinnabar"
      />

      {!revealed && hiddenCount > 0 && (
        <EmailGate hiddenCount={hiddenCount} onUnlock={onUnlock} />
      )}

      {revealed && <NextSteps />}
    </div>
  );
}

function ScoreDisplay({ value }: { value: number }) {
  const shown = useCountUp(value, 900);
  const tone = scoreTone(value);
  return (
    <div className="border-t-2 border-ink pt-4">
      <div className="flex items-baseline gap-4">
        <span
          className={`numeral text-[5.5rem] leading-[0.85] tracking-[-0.04em] ${tone}`}
        >
          {shown.toFixed(1)}
        </span>
        <span className="text-2xl text-muted font-display">/ 10</span>
      </div>
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mt-2">
        {scoreLabel(value)}
      </div>
    </div>
  );
}

function scoreTone(value: number) {
  if (value >= 8) return "text-cinnabar";
  if (value >= 6.5) return "text-jade";
  if (value >= 4) return "text-ink";
  return "text-earth";
}

function scoreLabel(value: number) {
  if (value >= 8) return "Rare · 甚吉";
  if (value >= 6.5) return "Auspicious · 吉";
  if (value >= 4) return "Balanced · 平";
  if (value >= 2) return "Cautionary · 凶";
  return "Dire · 大凶";
}

function useCountUp(target: number, duration = 800): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(target * 10 * eased) / 10);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

function LandmarkCaption({
  analysis,
  coords,
}: {
  analysis: FormSchoolAnalysis;
  coords: Coords;
}) {
  if (analysis.address) {
    return (
      <div className="mt-4 space-y-1">
        <div className="font-display text-base leading-tight text-ink">
          {analysis.address.formatted}
        </div>
        {analysis.nearestLandmark && (
          <div className="text-[11px] tracking-[0.25em] uppercase text-muted">
            Near {analysis.nearestLandmark.name} ·{" "}
            {Math.round(analysis.nearestLandmark.distanceMeters)}m
          </div>
        )}
      </div>
    );
  }

  const landmark = analysis.nearestLandmark;
  if (landmark) {
    return (
      <div className="text-[11px] tracking-[0.25em] uppercase text-muted mt-4">
        Near {landmark.name} · {Math.round(landmark.distanceMeters)}m{" "}
        {landmark.category.replace("_", " ")}
      </div>
    );
  }

  return (
    <div className="text-[11px] tracking-[0.25em] uppercase text-muted mt-4">
      {coords.lat.toFixed(4)}°N · {coords.lon.toFixed(4)}°E
    </div>
  );
}

function FactorSection({
  title,
  cn,
  factors,
  emptyText,
  accent,
}: {
  title: string;
  cn: string;
  factors: FengshuiFactor[];
  emptyText: string;
  accent: "jade" | "cinnabar";
}) {
  const accentClass = accent === "jade" ? "text-jade" : "text-cinnabar";
  return (
    <section>
      <header className="flex items-baseline justify-between border-t border-ink pt-4 mb-5">
        <h3 className="font-display text-xl tracking-tight">{title}</h3>
        <span className={`font-cn text-xl ${accentClass}`}>{cn}</span>
      </header>
      {factors.length === 0 ? (
        <p className="text-sm text-muted italic">{emptyText}</p>
      ) : (
        <ul className="space-y-5">
          {factors.map((f, i) => (
            <FactorItem key={i} factor={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FactorItem({ factor }: { factor: FengshuiFactor }) {
  return (
    <li>
      <div className="flex items-baseline gap-3 mb-1">
        <SeverityDots
          severity={factor.severity}
          tone={factor.type === "positive" ? "jade" : "cinnabar"}
        />
        <span className="font-display text-base leading-tight">
          {factor.title}
        </span>
      </div>
      <p className="text-sm text-ink-soft leading-relaxed pl-[2.4rem]">
        {factor.description}
      </p>
    </li>
  );
}

function SeverityDots({
  severity,
  tone,
}: {
  severity: 1 | 2 | 3;
  tone: "jade" | "cinnabar";
}) {
  const cls = tone === "jade" ? "bg-jade" : "bg-cinnabar";
  return (
    <span className="flex items-center gap-0.5 shrink-0 pt-1">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= severity ? cls : "bg-line"}`}
        />
      ))}
    </span>
  );
}

function EmailGate({
  hiddenCount,
  onUnlock,
}: {
  hiddenCount: number;
  onUnlock: (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrMsg(null);
    const r = await onUnlock(email);
    if (!r.ok) setErrMsg(r.error);
    setSubmitting(false);
  };

  return (
    <section className="border-t border-cinnabar pt-6 bg-bg-warm/40 -mx-8 lg:-mx-10 px-8 lg:px-10 pb-2">
      <div className="text-[10px] tracking-[0.35em] uppercase text-cinnabar mb-3">
        For the full reading
      </div>
      <p className="font-display text-xl leading-snug mb-4">
        {hiddenCount} more factor{hiddenCount === 1 ? "" : "s"} await — every
        gathering and scattering, with their classical references.
      </p>
      <p className="text-sm text-ink-soft mb-6">
        Drop your email — you&rsquo;ll see the full reading instantly. We&rsquo;ll
        also send a link to verify your email and unlock free unit-level analysis.
      </p>
      <form onSubmit={handle} className="flex border-b-2 border-ink">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@somewhere.sg"
          className="flex-1 bg-transparent py-3 text-base placeholder:text-muted focus:outline-none"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting}
          className="font-display text-2xl text-cinnabar hover:translate-x-1 transition-transform px-2 disabled:opacity-40"
          aria-label="Reveal full reading"
        >
          {submitting ? "…" : "→"}
        </button>
      </form>
      {errMsg && <p className="text-xs text-cinnabar mt-3">{errMsg}</p>}
      <p className="text-[10px] tracking-wide text-muted mt-3">
        One email per visitor. No newsletter spam.
      </p>
    </section>
  );
}

function NextSteps() {
  return (
    <section className="border-t border-line pt-6">
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
        What next
      </div>
      <p className="font-display text-xl leading-snug mb-4">
        Take this reading to{" "}
        <em className="text-cinnabar italic font-normal">your unit.</em>
      </p>
      <p className="text-sm text-ink-soft mb-5">
        Location is only half the reading. Verify your email, then upload your
        floor plan for flying stars and eight mansions analysis specific to your
        home — free.
      </p>
      <a
        href="/upload"
        className="inline-flex items-center gap-2 font-display text-lg text-cinnabar hover:gap-3 transition-all"
      >
        Upload a floor plan <span aria-hidden>→</span>
      </a>
    </section>
  );
}
