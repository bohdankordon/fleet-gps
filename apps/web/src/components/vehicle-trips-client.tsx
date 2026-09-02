"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { parseTripAnalysisResponse, type TripAnalysisResponse } from "@/lib/trip-analysis/trip-analysis-contract";
import { formatObservedDistance, formatTripAnalysisDuration, formatTripAnalysisTime } from "@/lib/trip-analysis/trip-analysis-formatters";
import { clearTripAnalysisInteraction, failSelectedTrack, initialTripAnalysisInteractionState, selectTripAnalysisItem } from "@/lib/trip-analysis/trip-analysis-interaction";
import { createTripAnalysisPresetRange, TRIP_ANALYSIS_PRESETS, type TripAnalysisPreset } from "@/lib/trip-analysis/trip-analysis-range";
import { selectedStopBoundaryPresentation, selectedTripTrackRequest } from "@/lib/trip-analysis/trip-analysis-selection";
import { buildTripAnalysisTimeline, type TripAnalysisSelection } from "@/lib/trip-analysis/trip-analysis-timeline";
import { vehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { parseVehicleTrackCustomRange, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft, type VehicleTrackDraftRange } from "@/lib/vehicle-track/vehicle-track-custom-range";
import { ensureVehicleTrackLayers, updateVehicleTrackMapData } from "@/lib/vehicle-track/vehicle-track-layers";
import { parseVehicleTrackOverviewResponse } from "@/lib/vehicle-track/vehicle-track-overview-contract";
import { buildVehicleTrackOverviewPresentation } from "@/lib/vehicle-track/vehicle-track-overview-presentation";
import { WarningIcon } from "@/components/ui/icons";
import { buildVehicleTrackPresentation, EMPTY_VEHICLE_TRACK_PRESENTATION, type VehicleTrackPresentationModel } from "@/lib/vehicle-track/vehicle-track-presentation";
import { parseVehicleTrackResponse } from "@/lib/vehicle-track/vehicle-track-contract";
import type { VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { useI18n } from "../i18n/client";
import { VehicleDetailShell } from "@/components/vehicle-detail-shell";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"; const workerState: FleetMapWorkerBootstrapState = { configured: false };
type Props = Readonly<{ vehicleId: string; vehicleName: string | null; shellGeneratedAt: string | null; initialData: TripAnalysisResponse | null; initialRange: VehicleTrackRange; initialError: boolean; timezone: string }>;
function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel): void { const camera = vehicleTrackCamera(model, null); if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 }); else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom }); }

