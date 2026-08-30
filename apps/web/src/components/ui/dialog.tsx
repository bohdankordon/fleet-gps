"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode, type RefObject } from "react";
import { Button } from "./button";

type DialogKind = "dialog" | "alertdialog";
type DialogProps = Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
  closeLabel?: string;
  dismissible?: boolean;
  kind?: DialogKind;
  initialFocusRef?: RefObject<HTMLElement | null>;
}>;

export function Dialog({ open, onOpenChange, title, description, children, footer, trigger, closeLabel, dismissible = true, kind = "dialog", initialFocusRef }: DialogProps) {
  return <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal>
    {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="ui-dialog__overlay" />
      <RadixDialog.Content className={`ui-dialog ui-dialog--${kind}`} role={kind} onEscapeKeyDown={(event) => { if (!dismissible) event.preventDefault(); }} onPointerDownOutside={(event) => { if (!dismissible) event.preventDefault(); }} onInteractOutside={(event) => { if (!dismissible) event.preventDefault(); }} onOpenAutoFocus={(event) => { if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus(); } }}>
        <div className="ui-dialog__header"><div><RadixDialog.Title className="ui-dialog__title">{title}</RadixDialog.Title>{description ? <RadixDialog.Description className="ui-dialog__description">{description}</RadixDialog.Description> : null}</div>{dismissible && closeLabel ? <RadixDialog.Close asChild><Button variant="ghost" size="sm">{closeLabel}</Button></RadixDialog.Close> : null}</div>
        {children ? <div className="ui-dialog__body">{children}</div> : null}
        {footer ? <div className="ui-dialog__footer">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>;
}

export function AlertDialog({ open, onOpenChange, title, description, children, trigger, cancelLabel, confirmLabel, onConfirm, loading = false, destructive = false, closeLabel }: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  trigger?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm(): void;
  loading?: boolean;
  destructive?: boolean;
  closeLabel?: string;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} trigger={trigger} kind="alertdialog" closeLabel={closeLabel} initialFocusRef={cancelRef} footer={<><Button ref={cancelRef} variant="secondary" disabled={loading} onClick={() => onOpenChange(false)}>{cancelLabel}</Button><Button variant={destructive ? "destructive" : "default"} disabled={loading} aria-busy={loading || undefined} onClick={onConfirm}>{confirmLabel}</Button></>}>
    {children}
  </Dialog>;
}
