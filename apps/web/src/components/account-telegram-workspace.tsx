"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Tag } from "antd";
import { AlertDialog } from "./ui/dialog";
import { useI18n } from "../i18n/client";
import type { AppLocale } from "../i18n/locales";
import type { Translator } from "../i18n/core";
import type { MessageKey } from "../i18n/messages";
import { formatDateTime } from "../i18n/formatting";
import {
  TELEGRAM_STATUS_POLL_MS,
  isLinkExpired,
  linkErrorKey,
  parseTelegramConnectionView,
  parseTelegramLinkTicket,
  type TelegramConnectionView,
  type TelegramLinkTicket,
} from "../lib/account/account-telegram-connection";

export type TelegramWorkspaceInitial =
  | Readonly<{ availability: "unavailable" }>
  | Readonly<{
    availability: "available";
    connection: TelegramConnectionView;
    notificationsEnabled: boolean | null;
  }>;

type Operation = "link" | "disconnect" | "refresh";

export function AccountTelegramOperationError({ title }: Readonly<{ title: string }>) {
  return <Alert type="error" showIcon title={title} />;
}

function tagColor(status: TelegramConnectionView["status"]): "success" | "default" | "processing" | "warning" {
  if (status === "CONNECTED") return "success";
  if (status === "BROKEN") return "warning";
  if (status === "LINK_PENDING") return "processing";
  return "default";
}

