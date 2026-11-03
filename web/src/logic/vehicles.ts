import * as THREE from 'three';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import type { Player } from '../player/player';
import type { ObjectInfo } from '../render/worldObjects';
import { wheelsOf, type Wheels } from '../render/vehicleModel';
import { parkingSpot, stepCar, type CarInput, type CarState } from './carModel';

export interface VehicleEnv {
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  isReady(x: number, z: number): boolean;
}

const quatY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const PARKED = 'parked-car';
const GRAVITY = 20;
/** Chase camera: this far behind and above the car. */
const CHASE_BACK = 8, CHASE_UP = 3.2;

interface Car {
  key: string;
  label: string;
  root: THREE.Object3D;
  state: CarState;
  body: RigidBody;
  collider: Collider;
  half: THREE.Vector3;
  vy: number;
  wheels: Wheels | null;
  spin: number;
  steer: number;
  /** The car parked at spawn: its root belongs to this system (adopted cars' roots belong to WorldObjects). */
  own: boolean;
  /** Driven at least once: its pose outlives world edits. */
  moved: boolean;
}

/**
 * Drivable vehicles: the car parked at every spawn, plus any place whose interaction is 'drive' (a jeep, a rover…).
 * E gets in and out; W/S throttle, A/D steer, Space brakes, Shift boosts. Each car is a kinematic box moved by a Rapier
 * character controller, so it climbs terrain and stops at buildings; the model tilts with the ground under it.
 */
