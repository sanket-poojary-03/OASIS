import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fitToHeight } from './fit';

export interface ModelTemplate { scene: THREE.Object3D; animations: THREE.AnimationClip[]; height: number }
export type ClipName = 'idle' | 'walk' | 'run' | 'jump';
export interface AnimatedModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: ClipName): void;
  /** Stops the mixer and frees its cached actions. Geometry and materials are shared with the template: not disposed. */
  dispose(): void;
}

/** Clip names across the packs (Quaternius animals: Idle/Eating/Walk/Gallop; KayKit: Idle/Walking_A/Running_A/Jump_*). */
const CLIPS: Record<ClipName, RegExp> = { idle: /idle|\beat|graz/i, walk: /walk/i, run: /run|gallop|sprint/i, jump: /jump/i };

/** The shortest matching name wins, so "Idle" beats "Idle_HitReact" and "Walk" beats "Walk_Back". */
export function pickClip(clips: THREE.AnimationClip[], name: ClipName): THREE.AnimationClip | undefined {
  let best: THREE.AnimationClip | undefined;
  for (const c of clips) if (CLIPS[name].test(c.name) && (!best || c.name.length < best.name.length)) best = c;
  return best;
}

/** Independent copy of a rigged model (own skeleton and mixer), fitted to its template height, feet on y = 0. */
export function animatedClone(t: ModelTemplate): AnimatedModel {
  const model = SkeletonUtils.clone(t.scene);
  fitToHeight(model, t.height, false);
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    // A skinned mesh's bounds come from the bind pose; animation can leave them, so never cull it by them.
    if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false;
  });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<ClipName, THREE.AnimationAction>();
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    const clip = pickClip(t.animations, name);
    if (clip) actions.set(name, mixer.clipAction(clip));
  }
  let current: THREE.AnimationAction | null = null;
  const play = (name: ClipName): void => {
    const next = actions.get(name) ?? actions.get('idle') ?? null;
    if (!next || next === current) return;
    current?.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    current = next;
  };
  play('idle');
  const dispose = (): void => { mixer.stopAllAction(); mixer.uncacheRoot(model); };
  return { root, mixer, play, dispose };
}
