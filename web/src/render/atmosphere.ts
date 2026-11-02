import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Atmosphere } from '../core/recipe';

export const TIME_HOURS: Record<Atmosphere['time'], number> = { dawn: 6.3, day: 12, dusk: 18.4, night: 23 };
const FOG_DAY: Record<Atmosphere['weather'], number> = { clear: 0xbfd6ea, rain: 0x8a96a3, snow: 0xd8dee8, mist: 0xc9cfd6, storm: 0x5d6670 };
const FOG_EXTRA: Record<Atmosphere['weather'], number> = { clear: 0, rain: 0.004, snow: 0.005, mist: 0.012, storm: 0.008 };
/**
 * Night floor: a night scene must stay readable. A cool moon light (no shadows, so no extra shadow pass and no shader
 * recompiles), a hemisphere minimum tinted moonlit blue, a night fog light enough to show silhouettes against it, and
 * (in App) a little more exposure as `night` rises.
 */
const NIGHT_FOG = new THREE.Color(0x172036);
const HEMI_SKY_DAY = new THREE.Color(0xcfe3ff), HEMI_SKY_NIGHT = new THREE.Color(0x7d93c8);
const HEMI_GROUND_DAY = new THREE.Color(0x4a3f2a), HEMI_GROUND_NIGHT = new THREE.Color(0x2a2a36);
const MOON_INTENSITY = 0.7;
const HEMI_NIGHT_FLOOR = 0.35;

export class AtmosphereSystem {
  hours = 12;
  /** Game hours per real second: one day = 24 real minutes. */
  timeScale = 1 / 60;
  readonly sun = new THREE.DirectionalLight(0xfff1dd, 3);
  readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2a, 1);
  /** Fixed direction, high in the south-west sky; fades in as the sun sets. */
  readonly moon = new THREE.DirectionalLight(0xa9bfff, 0);
  /** 0 in daylight … 1 at full night (smooth through dusk and dawn). */
  night = 0;
  private readonly sky = new Sky();
  private readonly fog = new THREE.FogExp2(0xbfd6ea, 0.003);
  private spec: Atmosphere = { time: 'day', weather: 'clear', fog: 0.2, wind: 0.3 };
  private precip: THREE.Points | null = null;
  private precipSpeed = 0;
  private readonly sunDir = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.sky.scale.setScalar(5000); // must stay inside the camera far plane (6000); follows the viewer in update()
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.5;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -60; cam.right = 60; cam.top = 60; cam.bottom = -60; cam.near = 1; cam.far = 600;
    this.sun.shadow.bias = -0.0005;
    this.moon.position.set(-0.35, 0.85, 0.4);
    scene.add(this.sky, this.sun, this.sun.target, this.hemi, this.moon);
    scene.fog = this.fog;
  }

  get isNight(): boolean {
    return this.hours < 6 || this.hours > 19.5;
  }

  apply(spec: Atmosphere, resetTime = true): void {
    this.spec = { ...spec };
    if (resetTime) this.hours = TIME_HOURS[spec.time];
    this.setPrecipitation(spec.weather);
  }

  private setPrecipitation(weather: Atmosphere['weather']): void {
    if (this.precip) {
      this.scene.remove(this.precip);
      this.precip.geometry.dispose();
      (this.precip.material as THREE.Material).dispose();
      this.precip = null;
    }
    if (weather !== 'rain' && weather !== 'snow' && weather !== 'storm') return;
    const snow = weather === 'snow';
    const count = snow ? 3000 : 5000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xa8b8cc, size: snow ? 0.18 : 0.07, transparent: true, opacity: snow ? 0.9 : 0.6, depthWrite: false });
    this.precip = new THREE.Points(geo, mat);
    this.precip.frustumCulled = false;
    this.precipSpeed = snow ? 2.2 : weather === 'storm' ? 34 : 24;
    this.scene.add(this.precip);
  }

  update(dt: number, viewer: THREE.Vector3): void {
    this.hours = (this.hours + dt * this.timeScale) % 24;
    const angle = ((this.hours - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(angle), Math.sin(angle), -0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(viewer);
    this.sun.position.copy(viewer).addScaledVector(this.sunDir, 250);
    this.sun.target.position.copy(viewer);
    const day = THREE.MathUtils.smoothstep(this.sunDir.y, -0.08, 0.25);
    const overcast = this.spec.weather === 'storm' || this.spec.weather === 'rain' ? 0.5 : 1;
    this.sun.intensity = 3 * day * overcast;
    this.sun.castShadow = day > 0.05;
    this.night = 1 - day;
    this.moon.intensity = MOON_INTENSITY * this.night * (overcast < 1 ? 0.6 : 1);
    this.hemi.intensity = HEMI_NIGHT_FLOOR + (1.02 - HEMI_NIGHT_FLOOR) * day;
    this.hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, this.night);
    this.hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, this.night);
    this.fog.color.set(FOG_DAY[this.spec.weather]).lerp(NIGHT_FOG, this.night);
    this.fog.density = 0.0012 + this.spec.fog * 0.01 + FOG_EXTRA[this.spec.weather];
    if (this.precip) {
      const p = this.precip.geometry.getAttribute('position') as THREE.BufferAttribute;
      const drift = this.spec.wind * (this.spec.weather === 'snow' ? 2 : 6);
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - this.precipSpeed * dt;
        let x = p.getX(i) + drift * dt;
        if (y < 0) y += 40;
        if (x > 40) x -= 80;
        p.setY(i, y);
        p.setX(i, x);
      }
      p.needsUpdate = true;
      this.precip.position.set(viewer.x, viewer.y - 10, viewer.z);
    }
  }
}
