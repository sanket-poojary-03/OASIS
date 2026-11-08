import type { PlaceKind } from '../core/recipe';
import type { BuiltWorld } from '../world/build';
import type { Road, WorldField } from '../world/field';
import { MAP_RES, mapMarkers, minimapRows, terrainKey, toMap, type MapMarker } from '../world/minimap';

/** CSS pixels across the map in the corner, and at most when opened large (M). */
const SMALL = 180;
const LARGE = 460;
/** The land and roads are drawn once at this size, then scaled into the visible map. */
const BASE = 512;
/** The visible map redraws at most this often (ms): only the player's arrow moves. */
const REDRAW_MS = 100;
/** Time (ms) spent drawing the land's picture per frame: a busy world takes a few hundred ms in all. */
const SLICE_MS = 6;
/** A long name is cut to this many characters on the large map. */
const LABEL_MAX = 26;
const INK = '#0b2f63';
const ROAD = '#caa56a';
const BRIDGE = '#f6ead0';
const PLAYER = '#ff4d4d';
/** Whose name is placed first when names would overlap. */
const LABEL_ORDER: Record<PlaceKind, number> = { landmark: 0, settlement: 1, structure: 2, prop: 3 };
const MARK: Record<PlaceKind, { r: number; fill: string }> = {
  settlement: { r: 5, fill: '#ffd166' },
  landmark: { r: 5, fill: '#ff8fb1' },
  structure: { r: 3.5, fill: '#ffffff' },
  prop: { r: 2.5, fill: '#ffffff' },
};

/**
 * The map in the bottom-left corner: the whole 1 km world from above (north up) with its water, roads and bridges, a
 * marker for every place and an arrow for the player. M opens it large, with every place's name.
 */
export class Minimap {
  readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d');
  private readonly land = document.createElement('canvas');
  private readonly base = document.createElement('canvas');
  private readonly hint = document.createElement('div');
  private markers: MapMarker[] = [];
  private roads: Road[] = [];
  private hasLand = false;
  private large = false;
  private last = -Infinity;
  /** What the land picture shows (terrainKey), and a count that stops a drawing overtaken by a newer world. */
  private landKey = '';
  private drawing = 0;

  constructor() {
    this.root.className = 'minimap hidden';
    this.hint.className = 'minimap-hint';
    this.root.append(this.canvas, this.hint);
    this.base.width = this.base.height = BASE;
    this.setLarge(false);
  }

  /**
   * Show a world just built or edited: its roads and places at once; its land redrawn only when the land changed, a few
   * rows a frame, the map hidden until then. `shown` false (the start screen's world) hides the map.
   */
  showWorld(built: BuiltWorld, shown = true): void {
    if (!shown) { this.clear(); this.landKey = ''; this.drawing++; return; }
    this.setWorld(built.roads, mapMarkers(built.recipe, built.placements));
    const key = terrainKey(built.recipe);
    if (key === this.landKey) return;
    this.landKey = key;
    this.clear();
    void this.drawLand(built.field, ++this.drawing);
  }

  private async drawLand(field: WorldField, drawing: number): Promise<void> {
    const out = new Uint8ClampedArray(MAP_RES * MAP_RES * 4);
    for (let row = 0; row < MAP_RES;) {
      const start = performance.now();
      while (row < MAP_RES && performance.now() - start < SLICE_MS) {
        minimapRows(field, MAP_RES, out, row, row + 1);
        row++;
      }
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (drawing !== this.drawing) return;
    }
    this.setLand(out, MAP_RES);
  }

