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
import { ensureTripMapLayers, TRIP_MAP_LEGEND_ITEMS, TRIP_MAP_PRESENTATION, updateTripMapData } from "@/lib/trip-analysis/trip-analysis-map-layers";
import { vehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { parseVehicleTrackCustomRange, parseVehicleTrackCustomRangeToNow, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft, type VehicleTrackDraftRange } from "@/lib/vehicle-track/vehicle-track-custom-range";
import { parseVehicleTrackOverviewResponse } from "@/lib/vehicle-track/vehicle-track-overview-contract";
import { buildVehicleTrackOverviewPresentation } from "@/lib/vehicle-track/vehicle-track-overview-presentation";
import { buildVehicleTrackPresentation, EMPTY_VEHICLE_TRACK_PRESENTATION, type VehicleTrackPresentationModel } from "@/lib/vehicle-track/vehicle-track-presentation";
import { parseVehicleTrackResponse } from "@/lib/vehicle-track/vehicle-track-contract";
import type { VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { PeriodPopover } from "./period-popover";
import { useI18n } from "../i18n/client";

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
} as CSSProperties & Record<string, string>;

type Props = Readonly<{
  vehicleId: string;
  vehicleName: string | null;
  vehicleGroup?: Readonly<{ id: string; name: string }> | null;
  shellGeneratedAt: string | null;
  initialData: TripAnalysisResponse | null;
  initialRange: VehicleTrackRange;
  initialPreset: TripAnalysisPreset | null;
  initialOpenEnded: boolean;
  initialError: boolean;
  timezone: string;
}>;

function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel): void {
  const camera = vehicleTrackCamera(model, null);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
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

export function VehicleTripsClient({ vehicleId, vehicleName, vehicleGroup, shellGeneratedAt, initialData, initialRange, initialPreset, initialOpenEnded, initialError, timezone }: Props) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const [analysis, setAnalysis] = useState(initialData);
  const [range, setRange] = useState(initialRange);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(initialError);
  const [interaction, setInteraction] = useState(initialTripAnalysisInteractionState);
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
  const timeline = useMemo(() => analysis ? buildTripAnalysisTimeline(analysis) : [], [analysis]);

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
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      ensureTripMapLayers(map, model);
      updateTripMapData(map, model);
      applyCamera(map, model);
      map.resize();
    }
  }, [model]);

  const loadAnalysis = useCallback(async (nextRange: VehicleTrackRange, nextPreset: TripAnalysisPreset | null, nextOpenEnded: boolean, collapseEditor: boolean) => {
    analysisController.current?.abort();
    trackController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    setLoading(true);
    setAnalysisError(false);
    setInteraction(clearTripAnalysisInteraction());
    setTrackLoading(false);
    setModel(EMPTY_VEHICLE_TRACK_PRESENTATION);
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
      if (collapseEditor) setEditorOpen(false);
      window.history.replaceState(null, "", `/vehicles/${vehicleId}/trips?${tripAnalysisPageQuery(nextRange, nextOpenEnded)}`);
    } catch {
      if (!controller.signal.aborted) {
        setAnalysis(null);
        setAnalysisError(true);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => () => {
    analysisController.current?.abort();
    trackController.current?.abort();
  }, []);

  const select = useCallback(async (next: TripAnalysisSelection) => {
    trackController.current?.abort();
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
  }, [vehicleId]);

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
      applyCamera(map, modelRef.current);
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
      void loadAnalysis(next, preset, false, true);
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
    void loadAnalysis(parsed.range, null, openEnded, true);
  };
  const refresh = () => {
    const next = appliedOpenEnded ? refreshOpenEndedTripAnalysisRange(range, new Date()) : range;
    if (!next) {
      setFormError(vehicleTrackCustomRangeErrorCopy("TOO_LONG", locale));
      setEditorOpen(true);
      return;
    }
    setFormError(null);
    void loadAnalysis(next, appliedPreset, appliedOpenEnded, false);
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

      {analysis && !noObservations ? <section className="vehicle-trips__workspace">
        <section className="vehicle-trips__timeline-pane" aria-label={t("trips.timeline.label")}>
          <header className="vehicle-trips__workspace-header"><TripSectionTitle icon={<CalendarOutlined />} title={t("trips.timeline.title")} /></header>
          <div className="vehicle-trips__timeline-content">
            {timeline.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("trips.timeline.empty")} /> : <ol className="vehicle-trips__timeline">
              {timeline.map((item, index) => <TripTimelineRecord key={item.key} item={item} selected={selection?.key === item.key} connected={index < timeline.length - 1} onSelect={select} />)}
            </ol>}
          </div>
        </section>
        <section className="vehicle-trips__map-pane" aria-label={t("trips.map.label")}>
          <header className="vehicle-trips__workspace-header">
            <TripSectionTitle icon={<EnvironmentOutlined />} title={t("trips.map.title")} />
            <Popover trigger="click" placement="bottomRight" content={<TripMapLegend />}>
              <Button size="large" type="default" icon={<InfoCircleOutlined aria-hidden />}>{t("map.legend.label")}</Button>
            </Popover>
          </header>
          <div className="vehicle-trips__map-content">
            <div className="map-shell vehicle-trips__map-surface" aria-label={t("trips.map.label")}>
              <div ref={setMapContainer} className="fleet-map-canvas vehicle-trips__map-canvas" />
              {!selection ? <div className="map-empty vehicle-trips__map-empty">{t("trips.map.select")}</div> : null}
              {trackLoading ? <div className="map-empty vehicle-trips__map-empty">{t("trips.map.loading")}</div> : null}
              {interaction.trackError ? <div className="map-empty vehicle-trips__map-empty vehicle-trips__map-error">{t("trips.map.trackError")}</div> : null}
            </div>
            {styleError ? <Alert className="vehicle-trips__map-notice" type="error" showIcon title={t("map.basemapError")} /> : null}
            {selection?.kind === "STOP" ? <Text className="vehicle-trips__stop-disclaimer" type="secondary">{t("trips.map.stopDisclaimer")}</Text> : null}
          </div>
        </section>
      </section> : null}
    </div>
  </VehicleDetailShell>;
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

function TripLegendSwatch({ kind }: Readonly<{ kind: "route" | "observation" | "warning" | "start" | "end" | "stop" }>) {
  return <i className={`vehicle-trips__legend-sample vehicle-trips__legend-sample--${kind}`} aria-hidden />;
}

function TripMapLegend() {
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
