import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { Interaction } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { Player } from '../player/player';
import type { ObjectInfo } from '../render/worldObjects';

type Usable = Exclude<Interaction, 'none'>;

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
  light?: THREE.PointLight;
  glow?: THREE.Mesh;
  body?: RigidBody;
  halfHeight: number;
}

export class InteractionSystem {
  private items: InteractItem[] = [];
  private audio: AudioContext | null = null;
  private seated: InteractItem | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly physics: Physics, private readonly player: Player) {}

  register(root: THREE.Group, info: ObjectInfo): void {
    if (info.interaction === 'none') return;
    const size = root.userData.size as THREE.Vector3;
    const item: InteractItem = { root, info, type: info.interaction, on: info.interaction === 'fire', manual: false, halfHeight: size.y / 2 };
    if (item.type === 'door') {
      const pivot = new THREE.Group();
      pivot.position.set(-0.55, 0, size.z / 2 + 0.06);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.08), DOOR_MAT);
      panel.position.set(0.55, 1, 0);
      panel.castShadow = true;
      pivot.add(panel);
      root.add(pivot);
      item.pivot = pivot;
    }
    if (item.type === 'light' || item.type === 'fire') {
      const isLight = item.type === 'light';
      const y = isLight ? size.y + 0.2 : 0.6;
      const light = new THREE.PointLight(isLight ? 0xffd59a : 0xff8a3d, 0, isLight ? 26 : 14, 1.6);
      light.position.set(0, y, 0);
      const glow = new THREE.Mesh(
        isLight ? new THREE.SphereGeometry(0.18, 10, 8) : new THREE.ConeGeometry(0.4, 1.1, 7),
        new THREE.MeshBasicMaterial({ color: isLight ? 0xffe2a8 : 0xff9a3d, transparent: true, opacity: 0.9 }),
      );
      glow.position.set(0, isLight ? y : 0.7, 0);
      root.add(light, glow);
      item.light = light;
      item.glow = glow;
    }
    if (item.type === 'push') {
      const p = root.position;
      item.body = this.physics.addDynamicBox(p.x, p.y + size.y / 2 + 0.05, p.z, size.x / 2, size.y / 2, size.z / 2);
    }
    this.applyLight(item, 0);
    this.items.push(item);
  }

  clear(): void {
    for (const it of this.items) if (it.body) this.physics.removeBody(it.body);
    this.items = [];
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
      if (it.light) this.applyLight(it, t);
      if (it.body) {
        const tr = it.body.translation(), q = it.body.rotation();
        it.root.quaternion.set(q.x, q.y, q.z, q.w);
        const offset = new THREE.Vector3(0, -it.halfHeight, 0).applyQuaternion(it.root.quaternion);
        it.root.position.set(tr.x + offset.x, tr.y + offset.y, tr.z + offset.z);
      }
    }
  }

  private applyLight(it: InteractItem, t: number): void {
    if (!it.light || !it.glow) return;
    const flicker = it.type === 'fire' ? 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08 : 1;
    it.light.intensity = it.on ? (it.type === 'light' ? 40 : 22) * flicker : 0;
    it.glow.visible = it.on;
    if (it.type === 'fire') it.glow.scale.y = flicker;
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