// `initialLink` seeds ephemeral browser-only link state for fixture renders;
// production always starts without one (the raw URL is unrecoverable).
export function AccountTelegramWorkspace({ initial, locale, initialLink = null }: Readonly<{ initial: TelegramWorkspaceInitial; locale: AppLocale; initialLink?: TelegramLinkTicket | null }>) {
  const { t } = useI18n();
  const [confirmed, setConfirmed] = useState<TelegramConnectionView | null>(
    () => (initial.availability === "available" ? initial.connection : null),
  );
  const [notificationsEnabled] = useState<boolean | null>(
    () => (initial.availability === "available" ? initial.notificationsEnabled : null),
  );
  // Ephemeral browser memory only: never persisted, logged, or printed.
  const [link, setLink] = useState<TelegramLinkTicket | null>(initialLink);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationErrorKey, setOperationErrorKey] = useState<MessageKey | null>(null);
  const [updateStale, setUpdateStale] = useState(false);
  const [noticeKey, setNoticeKey] = useState<MessageKey | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const generation = useRef(0);
  const inflight = useRef(false);
  const busy = operation !== null;
  // A stale response must never overwrite newer state; unmount retires all.
  useEffect(() => () => {
    generation.current += 1;
  }, []);

  const linkExpired = link !== null && isLinkExpired(link.expiresAt, nowMs);
  const serverPendingLive = confirmed !== null
    && confirmed.pendingExpiresAt !== null
    && !isLinkExpired(confirmed.pendingExpiresAt, nowMs);
  const replacementRelevant = link !== null && !linkExpired;

  async function readStatus(): Promise<TelegramConnectionView | null> {
    try {
      const response = await fetch("/api/account/notifications", { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      return parseTelegramConnectionView(await response.json().catch(() => null));
    } catch {
      return null;
    }
  }

  // Non-overlapping, generation-guarded refresh. Returns the fresh view or
  // null when the read failed or a newer run superseded this one.
  async function refreshStatus(): Promise<TelegramConnectionView | null> {
    if (inflight.current) return null;
    inflight.current = true;
    const run = (generation.current += 1);
    try {
      const view = await readStatus();
      if (generation.current !== run) return null;
      return view;
    } finally {
      if (generation.current === run) inflight.current = false;
    }
  }

  function applyPolledView(view: TelegramConnectionView) {
    setConfirmed((previous) => {
      if (previous !== null && previous.status === view.status && previous.pendingExpiresAt === view.pendingExpiresAt) return previous;
      return view;
    });
    setUpdateStale(false);
    // A live local link whose server pending vanished resolved server-side.
    // Server truth, not a guess: expired tokens stay listed while alive.
    setLink((current) => {
      if (current === null || isLinkExpired(current.expiresAt, Date.now())) return current;
      if (view.pendingExpiresAt === null) {
        setNoticeKey("account.telegram.linkedSuccess");
        return null;
      }
      // A different server pending means this browser's URL was superseded.
      if (view.pendingExpiresAt !== current.expiresAt) return null;
      return current;
    });
  }

  async function pollOnce(): Promise<void> {
    const view = await refreshStatus();
    if (view) applyPolledView(view);
    else setUpdateStale(true);
  }

  // Bounded polling while a linking attempt is relevant: a live local link
  // or a live server-side pending token. Skipped while hidden; every tick
  // also advances the local expiry clock exactly once.
  useEffect(() => {
    if (link === null && !serverPendingLive) return;
    if (link !== null && isLinkExpired(link.expiresAt, Date.now())) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
      if (document.visibilityState !== "hidden") void pollOnce();
    }, TELEGRAM_STATUS_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link !== null, serverPendingLive]);

  async function createLink(): Promise<void> {
    if (busy) return;
    setOperation("link");
    setOperationErrorKey(null);
    setNoticeKey(null);
    const run = (generation.current += 1);
    try {
      const response = await fetch("/api/account/notifications/telegram/link", { method: "POST" });
      if (generation.current !== run) return;
      if (!response.ok) {
        setOperationErrorKey(linkErrorKey(response.status));
        return;
      }
      const ticket = parseTelegramLinkTicket(await response.json().catch(() => null));
      if (!ticket) {
        setOperationErrorKey("telegram.error.generic");
        return;
      }
      // The confirmed connection truth is never overwritten by a link
      // creation: a replacement attempt leaves CONNECTED/BROKEN intact.
      // Only a previously unknown truth may adopt the server response.
      if (confirmed === null) setConfirmed({ status: "LINK_PENDING", pendingExpiresAt: ticket.expiresAt });
      setLink(ticket);
      setNowMs(Date.now());
    } catch {
      if (generation.current !== run) return;
      setOperationErrorKey("telegram.error.generic");
      void refreshStatus().then((view) => {
        if (view) applyPolledView(view);
      });
    } finally {
      if (generation.current === run) setOperation(null);
    }
  }

  async function manualRefresh(): Promise<void> {
    if (busy) return;
    setOperation("refresh");
    try {
      const view = await refreshStatus();
      if (view) applyPolledView(view);
      else setUpdateStale(true);
    } finally {
      setOperation(null);
    }
  }

  async function confirmDisconnectNow(): Promise<void> {
    if (busy) return;
    setOperation("disconnect");
    setOperationErrorKey(null);
    setNoticeKey(null);
    const run = (generation.current += 1);
    try {
      const response = await fetch("/api/account/notifications/telegram/disconnect", { method: "POST" });
      if (generation.current !== run) return;
      const view = response.ok ? parseTelegramConnectionView(await response.json().catch(() => null)) : null;
      if (!view || view.status !== "NOT_CONNECTED") {
        setOperationErrorKey("telegram.error.generic");
        return;
      }
      setConfirmed(view);
      setLink(null);
      setNoticeKey("account.telegram.disconnectSuccess");
      setConfirmDisconnect(false);
    } catch {
      if (generation.current !== run) return;
      setOperationErrorKey("telegram.error.generic");
    } finally {
      if (generation.current === run) setOperation(null);
    }
  }

  if (confirmed === null) {
    return <>
      <Alert type="error" showIcon title={t("account.overview.statusUnavailable")} description={t("account.overview.summaryUnavailableHelp")} />
      <div className="account-telegram__actions">
        <Button onClick={() => { void manualRefresh(); }} loading={operation === "refresh"} disabled={busy}>
          {t("common.retry")}
        </Button>
      </div>
      {operationErrorKey ? <AccountTelegramOperationError title={t(operationErrorKey)} /> : null}
    </>;
  }

  const status = confirmed.status;
  const replacementPending = serverPendingLive || replacementRelevant;
  const showReplacement = (status === "CONNECTED" || status === "BROKEN") && replacementPending;

  return <>
    <div role="status" aria-live="polite">
      <p className="account-telegram__state">
        <Tag color={tagColor(status)}>{t(`telegram.label.${status}`)}</Tag>
      </p>
      {status === "NOT_CONNECTED" ? <p className="account-telegram__supporting">{t("account.telegram.notConnectedHelp")}</p> : null}
      {status === "BROKEN" ? <p className="account-telegram__supporting">{t("account.overview.telegram.brokenHelp")}</p> : null}
      {status === "CONNECTED" && notificationsEnabled !== null
        ? <p className="account-telegram__supporting">{t("account.navigation.notifications")}: {notificationsEnabled ? t("account.overview.notifications.on") : t("account.overview.notifications.off")}</p>
        : null}
    </div>
    {updateStale ? <Alert type="warning" showIcon title={t("account.telegram.updateStale")} /> : null}
    {noticeKey ? <Alert type="success" showIcon title={t(noticeKey)} /> : null}
    {operationErrorKey ? <AccountTelegramOperationError title={t(operationErrorKey)} /> : null}
    {status === "NOT_CONNECTED" ? (
      <div className="account-telegram__actions">
        <Button type="primary" onClick={() => { void createLink(); }} loading={operation === "link"} disabled={busy}>
          {t("telegram.connect")}
        </Button>
      </div>
    ) : null}
    {status === "LINK_PENDING" ? <PendingBlock locale={locale} t={t} link={link} linkExpired={linkExpired} busy={busy} refreshing={operation === "refresh"} onGenerate={() => { void createLink(); }} onRefresh={() => { void manualRefresh(); }} /> : null}
    {status === "CONNECTED" || status === "BROKEN" ? (
      <div className="account-telegram__actions">
        <Button onClick={() => { void createLink(); }} loading={operation === "link"} disabled={busy}>
          {status === "CONNECTED" ? t("account.telegram.replaceAction") : t("telegram.reconnect")}
        </Button>
        <AlertDialog
          open={confirmDisconnect}
          onOpenChange={setConfirmDisconnect}
          trigger={<Button danger disabled={busy}>{t("telegram.disconnect")}</Button>}
          title={t("telegram.disconnectConfirmTitle")}
          description={<><p>{t("telegram.disconnectConfirmBody")}</p><p>{t("account.telegram.disconnectPrefsNote")}</p></>}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("telegram.disconnect")}
          destructive
          loading={operation === "disconnect"}
          onConfirm={() => { void confirmDisconnectNow(); }}
        />
      </div>
    ) : null}
    {showReplacement ? (
      <section className="account-telegram__replacement" aria-label={t("account.telegram.replacementTitle")}>
        <h3 className="account-telegram__subtitle">{t("account.telegram.replacementTitle")}</h3>
        <p className="account-telegram__supporting">{t("account.telegram.replacementKept")}</p>
        <PendingBlock locale={locale} t={t} link={replacementRelevant ? link : null} linkExpired={false} busy={busy} refreshing={operation === "refresh"} onGenerate={() => { void createLink(); }} onRefresh={() => { void manualRefresh(); }} />
      </section>
    ) : null}
  </>;
}

