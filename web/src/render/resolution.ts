import type { RenderScale } from './renderScale';

export type Resolution = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export const RESOLUTIONS: ReadonlyArray<{ id: Resolution; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

const STORE_KEY = 'oasis.resolution';
/** Above one pixel per CSS pixel: the screen's own sharpness, or 1.5 on a plain screen, where it smooths edges. */
const ULTRA_MIN = 1.5;
const ULTRA_MAX = 2;

/** Pixels per CSS pixel for a fixed choice; null for Auto, which follows the frame rate. */
export function ratioOf(choice: Resolution, screenRatio: number): number | null {
  switch (choice) {
    case 'auto': return null;
    case 'low': return 0.5;
    case 'medium': return 0.75;
    case 'high': return 1;
    case 'ultra': return Math.min(ULTRA_MAX, Math.max(ULTRA_MIN, screenRatio));
  }
}

export function applyResolution(scale: RenderScale, choice: Resolution, screenRatio: number): void {
  const ratio = ratioOf(choice, screenRatio);
  if (ratio === null) scale.adapt();
  else scale.fix(ratio);
}

/** Storage can be missing or refuse (a private window): then it is simply Auto, and the choice lasts this visit. */
export function loadResolution(storage: Pick<Storage, 'getItem'> | null): Resolution {
  try {
    const saved = storage?.getItem(STORE_KEY);
    return RESOLUTIONS.find((r) => r.id === saved)?.id ?? 'auto';
  } catch { return 'auto'; }
}

export function saveResolution(storage: Pick<Storage, 'setItem'> | null, choice: Resolution): void {
  try { storage?.setItem(STORE_KEY, choice); } catch { /* the choice lasts this visit */ }
}

/** What a pixel ratio means on this window, e.g. "1440 × 810". */
export function pixelSize(ratio: number, width: number, height: number): string {
  return `${Math.round(width * ratio)} × ${Math.round(height * ratio)}`;
}
