import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Interaction, PlaceKind, PlaceSize } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { BuiltWorld } from '../world/build';
import { fitToHeight } from './fit';
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

export class NullModelSource implements ModelSource {
  async load(): Promise<null> { return null; }
}

const HEIGHT: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 5, medium: 6, large: 7 },
  landmark: { small: 10, medium: 16, large: 24 },
  structure: { small: 4, medium: 6, large: 9 },
  prop: { small: 1, medium: 1.6, large: 2.4 },
};

/** Scale to a target height, centre on x/z, stand on y = 0. Returns a group named "content". */
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

interface Spec { asset: string; kind: PlaceKind; variant: number; height: number; x: number; y: number; z: number; rotation: number; info: ObjectInfo }
interface Entry { root: THREE.Group; spec: Spec; collider: Collider | null }

export class WorldObjects {
  readonly group = new THREE.Group();
  readonly onReady: Array<(root: THREE.Group, info: ObjectInfo) => void> = [];
  readonly onCleared: Array<() => void> = [];
  private entries: Entry[] = [];
  private version = 0;

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly models: ModelSource) {
    scene.add(this.group);
  }

  rebuild(world: BuiltWorld): void {
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
        asset: b.asset, kind: 'structure', variant: Number(b.id.split('-').pop()) || 0, height: b.kind === 'house' ? HEIGHT.settlement[place.size] : 3, x: b.x, y: b.y, z: b.z, rotation: b.rotation,
        info: { placeId: place.id, objectId: b.id, label: b.kind === 'house' ? `${place.label} — house` : `${place.label} — ${b.kind}`, description: place.description, reasons: pl?.reasons ?? [], warnings: pl?.warnings ?? [], source: 'placeholder', interaction: b.interaction, kind: 'building' },
      });
    }
    for (const s of specs) this.spawn(s, version);
  }

  pickables(): THREE.Object3D[] {
    return this.entries.map((e) => e.root);
  }

  infoFor(o: THREE.Object3D): ObjectInfo | null {
    for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (cur.userData.info) return cur.userData.info as ObjectInfo;
    return null;
  }

  private spawn(s: Spec, version: number): void {
    const root = new THREE.Group();
    root.position.set(s.x, s.y, s.z);
    root.rotation.y = s.rotation;
    root.userData.info = s.info;
    this.setContent(root, normalizeTo(buildPlaceholder(s.asset), s.height));
    this.group.add(root);
    const entry: Entry = { root, spec: s, collider: null };
    this.entries.push(entry);
    this.refreshCollider(entry);
    for (const cb of this.onReady) cb(root, s.info);
    void this.models.load(s.asset, s.kind, s.variant).then((res) => {
      if (!res || version !== this.version) return;
      this.setContent(root, normalizeTo(res.object.clone(true), s.height));
      s.info.source = res.source;
      s.info.credit = res.credit;
      this.refreshCollider(entry);
    });
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
