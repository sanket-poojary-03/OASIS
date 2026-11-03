import * as THREE from 'three';
import type { WorldField } from '../world/field';
import { disposeGroup } from './dispose';
import { pieces } from './rangeCull';
import { ribbonGeometry } from './ribbon';

export { disposeGroup };

const WATER = 0x2b6f8f;

export class WaterSystem {
  readonly group = new THREE.Group();
  private sea: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  rebuild(field: WorldField): void {
    disposeGroup(this.group);
    this.group.clear();
    this.sea = null;
    this.material.color.set(field.recipe.palette?.water ?? WATER); // a palette water colour: "a purple sea"
    if (field.hasSea) {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), this.material);
      this.sea.position.y = field.seaLevelY;
      this.sea.userData.alwaysVisible = true; // follows the viewer; open sea to the horizon is right
      this.group.add(this.sea);
    }
    if (field.river.length > 1) {
      for (const run of pieces(field.river, 8)) this.group.add(new THREE.Mesh(ribbonGeometry(run, 18, (x, z) => field.baseHeight(x, z) - 1.5), this.material));
    }
    for (const l of field.lakes) {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(l.radius, 48).rotateX(-Math.PI / 2), this.material);
      lake.position.set(l.x, l.levelY, l.z);
      this.group.add(lake);
    }
  }

  update(viewer: THREE.Vector3): void {
    if (this.sea) this.sea.position.set(Math.round(viewer.x / 50) * 50, this.sea.position.y, Math.round(viewer.z / 50) * 50);
  }
}
