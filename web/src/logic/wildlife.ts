import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { animatedClone, type AnimatedModel, type ModelTemplate } from '../render/animated';
import type { BuiltWorld } from '../world/build';
import type { WorldField } from '../world/field';

export type AnimalMode = 'graze' | 'walk' | 'flee';
export interface AnimalState { mode: AnimalMode; timer: number; heading: number }
export interface AnimalTuning { fleeRadius: number; walkSpeed: number; fleeSpeed: number }

export function stepAnimal(s: AnimalState, ctx: { dt: number; playerDist: number; awayHeading: number; rng: () => number; tuning: AnimalTuning }): AnimalState {
  if (ctx.playerDist < ctx.tuning.fleeRadius && s.mode !== 'flee') return { mode: 'flee', timer: 4, heading: ctx.awayHeading };
  const timer = s.timer - ctx.dt;
  if (s.mode === 'flee') return timer > 0 ? { mode: 'flee', timer, heading: ctx.awayHeading } : { mode: 'graze', timer: 3 + ctx.rng() * 5, heading: s.heading };
  if (timer > 0) return { ...s, timer };
  if (s.mode === 'graze') return { mode: 'walk', timer: 2 + ctx.rng() * 4, heading: ctx.rng() * Math.PI * 2 };
  return { mode: 'graze', timer: 3 + ctx.rng() * 5, heading: s.heading };
}

export function speedOf(s: AnimalState, tuning: AnimalTuning): number {
  return s.mode === 'flee' ? tuning.fleeSpeed : s.mode === 'walk' ? tuning.walkSpeed : 0;
}

const DEER: AnimalTuning = { fleeRadius: 15, walkSpeed: 1.4, fleeSpeed: 9 };
const RABBIT: AnimalTuning = { fleeRadius: 9, walkSpeed: 1.2, fleeSpeed: 7 };

/** Materials are shared per colour for the app's lifetime; only geometries are disposed on rebuild. */
const MATERIALS = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number): THREE.MeshStandardMaterial {
  let m = MATERIALS.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }); MATERIALS.set(color, m); }
  return m;
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

function deerMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.45, 0.55, 1.3), 0x8a5a33, 0, 1.0, 0);
  part(g, new THREE.BoxGeometry(0.18, 0.55, 0.18), 0x8a5a33, 0, 1.45, 0.55).rotation.x = -0.5;
  part(g, new THREE.BoxGeometry(0.22, 0.24, 0.42), 0x7a4e2c, 0, 1.75, 0.78);
  for (const [x, z] of [[0.15, 0.48], [-0.15, 0.48], [0.15, -0.48], [-0.15, -0.48]]) part(g, new THREE.CylinderGeometry(0.05, 0.04, 0.95, 5), 0x6b4428, x, 0.48, z);
  return g;
}

function rabbitMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.SphereGeometry(0.22, 8, 6), 0x9a8a78, 0, 0.2, 0).scale.set(1, 0.8, 1.3);
  part(g, new THREE.SphereGeometry(0.13, 8, 6), 0x9a8a78, 0, 0.35, 0.2);
  part(g, new THREE.BoxGeometry(0.04, 0.22, 0.06), 0x8a7a68, 0.05, 0.52, 0.18);
  part(g, new THREE.BoxGeometry(0.04, 0.22, 0.06), 0x8a7a68, -0.05, 0.52, 0.18);
  return g;
}

function birdMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.ConeGeometry(0.12, 0.5, 5), 0x2e2e36, 0, 0, 0).rotation.x = Math.PI / 2;
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    part(wing, new THREE.BoxGeometry(0.6, 0.03, 0.25), 0x2e2e36, 0.3 * side, 0, 0);
    g.add(wing);
  }
  return g;
}

export type AnimalKind = 'deer' | 'rabbit';
/** `anim` is set when the pack model is in use; otherwise `mesh` is the procedural figure. */
interface Animal { kind: AnimalKind; mesh: THREE.Group; anim?: AnimatedModel; state: AnimalState; tuning: AnimalTuning; x: number; z: number; hop: boolean }

/** Procedural figures own their geometries (materials are the shared per-colour cache). */
function disposeGeometries(g: THREE.Object3D): void {
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}
interface Bird { mesh: THREE.Group; angle: number; radius: number; speed: number; height: number; phase: number }

export class Wildlife {
  readonly group = new THREE.Group();
  private animals: Animal[] = [];
  private birds: Bird[] = [];
  private readonly flock = new THREE.Vector3();
  private scatter = 0;
  private rng = mulberry32(1);
  private readonly templates = new Map<AnimalKind, ModelTemplate>();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /**
   * Use an animated pack model for every animal of `kind` from now on, and swap it in for the ones already out
   * (art hot-swap). Without a template the procedural figures stay. The template is registered only after a first copy
   * of it is made: a model that cannot be cloned is ignored (procedural animals stay), like Avatar.use.
   */
  useModel(kind: AnimalKind, t: ModelTemplate): void {
    let first: AnimatedModel | undefined;
    try {
      first = animatedClone(t);
    } catch (e) {
      console.warn(`[wildlife] cannot use the ${kind} model; keeping the procedural ones`, e);
      return;
    }
    this.templates.set(kind, t);
    for (const a of this.animals) {
      if (a.kind !== kind) continue;
      const anim = first ?? animatedClone(t);
      first = undefined;
      this.release(a);
      this.group.remove(a.mesh);
      a.anim = anim;
      a.mesh = anim.root;
      this.group.add(anim.root);
    }
    first?.dispose(); // no animal of this kind is out yet
  }

