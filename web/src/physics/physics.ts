import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';

const quatY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

export class Physics {
  private constructor(readonly R: typeof RAPIER, readonly world: World) {}

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics(RAPIER, new RAPIER.World({ x: 0, y: -20, z: 0 }));
  }

  addTerrain(positions: Float32Array, indices: Uint32Array): Collider {
    return this.world.createCollider(this.R.ColliderDesc.trimesh(positions, indices));
  }

  addFixedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY: number): Collider {
    return this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation(quatY(rotY)));
  }

  addDynamicBox(x: number, y: number, z: number, hx: number, hy: number, hz: number): RigidBody {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.6).setAngularDamping(0.6));
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setDensity(0.5), body);
    return body;
  }

  removeCollider(c: Collider): void { this.world.removeCollider(c, false); }
  removeBody(b: RigidBody): void { this.world.removeRigidBody(b); }

  step(dt: number): void {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
