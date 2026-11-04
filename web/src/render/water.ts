import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import type { WorldField } from '../world/field';
import { disposeGroup } from './dispose';
import { pieces } from './rangeCull';
import { ribbonGeometry } from './ribbon';
import { rippleMaterial } from './ripples';
import { foamUniforms } from './shoreFoam';
import { rippleTexture } from './waterNormals';

export { disposeGroup };

const WATER = 0x2b6f8f;
/** The sun's full intensity (AtmosphereSystem), which is a sun glint of full strength on the water. */
const FULL_LIGHT = 2.6;
/** How much of its colour the sea keeps with no sun: Water.js does not light it, so it would glow at night. */
const NIGHT_COLOUR = 0.12;
/** The ripple map repeats every 103 / SEA_RIPPLES metres. */
const SEA_RIPPLES = 3;
/** Pixels of the sea's reflection a side: the ripples blur it anyway. */
const REFLECTION_SIZE = 256;

export interface WaterLight {
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
}

export class WaterSystem {
  readonly group = new THREE.Group();
  /** Reused across worlds: Water.js owns a reflection target it has no way to release. */
  private sea: Water | null = null;
  private readonly normals = rippleTexture();
  private readonly time = { value: 0 };
  private readonly sky = { value: new THREE.Color(0xbfd6ea) };
  private readonly material = rippleMaterial(this.normals, this.time, this.sky);
  private readonly seaColour = new THREE.Color(WATER);
  private readonly toSun = new THREE.Vector3();
  private readonly toMoon = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
  }

  private makeSea(): Water {
    const sea = new Water(new THREE.PlaneGeometry(3000, 3000), { waterNormals: this.normals, textureWidth: REFLECTION_SIZE, textureHeight: REFLECTION_SIZE, distortionScale: 1.6, fog: true, side: THREE.DoubleSide });
    // Our bright sky at full strength turned the sea white. Far water fades into what it reflects, the sky at the horizon:
    // fading to the fog colour drew a band under a brighter sky.
    sea.material.fragmentShader = sea.material.fragmentShader
      .replace('reflectionSample + specularLight, reflectance', 'reflectionSample * 0.6 + specularLight, reflectance')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
      gl_FragColor.rgb = mix(gl_FragColor.rgb, reflectionSample, smoothstep(fogNear, fogFar, vFogDepth));
    #endif`);
    sea.rotation.x = -Math.PI / 2;
    sea.material.uniforms.size.value = SEA_RIPPLES;
    sea.userData.alwaysVisible = true; // follows the viewer; open sea to the horizon is right
    return sea;
  }

  rebuild(field: WorldField): void {
    if (this.sea) this.group.remove(this.sea);
    disposeGroup(this.group);
    this.group.clear();
    const colour = field.recipe.palette?.water ?? WATER; // a palette water colour: "a purple sea"
    this.material.color.set(colour);
    this.seaColour.set(colour);
    foamUniforms.uFoamOn.value = field.hasSea && field.deckY === null ? 1 : 0; // an ocean has no shores
    foamUniforms.uFoamSea.value = field.seaLevelY;
    if (field.hasSea) {
      this.sea ??= this.makeSea();
      this.sea.position.y = field.seaLevelY;
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

  update(viewer: THREE.Vector3, t: number, light: WaterLight): void {
    this.time.value = t;
    foamUniforms.uFoamTime.value = t;
    const fog = this.scene.fog;
    if (fog) this.sky.value.copy(fog.color);
    if (!this.sea) return;
    this.sea.position.set(Math.round(viewer.x / 50) * 50, this.sea.position.y, Math.round(viewer.z / 50) * 50);
    const u = this.sea.material.uniforms;
    u.time.value = t;
    const sun = light.sun.intensity / FULL_LIGHT, moon = light.moon.intensity / FULL_LIGHT;
    this.toSun.subVectors(light.sun.position, light.sun.target.position).normalize();
    this.toMoon.subVectors(light.moon.position, light.moon.target.position).normalize();
    (u.sunDirection.value as THREE.Vector3).copy(this.toSun).multiplyScalar(sun).addScaledVector(this.toMoon, moon).normalize();
    (u.sunColor.value as THREE.Color).copy(light.sun.color).multiplyScalar(sun);
    (u.sunColor.value as THREE.Color).r += light.moon.color.r * moon;
    (u.sunColor.value as THREE.Color).g += light.moon.color.g * moon;
    (u.sunColor.value as THREE.Color).b += light.moon.color.b * moon;
    (u.waterColor.value as THREE.Color).copy(this.seaColour).multiplyScalar(NIGHT_COLOUR + (1 - NIGHT_COLOUR) * sun);
  }
}
