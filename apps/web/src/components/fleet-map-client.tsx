"use client";

import { AlertFilled, AimOutlined, CarFilled, CarOutlined, CloseOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, AutoComplete, Badge, Button, Card, Col, Descriptions, Divider, Drawer, Empty, Flex, Grid, Input, Popover, Row, Space, Spin, Tag, Typography, theme } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/components/auth-provider";
import { StableLoadingButton } from "@/components/stable-loading-button";
import { hasPermission } from "@/lib/auth/auth-contract";
import type { CityGeofenceMapResponse } from "@/lib/city-geofence/city-geofence-contract";
import { ensureCityGeofenceLayers } from "@/lib/city-geofence/city-geofence-map";
import { initialFleetMapBasemapState, recordFleetMapBasemapError, recordFleetMapBasemapLoad } from "@/lib/fleet-map/fleet-map-basemap-state";
import { fleetMapInitialCamera } from "@/lib/fleet-map/fleet-map-camera";
import { parseFleetMapResponse, type FleetMapResponse, type FleetMapVehicle } from "@/lib/fleet-map/fleet-map-contract";
import { formatFleetMapAge, formatFleetMapTimestamp } from "@/lib/fleet-map/fleet-map-formatters";
import { selectNearestMapFeature, updateFleetMapHoverState, type FleetMapFeatureId, type FleetMapHoverCandidate } from "@/lib/fleet-map/fleet-map-hover-target";
import { createFleetMapInactivityRingImage, FLEET_MAP_PRESENTATION } from "@/lib/fleet-map/fleet-map-presentation";
import { fleetMapSearchOptions } from "@/lib/fleet-map/fleet-map-search";
import { clearFleetMapSelection, initialFleetMapSelectionState, reconcileFleetMapSelection, selectFleetMapVehicle, selectedFleetMapVehicle } from "@/lib/fleet-map/fleet-map-selection";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { parseOpenAlertMapResponse, type OpenAlertMapAlert, type OpenAlertMapResponse } from "@/lib/open-alert-map/open-alert-map-contract";
import { activeAlertDetails } from "@/lib/open-alert-map/open-alert-map-formatters";
import { FLEET_MAP_HIT_LAYER_ID, FLEET_MAP_SELECTED_LAYER_ID, FLEET_MAP_SOURCE_ID, ensureFleetAlertMapLayers } from "@/lib/open-alert-map/open-alert-map-layers";
import { alertsForFleetVehicle, fleetAlertMapToGeoJson, joinFleetOpenAlerts } from "@/lib/open-alert-map/open-alert-map-model";
import { abortCoordinatedMapRefresh, beginCoordinatedMapRefresh, initialCoordinatedMapRefreshState, settleCoordinatedMapRefresh, type MapRefreshResult } from "@/lib/open-alert-map/open-alert-map-refresh-state";
import { useI18n } from "../i18n/client";
import { formatNumber } from "../i18n/formatting";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const mapLibreWorkerBootstrapState: FleetMapWorkerBootstrapState = { configured: false };
const { Text, Title } = Typography;

type Props = Readonly<{
  initialSnapshot: FleetMapResponse;
  initialGeofence: CityGeofenceMapResponse | null;
  initialGeofenceUnavailable: boolean;
  initialAlerts: OpenAlertMapResponse | null;
  initialAlertsUnavailable: boolean;
}>;

type SummaryMetric = Readonly<{ label: string; value: number | string; status: "success" | "warning" | "error" | "default" }>;

function updateMapData(map: MapLibreMap, fleet: FleetMapResponse, alerts: OpenAlertMapResponse | null, selectedId: string | null): void {
  const source = map.getSource(FLEET_MAP_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  source.setData(fleetAlertMapToGeoJson(joinFleetOpenAlerts(fleet, alerts)));
  map.setFilter(FLEET_MAP_SELECTED_LAYER_ID, ["==", ["get", "vehicleId"], selectedId ?? "__none__"]);
}

function applyInitialCamera(map: MapLibreMap, snapshot: FleetMapResponse, geofence: CityGeofenceMapResponse | null): void {
  const camera = fleetMapInitialCamera(snapshot, geofence);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
}

function MapSearchPopup({ children }: Readonly<{ children: ReactNode }>) {
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    const containWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      boundary.scrollTop += event.deltaY;
    };
    boundary.addEventListener("wheel", containWheel, { capture: true, passive: false });
    return () => boundary.removeEventListener("wheel", containWheel, { capture: true });
  }, []);
  return <div ref={boundaryRef} className="map-search-popup__boundary">{children}</div>;
}

