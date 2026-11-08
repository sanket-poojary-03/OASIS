import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fitToHeight } from './fit';

export interface ModelTemplate { scene: THREE.Object3D; animations: THREE.AnimationClip[]; height: number }
export type ClipName = 'idle' | 'walk' | 'run' | 'jump';
export interface AnimatedModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: ClipName): void;
  /** Plays the current clip at the rate whose stride covers `speed` m/s, so the feet do not slide over the ground. */
  pace(speed: number): void;
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

const FOOT = /foot/i;
/** Samples per clip, and how close to its lowest point a foot counts as on the ground (share of the model's height). */
const STRIDE_SAMPLES = 32;
const CONTACT_BAND = 0.03;
const PACE_MIN = 0.5, PACE_MAX = 2.4;

/**
 * The speed a clip was animated for, in m/s: how fast a foot travels backward under the body while it is on the
 * ground. Undefined for a model with no foot bones (it then plays at its own rate).
 */
function clipSpeed(model: THREE.Object3D, mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, height: number): number | undefined {
  const feet: THREE.Object3D[] = [];
  model.traverse((o) => { if (o instanceof THREE.Bone && FOOT.test(o.name)) feet.push(o); });
  if (feet.length === 0 || clip.duration <= 0) return undefined;
  const action = mixer.clipAction(clip).play();
  const dt = clip.duration / STRIDE_SAMPLES, p = new THREE.Vector3();
  const track = feet.map(() => [] as Array<{ y: number; z: number }>);
  for (let i = 0; i <= STRIDE_SAMPLES; i++) {
    mixer.setTime(i * dt);
    model.updateMatrixWorld(true);
    feet.forEach((f, k) => { f.getWorldPosition(p); track[k].push({ y: p.y, z: p.z }); });
  }
  action.stop();
  let sum = 0, n = 0;
  for (const samples of track) {
    const low = Math.min(...samples.map((s) => s.y)) + height * CONTACT_BAND;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].y > low || samples[i - 1].y > low) continue;
      sum += Math.abs(samples[i].z - samples[i - 1].z) / dt;
      n++;
    }
  }
  return n > 0 && sum > 0 ? sum / n : undefined;
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
  const speeds = new Map<THREE.AnimationAction, number>();
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    const clip = pickClip(t.animations, name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    actions.set(name, action);
    if (name === 'jump') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    if (name === 'walk' || name === 'run') {
      const speed = clipSpeed(model, mixer, clip, t.height);
      if (speed) speeds.set(action, speed);
    }
  }
  let current: THREE.AnimationAction | null = null;
  const play = (name: ClipName): void => {
    const next = actions.get(name) ?? actions.get('idle') ?? null;
    if (!next || next === current) return;
    current?.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    current = next;
  };
  const pace = (speed: number): void => {
    const natural = current && speeds.get(current);
    if (current && natural) current.timeScale = Math.max(PACE_MIN, Math.min(PACE_MAX, speed / natural));
  };
  play('idle');
  const dispose = (): void => { mixer.stopAllAction(); mixer.uncacheRoot(model); };
  return { root, mixer, play, pace, dispose };
}
