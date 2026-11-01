import { computeChunk } from '../world/chunkData';
import { restoreField, type FieldSnapshot, type WorldField } from '../world/field';

let field: WorldField | null = null;
let generation = 0;

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; generation: number; snapshot: FieldSnapshot } | { type: 'chunk'; generation: number; cx: number; cz: number };
  try {
    if (m.type === 'init') {
      generation = m.generation;
      field = null;
      field = restoreField(m.snapshot);
      return;
    }
    if (!field || m.generation !== generation) return;
    const data = computeChunk(field, m.cx, m.cz);
    post({ type: 'chunk', generation, data }, [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.indices.buffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (m.type === 'init') post({ type: 'error', generation: m.generation, message });
    else post({ type: 'error', generation: m.generation, cx: m.cx, cz: m.cz, message });
  }
};