  private release(a: Animal): void {
    if (a.anim) a.anim.dispose(); // geometry and materials are shared with the template
    else disposeGeometries(a.mesh);
  }

  private clear(): void {
    for (const a of this.animals) this.release(a);
    for (const b of this.birds) disposeGeometries(b.mesh);
    this.group.clear();
    this.scatter = 0;
  }

  rebuild(world: BuiltWorld): void {
    this.clear();
    this.animals = [];
    this.birds = [];
    this.rng = mulberry32(world.recipe.seed ^ 0x5eed);
    const f = world.field;
    const anchor = world.spawn;
    for (const life of world.recipe.life) {
      if (life.kind === 'birds') {
        const c = world.placements[0] ?? anchor;
        this.flock.set(c.x, f.heightAt(c.x, c.z) + 25, c.z);
        for (let i = 0; i < life.count; i++) {
          const mesh = birdMesh();
          this.group.add(mesh);
          this.birds.push({ mesh, angle: this.rng() * Math.PI * 2, radius: 18 + this.rng() * 22, speed: 0.4 + this.rng() * 0.3, height: this.rng() * 10, phase: this.rng() * 6 });
        }
        continue;
      }
      for (let i = 0; i < life.count; i++) {
        let x = anchor.x, z = anchor.z, found = false;
        for (let tries = 0; tries < 30; tries++) {
          const a = this.rng() * Math.PI * 2, d = 30 + this.rng() * 150;
          x = anchor.x + Math.cos(a) * d;
          z = anchor.z + Math.sin(a) * d;
          if (!f.isWater(x, z) && f.slopeAt(x, z) < 0.45 && !f.isReserved(x, z, 4)) { found = true; break; }
        }
        const state: AnimalState = { mode: 'graze', timer: this.rng() * 5, heading: this.rng() * Math.PI * 2 };
        if (!found) continue; // no valid spot: skip the animal (rng draws above stay stable)
        const deer = life.kind === 'deer';
        const kind: AnimalKind = deer ? 'deer' : 'rabbit';
        const template = this.templates.get(kind);
        const anim = template ? animatedClone(template) : undefined;
        const mesh = anim?.root ?? (deer ? deerMesh() : rabbitMesh());
        this.group.add(mesh);
        this.animals.push({ kind, mesh, anim, x, z, hop: !deer, tuning: deer ? DEER : RABBIT, state });
      }
    }
  }

  update(dt: number, t: number, player: THREE.Vector3, field: WorldField, isReady: (x: number, z: number) => boolean = () => true): void {
    dt = Math.min(dt, 0.1); // a long frame must not hop an animal across a thin water strip
    for (const a of this.animals) {
      const dx = a.x - player.x, dz = a.z - player.z;
      a.state = stepAnimal(a.state, { dt, playerDist: Math.hypot(dx, dz), awayHeading: Math.atan2(dx, dz), rng: this.rng, tuning: a.tuning });
      const sp = speedOf(a.state, a.tuning);
      if (sp > 0) {
        const nx = a.x + Math.sin(a.state.heading) * sp * dt, nz = a.z + Math.cos(a.state.heading) * sp * dt;
        if (isReady(nx, nz) && !field.isWater(nx, nz) && field.slopeAt(nx, nz) < 0.7) { a.x = nx; a.z = nz; }
        else if (a.state.mode === 'walk') a.state = { ...a.state, heading: a.state.heading + Math.PI };
      }
      a.mesh.position.set(a.x, field.heightAt(a.x, a.z) + (a.hop && !a.anim && sp > 0 ? Math.abs(Math.sin(t * 10)) * 0.25 : 0), a.z);
      a.mesh.rotation.y = a.state.heading;
      a.mesh.visible = isReady(a.x, a.z);
      if (a.anim && a.mesh.visible) {
        a.anim.mixer.update(dt);
        a.anim.play(a.state.mode === 'flee' ? 'run' : a.state.mode === 'walk' ? 'walk' : 'idle');
      }
    }
    if (Math.hypot(player.x - this.flock.x, player.z - this.flock.z) < 20) this.scatter = 6;
    this.scatter = Math.max(0, this.scatter - dt);
    const s = this.scatter > 0;
    for (const b of this.birds) {
      b.angle += b.speed * dt * (s ? 2 : 1);
      const r = b.radius * (s ? 2.2 : 1);
      b.mesh.position.set(this.flock.x + Math.cos(b.angle) * r, this.flock.y + b.height + (s ? 15 : 0) + Math.sin(t + b.phase) * 2, this.flock.z + Math.sin(b.angle) * r);
      b.mesh.rotation.y = -b.angle;
      const flap = Math.sin(t * 14 + b.phase) * 0.6;
      b.mesh.children[1].rotation.z = flap;
      b.mesh.children[2].rotation.z = -flap;
    }
  }
}
