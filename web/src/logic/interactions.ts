import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { Interaction } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { Player } from '../player/player';
import type { ObjectInfo } from '../render/worldObjects';
import { findDoorNode, hingeDoor } from './doorHinge';
import { needsRecovery, pickNearestLit } from './lightMath';

const POOL_SIZE = 6;

export interface InteractEnv {
  heightAt(x: number, z: number): number;
  isReady(x: number, z: number): boolean;
}

/** Vehicles ('drive') are driven by logic/vehicles.ts, not set up here. */
type Usable = Exclude<Interaction, 'none' | 'drive'>;

const LABEL: Record<Usable, [string, string]> = {
  door: ['Open door', 'Close door'],
  light: ['Turn on the light', 'Turn off the light'],
  fire: ['Light the fire', 'Put out the fire'],
  sound: ['Ring', 'Ring'],
  sit: ['Sit down', 'Stand up'],
  push: ['Push', 'Push'],
};
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3d25, roughness: 0.8 });

export interface InteractItem {
  root: THREE.Group;
  info: ObjectInfo;
  type: Usable;
  on: boolean;
  manual: boolean;
  pivot?: THREE.Object3D;
  lightY: number;
  glow?: THREE.Mesh;
  body?: RigidBody;
  halfHeight: number;
}

