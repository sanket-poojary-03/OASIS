import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Interaction, PlaceKind, PlaceSize } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { BuiltWorld } from '../world/build';
import type { Building } from '../world/settlement';
import { INTERACT } from '../api/localMock';
import { fitToHeight } from './fit';
import { addNightGlow } from './nightGlow';
import { surfaceOf } from './meshCollider';
import { buildPlaceholder } from './placeholders';
import { buildTower } from './towers';
import { hashString } from '../core/rng';
import { towerFacade, towerSpec, type FacadeHint } from '../world/towerSpec';

export interface ObjectInfo {
  placeId: string;
  objectId: string;
  label: string;
  description?: string;
  reasons: string[];
  warnings: string[];
  source: 'placeholder' | 'library' | 'online' | 'generated' | 'procedural';
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

/**
 * A place waiting for its model: loading, then ready, missing or cancelled. `shape`: on a miss, a simple stand-in shape
 * is shown instead (offline mode only); otherwise the place is left out.
 */
export interface LoadingEvent { placeId: string; label: string; state: 'loading' | 'ready' | 'missing' | 'cancelled'; shape?: boolean }

export class NullModelSource implements ModelSource {
  async load(): Promise<null> { return null; }
}

const HEIGHT: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 5, medium: 6, large: 7 },
  landmark: { small: 10, medium: 16, large: 24 },
  structure: { small: 4, medium: 6, large: 9 },
  prop: { small: 1, medium: 1.6, large: 2.4 },
};

/** Widest a single building or landmark may be, in multiples of its fitted height. */
export const MAX_ASPECT = 4;

/** Drivable vehicles are car-sized whatever kind the AI gave them (a "structure" car must not be 6 m tall). */
const VEHICLE_HEIGHT: Record<PlaceSize, number> = { small: 1.3, medium: 1.5, large: 2.6 };

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

/** `extra`: a prop scattered around its place (place.props): waits for its model silently, never in the place's notice. */
interface Spec {
  asset: string; kind: PlaceKind; variant: number; height: number; maxWidth?: number; x: number; y: number; z: number; rotation: number; info: ObjectInfo; extra?: boolean;
  /** A modern building designed in code (towerSpec) instead of a model, from this seed. */
  tower?: { facade: FacadeHint; seed: number };
}

/** A single modern tower (a "glass skyscraper" landmark) stands this tall; group members keep their layout height. */
const SINGLE_TOWER_HEIGHT: Record<PlaceSize, number> = { small: 36, medium: 56, large: 84 };

/** Heights of scattered props by size: a crate, a bench or barrel, a street lamp or parked car. */
const EXTRA_HEIGHT: Record<PlaceSize, number> = { small: 0.9, medium: 1.6, large: 3.2 };
/** Street lamps at city crossings stand taller than a large prop. */
const STREET_LAMP_HEIGHT = 4.6;

