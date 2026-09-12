import { redirect } from "next/navigation";

/** Compatibility route until Telegram receives its own Account screen. */
export default function AccountTelegramCompatibilityPage() {
  redirect("/account/notifications#telegram");
}
