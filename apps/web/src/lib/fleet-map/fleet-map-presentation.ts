export const FLEET_MAP_PRESENTATION = Object.freeze({
  fresh: "#17734d",
  stale: "#9a6110",
  speeding: "#c43d32",
  inactivity: "#64748b",
  selected: "#1677ff",
  markerOutline: "#ffffff",
  boundary: "#2f7f9f",
  baseRadius: 6,
  speedingRadius: 11,
  inactivityDiameter: 28,
  selectedRadius: 16,
  hitRadius: 18,
  hoverScale: 1.12,
  boundaryLineWidth: 2,
  boundaryLineOpacity: 0.7,
  boundaryFillOpacity: 0.04,
} as const);

export const FLEET_MAP_INACTIVITY_IMAGE_ID = "fleet-inactivity-ring";

export type FleetMapInactivityRingImage = Readonly<{
  image: ImageData;
  pixelRatio: number;
}>;

export function createFleetMapInactivityRingImage(devicePixelRatio: number): FleetMapInactivityRingImage {
  const logicalSize = FLEET_MAP_PRESENTATION.inactivityDiameter;
  const requestedPixelRatio = Math.min(3, Math.max(1, devicePixelRatio));
  const physicalSize = Math.round(logicalSize * requestedPixelRatio);
  const pixelRatio = physicalSize / logicalSize;
  const canvas = document.createElement("canvas");
  canvas.width = physicalSize;
  canvas.height = physicalSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the Map inactivity marker image.");

  context.scale(pixelRatio, pixelRatio);
  context.strokeStyle = FLEET_MAP_PRESENTATION.inactivity;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.setLineDash([3, 2.5]);
  context.beginPath();
  context.arc(logicalSize / 2, logicalSize / 2, logicalSize / 2 - 2, 0, Math.PI * 2);
  context.stroke();

  return { image: context.getImageData(0, 0, physicalSize, physicalSize), pixelRatio };
}
