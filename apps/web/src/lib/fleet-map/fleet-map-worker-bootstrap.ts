export type FleetMapWorkerBootstrapState = { configured: boolean };
export type FleetMapWorkerBootstrap = Readonly<{
  setWorkerUrl: (workerUrl: string) => void;
  workerUrl: string;
  state: FleetMapWorkerBootstrapState;
}>;

export function configureFleetMapWorkerOnce({ setWorkerUrl, workerUrl, state }: FleetMapWorkerBootstrap): void {
  if (state.configured) return;
  setWorkerUrl(workerUrl);
  state.configured = true;
}

export function createFleetMapAfterWorkerBootstrap<T>(bootstrap: FleetMapWorkerBootstrap, createMap: () => T): T {
  configureFleetMapWorkerOnce(bootstrap);
  return createMap();
}

export function isSameOriginFleetMapWorkerUrl(workerUrl: string, pageUrl: string): boolean {
  try {
    return new URL(workerUrl, pageUrl).origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}
