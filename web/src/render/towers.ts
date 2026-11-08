import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { Facade, TowerSpec } from '../world/towerSpec';
import { glowsAtNight } from './nightGlow';

/**
 * Draws a TowerSpec as one mesh: façade sides, roofs, trim and a shop floor are four materials of one merged geometry.
 * Façade textures hold 4 bays × 4 floors (some windows dark at night), shared by every building with the same façade
 * and colour; the UVs are in floors and bays, so windows line up across setbacks.
 */
const CELL = 16;
const CELLS = 4;
const SIZE = CELL * CELLS;
/** Dimmer than a cottage's few windows: a tower has hundreds, and together they washed the whole building out in the bloom. */
const NIGHT_WARM = new THREE.Color(0xffd29a).multiplyScalar(0.55);

type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const shade = (c: Rgb, k: number): Rgb => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** What a pixel (x, y from the bottom-left, in one 16 px cell) of a façade is: wall, frame, pane, or a sill. */
function cellPixel(facade: Facade | 'shop', x: number, y: number): 'wall' | 'frame' | 'pane' {
  switch (facade) {
    case 'glass': return x === 0 || y === 0 ? 'frame' : y <= 2 ? 'wall' : 'pane'; // curtain wall: mullions and spandrels
    case 'office': return y >= 5 && y <= 13 ? (x === 0 || x === 8 ? 'frame' : 'pane') : 'wall'; // ribbon windows
    case 'apartment': return x >= 4 && x <= 11 && y >= 4 && y <= 12 ? (x === 4 || x === 11 || y === 4 || y === 12 ? 'frame' : 'pane') : y === 3 && x >= 3 && x <= 12 ? 'frame' : 'wall';
    case 'shop': return y >= 13 ? 'wall' : x === 0 || y === 0 ? 'frame' : 'pane'; // storefront glass under a fascia
  }
}

const textures = new Map<string, { map: THREE.DataTexture; glow: THREE.DataTexture }>();

function facadeTextures(facade: Facade | 'shop', body: number, trim: number): { map: THREE.DataTexture; glow: THREE.DataTexture } {
  const key = `${facade}:${body}:${trim}`;
  let t = textures.get(key);
  if (t) return t;
  const wall = facade === 'glass' ? shade(rgb(body), 0.7) : rgb(body);
  const frame = facade === 'apartment' ? [236, 232, 224] as Rgb : rgb(trim);
  const pane = facade === 'glass' ? rgb(body) : [78, 98, 118] as Rgb;
  const colour = new Uint8Array(SIZE * SIZE * 4), mask = new Uint8Array(SIZE * SIZE * 4);
  const rng = mulberry32(body ^ (trim << 1));
  const lit = Array.from({ length: CELLS * CELLS }, () => facade === 'shop' || rng() < 0.62);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const kind = cellPixel(facade, x % CELL, y % CELL);
    const cellLit = lit[Math.floor(y / CELL) * CELLS + Math.floor(x / CELL)];
    // Panes are lighter near their top (sky reflection); glass varies a little per pane.
    const sky = kind === 'pane' ? 0.8 + 0.5 * ((y % CELL) / CELL) : 1;
    const c = kind === 'wall' ? wall : kind === 'frame' ? frame : shade(pane, sky * (facade === 'glass' ? 0.9 + 0.2 * (cellLit ? 1 : 0) : 1));
    const i = (y * SIZE + x) * 4;
    colour.set([c[0], c[1], c[2], 255], i);
    // A pane of a curtain wall is a whole bay: at full light a glass tower was a board of white squares.
    const g = kind === 'pane' && cellLit ? (facade === 'glass' ? 120 : 255) : 0;
    mask.set([g, g, g, 255], i);
  }
  const make = (data: Uint8Array, srgb: boolean): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  t = { map: make(colour, true), glow: make(mask, false) };
  textures.set(key, t);
  return t;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = materials.get(key);
  if (!m) { m = make(); materials.set(key, m); }
  return m;
}