/** What a scattered prop can do, from what it is (lantern → light, bench → sit, crate → push, car → drive). */
function extraInteraction(asset: string): Interaction {
  const a = asset.toLowerCase();
  return INTERACT.find(([re]) => re.test(a))?.[1] ?? 'none';
}
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
  /** This rebuild's objects still loading per waiting place, whether any found no model, and whether it has a notice. */
  private pending = new Map<string, { left: number; missing: boolean; announced: boolean }>();
  /**
   * Stand-in shapes allowed: only in offline mode (no server to find models). With a server, every object shows its
   * real model or nothing: the user never wants procedural placeholders.
   */
  standIns = true;

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly models: ModelSource) {
    scene.add(this.group);
  }

  /**
   * `wait`: places added or changed while playing. They show nothing until their model arrives (no stand-in house
   * first), and onLoading reports their progress; the simple shape appears only if no model is found.
   */
  rebuild(world: BuiltWorld, wait: ReadonlySet<string> = new Set(), announceAll = false): void {
    this.clear();
    const version = ++this.version;
    const specs: Spec[] = [];
    for (const pl of world.placements) {
      const place = world.recipe.places.find((p) => p.id === pl.id);
      if (!place || place.kind === 'settlement') continue;
      const facade = place.kind !== 'prop' && place.interaction !== 'drive' ? towerFacade(place.asset, false, false) : null;
      specs.push({
        asset: place.asset, kind: place.kind, variant: 0, x: pl.x, y: pl.y, z: pl.z, rotation: pl.rotation,
        height: facade ? SINGLE_TOWER_HEIGHT[place.size] : place.interaction === 'drive' ? VEHICLE_HEIGHT[place.size] : HEIGHT[place.kind][place.size],
        tower: facade ? { facade, seed: (world.recipe.seed ?? 0) ^ hashString(pl.id) } : undefined,
        info: { placeId: pl.id, objectId: pl.id, label: place.label, description: place.description, reasons: pl.reasons, warnings: pl.warnings, source: 'placeholder', interaction: place.interaction, kind: place.kind },
      });
    }
    for (const b of world.buildings) {
      const place = world.recipe.places.find((p) => p.id === b.placeId);
      const pl = world.placements.find((p) => p.id === b.placeId);
      if (!place) continue;
      const facade = b.kind === 'house' ? towerFacade(b.asset, !!place.layout, place.layout?.pattern === 'grid') : null;
      specs.push({
        tower: facade ? { facade, seed: (world.recipe.seed ?? 0) ^ hashString(b.id) } : undefined,
        // `village-house-3` → 3, so every house can be a different model; `…-centre` → 0.
        asset: b.asset, kind: 'structure', variant: Number(b.id.split('-').pop()) || 0, height: buildingHeight(b, place.size), maxWidth: b.maxWidth, x: b.x, y: b.y, z: b.z, rotation: b.rotation,
        info: { placeId: place.id, objectId: b.id, label: buildingLabel(b, place.label, !!place.layout), description: place.description, reasons: pl?.reasons ?? [], warnings: pl?.warnings ?? [], source: 'placeholder', interaction: b.interaction, kind: 'building' },
      });
    }
    for (const e of world.extras ?? []) {
      const place = world.recipe.places.find((p) => p.id === e.placeId);
      const interaction = extraInteraction(e.asset);
      specs.push({
        asset: e.asset, kind: 'prop', variant: Number(e.id.split('-').pop()) || 0, height: interaction === 'drive' ? VEHICLE_HEIGHT[e.size] : e.id.includes('-lamp-') ? STREET_LAMP_HEIGHT : EXTRA_HEIGHT[e.size],
        x: e.x, y: e.y, z: e.z, rotation: e.rotation, extra: true,
        info: { placeId: e.placeId, objectId: e.id, label: `${place?.label ?? e.placeId} — ${e.asset}`, reasons: [`belongs around ${place?.label ?? e.placeId}`], warnings: [], source: 'placeholder', interaction, kind: 'prop' },
      });
    }
    const labels = new Map(world.recipe.places.map((p) => [p.id, p.label]));
    const present = new Set(specs.map((s) => s.info.placeId));
    // Notices for the places that changed (or the whole new world); without stand-ins, kept places wait silently.
    const announce = new Set([...wait, ...this.waiting.keys(), ...(announceAll ? present : [])]);
    const waitIds = this.standIns ? announce : present;
    for (const [id, label] of [...this.waiting]) {
      if (!present.has(id)) { this.waiting.delete(id); this.emit(id, label, 'cancelled'); }
    }
    this.pending = new Map();
    for (const s of specs) {
      const id = s.info.placeId;
      if (s.extra || !waitIds.has(id)) continue;
      const p = this.pending.get(id) ?? { left: 0, missing: false, announced: announce.has(id) };
      p.left++;
      this.pending.set(id, p);
    }
    for (const [id, p] of this.pending) {
      if (p.announced && !this.waiting.has(id)) { this.waiting.set(id, labels.get(id) ?? id); this.emit(id, labels.get(id) ?? id, 'loading'); }
    }
    for (const s of specs) this.spawn(s, version, s.extra ? !this.standIns : this.pending.has(s.info.placeId));
  }

  private emit(placeId: string, label: string, state: LoadingEvent['state']): void {
    const e: LoadingEvent = state === 'missing' ? { placeId, label, state, shape: this.standIns } : { placeId, label, state };
    for (const cb of this.onLoading) cb(e);
  }

  /** One object of a waiting place has its model (or none); the place is done when all of its objects are. */
  private settle(placeId: string, missing: boolean): void {
    const p = this.pending.get(placeId);
    if (!p) return;
    p.missing ||= missing;
    if (--p.left > 0) return;
    this.pending.delete(placeId);
    if (!p.announced) return;
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
    if (s.tower) { this.spawnTower(entry, wait); return; }
    if (!wait) placeholder();
    void this.models.load(s.asset, s.kind, s.variant).catch(() => null).then((res) => {
      if (version !== this.version) return;
      if (wait && !s.extra) this.settle(s.info.placeId, !res);
      if (!res) { if (wait && this.standIns) placeholder(); return; } // with a server: no model, no object
      const content = this.fit(normalizeTo(cloneModel(res.object), s.height), s);
      addNightGlow(content, s.asset); // houses, towers, lighthouses and lanterns keep lit windows at night
      this.setContent(root, content);
      s.info.source = res.source;
      s.info.credit = res.credit;
      this.refreshCollider(entry);
      for (const cb of this.onReady) cb(root, s.info); // again: interactions re-fit the loaded model (its own door, size)
    });
  }

  /** A modern building designed in code: built at once at its real size, no model request. */
  private spawnTower(entry: Entry, wait: boolean): void {
    const s = entry.spec, t = s.tower!;
    const width = s.maxWidth ?? Math.min(22, Math.max(12, s.height * 0.24));
    const content = new THREE.Group();
    content.name = 'content';
    content.add(buildTower(towerSpec(t.seed, t.facade, s.height, width), t.seed));
    this.setContent(entry.root, content);
    s.info.source = 'procedural';
    this.refreshCollider(entry);
    for (const cb of this.onReady) cb(entry.root, s.info);
    if (wait && !s.extra) queueMicrotask(() => this.settle(s.info.placeId, false));
  }

  private fit(content: THREE.Group, s: Spec): THREE.Group {
    // A member asked to be taller than its plot is wide keeps its height (city towers); others shrink evenly.
    if (s.maxWidth) return fitWidth(content, s.maxWidth, s.height > s.maxWidth) as THREE.Group;
    // Models are fitted by height, so a low, wide one balloons (a 6 m-tall manhole cover was 100 m across): cap the
    // footprint of buildings and landmarks at MAX_ASPECT times their height. Props (rugs, bridges, docks) keep theirs.
    return s.kind === 'prop' ? content : (fitWidth(content, s.height * MAX_ASPECT) as THREE.Group);
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
    // Pushed props and vehicles get their own moving bodies (interactions, vehicles); flat things need none.
    if (e.spec.info.interaction === 'push' || e.spec.info.interaction === 'drive' || size.y < 1.2) return;
    // Shaped like the model (stand on its real surface); a box only for rigged or very heavy models.
    const surface = surfaceOf(e.root);
    e.collider = surface
      ? this.physics.addFixedTrimesh(surface.positions, surface.indices)
      : this.physics.addFixedBox(e.spec.x, e.spec.y + size.y / 2, e.spec.z, size.x / 2, size.y / 2, size.z / 2, e.spec.rotation);
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
