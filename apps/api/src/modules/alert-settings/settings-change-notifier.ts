import { Injectable } from "@nestjs/common";

export type SettingsChangeKind = "speeding" | "inactivity";
type Listener = (changes: ReadonlySet<SettingsChangeKind>) => void;

/** In-process boundary for policy changes which invalidate detector memory. */
@Injectable()
export class SettingsChangeNotifier {
  private readonly listeners = new Set<Listener>();
  public subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public notify(changes: ReadonlySet<SettingsChangeKind>): void { for (const listener of this.listeners) listener(changes); }
}
