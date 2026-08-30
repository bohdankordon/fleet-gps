import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChevronDownIcon, ClockIcon, FleetIcon, GlobeIcon, HelpIcon, HistoryIcon, NoPositionIcon, OfflineIcon, OnlineIcon, RouteIcon, UserIcon, WarningIcon } from "./ui/icons";

test("legacy source-owned icons remain valid for legacy route consumers", () => {
  const icons = [ChevronDownIcon, ClockIcon, FleetIcon, GlobeIcon, HelpIcon, HistoryIcon, NoPositionIcon, OfflineIcon, OnlineIcon, RouteIcon, UserIcon, WarningIcon];
  const html = renderToStaticMarkup(<>{icons.map((Icon) => <Icon key={Icon.name} />)}</>);
  assert.equal((html.match(/<svg/g) ?? []).length, icons.length);
  assert.equal((html.match(/viewBox="0 0 24 24"/g) ?? []).length, icons.length);
});

test("the Ant Design foundation uses only the requested core UI packages and keeps Radix for its active dialog consumer", () => {
  const packages = `${readFileSync("package.json", "utf8")}\n${readFileSync("../../package.json", "utf8")}`;
  for (const packageName of ["antd", "@ant-design/icons", "@ant-design/nextjs-registry", "@radix-ui/react-dialog"]) assert.ok(packages.includes(`"${packageName}"`));
  assert.doesNotMatch(packages, /@mui|shadcn|lucide|heroicons|fontawesome|react-icons|@ant-design\/pro-components/i);
});
