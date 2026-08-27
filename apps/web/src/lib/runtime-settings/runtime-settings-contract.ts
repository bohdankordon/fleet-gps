import { z } from "zod";
const schema = z.object({ timezone: z.string().min(1).max(64) }).strict().refine((value) => { try { new Intl.DateTimeFormat("en-CA", { timeZone: value.timezone }).format(new Date(0)); return true; } catch { return false; } });
export type RuntimeSettings = z.infer<typeof schema>;
export function parseRuntimeSettings(value: unknown): RuntimeSettings | null { const parsed = schema.safeParse(value); return parsed.success ? parsed.data : null; }
