import type { ReactNode } from "react";

export type IconProps = Readonly<{ className?: string; size?: number }>;

function SvgIcon({ children, className, size = 20 }: IconProps & Readonly<{ children: ReactNode }>) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export function FleetIcon(props: IconProps) { return <SvgIcon {...props}><path d="M3 16.5V10l2-4h10l3 4v6.5" /><path d="M5 16.5h12M7 10h9" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="16" cy="17.5" r="1.5" /></SvgIcon>; }
export function OnlineIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="2.2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4" /></SvgIcon>; }
export function OfflineIcon(props: IconProps) { return <SvgIcon {...props}><path d="M5 8.5a10 10 0 0 1 12.5-1.2M3 3l18 18M7.8 12a6 6 0 0 1 4.7-1.7M16.2 12a6 6 0 0 1 .8 1M10.5 16.5a2.2 2.2 0 0 1 3 0" /></SvgIcon>; }
export function HelpIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1.1.9-1.1 1.8M12 17h.01" /></SvgIcon>; }
export function ClockIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></SvgIcon>; }
export function HistoryIcon(props: IconProps) { return <SvgIcon {...props}><path d="M4.5 9a8 8 0 1 1 .7 7M4.5 9V4.5M4.5 9H9" /><path d="M12 8v4l2.8 1.8" /></SvgIcon>; }
export function NoPositionIcon(props: IconProps) { return <SvgIcon {...props}><path d="M18 10c0 4.5-6 10-6 10s-2.2-2-4-4.7M6.2 11.5A7 7 0 0 1 6 10a6 6 0 0 1 9.7-4.7M3 3l18 18" /><circle cx="12" cy="10" r="1.8" /></SvgIcon>; }
export function WarningIcon(props: IconProps) { return <SvgIcon {...props}><path d="M10.3 4.2 2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></SvgIcon>; }
export function RouteIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h2a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h2" /></SvgIcon>; }
export function GlobeIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></SvgIcon>; }
export function ChevronDownIcon(props: IconProps) { return <SvgIcon {...props}><path d="m7 10 5 5 5-5" /></SvgIcon>; }
export function UserIcon(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" /></SvgIcon>; }