function PendingBlock({ locale, t, link, linkExpired, busy, refreshing, onGenerate, onRefresh }: Readonly<{
  locale: AppLocale;
  t: Translator;
  link: { telegramUrl: string; expiresAt: string } | null;
  linkExpired: boolean;
  busy: boolean;
  refreshing: boolean;
  onGenerate: () => void;
  onRefresh: () => void;
}>) {
  if (link !== null && !linkExpired) {
    const stamped = formatDateTime(locale, link.expiresAt);
    return <>
      <h3 className="account-telegram__subtitle">{t("account.telegram.confirmationTitle")}</h3>
      <p className="account-telegram__supporting">
        {t("telegram.expires", { expiresAt: stamped ?? "" })} <time dateTime={link.expiresAt}>{stamped ?? ""}</time>
      </p>
      <p className="account-telegram__supporting">{t("telegram.linkReady")}</p>
      <div className="account-telegram__actions">
        <Button type="primary" href={link.telegramUrl} target="_blank" rel="noopener noreferrer" disabled={busy}>
          {t("telegram.open")}
        </Button>
        <Button onClick={onGenerate} disabled={busy} loading={busy}>
          {t("telegram.regenerate")}
        </Button>
        <Button size="small" type="link" onClick={onRefresh} disabled={busy} loading={refreshing}>
          {t("account.telegram.refreshAction")}
        </Button>
      </div>
    </>;
  }
  if (link !== null) {
    return <>
      <p className="account-telegram__state"><Tag>{t("account.telegram.expiredLabel")}</Tag></p>
      <p className="account-telegram__supporting">{t("account.telegram.expiredHelp")}</p>
      <div className="account-telegram__actions">
        <Button type="primary" onClick={onGenerate} disabled={busy} loading={busy}>
          {t("account.telegram.generateAction")}
        </Button>
      </div>
    </>;
  }
  return <>
    <h3 className="account-telegram__subtitle">{t("account.telegram.confirmationTitle")}</h3>
    <Alert type="info" showIcon title={t("telegram.pendingReload")} />
    <div className="account-telegram__actions">
      <Button type="primary" onClick={onGenerate} disabled={busy} loading={busy}>
        {t("account.telegram.generateAction")}
      </Button>
      <Button size="small" type="link" onClick={onRefresh} disabled={busy} loading={refreshing}>
        {t("account.telegram.refreshAction")}
      </Button>
    </div>
  </>;
}
