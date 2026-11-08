/** The start of the prompt box's placeholder; it stays while the ideas after it come and go. */
export const HINT_LEAD = 'Describe your world…';

/** Wide on purpose: any prompt must work, so the hints should not suggest only one kind of world. */
const IDEAS = [
  'a misty pine valley with a fishing village',
  'a red desert canyon at sunset',
  'frozen mountains with a castle on the tallest peak',
  'a neon city in the rain',
  'a tropical island with a lighthouse',
  'a quiet farm between two rivers',
];

const TYPE_MS = 45;
const ERASE_MS = 18;
const HOLD_MS = 1800;
const GAP_MS = 500;

const ideaMs = (idea: string): number => idea.length * TYPE_MS + HOLD_MS + idea.length * ERASE_MS + GAP_MS;
const CYCLE_MS = IDEAS.reduce((sum, idea) => sum + ideaMs(idea), 0);

/** The placeholder `ms` after it started: each idea types itself out, holds, erases, and the next one follows. */
export function promptHint(ms: number): string {
  let t = Math.max(0, ms) % CYCLE_MS;
  for (const idea of IDEAS) {
    const span = ideaMs(idea);
    if (t < span) return `${HINT_LEAD} ${idea.slice(0, shownChars(idea, t))}`.trimEnd();
    t -= span;
  }
  return HINT_LEAD;
}

function shownChars(idea: string, t: number): number {
  const typed = idea.length * TYPE_MS;
  if (t < typed) return Math.floor(t / TYPE_MS);
  if (t < typed + HOLD_MS) return idea.length;
  return Math.max(0, idea.length - Math.floor((t - typed - HOLD_MS) / ERASE_MS));
}
