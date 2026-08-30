import * as React from "react"

// The persistent navigation becomes a drawer before it crowds data-dense views.
const MOBILE_BREAKPOINT = 1024

const mediaQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onStoreChange: () => void) {
  const query = window.matchMedia(mediaQuery)
  query.addEventListener("change", onStoreChange)
  return () => query.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(mediaQuery).matches
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
