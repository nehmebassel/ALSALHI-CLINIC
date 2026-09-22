/** Keep the decision being typed at one stable position in today's decision list.
 * An incomplete edit does not replace the last valid decision; the caller must
 * block leaving/finalizing until it is completed or explicitly discarded.
 */
export class VisitDecisionComposer {
  private index: number | null = null;
  update(items: Array<Record<string, unknown>>, decision: Record<string, unknown> | null) {
    if (!decision) return null;
    const next = [...items];
    if (this.index === null) this.index = next.length;
    next[this.index] = decision;
    return next;
  }
  next() { this.index = null; }
  remove(items: Array<Record<string, unknown>>, index: number) {
    if (this.index === index) this.index = null;
    else if (this.index !== null && index < this.index) this.index -= 1;
    return items.filter((_, position) => position !== index);
  }
  currentIndex() { return this.index; }
}
