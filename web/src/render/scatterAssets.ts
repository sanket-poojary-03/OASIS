import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloraLayer } from '../core/recipe';
import { parseFloraKey, type FloraKey, type ItemKind, type ScatterItem, type ScatterKind } from '../world/scatter';
import { standInTrunk, type TrunkShape } from '../world/trunks';
import { fitToHeight } from './fit';
import { bandOf, baseOf } from './meshCollider';
import { NOT_REFLECTED } from './layers';

interface PartOpts { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; rz?: number }

function part(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function build(kind: ScatterKind): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  switch (kind) {
    case 'tree':
      P.push(part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), 0x6b4a2b, { y: 1.2 }));
      P.push(part(new THREE.IcosahedronGeometry(1.7, 0), 0x3f7a32, { y: 3.4 }));
      P.push(part(new THREE.IcosahedronGeometry(1.2, 0), 0x4c8a3a, { y: 4.5 }));
      break;
    case 'pine':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), 0x5a3d25, { y: 0.8 }));
      P.push(part(new THREE.ConeGeometry(1.6, 3, 7), 0x2f5a35, { y: 2.6 }));
      P.push(part(new THREE.ConeGeometry(1.2, 2.4, 7), 0x356640, { y: 4.0 }));
      P.push(part(new THREE.ConeGeometry(0.8, 1.8, 7), 0x3b7048, { y: 5.2 }));
      break;
    case 'dead_tree':
      P.push(part(new THREE.CylinderGeometry(0.12, 0.22, 3, 5), 0x5a4a3a, { y: 1.5 }));
      P.push(part(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 4), 0x5a4a3a, { rz: 0.9, x: 0.45, y: 2.3 }));
      P.push(part(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 4), 0x5a4a3a, { rz: -0.8, x: -0.35, y: 2.0 }));
      break;
    case 'bush':
      P.push(part(new THREE.IcosahedronGeometry(0.9, 0), 0x4a7a34, { y: 0.5, sy: 0.7 }));
      break;
    case 'rock':
      P.push(part(new THREE.DodecahedronGeometry(0.9, 0), 0x7a756e, { y: 0.3, sy: 0.6 }));
      break;
    case 'cactus':
      P.push(part(new THREE.CylinderGeometry(0.25, 0.3, 2.6, 8), 0x3d7a3a, { y: 1.3 }));
      P.push(part(new THREE.CylinderGeometry(0.16, 0.16, 1, 6), 0x3d7a3a, { x: 0.5, y: 1.6 }));
      P.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 6), 0x3d7a3a, { x: -0.45, y: 1.1 }));
      break;
    case 'reed':
      for (const [x, z] of [[0, 0], [0.2, 0.1], [-0.15, 0.18]]) P.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 3), 0x7a8a46, { x, y: 0.8, z }));
      break;
    // Offline stand-ins for the newer kinds (with a server they wait for their pack model instead).
    case 'birch':
      P.push(part(new THREE.CylinderGeometry(0.14, 0.2, 3, 6), 0xe8e4d8, { y: 1.5 }));
      P.push(part(new THREE.IcosahedronGeometry(1.3, 0), 0x7fae4a, { y: 3.8, sy: 1.3 }));
      break;
    case 'autumn_tree':
      P.push(part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), 0x6b4a2b, { y: 1.2 }));
      P.push(part(new THREE.IcosahedronGeometry(1.7, 0), 0xc8682a, { y: 3.4 }));
      break;
    case 'snowy_pine':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), 0x5a3d25, { y: 0.8 }));
      P.push(part(new THREE.ConeGeometry(1.6, 3.4, 7), 0xe6edf2, { y: 2.8 }));
      P.push(part(new THREE.ConeGeometry(1.0, 2.4, 7), 0xf4f7fa, { y: 4.6 }));
      break;
    case 'palm':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 6, 6), 0x8a6a45, { y: 3, rz: 0.12 }));
      for (let i = 0; i < 5; i++) P.push(part(new THREE.BoxGeometry(2.4, 0.06, 0.5), 0x4f8a3a, { x: 0.35, y: 6, rz: -0.35 }).rotateY((i / 5) * Math.PI * 2));
      break;
    case 'pebble':
      P.push(part(new THREE.DodecahedronGeometry(0.3, 0), 0x8a857c, { y: 0.1, sy: 0.5 }));
      break;
    case 'flowers':
      for (const [x, z, c] of [[0, 0, 0xe05a7a], [0.25, 0.1, 0xf2d04a], [-0.2, 0.2, 0xb07ae0]] as const) P.push(part(new THREE.ConeGeometry(0.1, 0.4, 5), c, { x, y: 0.2, z }));
      break;
    case 'fern':
      P.push(part(new THREE.ConeGeometry(0.6, 0.8, 6), 0x3f7a32, { y: 0.4 }));
      break;
    case 'mushroom':
      P.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), 0xeee6d6, { y: 0.12 }));
      P.push(part(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xc0392b, { y: 0.24 }));
      break;
    case 'log':
      P.push(part(new THREE.CylinderGeometry(0.25, 0.28, 3, 7), 0x6b4a2b, { y: 0.25, rz: Math.PI / 2 }));
      break;
    case 'stump':
      P.push(part(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 7), 0x6b4a2b, { y: 0.3 }));
      break;
  }
  return mergeGeometries(P, false)!;
}

