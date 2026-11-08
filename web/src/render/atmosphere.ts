import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Atmosphere } from '../core/recipe';
import { SHADOW_MAP_SIZE } from './deviceTier';
import { NightSky } from './nightSky';
import { TERRAIN_RANGE } from './rangeCull';

/** Dawn and dusk keep the sun low but up (golden light): at 18.4 it was already under the horizon, so "dusk" was night. */
export const TIME_HOURS: Record<Atmosphere['time'], number> = { dawn: 6.6, day: 12, dusk: 17.4, night: 23 };
// Clear: the sky's own pale blue at the horizon, so far land fades into the sky instead of a band.
const FOG_DAY: Record<Atmosphere['weather'], number> = { clear: 0xbcd9f4, rain: 0x8a96a3, snow: 0xd8dee8, mist: 0xc9cfd6, storm: 0x5d6670 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const FOG_EXTRA: Record<Atmosphere['weather'], number> = { clear: 0, rain: 0.004, snow: 0.005, mist: 0.012, storm: 0.008 };
/**
 * Night floor: a night scene must stay readable. A cool moon light (no shadows, so no extra shadow pass and no shader
 * recompiles), a hemisphere minimum tinted moonlit blue, a night fog light enough to show silhouettes against it, and
 * (in App) a little more exposure as `night` rises.
 */
const NIGHT_FOG = new THREE.Color(0x172036);
/** Clear-sky haze with the sun near the horizon (the Sky shader's dusk band). */
const LOW_SUN_HAZE = new THREE.Color(0xc9a08c);
const HEMI_SKY_DAY = new THREE.Color(0xcfe3ff), HEMI_SKY_NIGHT = new THREE.Color(0x7d93c8);
const HEMI_GROUND_DAY = new THREE.Color(0x4a3f2a), HEMI_GROUND_NIGHT = new THREE.Color(0x2a2a36);
const MOON_INTENSITY = 1.3;
const HEMI_NIGHT_FLOOR = 0.6;
const PRECIP_NIGHT_DIM = 0.6;
/** A low sun's light: golden, the colour its haze already has. */
const SUN_HIGH = new THREE.Color(0xfff1dd), SUN_LOW = new THREE.Color(0xffb27a);
/** How far either side of the viewer the sun's shadows reach, and how far off it sits. */
const SHADOW_HALF = 60;
const SUN_DISTANCE = 250;
const SUN_DISC_GAIN = '0.05';
const SUN_DISC_MAX = '8.0';
/** Most fog a clear sky keeps. An edit like "make it a clear day" changes the weather and leaves the fog of the mist before it. */
const CLEAR_MAX_FOG = 0.15;

/** The fog to draw: the recipe's, except that a clear sky is clear. */
export function hazeFor(spec: Atmosphere): number {
  return spec.weather === 'clear' ? Math.min(spec.fog, CLEAR_MAX_FOG) : spec.fog;
}

/**
 * How fast the clock runs at `hours` (1 = one day per 24 real minutes). The time the player asked for lasts: within
 * 1.5 h of it the clock runs at a third. Nights run 4x faster unless night is what was asked for: a "dusk" world used
 * to be dark a minute in and stay dark for ten, nearly half of all play.
 */
export function clockPace(hours: number, asked: number): number {
  const diff = (((hours - asked) % 24) + 24) % 24;
  if (Math.min(diff, 24 - diff) < 1.5) return 1 / 3;
  const night = hours < 5.5 || hours > 20;
  const askedNight = asked < 5.5 || asked > 20;
  return night && !askedNight ? 4 : 1;
}

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
  private readonly nightSky = new NightSky();
  /**
   * Linear fog that is complete at the edge of the loaded terrain: nothing exists past it, so a far peak's castle, a
   * lake or a road there would otherwise hang in the sky, and the land would end in a visible cut. Weather only thickens it.
   */
  private readonly fog = new THREE.Fog(0xbfd6ea, 60, TERRAIN_RANGE);
  /**
   * Metres the view reaches past the loaded-terrain radius. 0 for a player (land loads around them); an orbiting
   * camera looks across the land loaded around its centre, so it may see farther (App.showcase).
   */
  reach = 0;
  private spec: Atmosphere = { time: 'day', weather: 'clear', fog: 0.2, wind: 0.3 };
  private precip: THREE.Points | null = null;
  private precipSpeed = 0;
  private readonly precipColour = new THREE.Color();
  private readonly sunDir = new THREE.Vector3();
  /** Where the shadows are drawn around when that is not the viewer: an orbiting camera looks at something else. */
  private shadowFocus: { x: number; y: number; z: number } | null = null;
  private shadowHalf = SHADOW_HALF;
  /**
   * The physical Sky shader cannot take an arbitrary hue, so a palette sky colour ("an orange alien sky") is a
   * translucent dome just inside it: the sun glow still shows through, and fog and ambient light follow the same tint.
   */
  private skyTint: THREE.Color | null = null;
  private readonly tintDome = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0.6, fog: false, depthWrite: false }),
  );
  private readonly tintNow = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {
    this.sky.scale.setScalar(5000); // must stay inside the camera far plane (6000); follows the viewer in update()
    const u = this.sky.material.uniforms;
    // This Sky outputs linear light for the tone mapper. At turbidity 6 / rayleigh 1.5 every channel saturated: a white sky.
    u.turbidity.value = 1;
    u.rayleigh.value = 0.5;
    u.mieCoefficient.value = 0.002;
    // The disc is up to 60000 times white, and bloom spread that over the whole screen from dusk on: a white-out facing the sun.
    // The sky's own light is lowered too (0.04 in the shader): near the horizon it still went pale.
    u.cloudCoverage.value = 0.3;
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 )', `sundisc * min( vSunE * Fex * ${SUN_DISC_GAIN}, vec3( ${SUN_DISC_MAX} ) )`)
      .replace('( Lin + L0 ) * 0.04 +', '( Lin + L0 ) * 0.024 +');
    u.mieDirectionalG.value = 0.8;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_HALF; cam.right = SHADOW_HALF; cam.top = SHADOW_HALF; cam.bottom = -SHADOW_HALF; cam.near = 1; cam.far = 600;
    // The depth range is 600 m, so a bias counts for 600 times its value: -0.0005 held every shadow 30 cm off the thing
    // casting it, and characters and props looked as if they hovered. The normal bias keeps surfaces free of speckle instead.
    this.sun.shadow.bias = -0.00008;
    this.sun.shadow.normalBias = 0.05;
    this.moon.position.set(-0.6, 0.5, 0.6); // low enough to see the moon itself without looking straight up
    this.tintDome.visible = false;
    this.tintDome.frustumCulled = false;
    scene.add(this.sky, this.nightSky.group, this.tintDome, this.sun, this.sun.target, this.hemi, this.moon);
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

  /** Shadows around `focus`, `half` metres either side, for a camera circling it; null goes back to around the viewer. */
  setShadowArea(focus: { x: number; y: number; z: number } | null, half = SHADOW_HALF): void {
    this.shadowFocus = focus;
    if (half === this.shadowHalf) return;
    this.shadowHalf = half;
    const cam = this.sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
  }

  /** The recipe's palette sky colour, or undefined for the natural sky. */
  setSkyTint(hex: string | undefined): void {
    this.skyTint = hex ? new THREE.Color(hex) : null;
    this.tintDome.visible = !!hex;
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
    this.precipColour.set(snow ? 0xffffff : 0xa8b8cc);
    const mat = new THREE.PointsMaterial({ color: this.precipColour, size: snow ? 0.18 : 0.07, transparent: true, opacity: snow ? 0.9 : 0.6, depthWrite: false });
    this.precip = new THREE.Points(geo, mat);
    this.precip.frustumCulled = false;
    this.precipSpeed = snow ? 2.2 : weather === 'storm' ? 34 : 24;
    this.scene.add(this.precip);
  }

  /** Rain and snow fall in the air only: hidden while the viewer is under water. */
  setPrecipVisible(visible: boolean): void {
    if (this.precip) this.precip.visible = visible;
  }

  update(dt: number, viewer: THREE.Vector3): void {
    this.hours = (this.hours + dt * this.timeScale * clockPace(this.hours, TIME_HOURS[this.spec.time])) % 24;
    const angle = ((this.hours - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(angle), Math.sin(angle), -0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(viewer);
    const shadows = this.shadowFocus ?? viewer;
    this.sun.position.set(shadows.x, shadows.y, shadows.z).addScaledVector(this.sunDir, SUN_DISTANCE);
    this.sun.target.position.set(shadows.x, shadows.y, shadows.z);
    const day = THREE.MathUtils.smoothstep(this.sunDir.y, -0.08, 0.25);
    const overcast = this.spec.weather === 'storm' || this.spec.weather === 'rain' ? 0.5 : 1;
    // Measured in the browser: sun 3 against fill 1 left every shaded face near black; 1.85 fill washed the grass out. 2.6 / 1.55 keeps both.
    this.sun.intensity = 2.6 * day * overcast;
    // castShadow stays true: toggling it changes the light-state hash and recompiles every lit material (hitch).
    // At night the sun intensity is 0, so its shadow is invisible.
    this.night = 1 - day;
    this.moon.intensity = MOON_INTENSITY * this.night * (overcast < 1 ? 0.6 : 1);
    this.hemi.intensity = HEMI_NIGHT_FLOOR + (1.55 - HEMI_NIGHT_FLOOR) * day;
    this.hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, this.night);
    this.hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, this.night);
    this.fog.color.set(FOG_DAY[this.spec.weather]);
    // A low sun turns the horizon warm; so does the haze, or the edge of the loaded land shows as a white box at dusk.
    const low = (1 - THREE.MathUtils.smoothstep(this.sunDir.y, 0.05, 0.4)) * day;
    this.sun.color.copy(SUN_HIGH).lerp(SUN_LOW, low);
    const u = this.sky.material.uniforms;
    u.rayleigh.value = THREE.MathUtils.lerp(0.5, 1.2, low);
    u.turbidity.value = THREE.MathUtils.lerp(1, 2.5, low);
    if (low > 0 && this.spec.weather === 'clear') this.fog.color.lerp(LOW_SUN_HAZE, low * 0.8);
    // Ahead of the night itself: the sky darkens faster than the land, and fog left bright stood out against it as a pale wall.
    this.fog.color.lerp(NIGHT_FOG, Math.sqrt(this.night));
    this.nightSky.update(dt, viewer, this.night, this.spec.weather, NIGHT_FOG, this.moon.position);
    if (this.skyTint) {
      this.tintNow.copy(this.skyTint).multiplyScalar(0.12 + 0.88 * day);
      (this.tintDome.material as THREE.MeshBasicMaterial).color.copy(this.tintNow);
      this.tintDome.position.copy(viewer);
      this.fog.color.lerp(this.tintNow, 0.6);
      this.hemi.color.lerp(this.skyTint, 0.5 * day);
    }
    // The old exp2 density, turned into the distance where it was ~97% fog; never past the loaded terrain.
    const density = 0.0012 + hazeFor(this.spec) * 0.01 + FOG_EXTRA[this.spec.weather];
    this.fog.far = Math.min(TERRAIN_RANGE + this.reach, 1.87 / density);
    this.fog.near = this.fog.far * clamp(0.55 - density * 40, 0.05, 0.55);
    if (this.precip) {
      // Kept under the night bloom threshold: white flakes next to the camera bloomed into orbs that filled the screen.
      (this.precip.material as THREE.PointsMaterial).color.copy(this.precipColour).multiplyScalar(1 - PRECIP_NIGHT_DIM * this.night);
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
