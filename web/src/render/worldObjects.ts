import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Interaction, PlaceKind, PlaceSize } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { BuiltWorld } from '../world/build';
import type { Building } from '../world/settlement';
import { fitToHeight } from './fit';
import { addNightGlow } from './nightGlow';
import { buildPlaceholder } from './placeholders';

export interface ObjectInfo {
  placeId: string;
  objectId: string;
  label: string;
  description?: string;
  reasons: string[];
  warnings: string[];
  source: 'placeholder' | 'library' | 'online' | 'generated';
  /** Attribution for CC-BY models found online, e.g. "Giraffe by X (CC-BY 3.0, Poly Pizza)". */
  credit?: string;
  interaction: Interaction;
  kind: PlaceKind | 'building';
}

export interface ModelSource {
  /** `variant` picks between equally good library models (house 0, 1, 2… of a village); 0 is the default model. */
  load(asset: string, kind: PlaceKind, variant?: number): Promise<{ object: THREE.Object3D; source: 'library' | 'online' | 'generated'; credit?: string } | null>;
  /** Optional: forget remembered misses (new world, or the backend is reachable again). */
  reset?(): void;
}

/** A place added while playing waits for its model: loading, then ready, missing (simple shape shown) or cancelled. */
export interface LoadingEvent { placeId: string; label: string; state: 'loading' | 'ready' | 'missing' | 'cancelled' }

export class NullModelSource implements ModelSource {
  async load(): Promise<null> { return null; }
}

const HEIGHT: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 5, medium: 6, large: 7 },
  landmark: { small: 10, medium: 16, large: 24 },
  structure: { small: 4, medium: 6, large: 9 },
  prop: { small: 1, medium: 1.6, large: 2.4 },
};

/**
 * A placed copy of a loaded model. SkeletonUtils.clone gives a rigged model its own bones (Object3D.clone would keep
 * skinning it with the template's bones, which are not in the scene: drawn at the origin, unscaled). Unrigged models
 * clone as usual. A skinned mesh's bounds come from the bind pose, so it is never frustum-culled by them.
 */
export function cloneModel(object: THREE.Object3D): THREE.Object3D {
  const copy = SkeletonUtils.clone(object);
  copy.traverse((o) => { if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false; });
  return copy;
}

/** Scale to a target height, centre on x/z, stand on y = 0. Returns a group named "content". */
/** Most a model is stretched upward to keep a tall group member's height on a narrow plot. */
const MAX_STRETCH = 3;

/**
 * Shrink `object` when its footprint is wider than `max` metres, so big models stay on their plot. Uniform by default;
 * with `keepHeight` (towers in a "tall" group) only the footprint narrows, stretching the height by at most 3x.
 */
export function fitWidth(object: THREE.Object3D, max: number, keepHeight = false): THREE.Object3D {
  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const w = Math.max(size.x, size.z);
  if (w > max && w > 0) {
    const k = max / w;
    object.scale.x *= k;
    object.scale.z *= k;
    object.scale.y *= keepHeight ? Math.min(1, k * MAX_STRETCH) : k;
  }
  object.updateMatrixWorld(true);
  return object;
}

export function normalizeTo(object: THREE.Object3D, height: number): THREE.Group {
  fitToHeight(object, height);
  const g = new THREE.Group();
  g.name = 'content';
  g.add(object);
  return g;
}

function shadows(o: THREE.Object3D): void {
  o.traverse((m) => { if (m instanceof THREE.Mesh) { m.castShadow = true; m.receiveShadow = true; } });
}

interface Spec { asset: string; kind: PlaceKind; variant: number; height: number; maxWidth?: number; x: number; y: number; z: number; rotation: number; info: ObjectInfo }
interface Entry { root: THREE.Group; spec: Spec; collider: Collider | null }

/** A group member's own height (city towers), else the size's house height; centre pieces by what they are. */
function buildingHeight(b: Building, size: PlaceSize): number {
  if (b.height) return b.height;
  if (b.kind === 'house') return HEIGHT.settlement[size];
  return b.kind === 'centre' && b.interaction === 'fire' ? 1.2 : 3;
}

function buildingLabel(b: Building, placeLabel: string, grouped: boolean): string {
  if (b.kind === 'house') return grouped ? `${placeLabel} — ${b.asset}` : `${placeLabel} — house`;
  return `${placeLabel} — ${b.kind === 'centre' ? b.asset : b.kind}`;
}

