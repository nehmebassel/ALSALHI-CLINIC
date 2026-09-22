export type DraftSaveState = "saved" | "saving" | "failed";
export type DraftSaveCommand = { expectedDraftVersion: number; section: string; value: Record<string, unknown> };

export function sameDraftContent(left: unknown, right: unknown): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]))
    : value;
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export class VisitDraftAcknowledgement {
  private sections: Record<string, unknown> = {};
  acknowledge(sections: Record<string, unknown>) { this.sections = structuredClone(sections); }
  matchesAttempt(sections: Record<string, unknown>, section: string, normalizedValue: unknown) {
    return sameDraftContent(sections, { ...this.sections, [section]: normalizedValue });
  }
}

/** One queue per mounted Visit. Only acknowledgements advance the shared version.
 * Local values never come from a save response. A failed command stays queued;
 * in particular, a conflict never silently rebases over another editor's work.
 */
export class VisitDraftAutosave {
  private version = 0;
  private pending = new Map<string, Record<string, unknown>>();
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<boolean>;
  private listener?: (state: DraftSaveState) => void;
  private state: DraftSaveState = "saved";
  private failedAttempt?: DraftSaveCommand;

  constructor(
    private readonly save: (command: DraftSaveCommand) => Promise<number>,
    private readonly delay = 650,
    private readonly recover?: (command: DraftSaveCommand) => Promise<number | null>,
  ) {}

  initialize(version: number) {
    if (!this.hasUnsavedChanges()) this.version = version;
  }

  subscribe(listener: (state: DraftSaveState) => void) {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }

  getVersion() { return this.version; }
  hasUnsavedChanges() { return this.pending.size > 0 || Boolean(this.flight); }

  private publish(state: DraftSaveState) {
    this.state = state;
    this.listener?.(state);
  }

  edit(section: string, value: Record<string, unknown>) {
    this.pending.set(section, structuredClone(value));
    clearTimeout(this.timer);
    // A deliberate Retry is required after failure; typing never hides it.
    if (this.state === "failed") return;
    this.publish("saving");
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }

  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.flight) return this.flight;
    if (!this.pending.size) return Promise.resolve(true);
    this.publish("saving");
    this.flight = this.drain().finally(() => { this.flight = undefined; });
    return this.flight;
  }

  private async drain(): Promise<boolean> {
    try {
      if (this.failedAttempt && this.recover) {
        const attempted = this.failedAttempt;
        const recoveredVersion = await this.recover(attempted);
        if (recoveredVersion !== null) {
          if (recoveredVersion !== this.version + 1) throw new Error("DRAFT_CONFLICT");
          this.version = recoveredVersion;
          if (this.pending.get(attempted.section) === attempted.value) this.pending.delete(attempted.section);
        }
        this.failedAttempt = undefined;
      }
      while (this.pending.size) {
        const [section, value] = this.pending.entries().next().value!;
        const command = { expectedDraftVersion: this.version, section, value };
        this.failedAttempt = command;
        const nextVersion = await this.save(command);
        if (!Number.isInteger(nextVersion) || nextVersion !== this.version + 1) throw new Error("DRAFT_CONFLICT");
        this.version = nextVersion;
        this.failedAttempt = undefined;
        // A newer edit replaces this exact object in the map while we await.
        if (this.pending.get(section) === value) this.pending.delete(section);
      }
      this.publish("saved");
      return true;
    } catch {
      clearTimeout(this.timer);
      this.publish("failed");
      return false;
    }
  }
}
