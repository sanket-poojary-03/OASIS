import * as THREE from 'three';
import type { WorldField } from '../world/field';
import { ribbonGeometry } from './ribbon';

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}

export class WaterSystem {
  readonly group = new THREE.Group();
  private sea: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x2b6f8f, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  rebuild(field: WorldField): void {
    disposeGroup(this.group);
    this.group.clear();
    this.sea = null;
    if (field.hasSea) {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), this.material);
      this.sea.position.y = field.seaLevelY;
      this.group.add(this.sea);
    }
    if (field.river.length > 1) {
      this.group.add(new THREE.Mesh(ribbonGeometry(field.river, 18, (x, z) => field.baseHeight(x, z) - 1.5), this.material));
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