export class InteractionSystem {
  private items: InteractItem[] = [];
  private audio: AudioContext | null = null;
  private seated: InteractItem | null = null;
  private readonly pool: THREE.PointLight[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    private readonly player: Player,
    scene: THREE.Object3D,
    private readonly env: InteractEnv,
  ) {
    // Fixed pool: the light count never changes, so shaders never recompile on world reload.
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.6);
      scene.add(l);
      this.pool.push(l);
    }
  }

  /**
   * Called when an object appears and again each time its model is swapped in: the old set-up is removed first, so the
   * door, glow and push body always fit the content the player actually sees.
   */
  register(root: THREE.Group, info: ObjectInfo): void {
    const previous = this.unregister(root);
    if (info.interaction === 'none' || info.interaction === 'drive') return;
    const size = root.userData.size as THREE.Vector3;
    const item: InteractItem = { root, info, type: info.interaction, on: info.interaction === 'fire', manual: false, halfHeight: size.y / 2, lightY: 0 };
    if (previous?.type === 'light' && previous.manual) { item.on = previous.on; item.manual = true; }
    if (item.type === 'door') {
      const content = root.getObjectByName('content');
      if (content?.children.some((c) => c.userData.placeholder)) {
        // Procedural houses have no door of their own: add a stand-in panel on the front face.
        const pivot = new THREE.Group();
        pivot.name = 'stand-in-door';
        pivot.position.set(-0.55, 0, size.z / 2 + 0.06);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.08), DOOR_MAT);
        panel.position.set(0.55, 1, 0);
        panel.castShadow = true;
        pivot.add(panel);
        root.add(pivot);
        item.pivot = pivot;
      } else {
        // A loaded model swings its own door part; without one it is scenery (never a slab floating outside it).
        const door = content ? findDoorNode(content) : null;
        if (!door) return;
        item.pivot = hingeDoor(root, door);
      }
    }
    if (item.type === 'light' || item.type === 'fire') {
      const isLight = item.type === 'light';
      const y = isLight ? size.y + 0.2 : 0.6;
      const glow = new THREE.Mesh(
        isLight ? new THREE.SphereGeometry(0.18, 10, 8) : new THREE.ConeGeometry(0.4, 1.1, 7),
        new THREE.MeshBasicMaterial({ color: isLight ? 0xffe2a8 : 0xff9a3d, transparent: true, opacity: 0.9 }),
      );
      glow.position.set(0, isLight ? y : 0.7, 0);
      root.add(glow);
      item.lightY = y;
      item.glow = glow;
    }
    if (item.type === 'push') {
      const p = root.position;
      item.body = this.physics.addDynamicBox(p.x, p.y + size.y / 2 + 0.05, p.z, size.x / 2, size.y / 2, size.z / 2, root.rotation.y);
    }
    this.applyGlow(item, 0);
    this.items.push(item);
  }

  /** Remove the interaction set up for `root` (stand-in door or hinge, glow, push body, seat); returns it, if any. */
  private unregister(root: THREE.Group): InteractItem | undefined {
    const i = this.items.findIndex((it) => it.root === root);
    if (i < 0) return undefined;
    const [it] = this.items.splice(i, 1);
    if (it.pivot) {
      root.remove(it.pivot);
      if (it.pivot.name === 'stand-in-door') it.pivot.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    if (it.glow) { root.remove(it.glow); it.glow.geometry.dispose(); (it.glow.material as THREE.Material).dispose(); }
    if (it.body) this.physics.removeBody(it.body);
    if (this.seated === it) { this.player.seated = false; this.seated = null; }
    return it;
  }

  clear(): void {
    for (const it of this.items) if (it.body) this.physics.removeBody(it.body);
    this.items = [];
    for (const l of this.pool) l.intensity = 0;
    if (this.seated) { this.player.seated = false; this.seated = null; }
  }

  nearest(ray: THREE.Ray, maxDist = 4): InteractItem | null {
    if (this.items.length === 0) return null;
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = maxDist;
    const hit = this.raycaster.intersectObjects(this.items.map((i) => i.root), true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      const item = this.items.find((i) => i.root === o);
      if (item) return item;
    }
    return null;
  }

  hint(item: InteractItem): string {
    return `E · ${LABEL[item.type][item.on ? 1 : 0]} — ${item.info.label}`;
  }

  use(item: InteractItem): void {
    switch (item.type) {
      case 'door': item.on = !item.on; break;
      case 'light':
      case 'fire': item.on = !item.on; item.manual = true; break;
      case 'sound': this.ring(); break;
      case 'sit':
        if (this.seated === item) { this.player.seated = false; this.seated = null; item.on = false; }
        else {
          this.player.seated = true;
          this.seated = item;
          item.on = true;
          const p = item.root.position;
          this.player.spawn(p.x, p.y, p.z);
        }
        break;
      case 'push':
        if (item.body) {
          this.dir.copy(this.player.lookRay().direction).setY(0).normalize();
          const m = item.body.mass();
          item.body.applyImpulse({ x: this.dir.x * m * 6, y: m * 1.5, z: this.dir.z * m * 6 }, true);
        }
        break;
    }
  }

  update(dt: number, isNight: boolean, t: number): void {
    for (const it of this.items) {
      if (it.pivot) it.pivot.rotation.y += ((it.on ? -1.6 : 0) - it.pivot.rotation.y) * Math.min(1, dt * 6);
      if (it.type === 'light' && !it.manual) it.on = isNight;
      if (it.glow) this.applyGlow(it, t);
      if (it.body) this.syncBody(it);
    }
    this.assignPool(t);
  }

  private syncBody(it: InteractItem): void {
    const body = it.body!;
    const tr = body.translation();
    const ground = this.env.heightAt(tr.x, tr.z);
    const ready = this.env.isReady(tr.x, tr.z);
    // Hold the body still until the chunk collider underneath exists, then release it.
    body.setGravityScale(ready ? 1 : 0, true);
    if (!ready) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    } else if (needsRecovery(tr.y, ground)) {
      body.setTranslation({ x: tr.x, y: ground + it.halfHeight + 0.05, z: tr.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const t2 = body.translation(), q = body.rotation();
    it.root.quaternion.set(q.x, q.y, q.z, q.w);
    const offset = new THREE.Vector3(0, -it.halfHeight, 0).applyQuaternion(it.root.quaternion);
    it.root.position.set(t2.x + offset.x, t2.y + offset.y, t2.z + offset.z);
  }

  private assignPool(t: number): void {
    const cam = this.player.lookRay().origin;
    const pts = this.items.map((it) => ({
      x: it.root.position.x, y: it.root.position.y + it.lightY, z: it.root.position.z, lit: it.on && !!it.glow,
    }));
    const chosen = pickNearestLit(pts, cam.x, cam.y, cam.z, this.pool.length);
    this.pool.forEach((l, i) => {
      const idx = chosen[i];
      if (idx === undefined) { l.intensity = 0; return; }
      const it = this.items[idx], p = pts[idx];
      const isLight = it.type === 'light';
      l.position.set(p.x, p.y, p.z);
      l.color.set(isLight ? 0xffd59a : 0xff8a3d);
      l.distance = isLight ? 26 : 14;
      l.intensity = (isLight ? 40 : 22) * this.flicker(it, t);
    });
  }

  private flicker(it: InteractItem, t: number): number {
    return it.type === 'fire' ? 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08 : 1;
  }

  private applyGlow(it: InteractItem, t: number): void {
    if (!it.glow) return;
    it.glow.visible = it.on;
    if (it.type === 'fire') it.glow.scale.y = this.flicker(it, t);
  }

  private ring(): void {
    this.audio ??= new AudioContext();
    const ctx = this.audio;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [f, g] of [[523, 0.5], [1046, 0.25], [1568, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(g, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.3);
    }
  }
}
