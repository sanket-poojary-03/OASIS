/** Long enough to read one message before the next replaces it. */
export const NOTICE_GAP_MS = 2600;
/** A world can build a dozen things by hand: after this many waiting, the rest become one line. */
export const MAX_WAITING = 3;

/** Shows the model finder's messages one after another: the toast holds one, and they often arrive together. */
export class NoticeQueue {
  private readonly waiting: string[] = [];
  private more = 0;
  private busy = false;

  constructor(
    private readonly show: (text: string) => void,
    private readonly later: (fn: () => void, ms: number) => void = (fn, ms) => { setTimeout(fn, ms); },
  ) {}

  add(text: string): void {
    if (this.waiting.length >= MAX_WAITING) this.more++;
    else this.waiting.push(text);
    if (!this.busy) this.next();
  }

  private next(): void {
    let text = this.waiting.shift();
    if (text === undefined && this.more > 0) {
      text = this.more === 1 ? 'One more thing is being built manually' : `${this.more} more things are being built manually`;
      this.more = 0;
    }
    if (text === undefined) { this.busy = false; return; }
    this.busy = true;
    this.show(text);
    this.later(() => this.next(), NOTICE_GAP_MS);
  }
}