/** Small things not worth drawing past the nearest chunks. */
const GROUND_COVER: ReadonlySet<ScatterKind> = new Set(['pebble', 'flowers', 'fern', 'mushroom', 'reed', 'stump', 'log', 'bush']);
const SHADOW: ReadonlySet<ScatterKind> = new Set(['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'cactus']);
/** The preset kind a named plant of each layer looks like until (or unless) its own model arrives. */
export const FLORA_FALLBACK: Record<FloraLayer, ScatterKind> = { canopy: 'tree', shrub: 'bush', ground: 'fern', rock: 'rock' };
const isGroundCover = (kind: ItemKind): boolean => {
  const named = parseFloraKey(kind);
  return named ? named.layer === 'shrub' || named.layer === 'ground' : GROUND_COVER.has(kind as ScatterKind);
};
const castsShadow = (kind: ItemKind): boolean => {
  const named = parseFloraKey(kind);
  return named ? named.layer === 'canopy' : SHADOW.has(kind as ScatterKind);
};
/**
 * Variants drawn per kind: every (kind, variant) is one draw call per chunk, and 49 chunks are live. Trees, which you
 * notice, use up to 4 models; ground cover and shrubs 2.
 */
export const drawnVariants = (kind: ItemKind): number => (castsShadow(kind) ? 4 : 2);
/**
 * The outer rings draw only a kind's lightest models: nobody counts the branches at 150 m, and one oak can be 6k
 * triangles to another's 3.5k. Oaks alone were more than half of what a wooded view drew (measured on the start screen).
 */
const FAR_VARIANTS = 2;

/** Attributes a pack model may keep when its meshes are merged (only those every mesh has). */
const KEEP = ['position', 'normal', 'uv', 'color'];

type Drawn = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };
/**
 * A pack model, with a lighter copy for the outer rings when it was given one (render/lightModel), and where its trunk
 * stands: fitting centres the whole model, so a leaning canopy puts the trunk a metre or more off its middle.
 */
type Model = Drawn & { far?: Drawn; trunk: TrunkShape };

export class ScatterAssets {
  private readonly geos = new Map<ScatterKind, THREE.BufferGeometry>();
  /** Every pack model a kind has (its variants); an item draws `variant % count`. */
  private readonly models = new Map<ItemKind, Model[]>();
  /** Named plants with no model of their own: drawn as this preset kind instead (FLORA_FALLBACK). */
  private readonly fallbacks = new Map<FloraKey, ScatterKind>();
  /** Named plants already asked for, so a rebuild or an edit never fetches one twice. */
  private readonly asked = new Set<FloraKey>();
  /**
   * Stand-in shapes allowed: only while no server has answered. With a server a kind without its pack model yet is not drawn at all (it
   * appears when the model arrives, via ChunkManager.refreshScatter), so no placeholder trees ever show.
   */
  standIns = true;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private readonly dummy = new THREE.Object3D();

  private geometry(kind: ItemKind): THREE.BufferGeometry {
    const named = parseFloraKey(kind);
    const shape = named ? FLORA_FALLBACK[named.layer] : (kind as ScatterKind);
    let g = this.geos.get(shape);
    if (!g) { g = build(shape); this.geos.set(shape, g); }
    return g;
  }

  hasModel(kind: ItemKind): boolean {
    return (this.models.get(kind)?.length ?? 0) > 0;
  }

  /** How many pack models (variants) a kind has. */
  modelCount(kind: ItemKind): number {
    return this.models.get(kind)?.length ?? 0;
  }

  /** True the first time a named plant is asked for; false ever after. */
  claim(kind: FloraKey): boolean {
    if (this.asked.has(kind)) return false;
    this.asked.add(kind);
    return true;
  }

  /** Draw a named plant that has no model of its own as a preset kind's models. */
  useFallback(kind: FloraKey, preset: ScatterKind): void {
    this.fallbacks.set(kind, preset);
  }

  /** A kind's own models, or its fallback's. */
  private modelsFor(kind: ItemKind) {
    const own = this.models.get(kind);
    if (own?.length) return own;
    const preset = this.fallbacks.get(kind as FloraKey);
    return preset ? this.models.get(preset) : undefined;
  }

  /**
   * Add a pack model (one more variant) for a kind, replacing its procedural shape: merged into one geometry (one material group per mesh), fitted to
   * `height` with fitToHeight, standing on y = 0. Takes ownership of `object` (it is rescaled). Live chunks keep their
   * old instances until ChunkManager.refreshScatter() re-instances them. If nothing can be merged the kind stays procedural.
   * `far`: a lighter copy of the same model, drawn in the outer rings instead.
   */
  useModel(kind: ItemKind, object: THREE.Object3D, height: number, far?: THREE.Object3D): void {
    const near = this.merge(object, height);
    if (!near) return;
    const model: Model = { ...near, far: far ? this.merge(far, height) ?? undefined : undefined, trunk: trunkOf(object, height) };
    const list = this.models.get(kind) ?? [];
    list.push(model);
    list.sort((a, b) => a.geometry.getAttribute('position').count - b.geometry.getAttribute('position').count); // lightest first: see FAR_VARIANTS
    this.models.set(kind, list);
  }

  private merge(object: THREE.Object3D, height: number): Drawn | null {
    fitToHeight(object, height);
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let g = o.geometry.clone() as THREE.BufferGeometry;
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(o.matrixWorld);
      g.morphAttributes = {};
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      geos.push(g);
      mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
    });
    if (geos.length === 0) return null;
    const keep = KEEP.filter((a) => geos.every((g) => g.getAttribute(a)));
    for (const g of geos) for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    const merged = mergeGeometries(geos, true);
    for (const g of geos) g.dispose();
    if (!merged) return null;
    // A material that reads vertex colours would turn black once a mesh without them forced the attribute out.
    const fixed = mats.map((m) => {
      if (keep.includes('color') || !(m as THREE.MeshStandardMaterial).vertexColors) return m;
      const c = m.clone();
      (c as THREE.MeshStandardMaterial).vertexColors = false;
      return c;
    });
    return { geometry: merged, material: fixed.length === 1 ? fixed[0] : fixed };
  }

  /** Which of a kind's models an item is drawn with at `lod` (see instance), or -1 for its stand-in shape. */
  private variantOf(it: ScatterItem, models: Model[] | undefined, lod: number): number {
    return models?.length ? (it.variant ?? 0) % Math.min(models.length, lod > 0 ? FAR_VARIANTS : drawnVariants(it.kind)) : -1;
  }

  /**
   * The trunk of the model a near item is drawn with (colliders exist only near the player, at lod 0), in its own space
   * at scale 1; a stand-in's is in its middle, sized by `height`. Null when the item is not drawn at all.
   */
  trunkShape(it: ScatterItem, height: number): TrunkShape | null {
    const models = this.modelsFor(it.kind);
    const v = this.variantOf(it, models, 0);
    if (v >= 0) return models![v].trunk;
    return this.standIns ? standInTrunk(height) : null;
  }

  /**
   * `lod`: 0 for the chunks around the camera (everything, with shadows); 1 and 2 for the outer rings, which keep only
   * trees, rocks and other big things, thinned to 1 in 3 and 1 in 5, and cast no shadows. Library trees are 3-6k
   * triangles each: measured on an integrated GPU, drawing every one of ~1,500 at full detail ran a city at 1.5 fps,
   * and with 1 in 2 / 1 in 3 the outer rings still cost an island 11 of its 54 fps at 1080p (they are mostly in fog).
   */
  instance(items: ScatterItem[], lod = 0): THREE.Group {
    const group = new THREE.Group();
    if (lod > 0) items = items.filter((it, i) => !isGroundCover(it.kind) && i % (2 * lod + 1) === 0);
    // One instanced mesh per (kind, variant) actually used.
    const groups = new Map<string, { kind: ItemKind; model?: Drawn; list: ScatterItem[] }>();
    for (const it of items) {
      const models = this.modelsFor(it.kind);
      if (!models?.length && !this.standIns) continue; // with a server: real model or nothing
      const v = this.variantOf(it, models, lod);
      const key = `${it.kind}#${v}`;
      const model = v >= 0 ? models![v] : undefined;
      const g = groups.get(key) ?? { kind: it.kind, model: lod > 0 ? model?.far ?? model : model, list: [] };
      g.list.push(it);
      groups.set(key, g);
    }
    for (const { kind, model, list } of groups.values()) {
      const mesh = new THREE.InstancedMesh(model?.geometry ?? this.geometry(kind), model?.material ?? this.material, list.length);
      list.forEach((it, i) => {
        this.dummy.position.set(it.x, it.y, it.z);
        this.dummy.rotation.set(0, it.rotation, 0);
        this.dummy.scale.setScalar(it.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = lod === 0 && castsShadow(kind);
      mesh.receiveShadow = true;
      if (lod > 0 || isGroundCover(kind)) mesh.layers.set(NOT_REFLECTED);
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
}

/** No measured trunk is wider than this share of its tree: a model with a ground patch under it is not a wall. */
const WIDEST_TRUNK = 0.2;
/** Where the player meets a trunk, in metres above the model's foot: from the knee to the shoulder. */
const BODY_FROM = 0.5, BODY_TO = 1.5;

/**
 * A fitted model's trunk where the player touches it (meshCollider.bandOf): the middle and mean half-width. A model with
 * nothing at that height (a floating tree) falls back to where it meets the ground.
 */
function trunkOf(object: THREE.Object3D, height: number): TrunkShape {
  const b = bandOf(object, BODY_FROM, BODY_TO) ?? baseOf(object);
  const radius = Math.min(height * WIDEST_TRUNK, (b.maxX - b.minX + b.maxZ - b.minZ) / 4);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, radius };
}