export class WorldObjects {
  readonly group = new THREE.Group();
  /** Fired when an object appears (placeholder) and again when its loaded model replaces the placeholder. */
  readonly onReady: Array<(root: THREE.Group, info: ObjectInfo) => void> = [];
  readonly onCleared: Array<() => void> = [];
  readonly onLoading: Array<(e: LoadingEvent) => void> = [];
  private entries: Entry[] = [];
  private version = 0;
  /** Places still waiting for their first model (label by id); they keep waiting across rebuilds. */
  private readonly waiting = new Map<string, string>();
  /** This rebuild's objects still loading per waiting place, and whether any found no model. */
  private pending = new Map<string, { left: number; missing: boolean }>();

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly models: ModelSource) {
    scene.add(this.group);
  }

  /**
   * `wait`: places added or changed while playing. They show nothing until their model arrives (no stand-in house
   * first), and onLoading reports their progress; the simple shape appears only if no model is found.
   */
  rebuild(world: BuiltWorld, wait: ReadonlySet<string> = new Set()): void {
    this.clear();
    const version = ++this.version;
    const specs: Spec[] = [];
    for (const pl of world.placements) {
      const place = world.recipe.places.find((p) => p.id === pl.id);
      if (!place || place.kind === 'settlement') continue;
      specs.push({
        asset: place.asset, kind: place.kind, variant: 0, height: HEIGHT[place.kind][place.size], x: pl.x, y: pl.y, z: pl.z, rotation: pl.rotation,
        info: { placeId: pl.id, objectId: pl.id, label: place.label, description: place.description, reasons: pl.reasons, warnings: pl.warnings, source: 'placeholder', interaction: place.interaction, kind: place.kind },
      });
    }
    for (const b of world.buildings) {
      const place = world.recipe.places.find((p) => p.id === b.placeId);
      const pl = world.placements.find((p) => p.id === b.placeId);
      if (!place) continue;
      specs.push({
        // `village-house-3` → 3, so every house can be a different model; `…-centre` → 0.
        asset: b.asset, kind: 'structure', variant: Number(b.id.split('-').pop()) || 0, height: buildingHeight(b, place.size), maxWidth: b.maxWidth, x: b.x, y: b.y, z: b.z, rotation: b.rotation,
        info: { placeId: place.id, objectId: b.id, label: buildingLabel(b, place.label, !!place.layout), description: place.description, reasons: pl?.reasons ?? [], warnings: pl?.warnings ?? [], source: 'placeholder', interaction: b.interaction, kind: 'building' },
      });
    }
    const labels = new Map(world.recipe.places.map((p) => [p.id, p.label]));
    const waitIds = new Set([...wait, ...this.waiting.keys()]);
    const present = new Set(specs.map((s) => s.info.placeId));
    for (const [id, label] of [...this.waiting]) {
      if (!present.has(id)) { this.waiting.delete(id); this.emit(id, label, 'cancelled'); }
    }
    this.pending = new Map();
    for (const s of specs) {
      const id = s.info.placeId;
      if (!waitIds.has(id)) continue;
      const p = this.pending.get(id) ?? { left: 0, missing: false };
      p.left++;
      this.pending.set(id, p);
    }
    for (const id of this.pending.keys()) {
      if (!this.waiting.has(id)) { this.waiting.set(id, labels.get(id) ?? id); this.emit(id, labels.get(id) ?? id, 'loading'); }
    }
    for (const s of specs) this.spawn(s, version, this.pending.has(s.info.placeId));
  }

  private emit(placeId: string, label: string, state: LoadingEvent['state']): void {
    for (const cb of this.onLoading) cb({ placeId, label, state });
  }

  /** One object of a waiting place has its model (or none); the place is done when all of its objects are. */
  private settle(placeId: string, missing: boolean): void {
    const p = this.pending.get(placeId);
    if (!p) return;
    p.missing ||= missing;
    if (--p.left > 0) return;
    this.pending.delete(placeId);
    const label = this.waiting.get(placeId) ?? placeId;
    this.waiting.delete(placeId);
    this.emit(placeId, label, p.missing ? 'missing' : 'ready');
  }

  pickables(): THREE.Object3D[] {
    return this.entries.map((e) => e.root);
  }

  infoFor(o: THREE.Object3D): ObjectInfo | null {
    for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (cur.userData.info) return cur.userData.info as ObjectInfo;
    return null;
  }

  private spawn(s: Spec, version: number, wait: boolean): void {
    const root = new THREE.Group();
    root.position.set(s.x, s.y, s.z);
    root.rotation.y = s.rotation;
    root.userData.info = s.info;
    root.userData.size = new THREE.Vector3();
    this.group.add(root);
    const entry: Entry = { root, spec: s, collider: null };
    this.entries.push(entry);
    const placeholder = (): void => {
      this.setContent(root, this.fit(normalizeTo(buildPlaceholder(s.asset, s.height), s.height), s));
      this.refreshCollider(entry);
      for (const cb of this.onReady) cb(root, s.info);
    };
    if (!wait) placeholder();
    void this.models.load(s.asset, s.kind, s.variant).catch(() => null).then((res) => {
      if (version !== this.version) return;
      if (wait) this.settle(s.info.placeId, !res);
      if (!res) { if (wait) placeholder(); return; }
      const content = this.fit(normalizeTo(cloneModel(res.object), s.height), s);
      addNightGlow(content, s.asset); // houses, towers, lighthouses and lanterns keep lit windows at night
      this.setContent(root, content);
      s.info.source = res.source;
      s.info.credit = res.credit;
      this.refreshCollider(entry);
      for (const cb of this.onReady) cb(root, s.info); // again: interactions re-fit the loaded model (its own door, size)
    });
  }

  private fit(content: THREE.Group, s: Spec): THREE.Group {
    // A member asked to be taller than its plot is wide keeps its height (city towers); others shrink evenly.
    return s.maxWidth ? (fitWidth(content, s.maxWidth, s.height > s.maxWidth) as THREE.Group) : content;
  }

  private setContent(root: THREE.Group, content: THREE.Group): void {
    const old = root.getObjectByName('content');
    if (old) root.remove(old);
    content.updateMatrixWorld(true);
    root.userData.size = new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
    shadows(content);
    root.add(content);
  }

  private refreshCollider(e: Entry): void {
    if (e.collider) { this.physics.removeCollider(e.collider); e.collider = null; }
    const size = e.root.userData.size as THREE.Vector3;
    if (e.spec.info.interaction === 'push' || size.y < 1.2) return;
    e.collider = this.physics.addFixedBox(e.spec.x, e.spec.y + size.y / 2, e.spec.z, size.x / 2, size.y / 2, size.z / 2, e.spec.rotation);
  }

  private clear(): void {
    for (const e of this.entries) {
      if (e.collider) this.physics.removeCollider(e.collider);
      e.root.traverse((o) => { if (o instanceof THREE.Mesh && o.parent?.userData.placeholder) o.geometry.dispose(); });
      this.group.remove(e.root);
    }
    this.entries = [];
    for (const cb of this.onCleared) cb();
  }
}
