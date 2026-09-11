"use client";

export const BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT = "business-settings:blocked-navigation";

const DIRTY_FLAG = "__businessSettingsDirty";

export function setBusinessSettingsDirty(dirty: boolean): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[DIRTY_FLAG] = dirty;
}

export function isBusinessSettingsNavigationBlocked(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as Record<string, unknown>)[DIRTY_FLAG] === true;
}

export function notifyBusinessSettingsBlockedNavigation(href: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT, { detail: href }));
}
