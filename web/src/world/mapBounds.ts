import { CORE_HALF } from '../core/recipe';
import { CHUNK_SIZE } from './chunkData';

/**
 * The world is one fixed map, CORE_HALF * 2 metres across (the user's choice: no endless land). Land rises to mountains
 * over this many metres at its edge, so the end of the world looks like a place, not a cut.
 */
export const RIM_WIDTH = 80;
/** A walker stops this short of the edge. */
const EDGE_MARGIN = 2;
const LAST_CHUNK = CORE_HALF / CHUNK_SIZE;

/** Chunks of the map, and one ring beyond it so the mountains at the edge have a back to them. */
export const chunkInMap = (cx: number, cz: number): boolean => cx >= -LAST_CHUNK - 1 && cx <= LAST_CHUNK && cz >= -LAST_CHUNK - 1 && cz <= LAST_CHUNK;

export const insideMap = (x: number, z: number): boolean => Math.abs(x) <= CORE_HALF && Math.abs(z) <= CORE_HALF;

export const clampToMap = (v: number): number => Math.max(-CORE_HALF + EDGE_MARGIN, Math.min(CORE_HALF - EDGE_MARGIN, v));
