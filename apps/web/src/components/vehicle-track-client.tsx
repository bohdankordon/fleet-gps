"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Alert, Button, DatePicker, Divider, Flex, Popover, Space, Tag, Tooltip, Typography, theme } from "antd";
import { AimOutlined, CalendarOutlined, CloseOutlined, DisconnectOutlined, DownOutlined, EnvironmentOutlined, InfoCircleOutlined, NodeIndexOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { StableLoadingButton } from "@/components/stable-loading-button";
import { VehicleDetailShell } from "@/components/vehicle-detail-shell";
import type { CityGeofenceMapResponse } from "@/lib/city-geofence/city-geofence-contract";
import { ensureCityGeofenceLayers } from "@/lib/city-geofence/city-geofence-map";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { initialFleetMapBasemapState, recordFleetMapBasemapError, recordFleetMapBasemapLoad } from "@/lib/fleet-map/fleet-map-basemap-state";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { parseVehicleTrackResponse, VehicleTrackContractError } from "@/lib/vehicle-track/vehicle-track-contract";
import { parseVehicleTrackOverviewResponse, VehicleTrackOverviewContractError } from "@/lib/vehicle-track/vehicle-track-overview-contract";
import { vehicleTrackCamera, shouldFitVehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { formatVehicleTrackClock, formatVehicleTrackQualityWarnings, formatVehicleTrackSpeed, vehicleTrackQualityLabels } from "@/lib/vehicle-track/vehicle-track-formatters";
import { ensureVehicleTrackLayers, updateVehicleTrackMapData, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, VEHICLE_TRACK_PRESENTATION, VEHICLE_TRACK_SELECTED_LAYER_ID, VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID } from "@/lib/vehicle-track/vehicle-track-layers";
import { vehicleTrackLoadedKey, vehicleTrackLoadedRange, type VehicleTrackLoadedData } from "@/lib/vehicle-track/vehicle-track-load";
import { buildVehicleTrackLoadPresentation } from "@/lib/vehicle-track/vehicle-track-load-presentation";
import { EMPTY_VEHICLE_TRACK_PRESENTATION, VehicleTrackPresentationError, type VehicleTrackPresentationModel, type VehicleTrackPresentationPoint } from "@/lib/vehicle-track/vehicle-track-presentation";
import { parseVehicleTrackCustomRange, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft, type VehicleTrackDraftRange } from "@/lib/vehicle-track/vehicle-track-custom-range";
import { createVehicleTrackPresetRange, VEHICLE_TRACK_PRESETS, vehicleTrackModeForRange, vehicleTrackRangeKey, type VehicleTrackPresetHours, type VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { abortVehicleTrackRequest, beginVehicleTrackRequest, failVehicleTrackRequest, initialVehicleTrackRequestState, succeedVehicleTrackRequest, type VehicleTrackLoadError } from "@/lib/vehicle-track/vehicle-track-request-state";
import { reconcileVehicleTrackSelection, selectedVehicleTrackPoint } from "@/lib/vehicle-track/vehicle-track-selection";
import { vehicleTrackErrorCopy, vehicleTrackResponseError } from "@/lib/vehicle-track/vehicle-track-error-copy";
import { formatNumber } from "@/i18n/formatting";
import { PeriodPopover } from "./period-popover";
import { useI18n } from "../i18n/client";

dayjs.extend(customParseFormat);
const { Text } = Typography;
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const workerState: FleetMapWorkerBootstrapState = { configured: false };
const TRACK_CIVIL_FORMAT = "YYYY-MM-DDTHH:mm";
const TRACK_PICKER_FORMAT = "DD.MM.YYYY, HH:mm";
const TRACK_MAP_MARKER_CSS_VARS = {
  "--track-marker-route": VEHICLE_TRACK_PRESENTATION.route,
  "--track-marker-observation": VEHICLE_TRACK_PRESENTATION.observation,
  "--track-marker-warning": VEHICLE_TRACK_PRESENTATION.warning,
  "--track-marker-start": VEHICLE_TRACK_PRESENTATION.start,
  "--track-marker-end": VEHICLE_TRACK_PRESENTATION.end,
  "--track-marker-selected": VEHICLE_TRACK_PRESENTATION.selected,
  "--track-marker-outline": VEHICLE_TRACK_PRESENTATION.outline,
} as CSSProperties;

type Props = Readonly<{ vehicleId: string; initialVehicleName: string | null; initialVehicleGroup?: Readonly<{ id: string; name: string }> | null; initialVehicleGeneratedAt: string | null; initialData: VehicleTrackLoadedData | null; initialRange: VehicleTrackRange | null; initialError: VehicleTrackLoadError; initialGeofence: CityGeofenceMapResponse | null; initialGeofenceUnavailable: boolean }>;

function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel, geofence: CityGeofenceMapResponse | null): void {
  const camera = vehicleTrackCamera(model, geofence);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
}

function pickerValue(value: string) {
  const parsed = value ? dayjs(value, TRACK_CIVIL_FORMAT, true) : null;
  return parsed?.isValid() ? parsed : null;
}
function pickerCivil(value: dayjs.Dayjs | null): string { return value?.isValid() ? value.format(TRACK_CIVIL_FORMAT) : ""; }
function presetForRange(range: VehicleTrackRange | null): VehicleTrackPresetHours | null {
  if (!range) return null;
  const hours = (Date.parse(range.to) - Date.parse(range.from)) / 3_600_000;
  return VEHICLE_TRACK_PRESETS.find((preset) => preset.hours === hours)?.hours ?? null;
}
function TrackSectionTitle({ icon, title }: Readonly<{ icon: ReactNode; title: string }>) {
  const { token } = theme.useToken();
  return <Flex className="vehicle-track__section-title" align="center" gap="small"><span className="vehicle-track__section-icon" aria-hidden style={{ color: token.colorPrimary }}>{icon}</span><span>{title}</span></Flex>;
}

export function VehicleTrackClient({ vehicleId, initialVehicleName, initialVehicleGroup, initialVehicleGeneratedAt, initialData, initialRange, initialError, initialGeofence, initialGeofenceUnavailable }: Props) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const [state, setState] = useState(() => initialVehicleTrackRequestState(initialData, initialRange, initialError));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [styleError, setStyleError] = useState(false);
  const [draft, setDraft] = useState<VehicleTrackDraftRange>(() => vehicleTrackRangeToKyivDraft(initialData ? vehicleTrackLoadedRange(initialData) : initialRange));
  const [appliedPreset, setAppliedPreset] = useState<VehicleTrackPresetHours | null>(() => presetForRange(initialData ? vehicleTrackLoadedRange(initialData) : initialRange));
  const [editorOpen, setEditorOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const selectedRef = useRef(selectedKey);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const initialCameraAppliedRef = useRef(false);
  const fitOnNextDataRef = useRef(false);
  const basemapStateRef = useRef(initialFleetMapBasemapState());
  const model = useMemo(() => state.data ? buildVehicleTrackLoadPresentation(state.data) : EMPTY_VEHICLE_TRACK_PRESENTATION, [state.data]);
  const modelRef = useRef(model);
  const geofenceRef = useRef(initialGeofence);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selectedRef.current = selectedKey; }, [selectedKey]);

  const pageStyle = {
    "--track-surface-bg": token.colorBgContainer,
    "--track-surface-border": token.colorBorder,
    "--track-surface-radius": `${token.borderRadiusLG}px`,
    "--track-divider": token.colorBorderSecondary,
    "--track-map-bg": token.colorFillQuaternary,
    "--track-primary": token.colorPrimary,
    "--track-primary-bg": token.colorPrimaryBg,
    "--track-warning": VEHICLE_TRACK_PRESENTATION.warning,
    "--track-warning-bg": token.colorWarningBg,
    "--track-route": VEHICLE_TRACK_PRESENTATION.route,
    "--track-observation": VEHICLE_TRACK_PRESENTATION.observation,
    "--track-start": VEHICLE_TRACK_PRESENTATION.start,
    "--track-end": VEHICLE_TRACK_PRESENTATION.end,
    "--track-selected": VEHICLE_TRACK_PRESENTATION.selected,
  } as CSSProperties & Record<string, string>;

  const load = useCallback(async (range: VehicleTrackRange, explicitRangeChange: boolean, preset: VehicleTrackPresetHours | null): Promise<void> => {
    if (activeRef.current) return;
    const mode = vehicleTrackModeForRange(range);
    if (!mode) return;
    const current = stateRef.current;
    const requestedKey = `${mode}:${vehicleTrackRangeKey(range)}`;
    const rangeChanged = explicitRangeChange && (!current.data || vehicleTrackLoadedKey(current.data) !== requestedKey);
    const begun = beginVehicleTrackRequest(current, range, rangeChanged);
    if (begun === current) return;
    stateRef.current = begun;
    setState(begun);
    activeRef.current = true;
    generationRef.current = begun.generation;
    const generation = begun.generation;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const endpoint = mode === "EXACT" ? "track" : "track/overview";
      const response = await fetch(`/api/vehicles/${vehicleId}/${endpoint}?${query}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw Object.assign(new Error("track request"), { trackError: vehicleTrackResponseError(response.status, mode) });
      const body: unknown = await response.json();
      const data: VehicleTrackLoadedData = mode === "EXACT" ? { mode, response: parseVehicleTrackResponse(body) } : { mode, response: parseVehicleTrackOverviewResponse(body) };
      const nextModel = buildVehicleTrackLoadPresentation(data);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const previousModel = modelRef.current;
      const sameRange = current.data !== null && vehicleTrackLoadedKey(current.data) === vehicleTrackLoadedKey(data);
      setSelectedKey((key) => reconcileVehicleTrackSelection(previousModel, nextModel, key, sameRange));
      fitOnNextDataRef.current = rangeChanged;
      const next = succeedVehicleTrackRequest(stateRef.current, generation, data);
      stateRef.current = next;
      setState(next);
      setDraft(vehicleTrackRangeToKyivDraft(vehicleTrackLoadedRange(data)));
      setAppliedPreset(preset);
      setFormError(null);
      if (explicitRangeChange) setEditorOpen(false);
      window.history.replaceState(null, "", `/vehicles/${vehicleId}/track?${query}`);
    } catch (error) {
      if (!controller.signal.aborted && generation === generationRef.current) {
        const kind: Exclude<VehicleTrackLoadError, null> = error instanceof VehicleTrackPresentationError || error instanceof VehicleTrackContractError || error instanceof VehicleTrackOverviewContractError ? "MALFORMED" : typeof error === "object" && error !== null && "trackError" in error ? (error as { trackError: Exclude<VehicleTrackLoadError, null> }).trackError : "UNAVAILABLE";
        const next = failVehicleTrackRequest(stateRef.current, generation, kind);
        stateRef.current = next;
        setState(next);
      }
    } finally { if (generation === generationRef.current) activeRef.current = false; }
  }, [vehicleId]);

  useEffect(() => {
    if (!mapContainer || mapRef.current) return;
    const map = createFleetMapAfterWorkerBootstrap({ setWorkerUrl: maplibregl.setWorkerUrl, workerUrl: MAPLIBRE_WORKER_URL, state: workerState }, () => new maplibregl.Map({ container: mapContainer, style: fleetMapStyleUrl(), pitchWithRotate: false, dragRotate: false }));
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const hitLayers = [VEHICLE_TRACK_SELECTED_LAYER_ID, VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID];
    const onLoad = () => { basemapStateRef.current = recordFleetMapBasemapLoad(); setStyleError(false); ensureCityGeofenceLayers(map, geofenceRef.current); ensureVehicleTrackLayers(map, modelRef.current, selectedRef.current); updateVehicleTrackMapData(map, modelRef.current, selectedRef.current); applyCamera(map, modelRef.current, geofenceRef.current); initialCameraAppliedRef.current = true; };
    const onClick = (event: maplibregl.MapLayerMouseEvent) => { const key = event.features?.[0]?.properties?.key; if (typeof key === "string") setSelectedKey(key); };
    const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { map.getCanvas().style.cursor = ""; };
    const onError = () => { basemapStateRef.current = recordFleetMapBasemapError(basemapStateRef.current); setStyleError(basemapStateRef.current.error); };
    map.on("load", onLoad);
    map.on("click", hitLayers, onClick);
    map.on("mouseenter", hitLayers, onEnter);
    map.on("mouseleave", hitLayers, onLeave);
    map.on("error", onError);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
    observer?.observe(mapContainer);
    return () => { observer?.disconnect(); map.off("load", onLoad); map.off("click", hitLayers, onClick); map.off("mouseenter", hitLayers, onEnter); map.off("mouseleave", hitLayers, onLeave); map.off("error", onError); map.remove(); mapRef.current = null; generationRef.current += 1; controllerRef.current?.abort(); activeRef.current = false; stateRef.current = abortVehicleTrackRequest(stateRef.current, stateRef.current.generation); };
  }, [mapContainer]);

  useEffect(() => {
    modelRef.current = model;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      updateVehicleTrackMapData(map, model, selectedKey);
      if (shouldFitVehicleTrackCamera(initialCameraAppliedRef.current, fitOnNextDataRef.current)) { applyCamera(map, model, geofenceRef.current); initialCameraAppliedRef.current = true; }
      fitOnNextDataRef.current = false;
    }
  }, [model, selectedKey]);

  const selected = selectedVehicleTrackPoint(model, selectedKey);
  useEffect(() => {
    if (!selected || !window.matchMedia("(min-width: 992px)").matches) return;
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      const overlay = document.querySelector<HTMLElement>(".vehicle-track__observation--overlay");
      const canvas = map?.getCanvas();
      if (!map || !overlay || !canvas) return;
      const overlayRect = overlay.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const projected = map.project([selected.point.longitude, selected.point.latitude]);
      const x = canvasRect.left + projected.x;
      const y = canvasRect.top + projected.y;
      if (x >= overlayRect.left - 12 && x <= overlayRect.right + 12 && y >= overlayRect.top - 12 && y <= overlayRect.bottom + 12) {
        map.panBy([overlayRect.right - x + 28, 0], { duration: 0 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const error = vehicleTrackErrorCopy(state.error, state.data !== null, locale);
  const choosePreset = (hours: VehicleTrackPresetHours) => { const range = createVehicleTrackPresetRange(hours, new Date()); if (range) void load(range, true, hours); };
  const submitCustomRange = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const result = parseVehicleTrackCustomRange(draft); const copy = vehicleTrackCustomRangeErrorCopy(result.error, locale); if (!result.range) { setFormError(copy); return; } setFormError(null); void load(result.range, true, null); };
  const loadedRange = state.data ? vehicleTrackLoadedRange(state.data) : state.range;
  const mode = state.data?.mode ?? (loadedRange ? vehicleTrackModeForRange(loadedRange) : null);
  const preset = VEHICLE_TRACK_PRESETS.find((item) => item.hours === appliedPreset);
  const periodLabel = preset ? t(preset.messageKey) : t("track.controls.custom");
  const pointCount = state.data?.mode === "OVERVIEW" ? state.data.response.summary.returnedPointCount : state.data?.response.summary.pointCount ?? 0;
  const rawPointCount = state.data?.mode === "OVERVIEW" ? state.data.response.summary.rawPointCount : pointCount;
  const qualityWarningCount = state.data?.mode === "OVERVIEW" ? state.data.response.summary.qualityWarningCount : model.points.filter((point) => point.qualityWarning).length;
  const segmentCount = state.data?.mode === "OVERVIEW" ? state.data.response.summary.segmentCount : model.segments.length;
  const gapCount = state.data?.mode === "OVERVIEW" ? state.data.response.summary.gapCount : model.gaps.length;
  const observationsValue = state.data?.mode === "OVERVIEW" ? t("track.summary.observationsSampled", { displayed: formatNumber(locale, pointCount), total: formatNumber(locale, rawPointCount) }) : formatNumber(locale, pointCount);
  const periodEditor = <div className="vehicle-track__period-editor">
    <Text className="vehicle-track__editor-label" type="secondary">{t("track.controls.quick")}</Text>
    <div className="vehicle-track__preset-groups">
      <TrackPresetGroup title={t("track.presetGroup.exact")} presets={VEHICLE_TRACK_PRESETS.filter((item) => item.hours <= 24)} selected={appliedPreset} loading={state.loading} choose={choosePreset} />
      <TrackPresetGroup title={t("track.presetGroup.overview")} presets={VEHICLE_TRACK_PRESETS.filter((item) => item.hours > 24)} selected={appliedPreset} loading={state.loading} choose={choosePreset} />
    </div>
    <Divider className="vehicle-track__editor-divider" />
    <form id="vehicle-track-custom-range" className="vehicle-track__custom-range" onSubmit={submitCustomRange}>
      <Text className="vehicle-track__custom-title" strong>{t("track.controls.custom")}</Text>
      <div className="vehicle-track__range-fields">
        <DatePicker.RangePicker className="vehicle-track__range-picker" aria-label={t("track.controls.label")} value={[pickerValue(draft.from), pickerValue(draft.to)]} onCalendarChange={(values) => setDraft({ from: pickerCivil(values[0]), to: pickerCivil(values[1]) })} onChange={(values) => setDraft({ from: pickerCivil(values?.[0] ?? null), to: pickerCivil(values?.[1] ?? null) })} allowClear order={false} needConfirm showTime={{ format: "HH:mm", minuteStep: 1 }} format={TRACK_PICKER_FORMAT} placeholder={[t("track.controls.from"), t("track.controls.to")]} placement="bottomLeft" classNames={{ popup: { root: "vehicle-track__range-popup" } }} styles={{ root: { height: token.controlHeightLG }, popup: { root: { maxWidth: "calc(100vw - 48px)", overflowX: "auto" } } }} size="large" />
        <Text className="vehicle-track__range-help" type="secondary">{t("trips.range.openEndedHelp")}</Text>
        <Button className="vehicle-track__show-period" htmlType="submit" type="primary" size="large" loading={state.loading} icon={<CalendarOutlined aria-hidden />}>{t("track.controls.showPeriod")}</Button>
      </div>
      {formError ? <Alert className="vehicle-track__range-error" type="error" showIcon title={formError} /> : null}
    </form>
  </div>;

  return <VehicleDetailShell vehicleId={vehicleId} vehicleName={state.data?.response.vehicle.name ?? initialVehicleName ?? t("track.defaultTitle")} vehicleGroup={state.data?.response.vehicle.group ?? initialVehicleGroup ?? undefined} activeTab="history" generatedAt={state.data?.response.generatedAt ?? initialVehicleGeneratedAt} showMapAction>
    <div className="vehicle-track" style={pageStyle}>
      <section className="vehicle-track__period-bar" aria-label={t("track.controls.label")}>
        <div className="vehicle-track__period-context">
          <PeriodPopover open={editorOpen} onOpenChange={setEditorOpen} title={<TrackSectionTitle icon={<CalendarOutlined />} title={t("trips.controls.title")} />} content={periodEditor} className="vehicle-track__period-popover">
            <Button className="vehicle-track__period-trigger" type="default" size="large" aria-expanded={editorOpen} aria-controls="vehicle-track-custom-range"><CalendarOutlined aria-hidden /><span className="vehicle-track__period-trigger-copy"><strong>{periodLabel}</strong><span aria-hidden>·</span><span className="vehicle-track__period-window"><time dateTime={loadedRange?.from}>{formatVehicleTrackClock(loadedRange?.from ?? null, locale)}</time> → <time dateTime={loadedRange?.to}>{formatVehicleTrackClock(loadedRange?.to ?? null, locale)}</time></span></span><DownOutlined className="vehicle-track__period-chevron" aria-hidden /></Button>
          </PeriodPopover>
          {mode ? <Tooltip title={mode === "OVERVIEW" ? t("track.mode.overviewHelp") : t("track.mode.exactHelp")}><Tag className="vehicle-track__mode" color={mode === "EXACT" ? "success" : "default"}><span>{mode === "EXACT" ? t("track.mode.exact") : t("track.mode.overview")}</span><InfoCircleOutlined className="vehicle-track__mode-info" aria-hidden /></Tag></Tooltip> : null}
          <Text className="vehicle-track__timezone" type="secondary">Europe/Kyiv</Text>
        </div>
        <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={state.loading} icon={<ReloadOutlined aria-hidden />} onClick={() => loadedRange && void load(loadedRange, false, appliedPreset)} size="large" type="default" />
      </section>

      {error ? <Alert className="vehicle-track__load-error" type="error" showIcon title={error[0]} description={error[1]} /> : null}
      {initialGeofenceUnavailable ? <Alert className="vehicle-track__map-notice" type="warning" showIcon title={t("track.geofenceUnavailable")} /> : null}
      {styleError ? <Alert className="vehicle-track__map-notice" type="error" showIcon title={t("map.basemapError")} description={t("track.basemapFallback")} /> : null}

      {state.data ? <section className="vehicle-track__summary" aria-label={t("track.summary.label")}>
        <TrackSummaryMetric icon={<AimOutlined />} title={t("track.summary.observations")} value={observationsValue} />
        <TrackSummaryMetric icon={<NodeIndexOutlined />} title={t("track.summary.segments")} value={formatNumber(locale, segmentCount)} />
        <TrackSummaryMetric icon={<DisconnectOutlined />} title={t("track.summary.gaps")} value={formatNumber(locale, gapCount)} />
        <TrackSummaryMetric icon={<WarningOutlined />} title={t("track.summary.quality")} value={formatVehicleTrackQualityWarnings(qualityWarningCount, locale)} />
      </section> : null}

      {state.data ? <section className="vehicle-track__workspace" aria-label={t("track.workspace.label")}>
        <div className="vehicle-track__map-content"><div className="map-shell vehicle-track__map-surface" aria-label={t("track.mapLabel")}>
          <div ref={setMapContainer} className="fleet-map-canvas vehicle-track__map-canvas" data-vehicle-track-map="true" />
          <div className="vehicle-track__legend-control"><Popover trigger="click" placement="bottomRight" content={<TrackMapLegend />}><Button size="large" type="default" icon={<InfoCircleOutlined aria-hidden />}>{t("map.legend.label")}</Button></Popover></div>
          {model.points.length === 0 ? <div className="map-empty vehicle-track__map-empty"><EnvironmentOutlined className="vehicle-track__map-empty-icon" aria-hidden /><strong className="vehicle-track__map-empty-title">{t("track.noPoints")}</strong><span className="vehicle-track__map-empty-copy">{t("track.noPointsMeaning")}</span></div> : null}
        </div></div>
        {selected ? <SelectedObservationDetails selected={selected} onClose={() => setSelectedKey(null)} /> : null}
      </section> : null}
    </div>
  </VehicleDetailShell>;
}

function TrackPresetGroup({ title, presets, selected, loading, choose }: Readonly<{ title: string; presets: Array<(typeof VEHICLE_TRACK_PRESETS)[number]>; selected: VehicleTrackPresetHours | null; loading: boolean; choose: (hours: VehicleTrackPresetHours) => void }>) {
  const { t } = useI18n();
  return <div className="vehicle-track__preset-group"><span className="vehicle-track__preset-group-title">{title}</span><div className={`vehicle-track__preset-grid vehicle-track__preset-grid--${presets.length}`} role="group" aria-label={title}>{presets.map((preset) => { const isSelected = selected === preset.hours; return <Button htmlType="button" key={preset.hours} aria-pressed={isSelected} className="vehicle-track__preset-button" color={isSelected ? "primary" : "default"} variant={isSelected ? "filled" : "outlined"} size="middle" onClick={() => choose(preset.hours)} disabled={loading}>{t(preset.choiceMessageKey)}</Button>; })}</div></div>;
}

function TrackSummaryMetric({ icon, title, value }: Readonly<{ icon: ReactNode; title: string; value: ReactNode }>) {
  const { token } = theme.useToken();
  return <article className="vehicle-track__summary-metric"><span className="vehicle-track__summary-icon" aria-hidden style={{ color: token.colorPrimary }}>{icon}</span><div className="vehicle-track__summary-content"><span className="vehicle-track__summary-title">{title}</span><Text className="vehicle-track__summary-value" strong>{value}</Text></div></article>;
}

function TrackLegendSwatch({ kind }: Readonly<{ kind: "route" | "gap" | "observation" | "warning" | "start" | "end" | "selected" }>) {
  return <i className={`vehicle-track__legend-sample vehicle-track__legend-sample--${kind}`} aria-hidden />;
}
function TrackMapLegend() {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const items = [["route", "track.legend.sequence"], ["gap", "track.legend.gap"], ["observation", "track.legend.observation"], ["warning", "track.legend.qualityWarning"], ["start", "track.legend.start"], ["end", "track.legend.end"], ["selected", "track.legend.selected"]] as const;
  return <div className="map-legend vehicle-track__legend" style={TRACK_MAP_MARKER_CSS_VARS} role="region" aria-label={t("map.legend.label")}><Flex className="map-legend__header" align="center" gap="small"><InfoCircleOutlined aria-hidden style={{ color: token.colorPrimary, fontSize: 16 }} /><Text strong>{t("map.legend.label")}</Text></Flex><Divider className="map-legend__divider" style={{ margin: 0 }} /><div className="map-legend__items">{items.map(([kind, key]) => <span key={kind}><TrackLegendSwatch kind={kind} />{t(key)}</span>)}</div><Divider className="map-legend__divider" style={{ margin: 0 }} /><Space className="map-legend__notes" orientation="vertical" size={4}><Text className="map-legend__note" type="secondary">{t("track.legend.note")}</Text></Space></div>;
}

function SelectedObservationDetails({ selected, onClose }: Readonly<{ selected: VehicleTrackPresentationPoint; onClose: () => void }>) {
  const { locale, t } = useI18n();
  const warnings = vehicleTrackQualityLabels(selected.point.valid, selected.point.outdated, locale).filter((label) => selected.qualityWarning && label !== t("track.quality.noWarnings"));
  const quality = selected.qualityWarning ? t("track.selection.qualityWarning") : selected.point.valid === null && selected.point.outdated === null ? t("track.quality.unspecified") : t("track.selection.qualityExact");
  return <aside className="vehicle-track__observation vehicle-track__observation--overlay" aria-label={t("track.selection.selected")} aria-live="polite"><div className="vehicle-track__observation-header"><div className="vehicle-track__observation-title"><EnvironmentOutlined className="vehicle-track__observation-icon" aria-hidden /><div><Text className="vehicle-track__observation-heading" strong>{t("track.selection.selected")}</Text><Text className="vehicle-track__observation-time" strong>{formatVehicleTrackClock(selected.point.observedAt, locale)}</Text></div></div><Button className="vehicle-track__observation-close" type="text" size="small" icon={<CloseOutlined aria-hidden />} aria-label={t("track.selection.close")} onClick={onClose} /></div><Divider className="vehicle-track__observation-divider" /><dl className="vehicle-track__observation-fields"><div><dt>{t("track.selection.speed")}</dt><dd>{formatVehicleTrackSpeed(selected.point.speedKph, locale)}</dd></div><div><dt>{t("track.selection.quality")}</dt><dd>{quality}</dd></div>{warnings.length > 0 ? <div className="vehicle-track__observation-warning"><dt><WarningOutlined aria-hidden />{t("track.selection.warnings")}</dt><dd>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</dd></div> : null}</dl></aside>;
}
