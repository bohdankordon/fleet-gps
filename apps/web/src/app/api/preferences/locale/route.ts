import { createLocalePreferenceDeleteHandler, createLocalePreferenceHandler } from "@/lib/preferences/locale-preference";

export const dynamic = "force-dynamic";
export const POST = createLocalePreferenceHandler();
export const DELETE = createLocalePreferenceDeleteHandler();
