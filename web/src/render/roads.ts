import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '../physics/physics';
import type { Road, WorldField } from '../world/field';
import type { Vec2 } from '../world/river';
import { under, WOOD_COLOUR } from './decks';
import { pieces } from './rangeCull';
import { ribbonData, ribbonGeometry } from './ribbon';

const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
/** City streets: dark asphalt. */
const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x5c5f66, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** Boardwalks and deck streets of an ocean world. */
const woodMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOUR, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** What holds a tall bridge up: wood would not. */
const pierMat = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 1, flatShading: true });

/** Subdivide a polyline to at most maxStep; `bridge[j]` is the flag of sub-segment j (from the raw segment's flag). */
export function densify(points: Vec2[], bridges: boolean[] = [], maxStep = 3): { points: Vec2[]; bridge: boolean[] } {
  if (points.length === 0) return { points: [], bridge: [] };
  const out: Vec2[] = [points[0]];
  const bridge: boolean[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxStep));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      bridge.push(bridges[i] === true);
    }
  }
  return { points: out, bridge };
}

/** How far a road's surface stands above the ground under it. */
export const ROAD_LIFT = 0.12;

/** A bridge rises at least this much to its middle, and stands this far clear of the water. */
const ARCH = 1;
/** A long span rises this much per metre of its length, so it does not read as a sagging plank. */
const CAMBER = 0.015;
const CLEARANCE = 1.2;
const RAIL_HEIGHT = 1;
const RAIL_THICK = 0.1;
const POST_RADIUS = 0.14;
/** A post at every this many points of a span (each about 3 m apart). */
const POST_EVERY = 2;
/** Posts stand this far into the bed. */
const POST_FOOT = 0.5;
/** Over a drop deeper than this a post is only part of the rail, and piers hold the deck up. */
const TALL_DROP = 8;
/** A rail's post starts this far under the deck, over a drop. */
const RAIL_FOOT = 0.4;
/** A pier at every this many points of a span (each about 3 m apart). */
const PIER_EVERY = 6;
/** A pier thickens with its height, within these. */
const PIER_RADIUS = 0.3, PIER_MAX_RADIUS = 1.1, PIER_TAPER = 0.012;
/** The girder under a tall deck: as deep as this, and this share of the deck's width. */
const GIRDER_DEPTH = 0.9, GIRDER_WIDTH = 0.7;
/** A car or anyone on foot counts as on a deck at most this far beneath it (coming up its first rise). */
const DECK_REACH = 1.5;

type RoadGround = Pick<WorldField, 'waterSurfaceAt' | 'heightAt'> & { deckY?: number | null };

/** Height a road with no span is drawn at: on the ground, or on an ocean's boardwalks above the sea. */
export function roadY(field: RoadGround, x: number, z: number): number {
  const surface = field.waterSurfaceAt(x, z), h = field.heightAt(x, z);
  return surface !== null && h < surface ? surface + 1.2 : h + ROAD_LIFT;
}

/** Each run of bridge in a road, as its first and last segment. */
function spansIn(bridge: boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let j = 0; j < bridge.length; j++) {
    if (!bridge[j]) continue;
    let e = j;
    while (e + 1 < bridge.length && bridge[e + 1]) e++;
    out.push([j, e]);
    j = e;
  }
  return out;
}

/** One span's deck: a straight line from a to b, its height along it, and how wide it is. */
interface Deck { a: Vec2; b: Vec2; ya: number; yb: number; arch: number; half: number }
const deckY = (d: Deck, t: number) => d.ya + (d.yb - d.ya) * t + d.arch * Math.sin(Math.PI * t);

/** A road as it is drawn: its points every few metres, which spans they make, its height at any of them, and its decks. */
export function drawnRoad(field: RoadGround, road: Road): { points: Vec2[]; bridge: boolean[]; yAt: (x: number, z: number) => number; decks: Deck[] } {
  const { points, bridge } = densify(road.points, road.bridges);
  const spans = new Map<string, number>();
  const decks: Deck[] = [];
  const key = (x: number, z: number) => `${x},${z}`;
  // An ocean's boardwalks run level from deck to deck; everywhere else a span arches from one bank to the other.
  if (field.deckY == null) {
    for (const [j, e] of spansIn(bridge)) {
      const a = points[j], b = points[e + 1], n = e + 1 - j;
      const ya = field.heightAt(a.x, a.z) + ROAD_LIFT, yb = field.heightAt(b.x, b.z) + ROAD_LIFT;
      let surface = -Infinity;
      for (let i = j; i <= e + 1; i++) surface = Math.max(surface, field.waterSurfaceAt(points[i].x, points[i].z) ?? -Infinity);
      const arch = Math.max(ARCH, Math.hypot(b.x - a.x, b.z - a.z) * CAMBER, surface + CLEARANCE - Math.min(ya, yb));
      const deck: Deck = { a, b, ya, yb, arch, half: road.width / 2 };
      decks.push(deck);
      for (let i = j; i <= e + 1; i++) spans.set(key(points[i].x, points[i].z), deckY(deck, (i - j) / n));
    }
  }
  return { points, bridge, yAt: (x, z) => spans.get(key(x, z)) ?? roadY(field, x, z), decks };
}