  /** The land's picture (minimapPixels, `res` across). Until one arrives the map stays hidden. */
  setLand(pixels: Uint8ClampedArray, res: number): void {
    this.land.width = this.land.height = res;
    this.land.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), res, res), 0, 0);
    this.hasLand = true;
    this.paintBase();
    this.root.classList.remove('hidden');
  }

  /** The world's roads and places, after it was built or edited. */
  setWorld(roads: Road[], markers: MapMarker[]): void {
    this.roads = roads;
    this.markers = markers;
    this.paintBase();
    this.last = -Infinity;
  }

  /** A new world is coming: hide the old one's map until its land is drawn. */
  clear(): void {
    this.hasLand = false;
    this.root.classList.add('hidden');
  }

  /** M: large with names, or small again. Returns whether it is now large. */
  toggle(): boolean {
    this.setLarge(!this.large);
    return this.large;
  }

  /** The player at (x, z), looking along (dx, dz). Redraws at most every REDRAW_MS. */
  draw(x: number, z: number, dx: number, dz: number, now = performance.now()): void {
    const ctx = this.ctx;
    if (!ctx || !this.hasLand || now - this.last < REDRAW_MS) return;
    this.last = now;
    const css = this.cssSize(), dpr = Math.min(2, devicePixelRatio || 1), size = Math.round(css * dpr);
    if (this.canvas.width !== size) this.canvas.width = this.canvas.height = size;
    ctx.drawImage(this.base, 0, 0, size, size);
    const s = dpr * (this.large ? 1.25 : 1);
    for (const m of this.markers) {
      const { u, v } = toMap(m.x, m.z, size), mark = MARK[m.kind];
      ctx.beginPath();
      if (m.kind === 'landmark') { // a diamond
        ctx.moveTo(u, v - mark.r * s); ctx.lineTo(u + mark.r * s, v); ctx.lineTo(u, v + mark.r * s); ctx.lineTo(u - mark.r * s, v); ctx.closePath();
      } else ctx.arc(u, v, mark.r * s, 0, Math.PI * 2);
      ctx.fillStyle = mark.fill;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5 * dpr;
      ctx.fill();
      ctx.stroke();
    }
    if (this.large) this.labels(ctx, size, dpr);
    this.arrow(ctx, size, dpr, x, z, dx, dz);
  }

  private setLarge(large: boolean): void {
    this.large = large;
    this.root.classList.toggle('large', large);
    this.hint.textContent = large ? 'M to shrink' : 'Map · M';
    const css = this.cssSize();
    this.canvas.style.width = this.canvas.style.height = `${css}px`;
    this.last = -Infinity;
  }

  private cssSize(): number {
    return this.large ? Math.round(Math.min(LARGE, innerHeight * 0.7, innerWidth - 64)) : SMALL;
  }

  /** Land, then roads on it (bridges lighter): everything that stays put between edits. */
  private paintBase(): void {
    const ctx = this.base.getContext('2d');
    if (!ctx || !this.hasLand) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.land, 0, 0, BASE, BASE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of this.roads) {
      const width = Math.max(1.5, (road.width / 1024) * BASE * 1.6);
      for (let i = 0; i + 1 < road.points.length; i++) {
        const a = toMap(road.points[i].x, road.points[i].z, BASE), b = toMap(road.points[i + 1].x, road.points[i + 1].z, BASE);
        const bridge = road.bridges[i] || road.bridges[i + 1];
        ctx.beginPath();
        ctx.moveTo(a.u, a.v);
        ctx.lineTo(b.u, b.v);
        ctx.strokeStyle = bridge ? BRIDGE : ROAD;
        ctx.lineWidth = bridge ? width + 1.5 : width;
        ctx.stroke();
      }
    }
  }

  /**
   * Every place's name beside its marker (as text drawn on the canvas, never markup): landmarks and groups first; a name
   * that would cover one already drawn tries the marker's other side, and is left out when both are taken.
   */
  private labels(ctx: CanvasRenderingContext2D, size: number, dpr: number): void {
    ctx.font = `600 ${12 * dpr}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(11, 47, 99, 0.85)';
    ctx.fillStyle = '#ffffff';
    const taken: Array<{ l: number; r: number; t: number; b: number }> = [];
    const free = (box: { l: number; r: number; t: number; b: number }) =>
      box.l >= 0 && box.r <= size && !taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
    const order = [...this.markers].filter((m) => m.kind !== 'prop').sort((a, b) => LABEL_ORDER[a.kind] - LABEL_ORDER[b.kind]);
    const h = 14 * dpr, gap = 8 * dpr;
    for (const m of order) {
      const { u, v } = toMap(m.x, m.z, size);
      const text = m.label.length > LABEL_MAX ? `${m.label.slice(0, LABEL_MAX - 1)}…` : m.label;
      const w = ctx.measureText(text).width;
      const box = [u + gap, u - gap - w].map((l) => ({ l, r: l + w, t: v - h / 2, b: v + h / 2 })).find(free);
      if (!box) continue;
      taken.push(box);
      ctx.strokeText(text, box.l, v);
      ctx.fillText(text, box.l, v);
    }
  }

  private arrow(ctx: CanvasRenderingContext2D, size: number, dpr: number, x: number, z: number, dx: number, dz: number): void {
    const p = toMap(x, z, size), r = (this.large ? 9 : 7) * dpr;
    const u = Math.min(size - r, Math.max(r, p.u)), v = Math.min(size - r, Math.max(r, p.v));
    const a = Math.atan2(dz, dx);
    ctx.save();
    ctx.translate(u, v);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.65);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.7, -r * 0.65);
    ctx.closePath();
    ctx.fillStyle = PLAYER;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * dpr;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
