import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelTemplate } from '../render/animated';
import type { Avatar } from './avatar';

/**
 * The playable characters, bundled with the web app (web/public/models/characters): Microsoft Rocketbox avatars (MIT, notice in
 * ROCKETBOX-LICENSE.txt there). One rig, with Idle / Walk / Run clips.
 */
export const CHARACTERS = [
  { name: 'Street', file: 'street.glb' },
  { name: 'Tourist', file: 'tourist.glb' },
  { name: 'Builder', file: 'builder.glb' },
  { name: 'Police', file: 'police.glb' },
  { name: 'Woman', file: 'woman.glb' },
] as const;

export const CHARACTER_HEIGHT = 1.8;

type LoadGltf = (url: string) => Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>;

/** Loads characters on demand (the first at start, the others when picked) and dresses the avatar in them. */
export class CharacterRoster {
  private index = 0;
  private readonly templates = new Map<number, Promise<ModelTemplate>>();
  private readonly loadGltf: LoadGltf;

  constructor(private readonly avatar: Avatar, loadGltf?: LoadGltf, private readonly base = import.meta.env?.BASE_URL ?? '/') {
    let loader: GLTFLoader | null = null;
    this.loadGltf = loadGltf ?? ((url) => (loader ??= new GLTFLoader()).loadAsync(url));
  }

  get current(): string { return CHARACTERS[this.index].name; }

  /** Wear the first character; on failure the procedural figure stays. */
  start(): Promise<boolean> { return this.wear(0); }

  /** B: the next character. Resolves with its name once it is worn (or the old one stays when it cannot load). */
  async next(): Promise<string> {
    const i = (this.index + 1) % CHARACTERS.length;
    return (await this.wear(i)) ? this.current : `${CHARACTERS[i].name} could not be loaded`;
  }

  private template(i: number): Promise<ModelTemplate> {
    let t = this.templates.get(i);
    if (!t) {
      t = this.loadGltf(`${this.base}models/characters/${CHARACTERS[i].file}`)
        .then((g) => ({ scene: g.scene, animations: g.animations, height: CHARACTER_HEIGHT }));
      this.templates.set(i, t);
      t.catch(() => { if (this.templates.get(i) === t) this.templates.delete(i); });
    }
    return t;
  }

  private async wear(i: number): Promise<boolean> {
    try {
      const t = await this.template(i);
      this.avatar.use(t);
      this.index = i;
      return true;
    } catch (e) {
      console.warn('[character] could not load', CHARACTERS[i].name, e);
      return false;
    }
  }
}
