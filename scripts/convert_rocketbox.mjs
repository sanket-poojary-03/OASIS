// Converts Microsoft Rocketbox avatars (MIT) to the small GLBs the game wears: one skinned mesh, 1024 px colour
// textures, and Idle / Walk / Run clips with the forward drift taken out (the game moves the character itself).
//
//   python scripts/shrink_textures.py <raw>/Assets/Avatars <textures-out>
//   node scripts/convert_rocketbox.mjs <raw> <textures-out> web/public/models/characters
//
// <raw> is a copy of the Rocketbox repo's Assets folder. Run from the repo root (three comes from web/node_modules).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const webModules = path.resolve('web/node_modules/three');
const load = (p) => import(pathToFileURL(path.join(webModules, p)).href);
const THREE = await load('build/three.module.js');
const { FBXLoader } = await load('examples/jsm/loaders/FBXLoader.js');
const { GLTFExporter } = await load('examples/jsm/exporters/GLTFExporter.js');
createRequire(import.meta.url);

// The exporter hands its result over through a browser FileReader; Node only has Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.(); }); }
};
const quiet = console.warn;
console.warn = (...a) => { if (!/THREE\.(FBXLoader|GLTFExporter)|Multiple instances/.test(String(a[0]))) quiet(...a); };

const [raw, textures, out] = process.argv.slice(2);
const CHARACTERS = [
  { file: 'street', dir: 'Adults/Male_Adult_10', sex: 'm' },
  { file: 'tourist', dir: 'Adults/Male_Adult_01', sex: 'm' },
  { file: 'builder', dir: 'Professions/Construction_Male_01', sex: 'm' },
  { file: 'police', dir: 'Professions/Police_Male_01', sex: 'm' },
  { file: 'woman', dir: 'Adults/Female_Adult_03', sex: 'f' },
];
const clipFile = (sex, name) => ({
  Idle: `static/${sex}_idle_neutral_01`, Walk: `xy/${sex}_walk_fast_01`, Run: `xy/${sex}_run_neutral_01`,
})[name];

function fbxLoader() {
  const manager = new THREE.LoadingManager();
  // Textures are embedded later from the shrunk files: only remember which file each material asked for.
  manager.addHandler(/\.tga$/i, { setPath() { return this; }, load(url) { const t = new THREE.Texture(); t.userData.file = path.basename(url.replaceAll('\\', '/')); return t; } });
  return new FBXLoader(manager);
}
const readFbx = (p) => {
  const b = fs.readFileSync(p);
  return fbxLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
};

/** The clip of one FBX, without scale tracks, its loop closed, and with no travel: only the sway of each step stays. */
function cleanClip(p, name) {
  const scene = readFbx(p);
  const clip = scene.animations[0];
  if (!clip) throw new Error(`no animation in ${p}`);
  clip.name = name;
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  // Only the skeleton's top bone travels; anything below it moves with it.
  const roots = clip.tracks.filter((t) => /^Bip01\.position$/.test(t.name));
  for (const t of roots) {
    const n = t.values.length / 3, end = t.times[t.times.length - 1] || 1;
    const net = [0, 1, 2].map((k) => t.values[(n - 1) * 3 + k] - t.values[k]);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) t.values[i * 3 + k] -= net[k] * (t.times[i] / end);
  }
  return clip;
}

/** Glb → its JSON and binary chunk, then back with images appended (the exporter cannot draw images without a canvas). */
function withTextures(glb, images) {
  const u = new Uint8Array(glb), view = new DataView(glb);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u.subarray(20, 20 + jsonLen)));
  const binLen = view.getUint32(20 + jsonLen, true);
  const parts = [Buffer.from(u.subarray(28 + jsonLen, 28 + jsonLen + binLen))];
  let offset = binLen;
  json.images = [];
  json.textures = [];
  json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  json.bufferViews ??= [];
  for (const [materialIndex, file, alpha] of images) {
    const data = fs.readFileSync(path.join(textures, file));
    const pad = (4 - (data.length % 4)) % 4;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    parts.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
    json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg' });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    const m = json.materials[materialIndex];
    (m.pbrMetallicRoughness ??= {}).baseColorTexture = { index: json.textures.length - 1 };
    if (alpha) { m.alphaMode = 'MASK'; m.alphaCutoff = 0.5; }
  }
  json.buffers = [{ byteLength: offset }];
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20);
  const bin = Buffer.concat(parts);
  const head = Buffer.alloc(28);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + jsonBytes.length + jsonPad.length + 8 + bin.length - 8, 8);
  head.writeUInt32LE(jsonBytes.length + jsonPad.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head.subarray(0, 20), jsonBytes, jsonPad, binHead, bin]);
}

for (const c of CHARACTERS) {
  const name = path.basename(c.dir);
  const scene = readFbx(path.join(raw, 'Avatars', c.dir, 'Export', `${name}.fbx`));
  const images = [];
  const seen = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    // FBX counts texture rows from the bottom, glTF from the top. The exporter would flip the image; it never sees one here.
    const uv = o.geometry.attributes.uv;
    for (let i = 0; uv && i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      if (seen.has(m)) return seen.get(m);
      const file = m.map?.userData?.file;
      const std = new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.85, metalness: 0, side: THREE.FrontSide });
      std.userData.file = file;
      seen.set(m, std);
      return std;
    });
  });
  const clips = ['Idle', 'Walk', 'Run'].map((n) => cleanClip(path.join(raw, 'Animations', `all_animations_max_motextr_${clipFile(c.sex, n)}.max.fbx`), n));
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: false });
  const mats = [...seen.values()];
  const header = new DataView(glb);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, header.getUint32(12, true))));
  json.materials.forEach((m, i) => {
    const std = mats.find((x) => x.name === m.name);
    if (!std?.userData.file) return;
    const stem = std.userData.file.replace(/\.tga$/i, '');
    const png = `${stem}.png`, jpg = `${stem}.jpg`;
    const shrunk = fs.existsSync(path.join(textures, png)) ? png : jpg;
    images.push([i, shrunk, shrunk === png]);
  });
  const final = withTextures(glb, images);
  fs.writeFileSync(path.join(out, `${c.file}.glb`), final);
  console.log(`${c.file}.glb ${(final.length / 1e6).toFixed(2)} MB  from ${name}; materials ${json.materials.map((m) => m.name).join(', ')}; clips ${clips.map((k) => `${k.name} ${k.duration.toFixed(2)}s`).join(', ')}; textures ${images.map((i) => i[1]).join(', ')}`);
}
