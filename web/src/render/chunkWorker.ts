import { computeChunk } from '../world/chunkData';
import { restoreField, type FieldSnapshot, type WorldField } from '../world/field';

let field: WorldField | null = null;
let generation = 0;

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; generation: number; snapshot: FieldSnapshot } | { type: 'chunk'; generation: number; cx: number; cz: number };
  if (m.type === 'init') {
    generation = m.generation;
    field = restoreField(m.snapshot);
    return;
  }
  if (!field || m.generation !== generation) return;
  const data = computeChunk(field, m.cx, m.cz);
  (self as unknown as Worker).postMessage({ type: 'chunk', generation, data }, [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.indices.buffer]);
};