export class Vehicles {
  driving: Car | null = null;
  private cars: Car[] = [];
  private readonly poses = new Map<string, { x: number; y: number; z: number; heading: number }>();
  private readonly controller: KinematicCharacterController;
  private template: Promise<THREE.Object3D> | null = null;
  private readonly chase = new THREE.Vector3();
  private chaseReady = false;
  private parkToken = 0;
  private drivingKey: string | null = null;
  private sound: { ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly player: Player,
    private readonly env: VehicleEnv,
    private readonly loadTemplate: () => Promise<THREE.Object3D>,
  ) {
    this.controller = physics.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.5, 0.3, false);
    this.controller.enableSnapToGround(0.7);
    this.controller.setMaxSlopeClimbAngle((42 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
  }

  /** A new world: everything goes, including the parked car and remembered poses. */
  reset(): void {
    if (this.driving) this.exit();
    for (const c of [...this.cars]) this.removeCar(c);
    this.poses.clear();
    this.parkToken++;
  }

  /** Park the bundled car on a dry, flat, free spot a few metres from (x, z). */
  async parkNear(x: number, z: number): Promise<void> {
    const token = ++this.parkToken;
    this.template ??= this.loadTemplate().then((t) => { wheelsOf(t); return t; });
    let template: THREE.Object3D;
    try { template = await this.template; } catch (e) {
      console.warn('[vehicles] could not load the car', e);
      this.template = null;
      return;
    }
    if (token !== this.parkToken) return;
    const old = this.cars.find((c) => c.key === PARKED);
    if (old) this.removeCar(old);
    const R = this.physics.R, probe = new R.Cuboid(1, 0.6, 2.1);
    const spot = parkingSpot(x, z, {
      heightAt: this.env.heightAt,
      isWater: this.env.isWater,
      blocked: (px, pz, h) => this.physics.world.intersectionWithShape(
        { x: px, y: this.env.heightAt(px, pz) + 1.9, z: pz }, quatY(h), probe, undefined, undefined, undefined, undefined, (c) => c !== this.player.collider,
      ) !== null,
    });
    if (!spot) return;
    const model = template.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const root = new THREE.Group();
    root.name = 'parked-car';
    root.add(model);
    root.position.set(spot.x, this.env.heightAt(spot.x, spot.z), spot.z);
    this.scene.add(root);
    const car = this.addCar(PARKED, 'Car', root, spot.heading, size, true, wheelsOf(model));
    this.pose(car, root.position.x, root.position.y + car.half.y + 0.05, root.position.z, 1, 0);
  }

  /** A 'drive' place appeared (or its loaded model replaced the stand-in): make it drivable, keeping a driven pose. */
  adopt(root: THREE.Group, info: ObjectInfo): void {
    const old = this.cars.find((c) => c.root === root);
    if (old) this.removeCar(old);
    const content = root.getObjectByName('content');
    const size = (root.userData.size as THREE.Vector3 | undefined)?.clone() ?? new THREE.Vector3(1.8, 1.5, 4);
    // Models found online face any way: turn the long side along z (front and back stay as the model has them).
    if (content && size.x > size.z * 1.15) { content.rotation.y += Math.PI / 2; [size.x, size.z] = [size.z, size.x]; }
    const pose = this.poses.get(info.objectId);
    if (pose) root.position.set(pose.x, pose.y, pose.z);
    const car = this.addCar(info.objectId, info.label, root, pose?.heading ?? root.rotation.y, size, false, null);
    car.moved = !!pose;
    if (this.drivingKey === car.key) this.driving = car;
  }

  /** Before a world rebuild drops its objects: forget adopted cars, remembering where driven ones were left. */
  dropAdopted(): void {
    if (this.driving && !this.driving.own) this.exit();
    for (const c of this.cars.filter((car) => !car.own)) {
      if (c.moved) this.poses.set(c.key, { x: c.root.position.x, y: c.root.position.y, z: c.root.position.z, heading: c.state.heading });
      this.removeCar(c);
    }
  }

  /** The car under the crosshair within reach, if any. */
  nearest(ray: THREE.Ray, reach: number): Car | null {
    let best: Car | null = null, bestAlong = Infinity;
    const c = new THREE.Vector3();
    for (const car of this.cars) {
      c.copy(car.root.position).setY(car.root.position.y + car.half.y);
      const along = c.clone().sub(ray.origin).dot(ray.direction);
      if (along < 0 || along > reach + car.half.z) continue;
      if (ray.distanceToPoint(c) > Math.max(car.half.x, car.half.z) + 0.3) continue;
      if (along < bestAlong) { best = car; bestAlong = along; }
    }
    return best;
  }

  hint(car: Car | null): string | null {
    if (this.driving) {
      return `${Math.round(Math.abs(this.driving.state.speed) * 3.6)} km/h · W/S drive · A/D steer · Space brake · Shift boost · E get out`;
    }
    return car ? `E — drive the ${car.label.toLowerCase()}` : null;
  }

  enter(car: Car): void {
    this.driving = car;
    this.drivingKey = car.key;
    car.state.speed = 0;
    car.moved = true;
    car.vy = 0;
    this.player.enabled = false;
    this.chaseReady = false;
    this.engineSound(0, true);
  }

  /** Get out on the driver's side (or the other, or on the roof if both are water). */
  exit(): void {
    const car = this.driving;
    if (!car) return;
    this.driving = null;
    this.drivingKey = null;
    car.state.speed = 0;
    const p = car.root.position, h = car.state.heading;
    const lx = Math.cos(h), lz = -Math.sin(h);
    let x = p.x, z = p.z, y = p.y + car.half.y * 2 + 0.5;
    for (const s of [1, -1]) {
      const ex = p.x + lx * (car.half.x + 1.1) * s, ez = p.z + lz * (car.half.x + 1.1) * s;
      if (!this.env.isWater(ex, ez)) { x = ex; z = ez; y = this.env.heightAt(ex, ez) + 1.2; break; }
    }
    this.player.teleport(x, Math.max(y, this.env.heightAt(x, z) + 1.2), z);
    this.player.enabled = true;
    this.engineSound(0, false);
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const car = this.driving;
    if (!car) return;
    const k = this.player.keys;
    const input: CarInput = {
      throttle: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      steer: (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0),
      brake: k.has('Space'),
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
    const r = stepCar(car.state, input, dt);
    const t = car.body.translation();
    let { dx, dz } = r;
    const dir = Math.sign(r.state.speed) || 1, h = r.state.heading;
    if (this.env.isWater(t.x + Math.sin(h) * (car.half.z + 0.5) * dir, t.z + Math.cos(h) * (car.half.z + 0.5) * dir)) {
      dx = 0; dz = 0; r.state.speed = 0; // cars do not swim
    }
    car.state = r.state;
    car.body.setNextKinematicRotation(quatY(h));
    let nx: number, ny: number, nz: number;
    if (!this.env.isReady(t.x, t.z)) {
      nx = t.x + dx; nz = t.z + dz; ny = this.env.heightAt(nx, nz) + car.half.y + 0.05; car.vy = 0;
    } else {
      car.vy = this.controller.computedGrounded() ? -1 : car.vy - GRAVITY * dt;
      this.controller.computeColliderMovement(car.collider, { x: dx, y: car.vy * dt, z: dz }, undefined, undefined, (c) => c !== this.player.collider);
      const m = this.controller.computedMovement();
      const want = Math.hypot(dx, dz);
      if (want > 0.01 && Math.hypot(m.x, m.z) < want * 0.5) car.state.speed *= 0.5; // hit something solid
      nx = t.x + m.x; ny = t.y + m.y; nz = t.z + m.z;
      const ground = this.env.heightAt(nx, nz);
      if (ny < ground - 2) { ny = ground + car.half.y + 0.3; car.vy = 0; } // fell through a missing chunk
    }
    car.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pose(car, nx, ny, nz, dt, input.steer);
    this.follow(car, camera, dt);
    this.player.position.set(nx, ny + 0.5, nz); // chunks, wildlife and the HUD follow the car
    this.engineSound(Math.abs(car.state.speed), true);
  }

  private addCar(key: string, label: string, root: THREE.Object3D, heading: number, size: THREE.Vector3, own: boolean, wheels: Wheels | null): Car {
    const half = new THREE.Vector3(Math.max(0.5, size.x * 0.45), Math.max(0.4, size.y * 0.4), Math.max(0.8, size.z * 0.46));
    const R = this.physics.R, p = root.position;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + half.y + 0.05, p.z).setRotation(quatY(heading)));
    const collider = this.physics.world.createCollider(R.ColliderDesc.cuboid(half.x, half.y, half.z), body);
    root.rotation.order = 'YXZ';
    root.rotation.set(0, heading, 0);
    const car: Car = { key, label, root, state: { speed: 0, heading }, body, collider, half, vy: 0, wheels, spin: 0, steer: 0, own, moved: false };
    this.cars.push(car);
    return car;
  }