/**
 * The height of whichever deck is under (x, z), for something at height `fromY`: over a span it stands on the deck, and
 * under one it stays on the ground. Null when there is no deck for it. Physics stands the player on the same surface.
 */
export function deckSurface(field: RoadGround, roads: Road[]): (x: number, z: number, fromY: number) => number | null {
  const decks = roads.flatMap((r) => (r.bridges.some(Boolean) ? drawnRoad(field, r).decks : []));
  return (x, z, fromY) => {
    let best: number | null = null;
    for (const d of decks) {
      const ux = d.b.x - d.a.x, uz = d.b.z - d.a.z, len2 = ux * ux + uz * uz;
      const t = ((x - d.a.x) * ux + (z - d.a.z) * uz) / (len2 || 1);
      if (t < 0 || t > 1) continue;
      if (Math.hypot(x - (d.a.x + ux * t), z - (d.a.z + uz * t)) > d.half) continue;
      const y = deckY(d, t);
      if (y <= fromY + DECK_REACH && (best === null || y > best)) best = y;
    }
    return best;
  };
}

/** Where the posts and rails of a span stand (`span`: its points, on a straight line), and over a drop its piers and girder. */
export function bridgeFrame(field: Pick<WorldField, 'meshHeightAt'>, span: Vec2[], width: number, yAt: (x: number, z: number) => number): {
  posts: Array<{ x: number; z: number; bottom: number; top: number }>;
  rails: Array<{ a: THREE.Vector3Like; b: THREE.Vector3Like }>;
  piers: Array<{ x: number; z: number; bottom: number; top: number; radius: number }>;
  girder: Array<{ a: THREE.Vector3Like; b: THREE.Vector3Like }>;
} {
  const posts: Array<{ x: number; z: number; bottom: number; top: number }> = [];
  const rails: Array<{ a: THREE.Vector3Like; b: THREE.Vector3Like }> = [];
  const piers: Array<{ x: number; z: number; bottom: number; top: number; radius: number }> = [];
  const girder: Array<{ a: THREE.Vector3Like; b: THREE.Vector3Like }> = [];
  const first = span[0], last = span[span.length - 1], len = Math.hypot(last.x - first.x, last.z - first.z) || 1;
  const nx = (-(last.z - first.z) / len) * (width / 2), nz = ((last.x - first.x) / len) * (width / 2);
  for (const s of [-1, 1]) {
    span.forEach((p, i) => {
      const deck = yAt(p.x, p.z), top = deck + RAIL_HEIGHT, x = p.x + nx * s, z = p.z + nz * s;
      const ground = field.meshHeightAt(x, z), drop = deck - ground, tall = drop > TALL_DROP;
      if (i % POST_EVERY === 0 || i === span.length - 1) posts.push({ x, z, top, bottom: tall ? deck - RAIL_FOOT : Math.min(ground, deck) - POST_FOOT });
      if (tall && i % PIER_EVERY === 0) piers.push({ x, z, top: deck - GIRDER_DEPTH / 2, bottom: ground - POST_FOOT, radius: Math.min(PIER_MAX_RADIUS, PIER_RADIUS + drop * PIER_TAPER) });
      if (i > 0) {
        const q = span[i - 1];
        rails.push({ a: { x: q.x + nx * s, y: yAt(q.x, q.z) + RAIL_HEIGHT, z: q.z + nz * s }, b: { x, y: top, z } });
      }
    });
  }
  if (piers.length > 0) {
    span.forEach((p, i) => {
      if (i === 0) return;
      const q = span[i - 1];
      girder.push({ a: { x: q.x, y: yAt(q.x, q.z) - GIRDER_DEPTH / 2, z: q.z }, b: { x: p.x, y: yAt(p.x, p.z) - GIRDER_DEPTH / 2, z: p.z } });
    });
  }
  return { posts, rails, piers, girder };
}