export function FleetMapClient({ initialSnapshot, initialGeofence, initialGeofenceUnavailable, initialAlerts, initialAlertsUnavailable }: Props) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const desktopInspector = Boolean(screens.lg);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selection, setSelection] = useState(initialFleetMapSelectionState);
  const selectedId = selection.selectedVehicleId;
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [alertError, setAlertError] = useState(initialAlertsUnavailable);
  const [styleError, setStyleError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const snapshotRef = useRef(snapshot);
  const alertsRef = useRef(alerts);
  const selectedRef = useRef(selectedId);
  const geofenceRef = useRef(initialGeofence);
  const basemapStateRef = useRef(initialFleetMapBasemapState());
  const initialFitRef = useRef(false);
  const activeRequestRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const requestStateRef = useRef(initialCoordinatedMapRefreshState(initialSnapshot, initialAlerts, initialAlertsUnavailable));

  const chooseVehicle = useCallback((vehicleId: string): void => {
    const vehicle = snapshotRef.current.vehicles.find((item) => item.vehicle.id === vehicleId);
    if (!vehicle) return;
    setSelection((current) => selectFleetMapVehicle(snapshotRef.current, current, vehicleId));
    setSearchQuery(vehicle.vehicle.name);
  }, []);

  const clearSelection = useCallback((): void => {
    setSelection(clearFleetMapSelection);
    setSearchQuery("");
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (activeRequestRef.current) return;
    const begun = beginCoordinatedMapRefresh(requestStateRef.current);
    if (begun === requestStateRef.current) return;
    requestStateRef.current = begun;
    activeRequestRef.current = true;
    const generation = begun.generation;
    generationRef.current = generation;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRefreshing(true);
    const request = async <T,>(url: string, parse: (value: unknown) => T): Promise<T> => {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Map refresh failed.");
      return parse(await response.json());
    };
    try {
      const [fleetResult, alertResult] = await Promise.allSettled([
        request("/api/fleet/map", parseFleetMapResponse),
        request("/api/alert-events/map", parseOpenAlertMapResponse),
      ]);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const fleetOutcome: MapRefreshResult<FleetMapResponse> = fleetResult.status === "fulfilled" ? { ok: true, value: fleetResult.value } : { ok: false };
      const alertOutcome: MapRefreshResult<OpenAlertMapResponse> = alertResult.status === "fulfilled" ? { ok: true, value: alertResult.value } : { ok: false };
      const settled = settleCoordinatedMapRefresh(requestStateRef.current, generation, fleetOutcome, alertOutcome);
      requestStateRef.current = settled;
      setSnapshot(settled.fleet);
      setAlerts(settled.alerts);
      const reconciledSelection = reconcileFleetMapSelection(settled.fleet, selectedRef.current);
      if (selectedRef.current !== null && reconciledSelection === null) setSearchQuery("");
      setSelection((current) => ({ ...current, selectedVehicleId: reconciledSelection }));
      setRefreshError(settled.fleetError);
      setAlertError(settled.alertError);
    } finally {
      if (generation === generationRef.current) {
        activeRequestRef.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = createFleetMapAfterWorkerBootstrap(
      { setWorkerUrl: maplibregl.setWorkerUrl, workerUrl: MAPLIBRE_WORKER_URL, state: mapLibreWorkerBootstrapState },
      () => new maplibregl.Map({ container, style: fleetMapStyleUrl(), pitchWithRotate: false, dragRotate: false }),
    );
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    let hoveredFeatureId: FleetMapFeatureId | null = null;
    const setHoveredFeature = (featureId: FleetMapFeatureId | null) => {
      hoveredFeatureId = updateFleetMapHoverState(map, FLEET_MAP_SOURCE_ID, hoveredFeatureId, featureId);
    };
    const onLoad = () => {
      basemapStateRef.current = recordFleetMapBasemapLoad();
      setStyleError(false);
      setMapReady(true);
      ensureCityGeofenceLayers(map, geofenceRef.current);
      const model = joinFleetOpenAlerts(snapshotRef.current, alertsRef.current);
      const inactivityRing = createFleetMapInactivityRingImage(window.devicePixelRatio);
      ensureFleetAlertMapLayers(map, fleetAlertMapToGeoJson(model), selectedRef.current, inactivityRing);
      updateMapData(map, snapshotRef.current, alertsRef.current, selectedRef.current);
      if (!initialFitRef.current) {
        initialFitRef.current = true;
        applyInitialCamera(map, snapshotRef.current, geofenceRef.current);
      }
    };
    const nearestFeatureId = (event: maplibregl.MapLayerMouseEvent): FleetMapFeatureId | null => {
      const candidates: FleetMapHoverCandidate[] = [];
      for (const feature of event.features ?? []) {
        if ((typeof feature.id !== "string" && typeof feature.id !== "number") || feature.geometry.type !== "Point") continue;
        const [longitude, latitude] = feature.geometry.coordinates;
        if (typeof longitude === "number" && typeof latitude === "number") candidates.push({ id: feature.id, coordinate: [longitude, latitude] });
      }
      return selectNearestMapFeature(candidates, event.point, (coordinate) => map.project(coordinate as [number, number]), FLEET_MAP_PRESENTATION.hitRadius);
    };
    const onClick = (event: maplibregl.MapLayerMouseEvent) => {
      const vehicleId = nearestFeatureId(event);
      if (typeof vehicleId === "string") chooseVehicle(vehicleId);
    };
    const onMouseMove = (event: maplibregl.MapLayerMouseEvent) => {
      const featureId = nearestFeatureId(event);
      setHoveredFeature(featureId);
      map.getCanvas().style.cursor = featureId === null ? "" : "pointer";
    };
    const onMouseLeave = () => { setHoveredFeature(null); map.getCanvas().style.cursor = ""; };
    const onError = () => {
      basemapStateRef.current = recordFleetMapBasemapError(basemapStateRef.current);
      setStyleError(basemapStateRef.current.error);
    };
    map.on("load", onLoad);
    map.on("click", FLEET_MAP_HIT_LAYER_ID, onClick);
    map.on("mousemove", FLEET_MAP_HIT_LAYER_ID, onMouseMove);
    map.on("mouseleave", FLEET_MAP_HIT_LAYER_ID, onMouseLeave);
    map.on("mouseout", onMouseLeave);
    map.on("error", onError);
    return () => {
      map.off("load", onLoad);
      map.off("click", FLEET_MAP_HIT_LAYER_ID, onClick);
      map.off("mousemove", FLEET_MAP_HIT_LAYER_ID, onMouseMove);
      map.off("mouseleave", FLEET_MAP_HIT_LAYER_ID, onMouseLeave);
      map.off("mouseout", onMouseLeave);
      map.off("error", onError);
      if (hoveredFeatureId !== null) setHoveredFeature(null);
      map.remove();
      mapRef.current = null;
    };
  }, [chooseVehicle]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    alertsRef.current = alerts;
    selectedRef.current = selectedId;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) updateMapData(map, snapshot, alerts, selectedId);
  }, [snapshot, alerts, selectedId]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map) return;
      map.resize();
      const vehicle = selectedFleetMapVehicle(snapshotRef.current, selectedId);
      if (vehicle) map.easeTo({ center: [vehicle.position.longitude, vehicle.position.latitude], duration: 300 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desktopInspector, selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    });
    observer.observe(container);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(async () => { await refresh(); if (!cancelled) schedule(); }, 30_000);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      const activeGeneration = requestStateRef.current.generation;
      requestStateRef.current = abortCoordinatedMapRefresh(requestStateRef.current, activeGeneration);
      generationRef.current += 1;
      controllerRef.current?.abort();
      activeRequestRef.current = false;
    };
  }, [refresh]);

  const model = useMemo(() => joinFleetOpenAlerts(snapshot, alerts), [snapshot, alerts]);
  const selected = selectedFleetMapVehicle(snapshot, selectedId);
  const selectedAlerts = alertsForFleetVehicle(model, selectedId);
  const searchOptions = useMemo(() => fleetMapSearchOptions(snapshot, searchQuery), [snapshot, searchQuery]);
  const surfaceStyle = { borderColor: token.colorBorder, borderRadius: token.borderRadiusLG, background: token.colorBgContainer } as const;

  return <div className="map-page">
    <header className="map-page__header">
      <Title level={1} style={{ margin: 0 }}>{t("map.title")}</Title>
      <Text type="secondary">{t("map.description")}</Text>
      <Flex className="map-page__metadata" wrap="wrap" gap="middle">
        <MetadataItem label={t("map.generated")}><time dateTime={snapshot.generatedAt}>{formatFleetMapTimestamp(snapshot.generatedAt, locale)}</time></MetadataItem>
        <MetadataItem label={t("map.freshnessThreshold")}>{formatNumber(locale, snapshot.positionFreshnessSeconds)} {t("unit.secondShort")}</MetadataItem>
      </Flex>
    </header>

    <MapSummary snapshot={snapshot} alerts={alerts} model={model} />

    <section className="map-controls" aria-label={t("map.controls.label")} style={{ ...surfaceStyle, padding: token.paddingSM }}>
      <AutoComplete
        className="map-controls__search"
        classNames={{ popup: { root: "map-search-popup", list: "map-search-popup__list" } }}
        styles={{
          root: { height: token.controlHeightLG },
          input: { minHeight: 0 },
          popup: { list: { maxHeight: "none", overflow: "visible" } },
        }}
        value={searchQuery}
        options={[...searchOptions]}
        filterOption={false}
        onChange={setSearchQuery}
        onSelect={(vehicleId) => chooseVehicle(vehicleId)}
        virtual={false}
        listHeight={Math.max(searchOptions.length, 1) * token.controlHeight}
        popupRender={(menu) => <MapSearchPopup>{menu}</MapSearchPopup>}
        notFoundContent={t("map.search.noResults")}
      >
        <Input
          className="map-controls__search-input"
          classNames={{ clear: "map-controls__search-clear" }}
          size="large"
          styles={{
            root: { height: token.controlHeightLG },
            input: { minHeight: 0 },
            clear: { alignItems: "center", background: "transparent", display: "inline-flex", height: token.controlHeightSM, justifyContent: "center", minHeight: token.controlHeightSM, padding: 0, width: token.controlHeightSM },
          }}
          aria-label={t("map.search.label")}
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder={t("dashboard.filters.searchPlaceholder")}
          onClear={clearSelection}
        />
      </AutoComplete>
      <Popover trigger="click" placement="bottomRight" content={<MapLegend />}>
        <Button size="large" type="default" icon={<InfoCircleOutlined aria-hidden />}>{t("map.legend.label")}</Button>
      </Popover>
      <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={refreshing} icon={<ReloadOutlined />} onClick={() => void refresh()} size="large" type="primary" />
    </section>

    <MapStatus initialGeofence={initialGeofence} initialGeofenceUnavailable={initialGeofenceUnavailable} refreshError={refreshError} alertError={alertError} alerts={alerts} styleError={styleError} />

    <div className={`map-workspace${desktopInspector && selected ? " map-workspace--selected" : ""}`}>
      <section className="map-surface" aria-label={t("map.interactiveLabel")} style={surfaceStyle}>
        <div ref={containerRef} className="fleet-map-canvas map-page__canvas" data-fleet-map-container="true" />
        {!mapReady && !styleError ? <div className="map-overlay map-overlay--loading"><Spin size="large" /><Text type="secondary">{t("map.loading")}</Text></div> : null}
        {snapshot.summary.withPosition === 0 ? <div className="map-overlay"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("map.noPositions")} /></div> : null}
        {snapshot.summary.withPosition > 0 && !selection.hasSelectedVehicle ? <div className="map-selection-helper">{t("map.selectVehicle")}</div> : null}
      </section>
      {desktopInspector && selected ? <VehicleInspector vehicle={selected} alerts={selectedAlerts} generatedAt={snapshot.generatedAt} onClose={clearSelection} /> : null}
    </div>

    {!desktopInspector ? <Drawer open={selected !== null} placement={screens.sm ? "right" : "bottom"} size={screens.sm ? 380 : "72vh"} title={selected ? <VehicleInspectorTitle name={selected.vehicle.name} /> : undefined} closeIcon={<CloseOutlined aria-label={t("map.vehicle.closeDetails")} />} onClose={clearSelection} styles={{ body: { padding: token.paddingLG } }}>
      {selected ? <VehicleInspectorContent vehicle={selected} alerts={selectedAlerts} generatedAt={snapshot.generatedAt} /> : null}
    </Drawer> : null}
  </div>;
}