function facadeMaterial(facade: Facade | 'shop', body: number, trim: number): THREE.MeshStandardMaterial {
  return material(`f:${facade}:${body}:${trim}`, () => {
    const { map, glow } = facadeTextures(facade, body, trim);
    const glass = facade === 'glass' || facade === 'shop';
    const m = new THREE.MeshStandardMaterial({
      map, emissiveMap: glow, emissive: NIGHT_WARM, emissiveIntensity: 0,
      roughness: glass ? 0.3 : 0.85, metalness: 0, // nothing here to reflect: metal would only draw dark (see render/matte)
    });
    m.name = 'tower-window';
    glowsAtNight(m);
    return m;
  });
}
const plain = (hex: number, roughness = 0.85): THREE.MeshStandardMaterial =>
  material(`p:${hex}:${roughness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, flatShading: true }));

/** The four sides of a box, UVs in façade cells (one cell = one bay wide, one floor tall; 4 × 4 per texture). */
function sides(cx: number, cz: number, w: number, d: number, y0: number, y1: number, bay: number, floor: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const hw = w / 2, hd = d / 2;
  const faces: Array<{ a: [number, number]; b: [number, number]; n: [number, number] }> = [
    { a: [-hw, hd], b: [hw, hd], n: [0, 1] },
    { a: [hw, hd], b: [hw, -hd], n: [1, 0] },
    { a: [hw, -hd], b: [-hw, -hd], n: [0, -1] },
    { a: [-hw, -hd], b: [-hw, hd], n: [-1, 0] },
  ];
  for (const f of faces) {
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    // Whole bays per face (stretched a little), so a face never ends in half a window.
    const u1 = Math.max(1, Math.round(len / bay)) / CELLS, v0 = y0 / floor / CELLS, v1 = y1 / floor / CELLS;
    const base = pos.length / 3;
    for (const [[x, z], y, u, v] of [[f.a, y0, 0, v0], [f.b, y0, u1, v0], [f.b, y1, u1, v1], [f.a, y1, 0, v1]] as const) {
      pos.push(cx + x, y, cz + z);
      nor.push(f.n[0], 0, f.n[1]);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylinder = (r: number, h: number, x: number, y: number, z: number, top = r): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(top, r, h, 10).translate(x, y + h / 2, z);

/** The building as one mesh, standing on y = 0, centred on x/z. */
export function buildTower(spec: TowerSpec, seed: number): THREE.Mesh {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const facadeParts: THREE.BufferGeometry[] = [], shopParts: THREE.BufferGeometry[] = [], roofParts: THREE.BufferGeometry[] = [], trimParts: THREE.BufferGeometry[] = [];
  const { bay, floor } = spec;
  const first = spec.tiers[0];
  // A shop floor wider than the tower, with a fascia band; the tower's own façade starts above it.
  let start = 0;
  if (spec.podium) {
    const p = spec.podium;
    shopParts.push(sides(0, 0, p.w, p.d, 0, p.h, 4, p.h));
    trimParts.push(box(p.w + 0.3, 0.45, p.d + 0.3, 0, p.h, 0));
    roofParts.push(box(p.w, 0.05, p.d, 0, p.h - 0.04, 0));
    start = p.h;
  }
  for (const t of spec.tiers) {
    const y0 = Math.max(t.y, t === first ? start : t.y), y1 = t.y + t.h;
    if (y1 > y0) facadeParts.push(sides(0, 0, t.w, t.d, y0, y1, bay, floor));
    roofParts.push(box(t.w - 0.1, 0.1, t.d - 0.1, 0, y1 - 0.08, 0));
    trimParts.push(box(t.w + 0.25, 0.6, t.d + 0.25, 0, y1, 0)); // parapet / setback ledge
  }
  const top = spec.tiers[spec.tiers.length - 1];
  const roofY = top.y + top.h + 0.6;
  switch (spec.roof) {
    case 'plant':
      roofParts.push(box(top.w * (0.3 + rng() * 0.2), 2.2, top.d * (0.3 + rng() * 0.2), (rng() - 0.5) * top.w * 0.3, roofY, (rng() - 0.5) * top.d * 0.3));
      if (rng() < 0.6) roofParts.push(box(top.w * 0.2, 1.4, top.d * 0.25, top.w * 0.28, roofY, -top.d * 0.25));
      break;
    case 'tank':
      trimParts.push(cylinder(1.1, 2.4, top.w * 0.2, roofY + 1.6, top.d * 0.15, 1.1), cylinder(1.25, 0.6, top.w * 0.2, roofY + 4, top.d * 0.15, 0.1));
      for (const [sx, sz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) trimParts.push(box(0.15, 1.6, 0.15, top.w * 0.2 + sx, roofY, top.d * 0.15 + sz));
      break;
    case 'spire':
      roofParts.push(box(top.w * 0.45, 2.5, top.d * 0.45, 0, roofY, 0));
      trimParts.push(cylinder(0.35, top.h * 0.25 + 6, 0, roofY + 2.5, 0, 0.06));
      break;
    case 'crown':
      // Fins rising past the roof on every side: the crown of an office tower.
      trimParts.push(box(top.w + 0.2, 3.2, 0.25, 0, roofY - 0.6, top.d / 2), box(top.w + 0.2, 3.2, 0.25, 0, roofY - 0.6, -top.d / 2));
      trimParts.push(box(0.25, 3.2, top.d + 0.2, top.w / 2, roofY - 0.6, 0), box(0.25, 3.2, top.d + 0.2, -top.w / 2, roofY - 0.6, 0));
      break;
    case 'flat': break;
  }
  // A door-height entrance canopy on the front (+z) when there is no shop floor.
  if (!spec.podium) trimParts.push(box(Math.min(4, first.w * 0.5), 0.25, 1.4, 0, 3, first.d / 2 + 0.7));

  const groups: Array<[THREE.BufferGeometry[], THREE.Material]> = [
    [facadeParts, facadeMaterial(spec.facade, spec.body, spec.trim)],
    [shopParts, facadeMaterial('shop', 0x3a4654, spec.trim)],
    [roofParts, plain(0x6a6d72)],
    [trimParts, plain(spec.trim, 0.6)],
  ];
  const used = groups.filter(([parts]) => parts.length > 0);
  const merged = mergeGeometries(used.map(([parts]) => mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p))), true);
  for (const [parts] of used) for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(merged, used.map(([, m]) => m));
  mesh.name = 'tower';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
