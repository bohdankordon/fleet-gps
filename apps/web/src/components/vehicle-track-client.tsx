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
import { parseVehicleTrackResponse, type VehicleTrackResponse } from "@/lib/vehicle-track/vehicle-track-contract";
import { vehicleTrackCamera, shouldFitVehicleTrackCamera } from "@/lib/vehicle-track/vehicle-track-camera";
import { formatVehicleTrackSpeed, formatVehicleTrackTimestamp, vehicleTrackQualityLabels } from "@/lib/vehicle-track/vehicle-track-formatters";
import { ensureVehicleTrackLayers, updateVehicleTrackMapData, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, VEHICLE_TRACK_WARNING_POINT_LAYER_ID } from "@/lib/vehicle-track/vehicle-track-layers";
import { buildVehicleTrackPresentation, EMPTY_VEHICLE_TRACK_PRESENTATION, VehicleTrackPresentationError, type VehicleTrackPresentationModel } from "@/lib/vehicle-track/vehicle-track-presentation";
import { createVehicleTrackPresetRange, VEHICLE_TRACK_PRESETS, vehicleTrackRangeKey, type VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { abortVehicleTrackRequest, beginVehicleTrackRequest, failVehicleTrackRequest, initialVehicleTrackRequestState, succeedVehicleTrackRequest, type VehicleTrackLoadError } from "@/lib/vehicle-track/vehicle-track-request-state";
import { reconcileVehicleTrackSelection, selectedVehicleTrackPoint } from "@/lib/vehicle-track/vehicle-track-selection";

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const workerState: FleetMapWorkerBootstrapState = { configured: false };
type Props = Readonly<{ vehicleId: string; initialData: VehicleTrackResponse | null; initialRange: VehicleTrackRange | null; initialError: VehicleTrackLoadError; initialGeofence: CityGeofenceMapResponse | null; initialGeofenceUnavailable: boolean }>;

function applyCamera(map: MapLibreMap, model: VehicleTrackPresentationModel, geofence: CityGeofenceMapResponse | null): void {
  const camera = vehicleTrackCamera(model, geofence);
  if ("bounds" in camera) map.fitBounds(camera.bounds as [[number, number], [number, number]], { padding: camera.padding, maxZoom: camera.maxZoom, duration: 0 });
  else map.jumpTo({ center: camera.center as [number, number], zoom: camera.zoom });
}

function errorCopy(error: VehicleTrackLoadError, hasData: boolean): readonly [string, string] | null {
  if (!error) return null;
  if (error === "TOO_DENSE") return ["Слишком много точек для выбранного периода", hasData ? "Выберите меньший период. На карте показан последний успешно загруженный трек." : "Выберите меньший период."];
  if (error === "INVALID_RANGE") return ["Некорректный период", "Укажите обе абсолютные границы периода или выберите готовый интервал."];
  if (error === "NOT_FOUND") return ["Автомобиль не найден", "Проверьте ссылку или вернитесь к автопарку."];
  if (error === "MALFORMED") return ["Трек временно недоступен", "Сервер вернул некорректный формат данных."];
  return ["Не удалось загрузить трек", hasData ? "Показаны последние успешно полученные данные." : "Повторите попытку позже или выберите другой период."];
}

function responseError(response: Response): Exclude<VehicleTrackLoadError, null> { return response.status === 400 ? "INVALID_RANGE" : response.status === 404 ? "NOT_FOUND" : response.status === 422 ? "TOO_DENSE" : response.status === 502 ? "MALFORMED" : "UNAVAILABLE"; }

export function VehicleTrackClient({ vehicleId, initialData, initialRange, initialError, initialGeofence, initialGeofenceUnavailable }: Props) {
  const [state, setState] = useState(() => initialVehicleTrackRequestState(initialData, initialRange, initialError));
  const [selectedKey, setSelectedKey] = useState<string | null>(null); const [styleError, setStyleError] = useState(false);
  const stateRef = useRef(state); const selectedRef = useRef(selectedKey); const containerRef = useRef<HTMLDivElement | null>(null); const mapRef = useRef<MapLibreMap | null>(null);
  const activeRef = useRef(false); const controllerRef = useRef<AbortController | null>(null); const generationRef = useRef(0); const initialCameraAppliedRef = useRef(false); const fitOnNextDataRef = useRef(false);
  const basemapStateRef = useRef(initialFleetMapBasemapState());
  const model = useMemo(() => state.data ? buildVehicleTrackPresentation(state.data) : EMPTY_VEHICLE_TRACK_PRESENTATION, [state.data]);
  const modelRef = useRef(model); const geofenceRef = useRef(initialGeofence);
  useEffect(() => { stateRef.current = state; }, [state]); useEffect(() => { selectedRef.current = selectedKey; }, [selectedKey]);

  const load = useCallback(async (range: VehicleTrackRange, explicitRangeChange: boolean): Promise<void> => {
    if (activeRef.current) return;
    const current = stateRef.current; const rangeChanged = explicitRangeChange && (!current.data || vehicleTrackRangeKey(current.data.range) !== vehicleTrackRangeKey(range));
    const begun = beginVehicleTrackRequest(current, range, rangeChanged); if (begun === current) return;
    stateRef.current = begun; setState(begun); activeRef.current = true; generationRef.current = begun.generation;
    const generation = begun.generation; const controller = new AbortController(); controllerRef.current = controller;
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const response = await fetch(`/api/vehicles/${vehicleId}/track?${query.toString()}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw Object.assign(new Error("track request"), { trackError: responseError(response) });
      const data = parseVehicleTrackResponse(await response.json()); const nextModel = buildVehicleTrackPresentation(data);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const previousModel = modelRef.current; const sameRange = current.data !== null && vehicleTrackRangeKey(current.data.range) === vehicleTrackRangeKey(data.range);
      setSelectedKey((key) => reconcileVehicleTrackSelection(previousModel, nextModel, key, sameRange));
      fitOnNextDataRef.current = rangeChanged; const next = succeedVehicleTrackRequest(stateRef.current, generation, data); stateRef.current = next; setState(next);
      window.history.replaceState(null, "", `/vehicles/${vehicleId}/track?${query.toString()}`);
    } catch (error) {
      if (!controller.signal.aborted && generation === generationRef.current) {
        const kind: Exclude<VehicleTrackLoadError, null> = error instanceof VehicleTrackPresentationError ? "MALFORMED" : typeof error === "object" && error !== null && "trackError" in error ? (error as { trackError: Exclude<VehicleTrackLoadError, null> }).trackError : "UNAVAILABLE";
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

  const selected = selectedVehicleTrackPoint(model, selectedKey); const error = errorCopy(state.error, state.data !== null);
  const choosePreset = (hours: 1 | 6 | 24) => { const range = createVehicleTrackPresetRange(hours, new Date()); if (range) void load(range, true); };
  return <>
    <header className="hero track-hero"><p className="eyebrow">История движения</p><h1>{state.data?.vehicle.name ?? "Трек автомобиля"}</h1><p>Реальные сохранённые GPS-наблюдения за ограниченный период.</p><div className="metadata"><Link href={`/vehicles/${vehicleId}`}>Назад к карточке</Link><Link href="/map">Открыть текущую карту</Link></div></header>
    <section className="track-controls" aria-label="Выбор периода"><div className="track-presets">{VEHICLE_TRACK_PRESETS.map((preset) => <button type="button" onClick={() => choosePreset(preset.hours)} disabled={state.loading} key={preset.hours}>{preset.label}</button>)}</div><button type="button" className="track-refresh" onClick={() => state.range && void load(state.range, false)} disabled={state.loading || !state.range}>{state.loading ? "Загрузка…" : "Обновить текущий период"}</button><div className="track-range"><span>От: <strong>{formatVehicleTrackTimestamp(state.range?.from ?? null)}</strong></span><span>До: <strong>{formatVehicleTrackTimestamp(state.range?.to ?? null)}</strong></span></div></section>
    {state.loading && <p className="refresh" aria-live="polite">Загрузка исторического трека…</p>}
    {error && <section className="notice" role="alert"><span>⚠</span><div><strong>{error[0]}</strong><span>{error[1]}</span></div></section>}
    {initialGeofenceUnavailable && <p className="map-geofence-status" role="alert">Граница города недоступна; трек продолжает работать.</p>}
    {styleError && <section className="notice" role="alert"><span>⚠</span><div><strong>Не удалось загрузить базовую карту</strong><span>Данные трека остаются доступны в сводке.</span></div></section>}
    <section className="track-summary" aria-label="Сводка трека"><article><span>Точек</span><strong>{state.data?.summary.pointCount ?? 0}</strong></article><article><span>Начало</span><strong>{formatVehicleTrackTimestamp(state.data?.summary.firstObservedAt ?? null)}</strong></article><article><span>Конец</span><strong>{formatVehicleTrackTimestamp(state.data?.summary.lastObservedAt ?? null)}</strong></article><article><span>Разрывов &gt;5 мин</span><strong>{model.gapCount}</strong></article></section>
    <div className="track-legend" aria-label="Легенда трека"><span><i className="track-legend-line" />Сохранённая последовательность</span><span><i className="track-legend-point" />GPS-наблюдение</span><span><i className="track-legend-warning" />Предупреждение качества</span><span><i className="track-legend-start" />Начало</span><span><i className="track-legend-end" />Конец</span></div>
    {model.points.length === 1 && <p className="track-single-point">Единственная точка: начало и конец совпадают.</p>}
    <p className="track-disclaimer">Трек построен только по сохранённым GPS-наблюдениям. Разрывы не интерполируются. Линия прерывается, если между сохранёнными GPS-точками более 5 минут.</p>
    <section className="map-shell track-map-shell" aria-label="Карта исторического трека"><div ref={containerRef} className="fleet-map-canvas track-map-canvas" data-vehicle-track-map="true" />{state.data && state.data.points.length === 0 && <div className="map-empty">За выбранный период сохранённых GPS-точек нет.</div>}</section>
    <section className="map-details track-point-details" aria-live="polite"><h2>{selected ? selected.endpoint === "single" ? "Единственная точка" : "Выбранное наблюдение" : "Наблюдение не выбрано"}</h2>{selected ? <dl><div><dt>Время</dt><dd>{formatVehicleTrackTimestamp(selected.point.observedAt)}</dd></div><div><dt>Скорость</dt><dd>{formatVehicleTrackSpeed(selected.point.speedKph)}</dd></div><div><dt>Качество позиции</dt><dd>{vehicleTrackQualityLabels(selected.point.valid, selected.point.outdated).map((label) => <span key={label}>{label}</span>)}</dd></div></dl> : <p>Выберите GPS-точку на карте, чтобы увидеть время, скорость и качество позиции.</p>}</section>
  </>;
}
