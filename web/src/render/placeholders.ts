import * as THREE from 'three';

export const WINDOW_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.6 });
const mats = new Map<number, THREE.MeshStandardMaterial>();
const mat = (color: number) => {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); mats.set(color, m); }
  return m;
};

function add(g: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material | number, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const K = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);

const BUILDERS: Record<string, (g: THREE.Group) => void> = {
  house: (g) => {
    add(g, B(6, 3.2, 5), 0xc9b38a, 0, 1.6);
    const roof = add(g, K(4.6, 2.4, 4), 0x7a3b2a, 0, 4.4, 0, Math.PI / 4);
    roof.scale.z = 0.85;
    add(g, B(0.9, 0.8, 0.05), WINDOW_MATERIAL, -1.7, 1.9, 2.53);
    add(g, B(0.9, 0.8, 0.05), WINDOW_MATERIAL, 1.7, 1.9, 2.53);
    add(g, B(0.6, 1.4, 0.6), 0x6e5d4b, 1.6, 4.6, -0.8);
  },
  tent: (g) => { add(g, K(2.5, 3, 6), 0xd8c9a3, 0, 1.5); },
  tower: (g) => {
    add(g, C(2, 2.4, 12), 0x8d8a82, 0, 6);
    add(g, C(2.6, 2.6, 1.2), 0x7d7a72, 0, 12.6);
    add(g, B(0.5, 0.9, 0.1), WINDOW_MATERIAL, 0, 9, 2.15);
  },
  lighthouse: (g) => {
    add(g, C(1.6, 2.4, 14, 16), 0xf2f2ee, 0, 7);
    add(g, C(1.75, 1.85, 1.5, 16), 0xb33a3a, 0, 9);
    add(g, C(1.3, 1.3, 1.6, 12), WINDOW_MATERIAL, 0, 14.8);
    add(g, K(1.6, 1.4, 12), 0x333333, 0, 16.3);
  },
  castle: (g) => {
    add(g, B(10, 10, 10), 0x8a8780, 0, 5);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      add(g, C(2, 2, 14, 8), 0x7f7c75, x, 7, z);
      add(g, K(2.4, 3, 8), 0x5b3a3a, x, 15.5, z);
    }
    add(g, B(2.4, 3.6, 0.3), 0x4a3726, 0, 1.8, 5.1);
  },
  obelisk: (g) => {
    add(g, C(0.9, 1.4, 10, 4), 0xb9a27a, 0, 5, 0, Math.PI / 4);
    add(g, K(0.9, 1.2, 4), 0xb9a27a, 0, 10.6, 0, Math.PI / 4);
  },
  statue: (g) => {
    add(g, B(2, 1, 2), 0x8f8f88, 0, 0.5);
    add(g, C(0.5, 0.6, 3, 8), 0x9a9a92, 0, 2.5);
    add(g, new THREE.SphereGeometry(0.45, 10, 8), 0x9a9a92, 0, 4.3);
  },
  well: (g) => {
    add(g, C(1.2, 1.2, 1, 12), 0x8d8a82, 0, 0.5);
    add(g, B(0.15, 2.2, 0.15), 0x6b4a2b, -1, 1.1);
    add(g, B(0.15, 2.2, 0.15), 0x6b4a2b, 1, 1.1);
    add(g, K(1.6, 0.9, 4), 0x7a3b2a, 0, 2.6, 0, Math.PI / 4);
  },
  stall: (g) => {
    add(g, B(3, 1, 1.6), 0x8a6a45, 0, 0.5);
    add(g, B(3.4, 0.1, 2), 0xb33a3a, 0, 2.4);
    for (const x of [-1.5, 1.5]) add(g, B(0.12, 2.4, 0.12), 0x6b4a2b, x, 1.2, 0.8);
  },
  campfire: (g) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(g, new THREE.DodecahedronGeometry(0.28, 0), 0x6f6a64, Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8);
    }
    add(g, C(0.1, 0.1, 1.2, 6), 0x5a3d25, 0, 0.2, 0, 0).rotation.z = Math.PI / 2;
    add(g, C(0.1, 0.1, 1.2, 6), 0x5a3d25, 0, 0.25, 0, Math.PI / 2).rotation.z = Math.PI / 2;
  },
  bell: (g) => {
    add(g, B(0.3, 3, 0.3), 0x6b4a2b, 0, 1.5);
    add(g, B(1.6, 0.25, 0.3), 0x6b4a2b, 0.6, 3);
    add(g, K(0.5, 0.8, 10), 0xb08d3a, 1.1, 2.4);
  },
  lantern: (g) => {
    add(g, C(0.07, 0.09, 2.2, 6), 0x333333, 0, 1.1);
    add(g, B(0.35, 0.45, 0.35), WINDOW_MATERIAL, 0, 2.4);
  },
  barrel: (g) => { add(g, C(0.45, 0.45, 1.1, 12), 0x7a5230, 0, 0.55); },
  crate: (g) => { add(g, B(1, 1, 1), 0x9a7445, 0, 0.5); },
  bench: (g) => {
    add(g, B(1.8, 0.12, 0.5), 0x8a6a45, 0, 0.5);
    add(g, B(1.8, 0.5, 0.08), 0x8a6a45, 0, 0.85, -0.22);
    for (const x of [-0.8, 0.8]) add(g, B(0.1, 0.5, 0.45), 0x5a3d25, x, 0.25);
  },
  dock: (g) => {
    add(g, B(3, 0.25, 10), 0x8a6a45, 0, 0.6);
    for (const z of [-4.5, 0, 4.5]) for (const x of [-1.4, 1.4]) add(g, C(0.15, 0.15, 1.6, 6), 0x5a3d25, x, 0, z);
  },
  shrine: (g) => {
    add(g, B(3, 0.6, 3), 0x9a958c, 0, 0.3);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) add(g, C(0.15, 0.15, 2.2, 8), 0xb0aaa0, x, 1.7, z);
    add(g, K(2.6, 1.5, 4), 0x7a3b2a, 0, 3.5, 0, Math.PI / 4);
  },
  arch: (g) => {
    add(g, B(1.5, 8, 2), 0xc0703a, -4, 4);
    add(g, B(1.5, 8, 2), 0xc0703a, 4, 4);
    add(g, B(9.5, 1.6, 2), 0xb0663a, 0, 8.8);
  },
  windmill: (g) => {
    add(g, C(1.8, 2.6, 8, 8), 0xd9cfbf, 0, 4);
    add(g, K(2.2, 2, 8), 0x7a3b2a, 0, 9);
    const blades = new THREE.Group();
    blades.name = 'rotor';
    blades.position.set(0, 7.5, 2.4);
    for (let i = 0; i < 4; i++) add(blades, B(0.5, 5, 0.1), 0xece4d4, 0, 0, 0).rotation.z = (i * Math.PI) / 2;
    blades.children.forEach((b) => b.translateY(2.5));
    g.add(blades);
  },
  generic: (g) => {
    add(g, B(3, 3, 3), 0xa89a86, 0, 1.5);
    add(g, K(2.4, 1.6, 4), 0x7a3b2a, 0, 3.8, 0, Math.PI / 4);
  },
};

