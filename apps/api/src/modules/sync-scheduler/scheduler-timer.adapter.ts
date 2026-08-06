export interface SchedulerTimerAdapter {
  addInterval(name: string, callback: () => void, milliseconds: number): void;
  deleteInterval(name: string): void;
  hasInterval(name: string): boolean;
}
