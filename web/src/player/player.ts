import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import type { WorldField } from '../world/field';
import { fallbackStep } from './fallbackStep';

const EYE = 0.75; // capsule centre → eye height offset

export class Player {
  readonly controls: PointerLockControls;
  readonly position = new THREE.Vector3();
  enabled = false;
  seated = false;
  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: KinematicCharacterController;
  private vy = 0;
  private readonly keys = new Set<string>();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement, physics: Physics) {
    this.controls = new PointerLockControls(camera, dom);
    const R = physics.R;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 200, 0));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.35), this.body);
    this.controller = physics.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.6, 0.2, true);
    this.controller.enableSnapToGround(0.6);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    addEventListener('keydown', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && this.controls.isLocked) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  teleport(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.vy = 0;
    this.position.set(x, y, z);
    this.camera.position.set(x, y + EYE, z);
  }

  spawn(x: number, y: number, z: number): void {
    this.teleport(x, y + 1, z);
  }

  lookRay(): THREE.Ray {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return new THREE.Ray(this.camera.position.clone(), dir);
  }

  /** `ready(x, z)` reports whether terrain collision exists there; while it is false a degraded mode uses the analytic field as the floor. */
  update(dt: number, field: WorldField, ready?: (x: number, z: number) => boolean): void {
    if (!this.enabled) return;
    const t = this.body.translation();
    this.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, THREE.Object3D.DEFAULT_UP);
    this.move.set(0, 0, 0);
    if (!this.seated && this.controls.isLocked) {
      if (this.keys.has('KeyW')) this.move.add(this.fwd);
      if (this.keys.has('KeyS')) this.move.sub(this.fwd);
      if (this.keys.has('KeyD')) this.move.add(this.right);
      if (this.keys.has('KeyA')) this.move.sub(this.right);
    }
    if (this.move.lengthSq() > 0) this.move.normalize();
    const active = this.controls.isLocked && !this.seated;
    if (ready && !ready(t.x, t.z)) {
      const n = fallbackStep(t, this.move, active && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? 10 : 5, dt, (x, z) => field.heightAt(x, z));
      this.vy = 0;
      this.body.setNextKinematicTranslation(n);
      this.position.set(n.x, n.y, n.z);
      this.camera.position.set(n.x, n.y + (this.seated ? 0.1 : EYE), n.z);
      return;
    }
    const surface = field.isWater(t.x, t.z) ? field.waterSurfaceAt(t.x, t.z) : null;
    const swimming = surface !== null && t.y < surface + 0.3;
    const running = active && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    const speed = swimming ? 3 : running ? 10 : 5;
    const grounded = this.controller.computedGrounded();
    if (swimming) {
      const target = (surface! - 0.5 - t.y) * 3;
      this.vy += (target - this.vy) * Math.min(1, dt * 4);
      if (active && this.keys.has('Space')) this.vy = 2.5;
    } else if (grounded && this.vy <= 0) {
      this.vy = active && this.keys.has('Space') ? 7 : -1;
    } else {
      this.vy -= 20 * dt;
    }
    this.controller.computeColliderMovement(this.collider, { x: this.move.x * speed * dt, y: this.vy * dt, z: this.move.z * speed * dt });
    const m = this.controller.computedMovement();
    const nx = t.x + m.x, nz = t.z + m.z;
    let ny = t.y + m.y;
    const ground = field.heightAt(nx, nz);
    if (ny < ground - 3) { ny = ground + 2; this.vy = 0; } // fell through a missing chunk
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.position.set(nx, ny, nz);
    this.camera.position.set(nx, ny + (this.seated ? 0.1 : EYE), nz);
  }
}
