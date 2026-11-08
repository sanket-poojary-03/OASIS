/** What the app is really doing: the AI's brief, the AI's world, the code building it, or the AI working out an edit. */
export const BUSY_STAGES = ['thinking', 'designing', 'building', 'editing'] as const;
export type BusyStage = (typeof BUSY_STAGES)[number];

/** General on purpose: any prompt must work, so no word may promise a river or a village the world will not have. */
const WORDS: Record<BusyStage, readonly string[]> = {
  thinking: ['Thinking', 'Imagining your world', 'Picturing the land', 'Dreaming it up', 'Finding the mood'],
  designing: ['Designing', 'Choosing the places', 'Sketching the map', 'Deciding what goes where', 'Hiding things to find'],
  building: ['Building', 'Shaping the land', 'Laying the roads', 'Placing everything', 'Almost there'],
  editing: ['Thinking', 'Working out the change', 'Finding the right spot'],
};

/**
 * The word to show after `step` changes. The AI can take any length of time, so its stages keep cycling, never back to
 * the opening word; building is short and ends, so it settles on its last word ("Almost there") instead of starting over.
 */
export function busyWord(stage: BusyStage, step: number): string {
  const words = WORDS[stage];
  if (step < words.length) return words[step];
  if (stage === 'building') return words[words.length - 1];
  return words[1 + ((step - 1) % (words.length - 1))];
}
