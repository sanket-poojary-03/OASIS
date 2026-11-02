import * as THREE from 'three';
import { animatedClone, type AnimatedModel, type ModelTemplate } from '../render/animated';

/** Capsule centre → feet (half-height 0.55 + radius 0.35), matching the Player's capsule. */
const FEET = 0.9;
/** Third-person camera: this far behind the player, and never closer than this to the ground under it. */
const BACK = 5;
const CLEARANCE = 0.5;
const TURN_RATE = 10;

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
    root, mixer, play: () => {},
    dispose: () => { for (const m of [body, head, nose]) m.geometry.dispose(); cloth.dispose(); skin.dispose(); },
  };
}

/**
 * The visible player. V toggles third person (camera 5 m behind, over the shoulder) and back to first person.
 * Starts as a procedural figure; use() swaps in the animated adventurer whenever it loads (art hot-swap).
 */
export class Avatar {
  thirdPerson = false;
  private model: AnimatedModel = placeholderFigure();
  private animated = false;
  private readonly dir = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.model.root.visible = false;
    scene.add(this.model.root);
  }

  /** True once the animated pack model replaced the procedural figure. */
  get hasModel(): boolean { return this.animated; }

  use(t: ModelTemplate): void {
    const next = animatedClone(t);
    next.root.position.copy(this.model.root.position);
    next.root.rotation.y = this.model.root.rotation.y;
    next.root.visible = this.thirdPerson;
    this.scene.remove(this.model.root);
    this.model.dispose();
    this.model = next;
    this.animated = true;
    this.scene.add(next.root);
  }

  toggle(): boolean {
    this.thirdPerson = !this.thirdPerson;
    this.model.root.visible = this.thirdPerson;
    return this.thirdPerson;
  }

  /**
   * Call after Player.update (which puts the camera at the eye). In third person this moves the camera behind the
   * player, keeping it above the ground; in first person it does nothing (the figure is hidden and not animated).
   */
  update(dt: number, camera: THREE.PerspectiveCamera, centre: THREE.Vector3, moving: boolean, running: boolean, groundAt?: (x: number, z: number) => number): void {
    if (!this.thirdPerson) return;
    camera.getWorldDirection(this.dir);
    this.flat.set(this.dir.x, 0, this.dir.z);
    if (this.flat.lengthSq() < 1e-6) this.flat.set(0, 0, -1);
    this.flat.normalize();
    const root = this.model.root;
    this.model.mixer.update(dt);
    root.position.set(centre.x, centre.y - FEET, centre.z);
    if (moving) {
      const target = Math.atan2(this.flat.x, this.flat.z);
      const diff = Math.atan2(Math.sin(target - root.rotation.y), Math.cos(target - root.rotation.y));
      root.rotation.y += diff * Math.min(1, dt * TURN_RATE);
    }
    this.model.play(moving ? (running ? 'run' : 'walk') : 'idle');
    const cx = centre.x - this.flat.x * BACK, cz = centre.z - this.flat.z * BACK;
    let cy = centre.y + 1.6 - this.dir.y * 3;
    if (groundAt) cy = Math.max(cy, groundAt(cx, cz) + CLEARANCE);
    camera.position.set(cx, cy, cz);
  }
}
