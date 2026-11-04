import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';

const quatY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

export class Physics {
  /** Handles of terrain colliders: vehicles follow the ground analytically and only collide with everything else. */
  private readonly terrain = new Set<number>();

  private constructor(readonly R: typeof RAPIER, readonly world: World) {}

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics(RAPIER, new RAPIER.World({ x: 0, y: -20, z: 0 }));
  }

  addTerrain(positions: Float32Array, indices: Uint32Array): Collider {
    const c = this.world.createCollider(this.R.ColliderDesc.trimesh(positions, indices));
    this.terrain.add(c.handle);
    return c;
  }

  isTerrain(c: Collider): boolean { return this.terrain.has(c.handle); }

  /** A fixed collider shaped like a model's own surface (world-space vertices), so you stand on what you see. */
  addFixedTrimesh(positions: Float32Array, indices: Uint32Array): Collider {
    return this.world.createCollider(this.R.ColliderDesc.trimesh(positions, indices));
  }

  /** One convex shape around a model's world-space vertices (its roof included); null when no hull can be made. */
  addFixedHull(positions: Float32Array): Collider | null {
    const desc = this.R.ColliderDesc.convexHull(positions);
    return desc ? this.world.createCollider(desc) : null;
  }

  /** A fixed upright cylinder (a floating deck). */
  addFixedCylinder(x: number, y: number, z: number, halfHeight: number, radius: number): Collider {
    return this.world.createCollider(this.R.ColliderDesc.cylinder(halfHeight, radius).setTranslation(x, y, z));
  }

  addFixedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY: number): Collider {
    return this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation(quatY(rotY)));
  }

  addDynamicBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0): RigidBody {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(quatY(rotY)).setLinearDamping(0.6).setAngularDamping(0.6));
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setDensity(0.5), body);
    return body;
  }

  removeCollider(c: Collider): void {
    this.terrain.delete(c.handle);
    this.world.removeCollider(c, false);
  }
  removeBody(b: RigidBody): void { this.world.removeRigidBody(b); }

  step(dt: number): void {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
