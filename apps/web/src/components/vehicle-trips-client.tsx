"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Alert, Button, DatePicker, Divider, Empty, Flex, Popover, Space, Typography, theme } from "antd";
import { CalendarOutlined, CarOutlined, DisconnectOutlined, DownOutlined, EnvironmentOutlined, InfoCircleOutlined, NodeIndexOutlined, PauseCircleOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { StableLoadingButton } from "@/components/stable-loading-button";
import { VehicleDetailShell } from "@/components/vehicle-detail-shell";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { parseTripAnalysisResponse, type TripAnalysisResponse } from "@/lib/trip-analysis/trip-analysis-contract";
import { formatObservedDistance, formatTripAnalysisClock, formatTripAnalysisDuration, formatTripAnalysisTime } from "@/lib/trip-analysis/trip-analysis-formatters";
import { clearTripAnalysisInteraction, failSelectedTrack, initialTripAnalysisInteractionState, selectTripAnalysisItem } from "@/lib/trip-analysis/trip-analysis-interaction";
import {
  TRIP_ANALYSIS_CALENDAR_PRESETS,
  TRIP_ANALYSIS_CIVIL_FORMAT,
  TRIP_ANALYSIS_PICKER_FORMAT,
  TRIP_ANALYSIS_PRESETS,
  TRIP_ANALYSIS_RECENT_PRESETS,
  createTripAnalysisPresetRange,
  refreshOpenEndedTripAnalysisRange,
  tripAnalysisPageQuery,
  tripAnalysisPickerValueToCivil,
  type TripAnalysisPreset,
} from "@/lib/trip-analysis/trip-analysis-range";
import { selectedStopBoundaryPresentation, selectedTripTrackRequest } from "@/lib/trip-analysis/trip-analysis-selection";
import { buildTripAnalysisTimeline, type TripAnalysisSelection, type TripAnalysisTimelineItem } from "@/lib/trip-analysis/trip-analysis-timeline";
import { ensureTripEventLayer, ensureTripMapLayers, ensureTripSpeedingRouteLayer, TRIP_MAP_LEGEND_ITEMS, TRIP_MAP_PRESENTATION, updateTripEventData, updateTripMapData, updateTripSpeedingRouteData, type TripEventPosition } from "@/lib/trip-analysis/trip-analysis-map-layers";
import { resolveContainingTrip, tripEventFocusCamera, type VehicleTripsEventFocus } from "@/lib/trip-analysis/trip-analysis-event-focus";
import { buildSpeedingSegmentGeoJson } from "@/lib/trip-analysis/trip-analysis-speeding-route";
import { vehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { parseVehicleTrackCustomRange, parseVehicleTrackCustomRangeToNow, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft, type VehicleTrackDraftRange } from "@/lib/vehicle-track/vehicle-track-custom-range";
import { parseVehicleTrackOverviewResponse } from "@/lib/vehicle-track/vehicle-track-overview-contract";
import { buildVehicleTrackOverviewPresentation } from "@/lib/vehicle-track/vehicle-track-overview-presentation";
import { buildVehicleTrackPresentation, EMPTY_VEHICLE_TRACK_PRESENTATION, type VehicleTrackPresentationModel } from "@/lib/vehicle-track/vehicle-track-presentation";
import { parseVehicleTrackResponse } from "@/lib/vehicle-track/vehicle-track-contract";
import type { VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { PeriodPopover } from "./period-popover";
import { useI18n } from "../i18n/client";
import { alertZoneLabel, formatAlertSpeed, formatAlertTimestamp } from "../lib/alert-events/alert-events-formatters";
import { parseSpeedingEventInvestigation } from "../lib/alert-events/alert-events-contract";
import { alertEventInvestigationRange } from "../lib/alert-events/alert-events-investigation";

dayjs.extend(customParseFormat);

const { Text } = Typography;
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const workerState: FleetMapWorkerBootstrapState = { configured: false };
const TRIP_MAP_MARKER_CSS_VARS = {
  "--trip-marker-route": TRIP_MAP_PRESENTATION.routeColor,
  "--trip-marker-observation": TRIP_MAP_PRESENTATION.observationColor,
  "--trip-marker-warning": TRIP_MAP_PRESENTATION.warningAccentColor,
  "--trip-marker-start": TRIP_MAP_PRESENTATION.startColor,
  "--trip-marker-end": TRIP_MAP_PRESENTATION.endColor,
  "--trip-marker-outline": TRIP_MAP_PRESENTATION.outlineColor,
  "--trip-marker-event": TRIP_MAP_PRESENTATION.eventColor,
  "--trip-marker-event-size": `${TRIP_MAP_PRESENTATION.eventRadius * 2}px`,
  "--trip-marker-event-halo-size": `${TRIP_MAP_PRESENTATION.eventHaloRadius * 2}px`,
} as CSSProperties & Record<string, string>;

type Props = Readonly<{
  vehicleId: string;
  vehicleName: string | null;
  vehicleGroup?: Readonly<{ id: string; name: string; color?: import("../lib/vehicle-groups/vehicle-groups-contract").VehicleGroupColor | null }> | null;
  shellGeneratedAt: string | null;
  initialData: TripAnalysisResponse | null;
  initialRange: VehicleTrackRange;
  initialPreset: TripAnalysisPreset | null;
  initialOpenEnded: boolean;
  initialError: boolean;
  initialEventFocus: VehicleTripsEventFocus | null;
  timezone: string;
}>;

function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel, eventPosition: TripEventPosition): void {
  if (eventPosition) {
    const camera = tripEventFocusCamera(eventPosition);
    map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
    return;
  }
  const camera = vehicleTrackCamera(model, null);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
}

/** Pure track fetch for one trip selection; state updates happen only in the caller's async continuations. */
async function fetchTripTrackPresentation(vehicleId: string, next: TripAnalysisSelection, signal: AbortSignal): Promise<VehicleTrackPresentationModel> {
  const request = selectedTripTrackRequest(next);
  if (!request) throw new Error("trip track is unavailable");
  const query = new URLSearchParams(request.range);
  const endpoint = request.mode === "EXACT" ? "track" : "track/overview";
  const response = await fetch(`/api/vehicles/${vehicleId}/${endpoint}?${query}`, { cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("trip track is unavailable");
  const body: unknown = await response.json();
  return request.mode === "EXACT" ? buildVehicleTrackPresentation(parseVehicleTrackResponse(body)) : buildVehicleTrackOverviewPresentation(parseVehicleTrackOverviewResponse(body));
}

function TripSectionTitle({ icon, title, className = "" }: Readonly<{ icon: ReactNode; title: string; className?: string }>) {
  const { token } = theme.useToken();
  return <Flex className={`vehicle-trips__section-title${className ? ` ${className}` : ""}`} align="center" gap="small">
    <span className="vehicle-trips__section-icon" aria-hidden style={{ color: token.colorPrimary }}>{icon}</span>
    <span>{title}</span>
  </Flex>;
}

function pickerValue(value: string) {
  const parsed = value ? dayjs(value, TRIP_ANALYSIS_CIVIL_FORMAT, true) : null;
  return parsed?.isValid() ? parsed : null;
}

export function VehicleTripsClient({ vehicleId, vehicleName, vehicleGroup, shellGeneratedAt, initialData, initialRange, initialPreset, initialOpenEnded, initialError, initialEventFocus, timezone }: Props) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const [analysis, setAnalysis] = useState(initialData);
  const [range, setRange] = useState(initialRange);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(initialError);
  const [interaction, setInteraction] = useState(initialTripAnalysisInteractionState);
  const [eventFocus, setEventFocus] = useState(initialEventFocus);
  const selection = interaction.selection;
  const [trackLoading, setTrackLoading] = useState(false);
  const [model, setModel] = useState<VehicleTrackPresentationModel>(EMPTY_VEHICLE_TRACK_PRESENTATION);
  const [draft, setDraft] = useState<VehicleTrackDraftRange>(() => {
    const initialDraft = vehicleTrackRangeToKyivDraft(initialRange);
    return initialOpenEnded ? { ...initialDraft, to: "" } : initialDraft;
  });
  const [appliedPreset, setAppliedPreset] = useState<TripAnalysisPreset | null>(initialPreset);
  const [appliedOpenEnded, setAppliedOpenEnded] = useState(initialOpenEnded);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [styleError, setStyleError] = useState(false);
  const analysisController = useRef<AbortController | null>(null);
  const trackController = useRef<AbortController | null>(null);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const modelRef = useRef(model);
  const eventFocusRef = useRef(eventFocus);
  const workspaceRef = useRef<HTMLElement>(null);
  const initialEventFocusRef = useRef(initialEventFocus);
  const didEventScrollRef = useRef(false);
  const timeline = useMemo(() => analysis ? buildTripAnalysisTimeline(analysis) : [], [analysis]);
  const eventPosition = eventFocus?.kind === "AVAILABLE" ? eventFocus.event.confirmationPosition : null;
  const selectedTrip = selection?.kind === "TRIP" ? selection.value : null;
  const speedingRoute = useMemo(() => buildSpeedingSegmentGeoJson(eventFocus?.kind === "AVAILABLE" ? eventFocus.event.speedingSegments : [], selectedTrip, model), [eventFocus, model, selectedTrip]);
  const speedingRouteRef = useRef(speedingRoute);

  const pageStyle = {
    "--trip-color-warning-text": token.colorWarningText,
    "--trip-record-bg": token.colorFillQuaternary,
    "--trip-record-hover": token.colorFillTertiary,
    "--trip-record-selected": token.colorPrimaryBg,
    "--trip-record-selected-border": token.colorPrimaryBorder,
    "--trip-record-radius": `${token.borderRadiusLG}px`,
    "--trip-record-padding": `${token.paddingSM}px`,
    "--trip-record-gap": `${token.marginSM}px`,
    "--trip-line": token.colorBorderSecondary,
    "--trip-map-bg": token.colorFillQuaternary,
    "--trip-surface-bg": token.colorBgContainer,
    "--trip-surface-border": token.colorBorder,
    "--trip-surface-radius": `${token.borderRadiusLG}px`,
    "--trip-summary-divider": token.colorBorderSecondary,
    ...TRIP_MAP_MARKER_CSS_VARS,
  } as CSSProperties & Record<string, string>;

  useEffect(() => {
    modelRef.current = model;
    eventFocusRef.current = eventFocus;
    speedingRouteRef.current = speedingRoute;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      ensureTripMapLayers(map, model);
      updateTripMapData(map, model);
      ensureTripSpeedingRouteLayer(map, speedingRoute.geoJson);
      updateTripSpeedingRouteData(map, speedingRoute.geoJson);
      ensureTripEventLayer(map, eventPosition);
      updateTripEventData(map, eventPosition);
      applyCamera(map, model, eventPosition);
      map.resize();
    }
  }, [eventFocus, eventPosition, model, speedingRoute]);

  const clearEventFocus = useCallback(() => {
    setEventFocus(null);
    eventFocusRef.current = null;
    const url = new URL(window.location.href);
    if (url.searchParams.has("event")) {
      url.searchParams.delete("event");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, []);

  const loadAnalysis = useCallback(async (nextRange: VehicleTrackRange, nextPreset: TripAnalysisPreset | null, nextOpenEnded: boolean, collapseEditor: boolean, preserveEventFocus: boolean) => {
    analysisController.current?.abort();
    trackController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    setLoading(true);
    setAnalysisError(false);
    setInteraction(clearTripAnalysisInteraction());
    setTrackLoading(false);
    setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
    if (!preserveEventFocus) clearEventFocus();
    try {
      const query = new URLSearchParams(nextRange);
      const response = await fetch(`/api/vehicles/${vehicleId}/trip-analysis?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      const data = parseTripAnalysisResponse(await response.json());
      if (controller.signal.aborted) return;
      setAnalysis(data);
      setRange(nextRange);
      const nextDraft = vehicleTrackRangeToKyivDraft(nextRange);
      setDraft(nextOpenEnded ? { ...nextDraft, to: "" } : nextDraft);
      setAppliedPreset(nextPreset);
      setAppliedOpenEnded(nextOpenEnded);
      const currentEventFocus = eventFocusRef.current;
      if (preserveEventFocus && currentEventFocus?.kind === "AVAILABLE") {
        const nextFocus = Object.freeze({ ...currentEventFocus, trip: resolveContainingTrip(data, currentEventFocus.event.confirmedAt) });
        eventFocusRef.current = nextFocus;
        setEventFocus(nextFocus);
      }
      if (collapseEditor) setEditorOpen(false);
      const pageQuery = new URLSearchParams(tripAnalysisPageQuery(nextRange, nextOpenEnded));
      const currentEventId = preserveEventFocus ? new URL(window.location.href).searchParams.get("event") : null;
      if (currentEventId) pageQuery.set("event", currentEventId);
      window.history.replaceState(null, "", `/vehicles/${vehicleId}/trips?${pageQuery}`);
    } catch {
      if (!controller.signal.aborted) {
        setAnalysis(null);
        setAnalysisError(true);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [clearEventFocus, vehicleId]);

  useEffect(() => () => {
    analysisController.current?.abort();
    trackController.current?.abort();
  }, []);

  useEffect(() => {
    if (didEventScrollRef.current) return;
    const initial = initialEventFocusRef.current;
    if (initial?.kind !== "AVAILABLE") return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    didEventScrollRef.current = true;
    workspace.scrollIntoView({ block: "start" });
  }, []);

  const select = useCallback(async (next: TripAnalysisSelection, preserveEventFocus: boolean) => {
    trackController.current?.abort();
    if (!preserveEventFocus) clearEventFocus();
    setInteraction(selectTripAnalysisItem(next));
    if (next.kind === "STOP") {
      const boundaries = selectedStopBoundaryPresentation(next);
      setTrackLoading(false);
      setModel(boundaries ?? EMPTY_VEHICLE_TRACK_PRESENTATION);
      return;
    }
    const request = selectedTripTrackRequest(next);
    if (!request) {
      setInteraction((current) => failSelectedTrack(current));
      return;
    }
    const controller = new AbortController();
    trackController.current = controller;
    setTrackLoading(true);
    setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
    try {
      const query = new URLSearchParams(request.range);
      const endpoint = request.mode === "EXACT" ? "track" : "track/overview";
      const response = await fetch(`/api/vehicles/${vehicleId}/${endpoint}?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      const nextModel = request.mode === "EXACT" ? buildVehicleTrackPresentation(parseVehicleTrackResponse(body)) : buildVehicleTrackOverviewPresentation(parseVehicleTrackOverviewResponse(body));
      if (!controller.signal.aborted) setModel(nextModel);
    } catch {
      if (!controller.signal.aborted) setInteraction((current) => failSelectedTrack(current));
    } finally {
      if (!controller.signal.aborted) setTrackLoading(false);
    }
  }, [clearEventFocus, vehicleId]);

  useEffect(() => {
    if (eventFocus?.kind !== "AVAILABLE" || eventFocus.trip.kind !== "MATCH" || loading) return;
    if (interaction.selection) return;
    const tripKey = eventFocus.trip.tripKey;
    const containing = timeline.find((item): item is TripAnalysisSelection => item.key === tripKey && item.kind === "TRIP");
    if (!containing) return;
    const controller = new AbortController();
    trackController.current?.abort();
    trackController.current = controller;
    const loadFocusedTrack = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setTrackLoading(true);
      try {
        const presentation = await fetchTripTrackPresentation(vehicleId, containing, controller.signal);
        if (controller.signal.aborted) return;
        setInteraction(selectTripAnalysisItem(containing));
        setModel(presentation);
      } catch {
        if (controller.signal.aborted) return;
        setInteraction(failSelectedTrack(selectTripAnalysisItem(containing)));
      } finally {
        if (!controller.signal.aborted) setTrackLoading(false);
      }
    };
    void loadFocusedTrack();
    return () => controller.abort();
  }, [eventFocus, interaction.selection, loading, timeline, vehicleId]);

  useEffect(() => {
    if (!mapContainer) return;
    const map = createFleetMapAfterWorkerBootstrap(
      { setWorkerUrl: maplibregl.setWorkerUrl, workerUrl: MAPLIBRE_WORKER_URL, state: workerState },
      () => new maplibregl.Map({ container: mapContainer, style: fleetMapStyleUrl(), pitchWithRotate: false, dragRotate: false })
    );
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const onLoad = () => {
      ensureTripMapLayers(map, modelRef.current);
      updateTripMapData(map, modelRef.current);
      ensureTripSpeedingRouteLayer(map, speedingRouteRef.current.geoJson);
      updateTripSpeedingRouteData(map, speedingRouteRef.current.geoJson);
      const initialPosition = eventFocusRef.current?.kind === "AVAILABLE" ? eventFocusRef.current.event.confirmationPosition : null;
      ensureTripEventLayer(map, initialPosition);
      updateTripEventData(map, initialPosition);
      applyCamera(map, modelRef.current, initialPosition);
      map.resize();
    };
    const onError = () => setStyleError(true);
    map.on("load", onLoad);
    map.on("error", onError);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      map.resize();
    }) : null;
    observer?.observe(mapContainer);
    return () => {
      observer?.disconnect();
      map.off("load", onLoad);
      map.off("error", onError);
      map.remove();
      mapRef.current = null;
    };
  }, [mapContainer]);

  const choosePreset = (preset: TripAnalysisPreset) => {
    const next = createTripAnalysisPresetRange(preset, new Date(), timezone);
    if (next) {
      setFormError(null);
      void loadAnalysis(next, preset, false, true, false);
    }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const openEnded = draft.to === "";
    const parsed = openEnded ? parseVehicleTrackCustomRangeToNow(draft, new Date()) : parseVehicleTrackCustomRange(draft);
    if (!parsed.range) {
      setFormError(parsed.error === "REQUIRED" ? t("trips.range.startRequired") : vehicleTrackCustomRangeErrorCopy(parsed.error, locale));
      return;
    }
    setFormError(null);
    void loadAnalysis(parsed.range, null, openEnded, true, false);
  };
  const refresh = async () => {
    if (eventFocus?.kind === "AVAILABLE") {
      analysisController.current?.abort(); trackController.current?.abort();
      const controller = new AbortController(); analysisController.current = controller;
      const eventRange = alertEventInvestigationRange(eventFocus.event.confirmedAt, new Date()) ?? range;
      setLoading(true); setAnalysisError(false); setInteraction(clearTripAnalysisInteraction()); setTrackLoading(false); setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
      try {
        const query = new URLSearchParams(eventRange);
        const [analysisResponse, investigationResponse] = await Promise.all([
          fetch(`/api/vehicles/${vehicleId}/trip-analysis?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }),
          fetch(`/api/alert-events/${eventFocus.event.eventId}/investigation`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }),
        ]);
        if (!analysisResponse.ok || !investigationResponse.ok) throw new Error();
        const nextAnalysis = parseTripAnalysisResponse(await analysisResponse.json());
        const nextEvent = parseSpeedingEventInvestigation(await investigationResponse.json());
        if (nextEvent.eventId !== eventFocus.event.eventId || nextEvent.vehicleId !== vehicleId) throw new Error();
        const nextFocus = Object.freeze({ kind: "AVAILABLE" as const, event: nextEvent, trip: resolveContainingTrip(nextAnalysis, nextEvent.confirmedAt) });
        eventFocusRef.current = nextFocus; setEventFocus(nextFocus); setAnalysis(nextAnalysis); setRange(eventRange);
        const pageQuery = new URLSearchParams(tripAnalysisPageQuery(eventRange, false)); pageQuery.set("event", nextEvent.eventId);
        window.history.replaceState(null, "", `/vehicles/${vehicleId}/trips?${pageQuery}`);
      } catch {
        if (!controller.signal.aborted) {
          const unavailable = Object.freeze({ kind: "UNAVAILABLE" as const });
          eventFocusRef.current = unavailable;
          setEventFocus(unavailable);
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
      return;
    }
    const next = appliedOpenEnded ? refreshOpenEndedTripAnalysisRange(range, new Date()) : range;
    if (!next) {
      setFormError(vehicleTrackCustomRangeErrorCopy("TOO_LONG", locale));
      setEditorOpen(true);
      return;
    }
    setFormError(null);
    void loadAnalysis(next, appliedPreset, appliedOpenEnded, false, true);
  };
  const noObservations = analysis?.summary.rawObservationCount === 0;
  const noEvents = analysis && analysis.summary.rawObservationCount > 0 && analysis.summary.tripCount === 0 && analysis.summary.stopCount === 0;
  const appliedPresetDefinition = TRIP_ANALYSIS_PRESETS.find((preset) => preset.key === appliedPreset);
  const periodLabel = appliedPresetDefinition ? t(appliedPresetDefinition.messageKey) : t("track.controls.custom");
  const concisePeriod = appliedOpenEnded
    ? <><time dateTime={range.from}>{formatTripAnalysisTime(range.from, locale)}</time> → {t("trips.range.now")}</>
    : appliedPreset === "TODAY"
    ? <><time dateTime={range.from}>{formatTripAnalysisClock(range.from, locale)}</time> → <time dateTime={range.to}>{formatTripAnalysisClock(range.to, locale)}</time></>
    : <><time dateTime={range.from}>{formatTripAnalysisTime(range.from, locale)}</time> → <time dateTime={range.to}>{formatTripAnalysisTime(range.to, locale)}</time></>;

  const periodEditor = <div className="vehicle-trips__period-editor">
    <Text className="vehicle-trips__editor-label" type="secondary">{t("track.controls.quick")}</Text>
    <div className="vehicle-trips__presets-section">
      <div className="vehicle-trips__preset-group">
        <span className="vehicle-trips__preset-group-title">{t("trips.presetGroup.calendar")}</span>
        <div className="vehicle-trips__preset-grid vehicle-trips__preset-grid--2col" role="group" aria-label={t("trips.presetGroup.calendar")}>
          {TRIP_ANALYSIS_CALENDAR_PRESETS.map((preset) => {
            const isSelected = appliedPreset === preset.key;
            return (
              <Button
                htmlType="button"
                key={preset.key}
                aria-pressed={isSelected}
                className="vehicle-trips__preset-button"
                color={isSelected ? "primary" : "default"}
                variant={isSelected ? "filled" : "outlined"}
                size="middle"
                onClick={() => choosePreset(preset.key)}
                disabled={loading}
              >
                {t(preset.choiceMessageKey)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="vehicle-trips__preset-group">
        <span className="vehicle-trips__preset-group-title">{t("trips.presetGroup.recent")}</span>
        <div className="vehicle-trips__preset-grid vehicle-trips__preset-grid--3col" role="group" aria-label={t("trips.presetGroup.recent")}>
          {TRIP_ANALYSIS_RECENT_PRESETS.map((preset) => {
            const isSelected = appliedPreset === preset.key;
            return (
              <Button
                htmlType="button"
                key={preset.key}
                aria-pressed={isSelected}
                className="vehicle-trips__preset-button"
                color={isSelected ? "primary" : "default"}
                variant={isSelected ? "filled" : "outlined"}
                size="middle"
                onClick={() => choosePreset(preset.key)}
                disabled={loading}
              >
                {t(preset.choiceMessageKey)}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
    <Divider className="vehicle-trips__editor-divider" />
    <form id="vehicle-trips-custom-range" className="vehicle-trips__custom-range" onSubmit={submit}>
      <Text className="vehicle-trips__custom-title" strong>{t("track.controls.custom")}</Text>
      <div className="vehicle-trips__range-fields">
        <DatePicker.RangePicker
          className="vehicle-trips__range-picker"
          aria-label={t("trips.range.label")}
          value={[pickerValue(draft.from), pickerValue(draft.to)]}
          onCalendarChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values[0]), to: tripAnalysisPickerValueToCivil(values[1]) })}
          onChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values?.[0] ?? null), to: tripAnalysisPickerValueToCivil(values?.[1] ?? null) })}
          allowEmpty={[false, true]}
          allowClear
          order={false}
          needConfirm
          showTime={{ format: "HH:mm", minuteStep: 1 }}
          format={TRIP_ANALYSIS_PICKER_FORMAT}
          placeholder={[t("trips.range.from"), t("trips.range.to")]}
          placement="bottomLeft"
          classNames={{ popup: { root: "vehicle-trips__range-popup" } }}
          styles={{ root: { height: token.controlHeightLG }, popup: { root: { maxWidth: "calc(100vw - 48px)", overflowX: "auto" } } }}
          size="large"
        />
        <Text className="vehicle-trips__range-help" type="secondary">{t("trips.range.openEndedHelp")}</Text>
        <Button className="vehicle-trips__show-period" htmlType="submit" type="primary" size="large" loading={loading} icon={<CalendarOutlined aria-hidden />}>{t("track.controls.showPeriod")}</Button>
      </div>
      {formError ? <Alert className="vehicle-trips__range-error" type="error" showIcon title={formError} /> : null}
    </form>
  </div>;

  const availableEvent = eventFocus?.kind === "AVAILABLE" ? eventFocus.event : null;
  const showEventLegend = availableEvent?.confirmationPosition != null;
  const showSpeedingSegmentLegend = speedingRoute.hasDrawableGeometry;
  const eventHistoryUnavailable = eventFocus?.kind === "AVAILABLE" && (eventFocus.trip.kind !== "MATCH" || interaction.trackError);
  const segmentRouteUnavailable = Boolean(availableEvent?.speedingSegments.length) && eventFocus?.kind === "AVAILABLE" && eventFocus.trip.kind === "MATCH" && !trackLoading && Boolean(selection) && !speedingRoute.hasDrawableGeometry;
  const segmentRoutePartial = speedingRoute.hasDrawableGeometry && speedingRoute.partial;
  const showWorkspace = eventFocus?.kind === "AVAILABLE" || Boolean(analysis && !noObservations);

  return <VehicleDetailShell vehicleId={vehicleId} vehicleName={vehicleName ?? t("trips.title")} vehicleGroup={vehicleGroup} activeTab="trips" generatedAt={shellGeneratedAt}>
    <div className="vehicle-trips" style={pageStyle}>
      <section className="vehicle-trips__period-bar" aria-label={t("trips.controls.title")}>
        <div className="vehicle-trips__period-context">
          <PeriodPopover open={editorOpen} onOpenChange={setEditorOpen} title={<TripSectionTitle icon={<CalendarOutlined />} title={t("trips.controls.title")} />} content={periodEditor} className="vehicle-trips__period-popover">
            <Button className="vehicle-trips__period-trigger" type="default" size="large" aria-expanded={editorOpen} aria-controls="vehicle-trips-custom-range">
              <CalendarOutlined aria-hidden />
              <span className="vehicle-trips__period-trigger-copy"><strong>{periodLabel}</strong><span aria-hidden>·</span><span className="vehicle-trips__period-window">{concisePeriod}</span></span>
              <DownOutlined className="vehicle-trips__period-chevron" aria-hidden />
            </Button>
          </PeriodPopover>
          <Text className="vehicle-trips__timezone" type="secondary">{timezone}</Text>
        </div>
        <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={loading} icon={<ReloadOutlined aria-hidden />} onClick={refresh} size="large" type="default" />
      </section>

      {analysisError ? <Alert className="vehicle-trips__analysis-error" type="error" showIcon title={t("trips.loadError")} description={t("trips.loadErrorText")} /> : null}
      {eventFocus?.kind === "UNAVAILABLE" ? <Alert className="vehicle-trips__event-notice" type="warning" showIcon title={t("trips.event.unavailable")} /> : null}
      {eventHistoryUnavailable ? <Alert className="vehicle-trips__event-notice" type="warning" showIcon title={t("trips.event.historyUnavailable")} /> : null}
      {availableEvent && !availableEvent.confirmationPosition ? <Alert className="vehicle-trips__event-notice" type="info" showIcon title={t("trips.event.positionUnavailable")} /> : null}
      {segmentRouteUnavailable ? <Alert className="vehicle-trips__event-notice" type="info" showIcon title={t("trips.event.segmentRouteUnavailable")} /> : null}
      {segmentRoutePartial ? <Alert className="vehicle-trips__event-notice" type="info" showIcon title={t("trips.event.segmentRoutePartial")} /> : null}
      {analysis ? <section className="vehicle-trips__summary" aria-label={t("trips.summary.label")}>
        <TripSummaryMetric icon={<CarOutlined />} title={t("trips.summary.trips")} value={analysis.summary.tripCount} />
        <TripSummaryMetric icon={<PauseCircleOutlined />} title={t("trips.summary.stops")} value={analysis.summary.stopCount} />
        <TripSummaryMetric icon={<NodeIndexOutlined />} title={t("trips.summary.distance")} value={formatObservedDistance(analysis.summary.totalObservedDistanceMeters, locale)} />
        <TripSummaryMetric icon={<DisconnectOutlined />} title={t("trips.summary.gaps")} value={analysis.summary.gapCount} />
      </section> : null}
      {noObservations ? <section className="vehicle-trips__empty-surface">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Flex vertical align="center" gap={2}><Text>{t("trips.noGpsTitle")}</Text><Text type="secondary">{t("trips.noGpsText")}</Text></Flex>} />
      </section> : null}
      {noEvents ? <Alert className="vehicle-trips__neutral-result" type="info" showIcon title={t("trips.noEvents")} /> : null}

      {showWorkspace ? <section ref={workspaceRef} id="vehicle-trips-workspace" className="vehicle-trips__workspace">
        <section className="vehicle-trips__timeline-pane" aria-label={t("trips.timeline.label")}>
          <header className="vehicle-trips__workspace-header"><TripSectionTitle icon={<CalendarOutlined />} title={t("trips.timeline.title")} /></header>
          <div className="vehicle-trips__timeline-content">
            {timeline.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("trips.timeline.empty")} /> : <ol className="vehicle-trips__timeline">
              {timeline.map((item, index) => <TripTimelineRecord key={item.key} item={item} selected={selection?.key === item.key} connected={index < timeline.length - 1} onSelect={(next) => void select(next, eventFocus?.kind === "AVAILABLE" && selection?.key === next.key)} />)}
            </ol>}
          </div>
        </section>
        <section className="vehicle-trips__map-pane" aria-label={t("trips.map.label")}>
          <header className="vehicle-trips__workspace-header">
            <TripSectionTitle icon={<EnvironmentOutlined />} title={t("trips.map.title")} />
            <Popover trigger="click" placement="bottomRight" content={<TripMapLegend showEvent={showEventLegend} showSpeedingSegment={showSpeedingSegmentLegend} />}>
              <Button size="large" type="default" icon={<InfoCircleOutlined aria-hidden />}>{t("map.legend.label")}</Button>
            </Popover>
          </header>
          <div className="vehicle-trips__map-content">
            <div className="map-shell vehicle-trips__map-surface" aria-label={t("trips.map.label")}>
              <div ref={setMapContainer} className="fleet-map-canvas vehicle-trips__map-canvas" />
              {!selection && !eventPosition ? <div className="map-empty vehicle-trips__map-empty">{t("trips.map.select")}</div> : null}
              {trackLoading && !eventPosition ? <div className="map-empty vehicle-trips__map-empty">{t("trips.map.loading")}</div> : null}
              {interaction.trackError && !eventPosition ? <div className="map-empty vehicle-trips__map-empty vehicle-trips__map-error">{t("trips.map.trackError")}</div> : null}
              {availableEvent?.confirmationPosition ? <SpeedingEventEvidence event={availableEvent} /> : null}
            </div>
            {styleError ? <Alert className="vehicle-trips__map-notice" type="error" showIcon title={t("map.basemapError")} /> : null}
            {selection?.kind === "STOP" ? <Text className="vehicle-trips__stop-disclaimer" type="secondary">{t("trips.map.stopDisclaimer")}</Text> : null}
          </div>
        </section>
      </section> : null}
    </div>
  </VehicleDetailShell>;
}

function SpeedingEventEvidence({ event }: Readonly<{ event: Extract<NonNullable<VehicleTripsEventFocus>, { kind: "AVAILABLE" }>["event"] }>) {
  const { locale, t } = useI18n();
  return <aside className="vehicle-trips__event-evidence" aria-label={t("trips.event.evidenceLabel")}>
    <strong>{t("trips.event.confirmation")}</strong>
    <dl>
      <div><dt>{t("events.table.opened")}</dt><dd><time dateTime={event.confirmedAt}>{formatAlertTimestamp(event.confirmedAt, locale)}</time></dd></div>
      <div><dt>{t("events.confirmationSpeed")}</dt><dd>{formatAlertSpeed(event.confirmationSpeedKph, locale)}</dd></div>
      <div><dt>{t("events.threshold")}</dt><dd>{formatAlertSpeed(event.thresholdKph, locale)}</dd></div>
      <div><dt>{t("events.zone")}</dt><dd>{alertZoneLabel(event.zone, locale)}</dd></div>
    </dl>
  </aside>;
}

function TripSummaryMetric({ icon, title, value }: Readonly<{ icon: ReactNode; title: string; value: ReactNode }>) {
  const { token } = theme.useToken();
  return <article className="vehicle-trips__summary-metric">
    <span className="vehicle-trips__summary-icon" aria-hidden style={{ color: token.colorPrimary }}>{icon}</span>
    <div className="vehicle-trips__summary-content">
      <span className="vehicle-trips__summary-title">{title}:</span>
      <Text className="vehicle-trips__summary-value" strong>{value}</Text>
    </div>
  </article>;
}

function TripLegendSwatch({ kind }: Readonly<{ kind: "route" | "observation" | "warning" | "start" | "end" | "stop" | "event" | "speeding-segment" }>) {
  return <i className={`vehicle-trips__legend-sample vehicle-trips__legend-sample--${kind}`} aria-hidden />;
}

function TripMapLegend({ showEvent, showSpeedingSegment }: Readonly<{ showEvent?: boolean; showSpeedingSegment?: boolean }>) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  return <div className="map-legend vehicle-trips__legend" style={TRIP_MAP_MARKER_CSS_VARS} role="region" aria-label={t("map.legend.label")}>
    <Flex className="map-legend__header" align="center" gap="small">
      <InfoCircleOutlined aria-hidden style={{ color: token.colorPrimary, fontSize: 16 }} />
      <Text strong>{t("map.legend.label")}</Text>
    </Flex>
    <Divider className="map-legend__divider" style={{ margin: 0 }} />
    <div className="map-legend__items">
      {TRIP_MAP_LEGEND_ITEMS.map((item) => <span key={item.kind}><TripLegendSwatch kind={item.kind} />{t(item.messageKey)}</span>)}
      {showEvent ? <span><TripLegendSwatch kind="event" />{t("trips.legend.speedingConfirmation")}</span> : null}
      {showSpeedingSegment ? <span><TripLegendSwatch kind="speeding-segment" />{t("trips.legend.speedingSegment")}</span> : null}
    </div>
    <Space className="map-legend__notes" orientation="vertical" size={4}>
      <Text className="map-legend__note" type="secondary">{t("trips.legend.note")}</Text>
    </Space>
  </div>;
}

function TripTimelineRecord({ item, selected, connected, onSelect }: Readonly<{ item: TripAnalysisTimelineItem; selected: boolean; connected: boolean; onSelect: (item: TripAnalysisSelection) => void }>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const accent = item.kind === "TRIP" ? token.colorPrimary : item.kind === "STOP" ? token.colorSuccess : token.colorWarning;
  const icon = item.kind === "TRIP" ? <CarOutlined /> : item.kind === "STOP" ? <PauseCircleOutlined /> : <DisconnectOutlined />;
  const title = item.kind === "TRIP" ? t("trips.timeline.trip") : item.kind === "STOP" ? t("trips.timeline.stop") : t("trips.timeline.gap");
  const recordStyle = { "--trip-record-accent": accent } as CSSProperties & Record<string, string>;
  const warning = item.kind !== "GAP" && (item.value.terminationReason === "DATA_GAP" ? t("trips.timeline.continuityLost") : item.value.endClipped ? t(item.kind === "TRIP" ? "trips.timeline.tripEndUnconfirmed" : "trips.timeline.stopEndUnconfirmed") : null);
  const content = <div className="vehicle-trips__record-content">
    <Text className="vehicle-trips__record-title" strong>{title}</Text>
    {item.kind === "GAP" ? <>
      <Text className="vehicle-trips__record-value">{formatTripAnalysisDuration(item.value.durationSeconds, locale)}</Text>
      <Text className="vehicle-trips__record-secondary" type="secondary">{t("trips.timeline.gapUnknown")}</Text>
    </> : <>
      <Text className="vehicle-trips__record-time" type="secondary"><time dateTime={item.startAt}>{formatTripAnalysisTime(item.startAt, locale)}</time> → <time dateTime={item.endAt}>{formatTripAnalysisTime(item.endAt, locale)}</time></Text>
      <Text className="vehicle-trips__record-value">{formatTripAnalysisDuration(item.value.durationSeconds, locale)}</Text>
      {item.kind === "TRIP" ? <Text className="vehicle-trips__record-value">{formatObservedDistance(item.value.observedDistanceMeters, locale)}</Text> : null}
      {warning ? <Flex className="vehicle-trips__record-warning" align="flex-start" gap="small"><WarningOutlined aria-hidden /><span>{warning}</span></Flex> : null}
    </>}
  </div>;

  return <li className={`vehicle-trips__record vehicle-trips__record--${item.kind.toLowerCase()}${selected ? " vehicle-trips__record--selected" : ""}${connected ? " vehicle-trips__record--connected" : ""}`} style={recordStyle}>
    <div className="vehicle-trips__record-marker" aria-hidden style={{ color: accent }}>
      <span className="vehicle-trips__record-icon">{icon}</span>
      {connected ? <span className="vehicle-trips__record-line" /> : null}
    </div>
    {item.kind === "GAP" ? <div className="vehicle-trips__record-body">{content}</div> : <button type="button" className="vehicle-trips__record-button" aria-pressed={selected} onClick={() => onSelect(item)}>{content}</button>}
  </li>;
}