function MetadataItem({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return <Text type="secondary">{label}: <Text strong>{children}</Text></Text>;
}

function MapSummary({ snapshot, alerts, model }: Readonly<{ snapshot: FleetMapResponse; alerts: OpenAlertMapResponse | null; model: ReturnType<typeof joinFleetOpenAlerts> }>) {
  const { t } = useI18n();
  const alertValue = (value: number): number | string => alerts ? value : "—";
  const eventStatus = (value: number, status: "warning" | "error"): SummaryMetric["status"] => alerts && value > 0 ? status : "default";
  const coverage: readonly SummaryMetric[] = [
    { label: t("map.summary.total"), value: snapshot.summary.totalVehicles, status: "default" },
    { label: t("map.summary.onMap"), value: snapshot.summary.withPosition, status: "success" },
  ];
  const gps: SummaryMetric[] = [
    { label: t("map.summary.fresh"), value: snapshot.summary.fresh, status: "success" },
    { label: t("map.summary.stale"), value: snapshot.summary.stale, status: snapshot.summary.stale > 0 ? "warning" : "default" },
    { label: t("map.summary.withoutPosition"), value: snapshot.summary.withoutPosition, status: "default" },
  ];
  if (snapshot.summary.invalidPosition > 0) gps.push({ label: t("map.summary.invalidPositionsLabel"), value: snapshot.summary.invalidPosition, status: "warning" });
  const events: readonly SummaryMetric[] = [
    { label: t("map.alertSummary.total"), value: alertValue(model.summary.totalOpenAlerts), status: eventStatus(model.summary.totalOpenAlerts, "error") },
    { label: t("map.alertSummary.vehicles"), value: alertValue(model.summary.vehiclesWithOpenAlerts), status: eventStatus(model.summary.vehiclesWithOpenAlerts, "error") },
    { label: t("events.type.SPEEDING"), value: alertValue(model.summary.speeding), status: eventStatus(model.summary.speeding, "error") },
    { label: t("events.type.INACTIVITY"), value: alertValue(model.summary.inactivity), status: eventStatus(model.summary.inactivity, "warning") },
    { label: t("map.alertSummary.visible"), value: alertValue(model.summary.visibleVehiclesWithOpenAlerts), status: "default" },
    { label: t("map.alertSummary.withoutPosition"), value: alertValue(model.summary.vehiclesWithoutMapPosition), status: "default" },
  ];
  return <Row className="map-summary-grid" gutter={[12, 12]} role="region" aria-label={t("map.summary.label")}>
    <Col className="map-summary-grid__column" xs={24} md={12} lg={6}><MapSummaryCard icon={<CarFilled aria-hidden />} title={t("map.summary.coverage")} metrics={coverage} /></Col>
    <Col className="map-summary-grid__column" xs={24} md={12} lg={6}><MapSummaryCard icon={<AimOutlined aria-hidden />} title={t("map.summary.gps")} metrics={gps} /></Col>
    <Col className="map-summary-grid__column map-summary-grid__events" xs={24} lg={12}><MapSummaryCard icon={<AlertFilled aria-hidden />} title={t("map.summary.events")} metrics={events} /></Col>
  </Row>;
}

function MapSummaryCard({ icon, title, metrics }: Readonly<{ icon: ReactNode; title: string; metrics: readonly SummaryMetric[] }>) {
  const { token } = theme.useToken();
  return <Card className="map-summary-group" size="small" title={<Flex align="center" gap="small"><span style={{ color: token.colorPrimary, display: "inline-flex" }}>{icon}</span><span>{title}</span></Flex>} styles={{ root: { borderColor: token.colorBorder }, body: { paddingBlock: token.paddingSM } }}>
    <div className="map-summary-group__metrics">
      {metrics.map((metric) => <Flex key={metric.label} justify="space-between" align="center" gap="small"><Space size="small"><Badge status={metric.status} /><Text type="secondary">{metric.label}:</Text></Space><Text className="map-tabular-value" strong>{metric.value}</Text></Flex>)}
    </div>
  </Card>;
}

function MapLegend() {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const markerPalette = {
    "--map-marker-fresh": FLEET_MAP_PRESENTATION.fresh,
    "--map-marker-stale": FLEET_MAP_PRESENTATION.stale,
    "--map-marker-speeding": FLEET_MAP_PRESENTATION.speeding,
    "--map-marker-inactivity": FLEET_MAP_PRESENTATION.inactivity,
    "--map-marker-selected": FLEET_MAP_PRESENTATION.selected,
    "--map-boundary": FLEET_MAP_PRESENTATION.boundary,
  } as CSSProperties;
  return <div className="map-legend" aria-label={t("map.legend.label")} style={markerPalette}>
    <Flex className="map-legend__header" align="center" gap="small">
      <InfoCircleOutlined aria-hidden style={{ color: token.colorPrimary, fontSize: 16 }} />
      <Text strong>{t("map.legend.label")}</Text>
    </Flex>
    <Divider className="map-legend__divider" style={{ margin: 0 }} />
    <div className="map-legend__items">
      <span><i className="map-marker-sample map-marker-sample--fresh" aria-hidden />{t("map.legend.fresh")}</span>
      <span><i className="map-marker-sample map-marker-sample--stale" aria-hidden />{t("map.legend.stale")}</span>
      <span><i className="map-marker-sample map-marker-sample--speeding" aria-hidden />{t("events.type.SPEEDING")}</span>
      <span><i className="map-marker-sample map-marker-sample--inactivity" aria-hidden />{t("events.type.INACTIVITY")}</span>
      <span><i className="map-marker-sample map-marker-sample--selected" aria-hidden />{t("map.legend.selected")}</span>
      <span><i className="map-boundary-line" aria-hidden />{t("map.legend.cityBoundary")}</span>
    </div>
    <Space className="map-legend__notes" orientation="vertical" size={4}>
      <Text className="map-legend__note" type="secondary">{t("map.legend.inactivityExplanation")}</Text>
      <Text className="map-legend__note" type="secondary">{t("map.legend.selectionExplanation")}</Text>
      <Text className="map-legend__note" type="secondary">{t("map.alertPositionNote")}</Text>
    </Space>
  </div>;
}

function MapStatus({ initialGeofence, initialGeofenceUnavailable, refreshError, alertError, alerts, styleError }: Readonly<{ initialGeofence: CityGeofenceMapResponse | null; initialGeofenceUnavailable: boolean; refreshError: boolean; alertError: boolean; alerts: OpenAlertMapResponse | null; styleError: boolean }>) {
  const { t } = useI18n();
  const geofenceMessage = initialGeofenceUnavailable ? t("map.geofence.unavailable") : !initialGeofence?.configured ? t("map.geofence.unconfigured") : null;
  if (!refreshError && !alertError && !styleError && !geofenceMessage) return <span className="sr-only" data-city-geofence-state="configured">{t("map.geofence.configured")}</span>;
  return <Flex className="map-status" vertical gap="small">
    {geofenceMessage ? <Alert type={initialGeofenceUnavailable ? "warning" : "info"} showIcon message={geofenceMessage} data-city-geofence-state={initialGeofenceUnavailable ? "unavailable" : "unconfigured"} /> : <span className="sr-only" data-city-geofence-state="configured">{t("map.geofence.configured")}</span>}
    {refreshError ? <Alert type="error" showIcon message={t("map.refreshError")} description={t("map.refreshFallback")} /> : null}
    {alertError ? <Alert type="warning" showIcon message={t("map.alertsUnavailable")} description={alerts ? t("map.alertsLastState") : t("map.alertsMapContinues")} /> : null}
    {styleError ? <Alert type="error" showIcon message={t("map.basemapError")} description={t("map.basemapFallback")} /> : null}
  </Flex>;
}

function VehicleInspector({ vehicle, alerts, generatedAt, onClose }: Readonly<{ vehicle: FleetMapVehicle; alerts: readonly OpenAlertMapAlert[]; generatedAt: string; onClose: () => void }>) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const closeButton = <Button type="text" icon={<CloseOutlined aria-hidden />} aria-label={t("map.vehicle.closeDetails")} title={t("map.vehicle.closeDetails")} onClick={onClose} />;
  return <aside className="map-inspector" aria-live="polite" aria-label={vehicle.vehicle.name}><Card title={<VehicleInspectorTitle name={vehicle.vehicle.name} />} extra={closeButton} styles={{ root: { borderColor: token.colorBorder }, body: { padding: token.paddingLG } }}><VehicleInspectorContent vehicle={vehicle} alerts={alerts} generatedAt={generatedAt} /></Card></aside>;
}

