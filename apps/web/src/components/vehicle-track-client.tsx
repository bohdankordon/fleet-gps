"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CityGeofenceMapResponse } from "@/lib/city-geofence/city-geofence-contract";
import { ensureCityGeofenceLayers } from "@/lib/city-geofence/city-geofence-map";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { initialFleetMapBasemapState, recordFleetMapBasemapError, recordFleetMapBasemapLoad } from "@/lib/fleet-map/fleet-map-basemap-state";
import { parseVehicleTrackResponse, VehicleTrackContractError } from "@/lib/vehicle-track/vehicle-track-contract";
import { vehicleTrackCamera, shouldFitVehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { formatVehicleTrackSpeed, formatVehicleTrackTimestamp, vehicleTrackQualityLabels } from "@/lib/vehicle-track/vehicle-track-formatters";
import { ensureVehicleTrackLayers, updateVehicleTrackMapData, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, VEHICLE_TRACK_WARNING_POINT_LAYER_ID } from "@/lib/vehicle-track/vehicle-track-layers";
import { vehicleTrackLoadedKey, vehicleTrackLoadedRange, type VehicleTrackLoadedData } from "@/lib/vehicle-track/vehicle-track-load";
import { buildVehicleTrackLoadPresentation } from "@/lib/vehicle-track/vehicle-track-load-presentation";
import { parseVehicleTrackOverviewResponse, VehicleTrackOverviewContractError } from "@/lib/vehicle-track/vehicle-track-overview-contract";
import { EMPTY_VEHICLE_TRACK_PRESENTATION, VehicleTrackPresentationError, type VehicleTrackPresentationModel } from "@/lib/vehicle-track/vehicle-track-presentation";
import { parseVehicleTrackCustomRange, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft, type VehicleTrackDraftRange } from "@/lib/vehicle-track/vehicle-track-custom-range";
import { createVehicleTrackPresetRange, VEHICLE_TRACK_PRESETS, vehicleTrackModeForRange, vehicleTrackRangeKey, type VehicleTrackPresetHours, type VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { abortVehicleTrackRequest, beginVehicleTrackRequest, failVehicleTrackRequest, initialVehicleTrackRequestState, succeedVehicleTrackRequest, type VehicleTrackLoadError } from "@/lib/vehicle-track/vehicle-track-request-state";
import { reconcileVehicleTrackSelection, selectedVehicleTrackPoint } from "@/lib/vehicle-track/vehicle-track-selection";
import { vehicleTrackErrorCopy, vehicleTrackResponseError } from "@/lib/vehicle-track/vehicle-track-error-copy";
import { useAuth } from "@/components/auth-provider";
import { hasPermission } from "@/lib/auth/auth-contract";
import { useI18n } from "../i18n/client";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const workerState: FleetMapWorkerBootstrapState = { configured: false };
type Props = Readonly<{ vehicleId: string; initialData: VehicleTrackLoadedData | null; initialRange: VehicleTrackRange | null; initialError: VehicleTrackLoadError; initialGeofence: CityGeofenceMapResponse | null; initialGeofenceUnavailable: boolean }>;

function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel, geofence: CityGeofenceMapResponse | null): void {
  const camera = vehicleTrackCamera(model, geofence);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
}

export function VehicleTrackClient({ vehicleId, initialData, initialRange, initialError, initialGeofence, initialGeofenceUnavailable }: Props) {
  const { locale, t } = useI18n();
  const auth = useAuth(); const canOpenMap = auth !== null && hasPermission(auth, "map.view");
  const [state, setState] = useState(() => initialVehicleTrackRequestState(initialData, initialRange, initialError));
  const [selectedKey, setSelectedKey] = useState<string | null>(null); const [styleError, setStyleError] = useState(false);
  const [draft, setDraft] = useState<VehicleTrackDraftRange>(() => vehicleTrackRangeToKyivDraft(initialData ? vehicleTrackLoadedRange(initialData) : initialRange));
  const [formError, setFormError] = useState<string | null>(null);
  const stateRef = useRef(state); const selectedRef = useRef(selectedKey); const containerRef = useRef<HTMLDivElement | null>(null); const mapRef = useRef<MapLibreMap | null>(null);
  const activeRef = useRef(false); const controllerRef = useRef<AbortController | null>(null); const generationRef = useRef(0); const initialCameraAppliedRef = useRef(false); const fitOnNextDataRef = useRef(false);
  const basemapStateRef = useRef(initialFleetMapBasemapState());
  const model = useMemo(() => state.data ? buildVehicleTrackLoadPresentation(state.data) : EMPTY_VEHICLE_TRACK_PRESENTATION, [state.data]);
  const modelRef = useRef(model); const geofenceRef = useRef(initialGeofence);
  useEffect(() => { stateRef.current = state; }, [state]); useEffect(() => { selectedRef.current = selectedKey; }, [selectedKey]);

  const load = useCallback(async (range: VehicleTrackRange, explicitRangeChange: boolean): Promise<void> => {
    if (activeRef.current) return;
    const mode = vehicleTrackModeForRange(range); if (!mode) return;
    const current = stateRef.current; const requestedKey = `${mode}:${vehicleTrackRangeKey(range)}`; const rangeChanged = explicitRangeChange && (!current.data || vehicleTrackLoadedKey(current.data) !== requestedKey);
    const begun = beginVehicleTrackRequest(current, range, rangeChanged); if (begun === current) return;
    stateRef.current = begun; setState(begun); activeRef.current = true; generationRef.current = begun.generation;
    const generation = begun.generation; const controller = new AbortController(); controllerRef.current = controller;
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const endpoint = mode === "EXACT" ? "track" : "track/overview";
      const response = await fetch(`/api/vehicles/${vehicleId}/${endpoint}?${query.toString()}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw Object.assign(new Error("track request"), { trackError: vehicleTrackResponseError(response.status, mode) });
      const body: unknown = await response.json();
      const data: VehicleTrackLoadedData = mode === "EXACT" ? { mode, response: parseVehicleTrackResponse(body) } : { mode, response: parseVehicleTrackOverviewResponse(body) };
      const nextModel = buildVehicleTrackLoadPresentation(data);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const previousModel = modelRef.current; const sameRange = current.data !== null && vehicleTrackLoadedKey(current.data) === vehicleTrackLoadedKey(data);
      setSelectedKey((key) => reconcileVehicleTrackSelection(previousModel, nextModel, key, sameRange));
      fitOnNextDataRef.current = rangeChanged; const next = succeedVehicleTrackRequest(stateRef.current, generation, data); stateRef.current = next; setState(next); setDraft(vehicleTrackRangeToKyivDraft(vehicleTrackLoadedRange(data))); setFormError(null);
      window.history.replaceState(null, "", `/vehicles/${vehicleId}/track?${query.toString()}`);
    } catch (error) {
      if (!controller.signal.aborted && generation === generationRef.current) {
        const kind: Exclude<VehicleTrackLoadError, null> = error instanceof VehicleTrackPresentationError || error instanceof VehicleTrackContractError || error instanceof VehicleTrackOverviewContractError ? "MALFORMED" : typeof error === "object" && error !== null && "trackError" in error ? (error as { trackError: Exclude<VehicleTrackLoadError, null> }).trackError : "UNAVAILABLE";
        const next = failVehicleTrackRequest(stateRef.current, generation, kind); stateRef.current = next; setState(next);
      }
    } finally { if (generation === generationRef.current) activeRef.current = false; }
  }, [vehicleId]);

  useEffect(() => {
    const container = containerRef.current; if (!container || mapRef.current) return;
    const map = createFleetMapAfterWorkerBootstrap({ setWorkerUrl: maplibregl.setWorkerUrl, workerUrl: MAPLIBRE_WORKER_URL, state: workerState }, () => new maplibregl.Map({ container, style: fleetMapStyleUrl(), pitchWithRotate: false, dragRotate: false }));
    mapRef.current = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const onLoad = () => { basemapStateRef.current = recordFleetMapBasemapLoad(); setStyleError(false); ensureCityGeofenceLayers(map, geofenceRef.current); ensureVehicleTrackLayers(map, modelRef.current, selectedRef.current); updateVehicleTrackMapData(map, modelRef.current, selectedRef.current); applyCamera(map, modelRef.current, geofenceRef.current); initialCameraAppliedRef.current = true; };
    const onClick = (event: maplibregl.MapLayerMouseEvent) => { const key = event.features?.[0]?.properties?.key; if (typeof key === "string") setSelectedKey(key); };
    const onError = () => { basemapStateRef.current = recordFleetMapBasemapError(basemapStateRef.current); setStyleError(basemapStateRef.current.error); };
    map.on("load", onLoad); map.on("click", [VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_WARNING_POINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID], onClick); map.on("error", onError);
    return () => { map.off("load", onLoad); map.off("click", [VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_WARNING_POINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID], onClick); map.off("error", onError); map.remove(); mapRef.current = null; generationRef.current += 1; controllerRef.current?.abort(); activeRef.current = false; stateRef.current = abortVehicleTrackRequest(stateRef.current, stateRef.current.generation); };
  }, []);

  useEffect(() => {
    modelRef.current = model; const map = mapRef.current;
    if (map?.isStyleLoaded()) { updateVehicleTrackMapData(map, model, selectedKey); if (shouldFitVehicleTrackCamera(initialCameraAppliedRef.current, fitOnNextDataRef.current)) { applyCamera(map, model, geofenceRef.current); initialCameraAppliedRef.current = true; } fitOnNextDataRef.current = false; }
  }, [model, selectedKey]);

  const selected = selectedVehicleTrackPoint(model, selectedKey); const error = vehicleTrackErrorCopy(state.error, state.data !== null, locale);
  const choosePreset = (hours: VehicleTrackPresetHours) => { const range = createVehicleTrackPresetRange(hours, new Date()); if (range) void load(range, true); };
  const submitCustomRange = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const result = parseVehicleTrackCustomRange(draft); const copy = vehicleTrackCustomRangeErrorCopy(result.error, locale); if (!result.range) { setFormError(copy); return; } setFormError(null); void load(result.range, true); };
  const exactResponse = state.data?.mode === "EXACT" ? state.data.response : null;
  const overviewResponse = state.data?.mode === "OVERVIEW" ? state.data.response : null;
  return <>
    <header className="hero track-hero"><p className="eyebrow">{t("track.eyebrow")}</p><h1>{state.data?.response.vehicle.name ?? t("track.defaultTitle")}</h1><p>{t("track.description")}</p><div className="metadata"><Link href={`/vehicles/${vehicleId}`}>{t("track.backToVehicle")}</Link>{canOpenMap && <Link href="/map">{t("track.openCurrentMap")}</Link>}</div></header>
    <section className="track-controls" aria-label={t("track.controls.label")}><div><span className="track-control-label">{t("track.controls.quick")}</span><div className="track-presets">{VEHICLE_TRACK_PRESETS.map((preset) => <button type="button" onClick={() => choosePreset(preset.hours)} disabled={state.loading} key={preset.hours}>{t(preset.messageKey)}</button>)}</div></div><button type="button" className="track-refresh" onClick={() => state.range && void load(state.range, false)} disabled={state.loading || !state.range}>{state.loading ? t("common.loading") : t("track.controls.refreshCurrent")}</button><form className="track-custom-range" onSubmit={submitCustomRange}><fieldset disabled={state.loading}><legend>{t("track.controls.custom")}</legend><p className="track-timezone">{t("track.controls.timezone")}</p><label htmlFor="track-from">{t("track.controls.from")}<input id="track-from" name="from" type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} step="60" required /></label><label htmlFor="track-to">{t("track.controls.to")}<input id="track-to" name="to" type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} step="60" required /></label><button type="submit">{t("track.controls.showPeriod")}</button></fieldset>{formError && <p className="track-form-error" role="alert">{formError}</p>}</form><div className="track-range"><span>{t("track.range.from")} <strong>{formatVehicleTrackTimestamp(state.range?.from ?? null, locale)}</strong></span><span>{t("track.range.to")} <strong>{formatVehicleTrackTimestamp(state.range?.to ?? null, locale)}</strong></span></div></section>
    {state.loading && <p className="refresh" aria-live="polite">{t("track.loading")}</p>}
    {error && <section className="notice" role="alert"><span>⚠</span><div><strong>{error[0]}</strong><span>{error[1]}</span></div></section>}
    {initialGeofenceUnavailable && <p className="map-geofence-status" role="alert">{t("track.geofenceUnavailable")}</p>}
    {styleError && <section className="notice" role="alert"><span>⚠</span><div><strong>{t("map.basemapError")}</strong><span>{t("track.basemapFallback")}</span></div></section>}
    {state.data && <p className={`track-mode-badge ${state.data.mode === "EXACT" ? "track-mode-exact" : "track-mode-overview"}`}>{state.data.mode === "EXACT" ? t("track.mode.exact") : t("track.mode.overview")}</p>}
    {exactResponse && <section className="track-summary" aria-label={t("track.summary.exactLabel")}><article><span>{t("track.summary.points")}</span><strong>{exactResponse.summary.pointCount}</strong></article><article><span>{t("track.summary.start")}</span><strong>{formatVehicleTrackTimestamp(exactResponse.summary.firstObservedAt, locale)}</strong></article><article><span>{t("track.summary.end")}</span><strong>{formatVehicleTrackTimestamp(exactResponse.summary.lastObservedAt, locale)}</strong></article><article><span>{t("track.summary.gapsOverFive")}</span><strong>{model.gapCount}</strong></article></section>}
    {overviewResponse && <><section className="track-summary track-overview-summary" aria-label={t("track.summary.overviewLabel")}><article><span>{t("track.summary.savedPoints")}</span><strong>{overviewResponse.summary.rawPointCount}</strong></article><article><span>{t("track.summary.shownPoints")}</span><strong>{overviewResponse.summary.returnedPointCount}</strong></article><article><span>{t("track.summary.start")}</span><strong>{formatVehicleTrackTimestamp(overviewResponse.summary.firstObservedAt, locale)}</strong></article><article><span>{t("track.summary.end")}</span><strong>{formatVehicleTrackTimestamp(overviewResponse.summary.lastObservedAt, locale)}</strong></article><article><span>{t("track.summary.gaps")}</span><strong>{overviewResponse.summary.gapCount}</strong></article><article><span>{t("track.summary.segments")}</span><strong>{overviewResponse.summary.segmentCount}</strong></article></section><p className="track-quality-summary">{t("track.summary.qualityWarnings")} <strong>{overviewResponse.summary.qualityWarningCount}</strong></p></>}
    <div className="track-legend" aria-label={t("track.legend.label")}><span><i className="track-legend-line" />{t("track.legend.sequence")}</span><span><i className="track-legend-point" />{t("track.legend.observation")}</span><span><i className="track-legend-warning" />{t("track.legend.qualityWarning")}</span><span><i className="track-legend-start" />{t("track.legend.start")}</span><span><i className="track-legend-end" />{t("track.legend.end")}</span></div>
    {model.points.length === 1 && <p className="track-single-point">{t("track.singlePoint")}</p>}
    {state.data?.mode === "EXACT" && <p className="track-disclaimer">{t("track.exactDisclaimer")}</p>}
    {state.data?.mode === "OVERVIEW" && <p className="track-disclaimer">{t("track.overviewDisclaimer")}</p>}
    <section className="map-shell track-map-shell" aria-label={t("track.mapLabel")}><div ref={containerRef} className="fleet-map-canvas track-map-canvas" data-vehicle-track-map="true" />{state.data && model.points.length === 0 && <div className="map-empty">{t("track.noPoints")}</div>}</section>
    <section className="map-details track-point-details" aria-live="polite"><h2>{selected ? selected.endpoint === "single" ? t("track.selection.single") : t("track.selection.selected") : t("track.selection.none")}</h2>{selected ? <dl><div><dt>{t("track.selection.time")}</dt><dd>{formatVehicleTrackTimestamp(selected.point.observedAt, locale)}</dd></div><div><dt>{t("track.selection.speed")}</dt><dd>{formatVehicleTrackSpeed(selected.point.speedKph, locale)}</dd></div><div><dt>{t("track.selection.quality")}</dt><dd>{vehicleTrackQualityLabels(selected.point.valid, selected.point.outdated, locale).map((label) => <span key={label}>{label}</span>)}</dd></div></dl> : <p>{t("track.selection.help")}</p>}</section>
  </>;
}
