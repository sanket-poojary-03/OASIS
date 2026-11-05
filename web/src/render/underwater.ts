import * as THREE from 'three';
import type { WorldField } from '../world/field';
import { depthBelowSurface } from '../world/waterDepth';

const WATER = 0x2b6f8f;
/** Visibility: clear shallows, closing in as it gets deeper and darker. */
const NEAR = 0.5;
const FAR_SHALLOW = 60;
const FAR_DEEP = 28;
const DEEP = 25;
/** How much light is left at full depth, and on a moonless night. */
const DARK_AT_DEPTH = 0.45;
const DARK_AT_NIGHT = 0.18;

const BUBBLES = 48;
const BUBBLE_RANGE = 7;
const BUBBLE_RISE = 0.7;

/** A soft round dot: points are square without one. */
function bubbleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const fade = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  fade.addColorStop(0, 'rgba(255,255,255,0.35)');
  fade.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export interface UnderwaterLook { colour: THREE.Color; near: number; far: number; veil: number }

/** What the water does to the view, `depth` metres down at `night` (0..1). */
export function underwaterLook(depth: number, night: number, water: string | number = WATER): UnderwaterLook {
  const d = Math.min(1, depth / DEEP);
  const light = (1 - d * (1 - DARK_AT_DEPTH)) * (1 - night * (1 - DARK_AT_NIGHT));
  return { colour: new THREE.Color(water).multiplyScalar(light), near: NEAR, far: FAR_SHALLOW + (FAR_DEEP - FAR_SHALLOW) * d, veil: 0.22 + 0.2 * d };
}

/**
 * Being under the water: thick tinted fog in place of the sky's, a veil over the picture, and bubbles drifting up.
 * Runs after the atmosphere each frame, which sets the fog for the air.
 */
export class Underwater {
  /** A plain layer, since a post pass would cost every frame, above and below the water alike. */
  private readonly veil = document.createElement('div');
  private readonly bubbles: THREE.Points;
  private readonly offsets = new Float32Array(BUBBLES * 3);
  private active = false;

  constructor(scene: THREE.Scene) {
    this.veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;display:none';
    document.body.append(this.veil);
    for (let i = 0; i < BUBBLES * 3; i++) this.offsets[i] = (Math.random() - 0.5) * BUBBLE_RANGE * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLES * 3), 3));
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8f2ff, size: 0.05, map: bubbleTexture(), transparent: true, opacity: 0.7, depthWrite: false }));
    this.bubbles.frustumCulled = false;
    this.bubbles.visible = false;
    scene.add(this.bubbles);
  }

  /** Returns whether the viewer is under the water. */
  update(dt: number, field: WorldField | undefined, viewer: THREE.Vector3, fog: THREE.Fog, night: number): boolean {
    const depth = field ? depthBelowSurface(field, viewer.x, viewer.y, viewer.z) : 0;
    const under = depth > 0;
    if (under !== this.active) {
      this.active = under;
      this.veil.style.display = under ? 'block' : 'none';
      this.bubbles.visible = under;
    }
    if (!under) return false;
    const look = underwaterLook(depth, night, field?.recipe.palette?.water ?? WATER);
    fog.color.copy(look.colour);
    fog.near = look.near;
    fog.far = look.far;
    const css = `#${look.colour.getHexString()}`;
    this.veil.style.background = `radial-gradient(ellipse at 50% 35%, ${css}55, ${css}cc)`;
    this.veil.style.opacity = String(look.veil * 2);
    const surface = field?.waterSurfaceAt(viewer.x, viewer.z) ?? viewer.y;
    const pos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < BUBBLES; i++) {
      let y = this.offsets[i * 3 + 1] + dt * BUBBLE_RISE;
      if (y > BUBBLE_RANGE) y -= BUBBLE_RANGE * 2;
      this.offsets[i * 3 + 1] = y;
      // Bubbles stop at the surface, not at wherever the viewer's range ends.
      pos.setXYZ(i, viewer.x + this.offsets[i * 3], Math.min(viewer.y + y, surface), viewer.z + this.offsets[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    return true;
  }
}