function VehicleInspectorTitle({ name }: Readonly<{ name: string }>) {
  const { token } = theme.useToken();
  return <Flex className="map-inspector__title" align="center" gap="small">
    <CarOutlined aria-hidden style={{ color: token.colorTextTertiary, flex: "none" }} />
    <span className="map-inspector__title-name">{name}</span>
  </Flex>;
}

function VehicleInspectorContent({ vehicle, alerts, generatedAt }: Readonly<{ vehicle: FleetMapVehicle; alerts: readonly OpenAlertMapAlert[]; generatedAt: string }>) {
  const { locale, t } = useI18n();
  const auth = useAuth();
  const canOpenVehicle = auth !== null && hasPermission(auth, "vehicles.view");
  const canOpenEvents = auth !== null && hasPermission(auth, "events.view");
  const active = activeAlertDetails(alerts, locale);
  const stateTag = <Tag color={vehicle.freshness === "FRESH" ? "green" : "orange"}>{t(`map.freshness.${vehicle.freshness}`)}</Tag>;
  const activeEvents = active.length === 0 ? <Text>{t("common.no")}</Text> : <Space orientation="vertical" size="small">{active.map((alert) => <div className="map-inspector__event" key={alert.type}><Tag color={alert.type === "SPEEDING" ? "red" : "purple"}>{alert.label}</Tag><Text type="secondary">{t("map.vehicle.opened")} <time dateTime={alert.openedAt}>{formatFleetMapTimestamp(alert.openedAt, locale)}</time></Text></div>)}</Space>;
  const items = [
    { key: "state", label: `${t("map.vehicle.state")}:`, children: stateTag },
    { key: "speed", label: `${t("map.vehicle.speed")}:`, children: vehicle.speedKph === null ? "—" : `${formatNumber(locale, vehicle.speedKph, { maximumFractionDigits: 1 })} ${t("unit.kilometresPerHour")}` },
    { key: "positionTime", label: `${t("map.vehicle.positionTime")}:`, children: <time dateTime={vehicle.position.observedAt}>{formatFleetMapTimestamp(vehicle.position.observedAt, locale)}</time> },
    { key: "age", label: `${t("map.vehicle.age")}:`, children: formatFleetMapAge(vehicle.position.observedAt, generatedAt, locale) },
    { key: "events", label: `${t("map.vehicle.activeEvents")}:`, children: activeEvents },
  ];
  return <Flex className="map-inspector__content" vertical gap="large">
    <Descriptions className="map-inspector__descriptions" size="small" column={1} colon={false} items={items} styles={{ label: { width: "44%" }, content: { fontVariantNumeric: "tabular-nums" } }} />
    <Flex className="map-inspector__actions" vertical gap="small">
      {canOpenVehicle ? <Button block type="primary" href={`/vehicles/${vehicle.vehicle.id}`}>{t("map.vehicle.openCard")}</Button> : null}
      {canOpenEvents ? <Button block type="default" href="/events?status=OPEN">{t("map.vehicle.openEvents")}</Button> : null}
    </Flex>
  </Flex>;
}