  private removeCar(car: Car): void {
    if (this.driving === car) this.driving = null; // a model swap: adopt() puts the driver back in (drivingKey)
    this.physics.removeBody(car.body);
    if (car.own) this.scene.remove(car.root); // geometry is shared with the template: not disposed
    this.cars = this.cars.filter((c) => c !== car);
  }

  /** Place the model on the body and tilt it with the ground under its four sides; spin and steer the wheels. */
  private pose(car: Car, x: number, y: number, z: number, dt: number, steer: number): void {
    const h = car.state.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const L = car.half.z, W = car.half.x, at = this.env.heightAt;
    const pitch = -Math.atan2(at(x + fx * L, z + fz * L) - at(x - fx * L, z - fz * L), 2 * L);
    const roll = Math.atan2(at(x + lx * W, z + lz * W) - at(x - lx * W, z - lz * W), 2 * W);
    const k = Math.min(1, dt * 8), rot = car.root.rotation;
    rot.set(rot.x + (pitch - rot.x) * k, h, rot.z + (roll - rot.z) * k);
    car.root.position.set(x, y - car.half.y - 0.05, z);
    if (!car.wheels) return;
    car.spin += (car.state.speed * dt) / car.wheels.radius;
    car.steer += (steer * 0.45 - car.steer) * Math.min(1, dt * 10);
    for (const w of car.wheels.all) w.rotation.x = car.spin;
    for (const w of car.wheels.front) w.rotation.y = car.steer;
  }

  private follow(car: Car, camera: THREE.PerspectiveCamera, dt: number): void {
    const p = car.root.position, h = car.state.heading;
    const target = new THREE.Vector3(p.x - Math.sin(h) * CHASE_BACK, p.y + CHASE_UP, p.z - Math.cos(h) * CHASE_BACK);
    if (!this.chaseReady) { this.chase.copy(target); this.chaseReady = true; } else this.chase.lerp(target, Math.min(1, dt * 5));
    this.chase.y = Math.max(this.chase.y, this.env.heightAt(this.chase.x, this.chase.z) + 1.2);
    camera.position.copy(this.chase);
    camera.lookAt(p.x + Math.sin(h) * 4, p.y + 1.4, p.z + Math.cos(h) * 4);
  }

  /** A low sawtooth hum whose pitch follows the speed while driving. */
  private engineSound(speed: number, on: boolean): void {
    if (!this.sound) {
      if (!on || typeof AudioContext === 'undefined') return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start();
      this.sound = { ctx, osc, gain };
    }
    const { ctx, osc, gain } = this.sound;
    if (on && ctx.state === 'suspended') void ctx.resume();
    osc.frequency.setTargetAtTime(38 + speed * 4.5, ctx.currentTime, 0.1);
    gain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.15);
  }
}
