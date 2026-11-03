import * as THREE from 'three';

/** Where the pack sits on the character (it faces +z, so its back is −z), in metres from the feet. */
const BACK = new THREE.Vector3(0, 1.12, -0.3);
const FLAME_LEN = 0.9;

/** Two rocket tanks with nozzles, procedural so every character can wear it. Flames hang below the nozzles. */
function buildPack(): { pack: THREE.Group; flames: THREE.Mesh[]; dispose: () => void } {
  const pack = new THREE.Group();
  pack.name = 'booster';
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.7, roughness: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.3, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.5 });
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const tank = new THREE.CylinderGeometry(0.11, 0.11, 0.55, 14);
  const cap = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.06, 0.1, 0.12, 12);
  const strap = new THREE.BoxGeometry(0.42, 0.08, 0.06);
  // Flame cones point down from the nozzle (tip at −FLAME_LEN), scaled by update().
  const outer = new THREE.ConeGeometry(0.09, FLAME_LEN, 12, 1, true).rotateX(Math.PI).translate(0, -FLAME_LEN / 2, 0);
  const inner = new THREE.ConeGeometry(0.05, FLAME_LEN * 0.6, 10, 1, true).rotateX(Math.PI).translate(0, -FLAME_LEN * 0.3, 0);
  const flames: THREE.Mesh[] = [];
  for (const x of [-0.13, 0.13]) {
    const body = new THREE.Mesh(tank, x < 0 ? red : metal);
    body.position.set(x, 0, 0);
    const top = new THREE.Mesh(cap, x < 0 ? red : metal);
    top.position.set(x, 0.275, 0);
    const noz = new THREE.Mesh(nozzle, dark);
    noz.position.set(x, -0.335, 0);
    const flame = new THREE.Mesh(outer, flameOuter);
    flame.add(new THREE.Mesh(inner, flameInner));
    flame.position.set(x, -0.39, 0);
    flame.visible = false;
    flames.push(flame);
    for (const m of [body, top, noz]) m.castShadow = true;
    pack.add(body, top, noz, flame);
  }
  for (const y of [0.15, -0.15]) {
    const s = new THREE.Mesh(strap, dark);
    s.position.set(0, y, 0.08);
    pack.add(s);
  }
  pack.position.copy(BACK);
  const dispose = (): void => {
    for (const g of [tank, cap, nozzle, strap, outer, inner]) g.dispose();
    for (const m of [metal, red, dark, flameOuter, flameInner]) m.dispose();
  };
  return { pack, flames, dispose };
}

/**
 * The rocket booster's look and sound: the pack on the character's back, flickering flames and an orange glow while
 * it fires, and a filtered-noise roar. The glow light exists from the start (intensity 0), so firing never changes the
 * scene's light count (no shader recompile hitch).
 */
export class Booster {
  readonly pack: THREE.Group;
  private readonly flames: THREE.Mesh[];
  private readonly light = new THREE.PointLight(0xff8a3a, 0, 14, 2);
  private power = 0;
  private audio: { ctx: AudioContext; gain: GainNode } | null = null;

  constructor(scene: THREE.Scene) {
    const built = buildPack();
    this.pack = built.pack;
    this.flames = built.flames;
    scene.add(this.light);
  }

  /** `at`: the player's feet. `firing` eases the flames, glow and roar in and out. */
  update(dt: number, t: number, firing: boolean, at: THREE.Vector3): void {
    this.power += ((firing ? 1 : 0) - this.power) * Math.min(1, dt * 12);
    const p = this.power;
    this.flames.forEach((f, i) => {
      f.visible = p > 0.03;
      const flicker = 0.8 + 0.2 * Math.sin(t * 47 + i * 2.1) + 0.12 * Math.sin(t * 83 + i);
      f.scale.set(0.8 + 0.3 * p, p * flicker, 0.8 + 0.3 * p);
    });
    this.light.intensity = 26 * p;
    this.light.position.set(at.x, at.y + 0.6, at.z);
    this.sound(p);
  }

  private sound(p: number): void {
    if (p < 0.01 && !this.audio) return;
    if (!this.audio) {
      const ctx = new AudioContext();
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      this.audio = { ctx, gain };
    }
    const { ctx, gain } = this.audio;
    if (ctx.state === 'suspended' && p > 0.01) void ctx.resume();
    gain.gain.setTargetAtTime(0.22 * p, ctx.currentTime, 0.05);
  }
}
