import * as THREE from 'three';
import { animatedClone, type AnimatedModel, type ModelTemplate } from '../render/animated';

/**
 * Capsule centre → feet: half-height 0.62 + radius 0.28, plus the 2 cm skin the character controller keeps between the
 * capsule and the ground. Without it the feet hover.
 */
export const FEET = 0.92;
/** Third-person camera: this far behind the player, and never closer than this to the ground under it. */
const BACK = 3.2;
/** The camera's height over the capsule centre, and how far it rises or sinks as the view tilts. */
const CAMERA_UP = 0.95;
const CAMERA_TILT = 2;
const CLEARANCE = 0.5;
const TURN_RATE = 10;
/** The capsule rides high on a slope: within this of the ground the feet stand on the ground itself. */
const FOOT_SNAP = 0.5;
const FOOT_FOLLOW = 18;
/** Off the ground this long before the jump pose shows, so a bump or a step does not flash it. */
const AIR_DELAY = 0.15;
/** Slower than this (walking into a wall) the legs stop. */
const MIN_STRIDE = 0.3;

/** What the player's body is doing this frame. */
export interface Motion { dir: THREE.Vector3; speed: number; running: boolean; airborne: boolean }

/** Procedural stand-in until (or unless) the adventurer model arrives: a capsule body with a head, 1.75 m tall. */
function placeholderFigure(): AnimatedModel {
  const root = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3d6fa8, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 4, 12), cloth);
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), skin);
  head.position.y = 1.52;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), skin);
  nose.position.set(0, 1.5, 0.2); // shows which way the figure faces (+z)
  for (const m of [body, head, nose]) { m.castShadow = true; root.add(m); }
  const mixer = new THREE.AnimationMixer(root);
  return {
    root, mixer, play: () => {}, pace: () => {},
    dispose: () => { for (const m of [body, head, nose]) m.geometry.dispose(); cloth.dispose(); skin.dispose(); },
  };
}

/**
 * The visible player. V toggles third person (camera close behind) and back to first person. In third person the
 * figure faces the way it walks, not the way the camera looks: A walks it to the left, S back toward the camera.
 * Starts as a procedural figure; use() swaps in the animated adventurer whenever it loads (art hot-swap).
 */
export class Avatar {
  thirdPerson = false;
  private model: AnimatedModel = placeholderFigure();
  private inCar = false;
  private animated = false;
  private feetY: number | null = null;
  private airTime = 0;
  private readonly dir = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();
  /** Gear worn on top of whichever character is on (the rocket booster); moved onto each new model. */
  private readonly gear: THREE.Object3D[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.model.root.visible = false;
    scene.add(this.model.root);
  }

  /** Wear `o` (positioned relative to the feet, facing +z) on this and every later character. */
  attach(o: THREE.Object3D): void {
    this.gear.push(o);
    this.model.root.add(o);
  }

  /** True once the animated pack model replaced the procedural figure. */
  get hasModel(): boolean { return this.animated; }

  use(t: ModelTemplate): void {
    const next = animatedClone(t);
    next.root.position.copy(this.model.root.position);
    next.root.rotation.y = this.model.root.rotation.y;
    next.root.visible = this.thirdPerson && !this.inCar;
    for (const o of this.gear) next.root.add(o);
    this.scene.remove(this.model.root);
    this.model.dispose();
    this.model = next;
    this.animated = true;
    this.scene.add(next.root);
  }

  /** Sitting in a car: the figure is hidden whatever the view. */
  get riding(): boolean { return this.inCar; }
  set riding(v: boolean) {
    this.inCar = v;
    this.model.root.visible = this.thirdPerson && !v;
  }

  toggle(): boolean {
    this.thirdPerson = !this.thirdPerson;
    this.model.root.visible = this.thirdPerson && !this.inCar;
    return this.thirdPerson;
  }

  /**
   * Call after Player.update (which puts the camera at the eye). In third person this moves the camera behind the
   * player, keeping it above the ground; in first person it does nothing (the figure is hidden and not animated).
   */
  update(dt: number, camera: THREE.PerspectiveCamera, centre: THREE.Vector3, motion: Motion, groundAt?: (x: number, z: number) => number): void {
    if (!this.thirdPerson) return;
    camera.getWorldDirection(this.dir);
    this.flat.set(this.dir.x, 0, this.dir.z);
    if (this.flat.lengthSq() < 1e-6) this.flat.set(0, 0, -1);
    this.flat.normalize();
    const root = this.model.root;
    this.model.mixer.update(dt);
    this.airTime = motion.airborne ? this.airTime + dt : 0;
    const airborne = this.airTime > AIR_DELAY;
    const capsule = centre.y - FEET, ground = groundAt ? groundAt(centre.x, centre.z) : capsule;
    const target = !airborne && Math.abs(capsule - ground) < FOOT_SNAP ? ground : capsule;
    if (this.feetY === null || Math.abs(target - this.feetY) > 1.5) this.feetY = target;
    else this.feetY += (target - this.feetY) * Math.min(1, dt * FOOT_FOLLOW);
    root.position.set(centre.x, this.feetY, centre.z);
    const moving = motion.dir.lengthSq() > 0;
    if (moving) {
      const target = Math.atan2(motion.dir.x, motion.dir.z);
      const diff = Math.atan2(Math.sin(target - root.rotation.y), Math.cos(target - root.rotation.y));
      root.rotation.y += diff * Math.min(1, dt * TURN_RATE);
    }
    this.model.play(airborne ? 'jump' : moving && motion.speed > MIN_STRIDE ? (motion.running ? 'run' : 'walk') : 'idle');
    this.model.pace(motion.speed);
    const cx = centre.x - this.flat.x * BACK, cz = centre.z - this.flat.z * BACK;
    let cy = centre.y + CAMERA_UP - this.dir.y * CAMERA_TILT;
    if (groundAt) cy = Math.max(cy, groundAt(cx, cz) + CLEARANCE);
    camera.position.set(cx, cy, cz);
  }
}
