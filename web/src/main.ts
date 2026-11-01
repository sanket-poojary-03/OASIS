import './styles.css';
import * as THREE from 'three';
import { AtmosphereSystem } from './render/atmosphere';
import { Engine } from './render/engine';

const engine = new Engine(document.querySelector<HTMLCanvasElement>('#view')!);
const atmo = new AtmosphereSystem(engine.scene);
const weather = (new URLSearchParams(location.search).get('weather') ?? 'clear') as 'clear';
atmo.apply({ time: 'dawn', weather, fog: 0.3, wind: 0.5 });
atmo.timeScale = 1; // fast-forward: 1 game hour per second, for this check only
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x557744 }));
ground.receiveShadow = true;
const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: 0xaa8866 }));
box.position.y = 2;
box.castShadow = true;
engine.scene.add(ground, box);
engine.camera.position.set(14, 6, 14);
engine.camera.lookAt(0, 2, 0);
engine.onUpdate((dt) => atmo.update(dt, engine.camera.position));
engine.start();
