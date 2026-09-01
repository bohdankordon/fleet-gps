"use client";

import { Input, theme } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

export const FLEET_SEARCH_DEBOUNCE_MS = 300;

type Props = Readonly<{
  value: string | undefined;
  ariaLabel: string;
  placeholder: string;
  onCommit: (value: string | undefined) => void;
}>;

export function FleetSearchInput({ value, ariaLabel, placeholder, onCommit }: Props) {
  const { token } = theme.useToken();
  const externalValue = value ?? "";
  const [draftState, setDraftState] = useState(() => ({ externalValue, draft: externalValue }));
  const draft = draftState.externalValue === externalValue ? draftState.draft : externalValue;

  useEffect(() => {
    if (draft === externalValue) return;
    const timer = window.setTimeout(() => onCommit(draft || undefined), FLEET_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, externalValue, onCommit]);

  return <Input
    className="fleet-toolbar__search"
    classNames={{ clear: "fleet-toolbar__search-clear" }}
    size="large"
    styles={{
      root: { height: token.controlHeightLG },
      input: { minHeight: 0 },
      clear: {
        alignItems: "center",
        background: "transparent",
        display: "inline-flex",
        height: token.controlHeightSM,
        justifyContent: "center",
        minHeight: token.controlHeightSM,
        padding: 0,
        width: token.controlHeightSM,
      },
    }}
    aria-label={ariaLabel}
    allowClear
    prefix={<SearchOutlined />}
    value={draft}
    onChange={(event) => setDraftState({ externalValue, draft: event.target.value })}
    placeholder={placeholder}
  />;
}
