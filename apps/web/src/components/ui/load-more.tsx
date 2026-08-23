import { Button } from "./button";

export function LoadMore({ label, loadingLabel, loading = false, disabled = false, onLoadMore, className }: Readonly<{
  label: string;
  loadingLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onLoadMore(): void;
  className?: string;
}>) {
  return <div className={["ui-load-more", className].filter(Boolean).join(" ")} aria-live="polite">
    <Button variant="secondary" onClick={onLoadMore} disabled={disabled} loading={loading}>{loading ? loadingLabel : label}</Button>
    {loading ? <span className="sr-only" role="status">{loadingLabel}</span> : null}
  </div>;
}
