import * as THREE from 'three';
import type { Atmosphere } from '../core/recipe';
import { mulberry32 } from '../core/rng';
import { NOT_REFLECTED } from './layers';

const RADIUS = 4500; // inside the camera far plane (6000)
const STARS = 3200;
/** Share of the stars crowded along the Milky Way. */
const IN_BAND = 0.4;
/** The Milky Way's great circle is the one square to this axis. */
const BAND_AXIS = new THREE.Vector3(0.55, 0.35, -0.76).normalize();
const STAR_TINTS = [0xffffff, 0xcfe0ff, 0xaec8ff, 0xfff0d6, 0xffd9b0].map((c) => new THREE.Color(c));
/** Screen height of the moon's quad: its disc is a third of this. */
const MOON_SIZE = 620;

/** How much of the stars and moon the weather lets through: clouds and falling snow hide them. */
const CLEARNESS: Record<Atmosphere['weather'], number> = { clear: 1, mist: 0.45, rain: 0, snow: 0, storm: 0 };

/** 0..1: the stars come out after the glow has gone, and only through a sky the weather leaves open. */
export function starVisibility(night: number, weather: Atmosphere['weather']): number {
  return THREE.MathUtils.smoothstep(night, 0.55, 0.95) * CLEARNESS[weather];
}

function starGeometry(): THREE.BufferGeometry {
  const rand = mulberry32(20261105); // the same sky every night
  const pos = new Float32Array(STARS * 3), colour = new Float32Array(STARS * 3), size = new Float32Array(STARS), phase = new Float32Array(STARS);
  const dir = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  a.crossVectors(BAND_AXIS, new THREE.Vector3(0, 1, 0)).normalize();
  b.crossVectors(BAND_AXIS, a);
  for (let i = 0; i < STARS; i++) {
    if (rand() < IN_BAND) {
      const angle = rand() * Math.PI * 2, off = (rand() + rand() + rand() - 1.5) * 0.17;
      dir.copy(a).multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle)).addScaledVector(BAND_AXIS, off).normalize();
    } else {
      const y = rand() * 2 - 1, angle = rand() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      dir.set(r * Math.cos(angle), y, r * Math.sin(angle));
    }
    pos.set([dir.x * RADIUS, dir.y * RADIUS, dir.z * RADIUS], i * 3);
    // Most stars are faint and a few are bright, as in a real sky.
    const bright = rand() ** 5;
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)];
    const power = 0.42 + bright * 0.75; // night bloom starts at 0.55: only the brightest few glow, and softly
    colour.set([tint.r * power, tint.g * power, tint.b * power], i * 3);
    size[i] = 1.6 + bright * 1.8;
    phase[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColour', new THREE.BufferAttribute(colour, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return geo;
}

/**
 * What the physical Sky shader cannot show: it fades to black at night, so hills vanished into it. A deep blue dome
 * with a faint Milky Way (whose horizon is the night fog, so far land melts into it), stars, and a moon where the moon
 * light comes from. All additive over the Sky, behind every opaque thing in the world.
 */
export class NightSky {
  readonly group = new THREE.Group();
  private readonly domeUniforms = { uAmount: { value: 0 }, uHorizon: { value: new THREE.Color() }, uBand: { value: 0 }, uAxis: { value: BAND_AXIS } };
  private readonly starUniforms = { uAmount: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 } };
  private readonly moonUniforms = { uAmount: { value: 0 } };
  private readonly moon: THREE.Mesh;
  private time = 0;

  constructor() {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.domeUniforms, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 vDir;
          uniform float uAmount; uniform float uBand; uniform vec3 uHorizon; uniform vec3 uAxis;
          void main() {
            vec3 d = normalize(vDir);
            vec3 zenith = vec3(0.006, 0.012, 0.042);
            vec3 c = mix(uHorizon, zenith, pow(smoothstep(-0.02, 0.62, d.y), 0.7));
            float across = dot(d, uAxis);
            c += vec3(0.05, 0.06, 0.1) * exp(-across * across / 0.022) * uBand * smoothstep(-0.02, 0.2, d.y);
            gl_FragColor = vec4(c * uAmount, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    const stars = new THREE.Points(
      starGeometry(),
      new THREE.ShaderMaterial({
        uniforms: this.starUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 aColour; attribute float aSize; attribute float aPhase;
          uniform float uTime; uniform float uScale; varying vec3 vColour;
          void main() {
            float twinkle = 0.78 + 0.22 * sin(uTime * (0.8 + fract(aPhase) * 2.2) + aPhase);
            vColour = aColour * twinkle;
            gl_PointSize = aSize * uScale;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `varying vec3 vColour; uniform float uAmount;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(vColour * uAmount * smoothstep(1.0, 0.25, r), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    // A 256 px reflection turns every star into a blob.
    stars.layers.set(NOT_REFLECTED);
    stars.onBeforeRender = (renderer) => { this.starUniforms.uScale.value = renderer.getPixelRatio(); };
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE),
      new THREE.ShaderMaterial({
        uniforms: this.moonUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv;
          void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uAmount;
          float blot(vec2 p, vec2 at, float r) { return smoothstep(r, r * 0.55, length(p - at)); }
          void main() {
            float r = length(vUv) * 3.0; // the disc's rim is at 1
            float disc = smoothstep(1.0, 0.96, r);
            float seas = max(max(blot(vUv * 3.0, vec2(-0.3, 0.25), 0.42), blot(vUv * 3.0, vec2(0.28, 0.42), 0.27)), blot(vUv * 3.0, vec2(0.05, -0.32), 0.34));
            vec3 face = mix(vec3(0.82, 0.83, 0.78), vec3(0.42, 0.45, 0.5), seas * 0.8) * (0.82 + 0.18 * sqrt(max(0.0, 1.0 - r * r)));
            float glow = pow(max(0.0, 1.0 - length(vUv)), 3.0) * 0.28;
            gl_FragColor = vec4((face * disc + vec3(0.55, 0.68, 1.0) * glow) * uAmount, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    for (const part of [dome, stars, this.moon]) part.frustumCulled = false;
    // Drawn first among see-through things, so water and the palette sky lie over them.
    dome.renderOrder = -12;
    stars.renderOrder = -11;
    this.moon.renderOrder = -10;
    this.group.add(dome, stars, this.moon);
    this.group.visible = false;
  }

  update(dt: number, viewer: THREE.Vector3, night: number, weather: Atmosphere['weather'], horizon: THREE.Color, toMoon: THREE.Vector3): void {
    this.group.visible = night > 0.01;
    if (!this.group.visible) return;
    this.time += dt;
    const stars = starVisibility(night, weather);
    this.group.position.copy(viewer);
    this.domeUniforms.uAmount.value = night;
    this.domeUniforms.uHorizon.value.copy(horizon);
    this.domeUniforms.uBand.value = stars;
    this.starUniforms.uAmount.value = stars;
    this.starUniforms.uTime.value = this.time;
    this.moonUniforms.uAmount.value = stars;
    this.moon.visible = stars > 0.01;
    this.moon.position.copy(toMoon).normalize().multiplyScalar(RADIUS * 0.95);
    this.moon.lookAt(viewer);
  }
}