export function VehicleTripsClient({ vehicleId, vehicleName, shellGeneratedAt, initialData, initialRange, initialError, timezone }: Props) {
  const { locale, t } = useI18n();
  const [analysis, setAnalysis] = useState(initialData); const [range, setRange] = useState(initialRange); const [loading, setLoading] = useState(false); const [analysisError, setAnalysisError] = useState(initialError);
  const [interaction, setInteraction] = useState(initialTripAnalysisInteractionState); const selection = interaction.selection; const [trackLoading, setTrackLoading] = useState(false); const [model, setModel] = useState<VehicleTrackPresentationModel>(EMPTY_VEHICLE_TRACK_PRESENTATION);
  const [draft, setDraft] = useState<VehicleTrackDraftRange>(() => vehicleTrackRangeToKyivDraft(initialRange)); const [formError, setFormError] = useState<string | null>(null); const [styleError, setStyleError] = useState(false);
  const analysisController = useRef<AbortController | null>(null); const trackController = useRef<AbortController | null>(null); const containerRef = useRef<HTMLDivElement | null>(null); const mapRef = useRef<MapLibreMap | null>(null); const modelRef = useRef(model);
  const timeline = useMemo(() => analysis ? buildTripAnalysisTimeline(analysis) : [], [analysis]);
  useEffect(() => { modelRef.current = model; const map = mapRef.current; if (map?.isStyleLoaded()) { updateVehicleTrackMapData(map, model, null); applyCamera(map, model); } }, [model]);

  const loadAnalysis = useCallback(async (nextRange: VehicleTrackRange) => {
    analysisController.current?.abort(); trackController.current?.abort(); const controller = new AbortController(); analysisController.current = controller;
    setLoading(true); setAnalysisError(false); setInteraction(clearTripAnalysisInteraction()); setTrackLoading(false); setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
    try { const query = new URLSearchParams(nextRange); const response = await fetch(`/api/vehicles/${vehicleId}/trip-analysis?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(); const data = parseTripAnalysisResponse(await response.json()); if (controller.signal.aborted) return; setAnalysis(data); setRange(nextRange); setDraft(vehicleTrackRangeToKyivDraft(nextRange)); window.history.replaceState(null, "", `/vehicles/${vehicleId}/trips?${query}`); }
    catch { if (!controller.signal.aborted) { setAnalysis(null); setAnalysisError(true); } } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [vehicleId]);

  const select = useCallback(async (next: TripAnalysisSelection) => {
    trackController.current?.abort(); setInteraction(selectTripAnalysisItem(next));
    if (next.kind === "STOP") { const boundaries = selectedStopBoundaryPresentation(next); setTrackLoading(false); setModel(boundaries ?? EMPTY_VEHICLE_TRACK_PRESENTATION); return; }
    const request = selectedTripTrackRequest(next); if (!request) { setInteraction((current) => failSelectedTrack(current)); return; }
    const controller = new AbortController(); trackController.current = controller; setTrackLoading(true); setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
    try { const query = new URLSearchParams(request.range); const endpoint = request.mode === "EXACT" ? "track" : "track/overview"; const response = await fetch(`/api/vehicles/${vehicleId}/${endpoint}?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(); const body: unknown = await response.json(); const nextModel = request.mode === "EXACT" ? buildVehicleTrackPresentation(parseVehicleTrackResponse(body)) : buildVehicleTrackOverviewPresentation(parseVehicleTrackOverviewResponse(body)); if (!controller.signal.aborted) setModel(nextModel); }
    catch { if (!controller.signal.aborted) setInteraction((current) => failSelectedTrack(current)); } finally { if (!controller.signal.aborted) setTrackLoading(false); }
  }, [vehicleId]);

  useEffect(() => { const container = containerRef.current; if (!container || mapRef.current) return; const map = createFleetMapAfterWorkerBootstrap({ setWorkerUrl: maplibregl.setWorkerUrl, workerUrl: MAPLIBRE_WORKER_URL, state: workerState }, () => new maplibregl.Map({ container, style: fleetMapStyleUrl(), pitchWithRotate: false, dragRotate: false })); mapRef.current = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right"); const onLoad = () => { ensureVehicleTrackLayers(map, modelRef.current, null); updateVehicleTrackMapData(map, modelRef.current, null); applyCamera(map, modelRef.current); }; const onError = () => setStyleError(true); map.on("load", onLoad); map.on("error", onError); return () => { map.off("load", onLoad); map.off("error", onError); map.remove(); mapRef.current = null; analysisController.current?.abort(); trackController.current?.abort(); }; }, []);
  const choosePreset = (preset: TripAnalysisPreset) => { const next = createTripAnalysisPresetRange(preset, new Date(), timezone); if (next) void loadAnalysis(next); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); const parsed = parseVehicleTrackCustomRange(draft); if (!parsed.range) { setFormError(vehicleTrackCustomRangeErrorCopy(parsed.error, locale)); return; } setFormError(null); void loadAnalysis(parsed.range); };
  const noObservations = analysis?.summary.rawObservationCount === 0; const noEvents = analysis && analysis.summary.rawObservationCount > 0 && analysis.summary.tripCount === 0 && analysis.summary.stopCount === 0;
  return <VehicleDetailShell vehicleId={vehicleId} vehicleName={vehicleName ?? t("trips.title")} activeTab="trips" generatedAt={shellGeneratedAt} description={t("trips.description")}>
    <section className="track-controls" aria-label={t("trips.controls.label")}><div><span className="track-control-label">{t("track.controls.quick")}</span><div className="track-presets">{TRIP_ANALYSIS_PRESETS.map((preset) => <button type="button" key={preset.key} disabled={loading} onClick={() => choosePreset(preset.key)}>{t(preset.messageKey)}</button>)}</div></div><button type="button" className="track-refresh" disabled={loading} onClick={() => void loadAnalysis(range)}>{loading ? t("common.loading") : t("common.refresh")}</button><form className="track-custom-range" onSubmit={submit}><fieldset disabled={loading}><legend>{t("track.controls.custom")}</legend><p className="track-timezone">{t("track.controls.timezone")}</p><label>{t("track.controls.from")}<input type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} required /></label><label>{t("track.controls.to")}<input type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} required /></label><button type="submit">{t("track.controls.show")}</button></fieldset>{formError && <p className="track-form-error" role="alert">{formError}</p>}</form></section>
    {analysisError && <section className="notice" role="alert"><WarningIcon className="notice-icon" /><div><strong>{t("trips.loadError")}</strong><span>{t("trips.loadErrorText")}</span></div></section>}
    {analysis && <section className="trip-summary" aria-label={t("trips.summary.label")}><article><span>{t("trips.summary.trips")}</span><strong>{analysis.summary.tripCount}</strong></article><article><span>{t("trips.summary.stops")}</span><strong>{analysis.summary.stopCount}</strong></article><article><span>{t("trips.summary.distance")}</span><strong>{formatObservedDistance(analysis.summary.totalObservedDistanceMeters, locale)}</strong></article><article><span>{t("trips.summary.gaps")}</span><strong>{analysis.summary.gapCount}</strong></article></section>}
    {noObservations && <section className="empty"><h2>{t("trips.noGpsTitle")}</h2><p>{t("trips.noGpsText")}</p></section>}
    {noEvents && <p className="trip-neutral trip-result-message">{t("trips.noEvents")}</p>}
    {analysis && !noObservations && <div className="trip-layout"><section className="trip-timeline" aria-label={t("trips.timeline.label")}><h2>{t("trips.timeline.title")}</h2>{timeline.length === 0 ? <p className="details-empty">{t("trips.timeline.empty")}</p> : <ol>{timeline.map((item) => <li key={item.key} className={`trip-event trip-event-${item.kind.toLowerCase()} ${selection?.key === item.key ? "trip-event-selected" : ""}`}>{item.kind === "GAP" ? <div><strong>{t("trips.timeline.gap")} {formatTripAnalysisDuration(item.value.durationSeconds, locale)}</strong><span>{t("trips.timeline.gapUnknown")}</span></div> : <button type="button" onClick={() => void select(item)}><strong>{item.kind === "TRIP" ? t("trips.timeline.trip") : t("trips.timeline.stop")}</strong><span>{formatTripAnalysisTime(item.startAt, locale)} → {formatTripAnalysisTime(item.endAt, locale)}</span><span>{formatTripAnalysisDuration(item.value.durationSeconds, locale)}{item.kind === "TRIP" ? ` · ${formatObservedDistance(item.value.observedDistanceMeters, locale)}` : ""}</span>{item.value.terminationReason === "DATA_GAP" && <em>{t("trips.timeline.continuityLost")}</em>}{item.value.endClipped && <em>{t(item.kind === "TRIP" ? "trips.timeline.tripEndUnconfirmed" : "trips.timeline.stopEndUnconfirmed")}</em>}</button>}</li>)}</ol>}</section><section><div className="map-shell trip-map-shell" aria-label={t("trips.map.label")}><div ref={containerRef} className="fleet-map-canvas trip-map-canvas" />{!selection && <div className="map-empty">{t("trips.map.select")}</div>}{trackLoading && <div className="map-empty">{t("trips.map.loading")}</div>}{interaction.trackError && <div className="map-empty map-track-error">{t("trips.map.trackError")}</div>}</div>{styleError && <p className="map-geofence-status" role="alert">{t("map.basemapError")}.</p>}{selection?.kind === "STOP" && <p className="track-disclaimer">{t("trips.map.stopDisclaimer")}</p>}</section></div>}
  </VehicleDetailShell>;
}
