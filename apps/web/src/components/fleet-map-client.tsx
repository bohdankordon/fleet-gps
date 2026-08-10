"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { CityGeofenceMapResponse } from "@/lib/city-geofence/city-geofence-contract";
import { ensureCityGeofenceLayers } from "@/lib/city-geofence/city-geofence-map";
import { fleetMapInitialCamera } from "@/lib/fleet-map/fleet-map-camera";
import { initialFleetMapBasemapState, recordFleetMapBasemapError, recordFleetMapBasemapLoad } from "@/lib/fleet-map/fleet-map-basemap-state";
import { parseFleetMapResponse, type FleetMapResponse, type FleetMapVehicle } from "@/lib/fleet-map/fleet-map-contract";
import { formatFleetMapAge, formatFleetMapTimestamp } from "@/lib/fleet-map/fleet-map-formatters";
import { reconcileFleetMapSelection, selectedFleetMapVehicle } from "@/lib/fleet-map/fleet-map-selection";
import { fleetMapStyleUrl } from "@/lib/fleet-map/fleet-map-style";
import { createFleetMapAfterWorkerBootstrap, type FleetMapWorkerBootstrapState } from "@/lib/fleet-map/fleet-map-worker-bootstrap";
import { parseOpenAlertMapResponse, type OpenAlertMapAlert, type OpenAlertMapResponse } from "@/lib/open-alert-map/open-alert-map-contract";
import { activeAlertDetails } from "@/lib/open-alert-map/open-alert-map-formatters";
import { FLEET_MAP_SELECTED_LAYER_ID, FLEET_MAP_SOURCE_ID, FLEET_MAP_VEHICLE_LAYER_ID, ensureFleetAlertMapLayers } from "@/lib/open-alert-map/open-alert-map-layers";
import { alertsForFleetVehicle, fleetAlertMapToGeoJson, joinFleetOpenAlerts } from "@/lib/open-alert-map/open-alert-map-model";
import { abortCoordinatedMapRefresh, beginCoordinatedMapRefresh, initialCoordinatedMapRefreshState, settleCoordinatedMapRefresh, type MapRefreshResult } from "@/lib/open-alert-map/open-alert-map-refresh-state";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const mapLibreWorkerBootstrapState: FleetMapWorkerBootstrapState = { configured: false };

type Props = Readonly<{
  initialSnapshot: FleetMapResponse;
  initialGeofence: CityGeofenceMapResponse | null;
  initialGeofenceUnavailable: boolean;
  initialAlerts: OpenAlertMapResponse | null;
  initialAlertsUnavailable: boolean;
}>;

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

function freshnessLabel(value: "FRESH" | "STALE"): string { return value === "FRESH" ? "Свежая позиция" : "Устаревшая позиция"; }
function formatSpeed(value: number | null): string { return value === null ? "—" : `${value.toFixed(1)} км/ч`; }

export function FleetMapClient({ initialSnapshot, initialGeofence, initialGeofenceUnavailable, initialAlerts, initialAlertsUnavailable }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [alertError, setAlertError] = useState(initialAlertsUnavailable);
  const [styleError, setStyleError] = useState(false);
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
      setSelectedId((current) => reconcileFleetMapSelection(settled.fleet, current));
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
    const onLoad = () => {
      basemapStateRef.current = recordFleetMapBasemapLoad();
      setStyleError(false);
      ensureCityGeofenceLayers(map, geofenceRef.current);
      const model = joinFleetOpenAlerts(snapshotRef.current, alertsRef.current);
      ensureFleetAlertMapLayers(map, fleetAlertMapToGeoJson(model), selectedRef.current);
      updateMapData(map, snapshotRef.current, alertsRef.current, selectedRef.current);
      if (!initialFitRef.current) {
        initialFitRef.current = true;
        applyInitialCamera(map, snapshotRef.current, geofenceRef.current);
      }
    };
    const onClick = (event: maplibregl.MapLayerMouseEvent) => {
      const vehicleId = event.features?.[0]?.properties?.vehicleId;
      if (typeof vehicleId === "string") setSelectedId(vehicleId);
    };
    const onError = () => {
      basemapStateRef.current = recordFleetMapBasemapError(basemapStateRef.current);
      setStyleError(basemapStateRef.current.error);
    };
    map.on("load", onLoad);
    map.on("click", FLEET_MAP_VEHICLE_LAYER_ID, onClick);
    map.on("error", onError);
    return () => {
      map.off("load", onLoad);
      map.off("click", FLEET_MAP_VEHICLE_LAYER_ID, onClick);
      map.off("error", onError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
    alertsRef.current = alerts;
    selectedRef.current = selectedId;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) updateMapData(map, snapshot, alerts, selectedId);
  }, [snapshot, alerts, selectedId]);

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

  const model = joinFleetOpenAlerts(snapshot, alerts);
  const selected = selectedFleetMapVehicle(snapshot, selectedId);
  const selectedAlerts = alertsForFleetVehicle(model, selectedId);

  return <>
    <header className="hero">
      <p className="eyebrow">Текущий snapshot автопарка</p>
      <h1>Карта</h1>
      <p>Позиции автомобилей из локального persisted состояния.</p>
      <div className="metadata"><span>Сформировано: <strong>{formatFleetMapTimestamp(snapshot.generatedAt)}</strong></span><span>Порог свежести: <strong>{snapshot.positionFreshnessSeconds} сек</strong></span></div>
    </header>
    <section className="map-summary" aria-label="Сводка карты"><Summary snapshot={snapshot} /><button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Обновление…" : "Обновить"}</button></section>
    {alerts && <AlertSummary model={model} />}
    <div className="map-legend" aria-label="Легенда">
      <span><i className="map-dot map-dot-fresh" />Свежая позиция</span>
      <span><i className="map-dot map-dot-stale" />Устаревшая позиция</span>
      <span><i className="map-alert-ring map-alert-ring-speeding" />Превышение скорости</span>
      <span><i className="map-alert-ring map-alert-ring-inactivity" />Неактивность</span>
      <span><i className="map-boundary-line" />Граница города</span>
    </div>
    <p className="map-alert-position-note">Индикатор активного события показан у текущей позиции автомобиля, а не в месте возникновения события.</p>
    {initialGeofenceUnavailable && <p className="map-geofence-status" role="alert" data-city-geofence-state="unavailable">Граница города недоступна</p>}
    {!initialGeofenceUnavailable && !initialGeofence?.configured && <p className="map-geofence-status" data-city-geofence-state="unconfigured">Граница города не настроена</p>}
    {initialGeofence?.configured && <span className="sr-only" data-city-geofence-state="configured">Граница города настроена</span>}
    {refreshing && <p className="refresh" aria-live="polite">Обновление данных карты…</p>}
    {refreshError && <section className="notice" role="alert"><span>⚠</span><div><strong>Не удалось обновить карту</strong><span>Показан последний успешный fleet snapshot.</span></div></section>}
    {alertError && <section className="notice" role="alert"><span>⚠</span><div><strong>Активные события недоступны</strong><span>{alerts ? "Показано последнее успешное состояние событий." : "Карта автомобилей продолжает работать."}</span></div></section>}
    {styleError && <section className="notice" role="alert"><span>⚠</span><div><strong>Не удалось загрузить базовую карту</strong><span>Данные автопарка доступны, повторите попытку позже.</span></div></section>}
    <section className="map-shell" aria-label="Интерактивная карта автопарка"><div ref={containerRef} className="fleet-map-canvas" data-fleet-map-container="true" />{snapshot.summary.withPosition === 0 && <div className="map-empty">Нет автомобилей с доступной позицией.</div>}</section>
    <SelectedVehicle vehicle={selected} alerts={selectedAlerts} generatedAt={snapshot.generatedAt} />
  </>;
}