/** A box from a to b. */
function beam(a: THREE.Vector3Like, b: THREE.Vector3Like, w: number, h: number): THREE.BufferGeometry {
  const from = new THREE.Vector3().copy(a), to = new THREE.Vector3().copy(b);
  const turn = new THREE.Matrix4().lookAt(to, from, new THREE.Vector3(0, 1, 0));
  return new THREE.BoxGeometry(w, h, from.distanceTo(to)).applyMatrix4(turn).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return geo;
}

/** The rail and its posts, and over a drop the concrete that holds the deck up. */
function frameGeometry(field: WorldField, span: Vec2[], width: number, yAt: (x: number, z: number) => number): { rail: THREE.BufferGeometry; piers: THREE.BufferGeometry | null } {
  const { posts, rails, piers, girder } = bridgeFrame(field, span, width, yAt);
  const rail = merged([
    ...posts.map((p) => new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, p.top - p.bottom, 6).translate(p.x, (p.top + p.bottom) / 2, p.z)),
    ...rails.map(({ a, b }) => beam(a, b, RAIL_THICK, RAIL_THICK)),
  ]);
  if (piers.length === 0) return { rail, piers: null };
  return {
    rail,
    piers: merged([
      ...piers.map((p) => new THREE.CylinderGeometry(p.radius * 0.8, p.radius, p.top - p.bottom, 8).translate(p.x, (p.top + p.bottom) / 2, p.z)),
      ...girder.map(({ a, b }) => beam(a, b, width * GIRDER_WIDTH, GIRDER_DEPTH)),
    ]),
  };
}

function deckGeometry(d: { positions: number[]; indices: number[] }): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
  geo.setIndex(d.indices);
  geo.computeVertexNormals();
  return geo;
}

/** The runs of plain road between a road's spans: no ribbon of it lies over water. */
function plainRuns(points: Vec2[], bridge: boolean[]): Vec2[][] {
  const out: Vec2[][] = [];
  let run: Vec2[] = points.slice(0, 1);
  for (let i = 0; i < bridge.length; i++) {
    if (bridge[i]) {
      if (run.length > 1) out.push(run);
      run = [points[i + 1]];
    } else run.push(points[i + 1]);
  }
  if (run.length > 1) out.push(run);
  return out;
}

export function buildRoadMeshes(field: WorldField, roads: Road[]): THREE.Group {
  const group = new THREE.Group();
  for (const road of roads) {
    const { points, bridge, yAt } = drawnRoad(field, road);
    const ocean = field.deckY != null;
    // In ~45 m pieces, so the parts beyond the loaded terrain can be hidden (RangeCuller).
    for (const land of ocean ? [points] : plainRuns(points, bridge)) {
      for (const run of pieces(land)) {
        const mesh = new THREE.Mesh(ribbonGeometry(run, road.width / 2, yAt), road.paved ? asphaltMat : ocean ? woodMat : roadMat);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    if (ocean) continue;
    for (const deck of bridgeDeckData(field, road)) {
      const mesh = new THREE.Mesh(deckGeometry(deck), road.paved ? asphaltMat : woodMat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const [j, e] of spansIn(bridge)) {
      const { rail, piers } = frameGeometry(field, points.slice(j, e + 2), road.width, yAt);
      const frame = new THREE.Mesh(rail, under);
      frame.castShadow = true;
      group.add(frame);
      if (piers) {
        const held = new THREE.Mesh(piers, pierMat);
        held.castShadow = true;
        group.add(held);
      }
    }
  }
  return group;
}

/** Deck mesh data (same vertices as the drawn ribbon) for each run of bridge spans, plus one ramp step onto each bank. */
export function bridgeDeckData(field: RoadGround, road: Road): Array<{ positions: number[]; indices: number[] }> {
  const { points, bridge, yAt } = drawnRoad(field, road);
  return spansIn(bridge).map(([j, e]) => ribbonData(points.slice(Math.max(0, j - 1), Math.min(bridge.length - 1, e + 1) + 2), road.width / 2, yAt));
}

/** One thin trimesh per bridge run, built from the same vertices as the drawn deck. Free with removeBridgeColliders on rebuild. */
export function addBridgeColliders(field: RoadGround, roads: Road[], physics: Pick<Physics, 'addTerrain'>): Collider[] {
  const out: Collider[] = [];
  for (const road of roads) {
    for (const d of bridgeDeckData(field, road)) {
      if (d.indices.length === 0) continue;
      out.push(physics.addTerrain(new Float32Array(d.positions), new Uint32Array(d.indices)));
    }
  }
  return out;
}

export function removeBridgeColliders(colliders: Collider[], physics: Pick<Physics, 'removeCollider'>): void {
  for (const c of colliders) physics.removeCollider(c);
  colliders.length = 0;
}
