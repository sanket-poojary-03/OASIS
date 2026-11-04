import * as THREE from 'three';
import { placeholderKind, WINDOW_MATERIAL } from './placeholders';

/** Placeholder kinds drawn with lit windows or a lamp (WINDOW_MATERIAL). A model that replaces one keeps a night glow. */
const LIT_KINDS: ReadonlySet<string> = new Set(['house', 'tower', 'lighthouse', 'lantern']);
/** Window and lamp materials by name. "light" alone is left out: it would match wall materials like "LightWood". */
export const GLOW_NAME = /window|glass|lamp|lantern|candle|flame|glow|emissi/i;

/**
 * Fallback panes on the front (+z) and back walls, sized and placed as fractions of the model's bounding box
 * (`at`: height of the pane centre, `xs`: x offsets, `w`/`h`: pane size, all relative to the model height or width).
 * They follow the procedural shapes: two house windows, one tower window, the lighthouse lamp.
 */
const PANES: Record<string, { at: number; xs: number[]; w: number; h: number }> = {
  house: { at: 0.34, xs: [-0.28, 0.28], w: 0.16, h: 0.14 },
  tower: { at: 0.7, xs: [0], w: 0.04, h: 0.07 },
  lighthouse: { at: 0.87, xs: [0], w: 0.12, h: 0.09 },
};

/** Every material driven by the night factor: the placeholder windows and the lit copies of model materials. */
const NIGHT_MATERIALS = new Set<THREE.MeshStandardMaterial>([WINDOW_MATERIAL]);
/** One lit copy per source material, shared by every placed copy of the model (never disposed: models stay cached). */
const litCopies = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
const PANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const raycaster = new THREE.Raycaster();

/** A material whose emissive part (its windows) follows the night factor, like the placeholder windows. */
export function glowsAtNight(m: THREE.MeshStandardMaterial): void {
  NIGHT_MATERIALS.add(m);
}

/** Sets how brightly every window and lamp glows (0 by day). */
export function setNightGlow(intensity: number): void {
  for (const m of NIGHT_MATERIALS) m.emissiveIntensity = intensity;
}

function litCopy(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let lit = litCopies.get(m);
  if (!lit) {
    lit = m.clone();
    lit.emissive.copy(WINDOW_MATERIAL.emissive);
    lit.emissiveIntensity = WINDOW_MATERIAL.emissiveIntensity;
    litCopies.set(m, lit);
    NIGHT_MATERIALS.add(lit);
  }
  return lit;
}

/** Window/lamp materials get a night-driven lit copy (materials that already glow are left alone). Returns how many glow. */
function lightNamedMaterials(content: THREE.Object3D): number {
  let lit = 0;
  const swap = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial) || !GLOW_NAME.test(m.name)) return m;
    lit++;
    return m.emissiveIntensity > 0 && m.emissive.getHex() !== 0 ? m : litCopy(m);
  };
  content.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return lit;
}

/** Small window panes on the walls, found by casting rays at the model (so they sit on a wall, not on the bounding box). */
function addPanes(content: THREE.Object3D, kind: string): number {
  const spec = PANES[kind];
  if (!spec) return 0;
  content.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(content);
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  const targets: THREE.Object3D[] = [];
  content.traverse((o) => { if (o instanceof THREE.Mesh) targets.push(o); });
  const y = box.min.y + spec.at * size.y;
  let added = 0;
  for (const side of [1, -1]) {
    for (const fx of spec.xs) {
      const x = (box.min.x + box.max.x) / 2 + fx * size.x;
      raycaster.set(new THREE.Vector3(x, y, side > 0 ? box.max.z + 1 : box.min.z - 1), new THREE.Vector3(0, 0, -side));
      raycaster.far = size.z + 2;
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) continue;
      const pane = new THREE.Mesh(PANE_GEOMETRY, WINDOW_MATERIAL);
      pane.name = 'night-window';
      pane.scale.set(spec.w * size.y, spec.h * size.y, 1);
      pane.position.set(x, y, hit.point.z + side * 0.04);
      if (side < 0) pane.rotation.y = Math.PI;
      content.add(pane);
      added++;
    }
  }
  return added;
}

/**
 * A model that replaces a placeholder with lit windows or a lamp (house, tower, lighthouse, lantern) keeps glowing at
 * night, whether it came from the library, online or Meshy: materials named like windows or lamps get a lit copy, and
 * a house, tower or lighthouse without any gets small window panes on its front and back walls. `content` is the
 * fitted model (normalizeTo), not yet in the scene. Returns how many parts glow.
 */
export function addNightGlow(content: THREE.Object3D, asset: string): number {
  const kind = placeholderKind(asset);
  if (!LIT_KINDS.has(kind)) return 0;
  return lightNamedMaterials(content) || addPanes(content, kind);
}