function Summary({ snapshot }: Readonly<{ snapshot: FleetMapResponse }>) {
  const values = [["Всего автомобилей", snapshot.summary.totalVehicles], ["На карте", snapshot.summary.withPosition], ["Свежие", snapshot.summary.fresh], ["Устаревшие", snapshot.summary.stale], ["Без позиции", snapshot.summary.withoutPosition]] as const;
  return <>{values.map(([label, value]) => <article className="map-summary-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}{snapshot.summary.invalidPosition > 0 && <p className="map-warning">Некорректных позиций: {snapshot.summary.invalidPosition}</p>}</>;
}

function AlertSummary({ model }: Readonly<{ model: ReturnType<typeof joinFleetOpenAlerts> }>) {
  return <section className="map-alert-summary" aria-label="Сводка активных событий" data-open-alert-summary="true">
    <span>Активных событий: <strong>{model.summary.totalOpenAlerts}</strong></span>
    <span>Машин с событиями: <strong>{model.summary.vehiclesWithOpenAlerts}</strong></span>
    <span>Превышение скорости: <strong>{model.summary.speeding}</strong></span>
    <span>Неактивность: <strong>{model.summary.inactivity}</strong></span>
    <span>Видно на карте: <strong>{model.summary.visibleVehiclesWithOpenAlerts}</strong></span>
    <span>Без позиции: <strong>{model.summary.vehiclesWithoutMapPosition}</strong></span>
  </section>;
}

function SelectedVehicle({ vehicle, alerts, generatedAt }: Readonly<{ vehicle: FleetMapVehicle | null; alerts: readonly OpenAlertMapAlert[]; generatedAt: string }>) {
  if (!vehicle) return <section className="map-details" aria-live="polite"><h2>Автомобиль не выбран</h2><p>Выберите точку на карте, чтобы увидеть её состояние.</p></section>;
  const active = activeAlertDetails(alerts);
  return <section className="map-details" aria-live="polite">
    <h2>{vehicle.vehicle.name}</h2>
    <dl><div><dt>Состояние</dt><dd>{freshnessLabel(vehicle.freshness)}</dd></div><div><dt>Скорость</dt><dd>{formatSpeed(vehicle.speedKph)}</dd></div><div><dt>Время позиции</dt><dd>{formatFleetMapTimestamp(vehicle.position.observedAt)}</dd></div><div><dt>Возраст</dt><dd>{formatFleetMapAge(vehicle.position.observedAt, generatedAt)}</dd></div></dl>
    <div className="map-active-alerts"><h3>Активные события</h3>{active.length === 0 ? <p>Нет</p> : <ul>{active.map((alert) => <li key={alert.type}><strong>{alert.label}</strong><span>Открыто: {formatFleetMapTimestamp(alert.openedAt)}</span></li>)}</ul>}<Link href="/events?status=OPEN">Открыть события</Link></div>
  </section>;
}