/** A tower block built at its real height (scaling a fixed shape would make tall blocks absurdly wide): body, roof slab, window strips. */
function block(g: THREE.Group, h: number): void {
  const w = 8, body = Math.max(1, h - 0.5);
  add(g, B(w, body, w), 0x9aa3ab, 0, body / 2);
  add(g, B(w + 0.4, 0.5, w + 0.4), 0x6b7177, 0, body + 0.25);
  const strip = Math.max(1, body - 2.5);
  for (const [x, z, ry] of [[0, w / 2 + 0.03, 0], [0, -w / 2 - 0.03, 0], [w / 2 + 0.03, 0, Math.PI / 2], [-w / 2 - 0.03, 0, Math.PI / 2]] as const) {
    for (const o of [-2, 2]) {
      const dx = ry ? 0 : o, dz = ry ? o : 0;
      add(g, B(1.4, strip, 0.05), WINDOW_MATERIAL, x + dx, 1.5 + strip / 2, z + dz, ry);
    }
  }
}

const RULES: Array<[RegExp, string]> = [
  [/lighthouse/, 'lighthouse'],
  [/castle|fort|keep|citadel/, 'castle'],
  [/windmill/, 'windmill'],
  [/obelisk|monolith|pillar|menhir/, 'obelisk'],
  [/statue|sculpture|idol/, 'statue'],
  [/\barch\b/, 'arch'],
  [/apartment|office|skyscraper|high-?rise|tower block|\bblock\b|\bbuilding\b|\bflats?\b|condo|hotel/, 'block'],
  [/tower/, 'tower'],
  [/tent|yurt/, 'tent'],
  [/shrine|altar|temple|chapel/, 'shrine'],
  [/\bwell\b/, 'well'],
  [/market|stall/, 'stall'],
  [/campfire|bonfire|fire ?pit/, 'campfire'],
  [/bell|gong/, 'bell'],
  [/lantern|lamp|torch/, 'lantern'],
  [/barrel/, 'barrel'],
  [/crate|\bbox\b|chest/, 'crate'],
  [/bench|chair|seat/, 'bench'],
  [/dock|pier|jetty/, 'dock'],
  [/house|cottage|\bhut\b|cabin|lodge|home|shack|barn|inn/, 'house'],
];

export function placeholderKind(asset: string): string {
  const a = asset.toLowerCase();
  for (const [re, kind] of RULES) if (re.test(a)) return kind;
  return 'generic';
}

/** `height` (metres) only shapes tower blocks, which are built at their real height; everything else is scaled later. */
export function buildPlaceholder(asset: string, height = 12): THREE.Group {
  const g = new THREE.Group();
  const kind = placeholderKind(asset);
  if (kind === 'block') block(g, height); else BUILDERS[kind](g);
  g.userData.placeholder = true;
  return g;
}
