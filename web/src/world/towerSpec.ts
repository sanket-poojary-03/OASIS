import { mulberry32 } from '../core/rng';

/**
 * Modern city buildings built in code. The model library holds only three modern city models (two office blocks and
 * a small shop), so a 50-tower downtown was the same block repeated and stretched. Generic modern buildings (towers,
 * offices, apartment blocks) are instead designed from a seed: setbacks, a façade, colours, a podium and a roof.
 * Named or old-world things (a church, a watchtower, a bakery) still go to the model finder.
 */
export type Facade = 'glass' | 'office' | 'apartment';
export type FacadeHint = Facade | 'mixed';
export type Roof = 'flat' | 'plant' | 'tank' | 'spire' | 'crown';

/** One stacked block: footprint `w` × `d`, from height `y` to `y + h`. */
export interface Tier { w: number; d: number; h: number; y: number }

export interface TowerSpec {
  facade: Facade;
  /** Wall or glass colour, and the trim (mullions, parapets, crown). */
  body: number;
  trim: number;
  floor: number;
  bay: number;
  /** A wider shop floor at street level (taller buildings only). */
  podium: { w: number; d: number; h: number } | null;
  tiers: Tier[];
  roof: Roof;
}

/** Words for one modern building, anywhere: a group of them or a single one. */
const MODERN = /\b(sky ?scrapers?|high-?rises?|mid-?rises?|offices?|apartments?|condos?|condominiums?|flats|tower ?blocks?|glass towers?|office towers?|corporate|commercial|residential|hotels?|headquarters|business (?:centre|center|tower|district))\b/i;
/** A single place gets a coded building only when it is unmistakably a modern tower. */
const TALL_MODERN = /\b(sky ?scrapers?|high-?rises?|tower ?blocks?|glass towers?|office towers?|apartment towers?|residential towers?|condo towers?)\b/i;
/** In a city grid, "towers", "buildings" and "blocks" are modern buildings too. */
const GENERIC = /\b(towers?|buildings?|blocks?)\b/i;
/** Old-world, fantasy, sci-fi or special towers: the library and online finder have better models for these. */
const NOT_MODERN = /medieval|castle|stone|wood|watch|bell|clock|church|chapel|guard|wizard|mage|elven|fantasy|ancient|ruin|light ?house|water ?tower|\btv\b|radio|antenna|windmill|\bmill\b|pagoda|temple|siege|\blog\b|viking|pirate|alien|sci-?fi|space|cyber|neon|dome|habitat|lookout|fire ?tower|post office|\bice\b|\bsnow|\bsand\b|\bmud\b|bamboo|tree ?house|ivory|crystal/i;

/**
 * The façade a coded building gets for `asset`, or null to use a model. `group`: a member of a group (city grid, row);
 * `grid`: a member of a city grid. "mixed" lets the seed choose.
 */
export function towerFacade(asset: string, group: boolean, grid: boolean): FacadeHint | null {
  if (NOT_MODERN.test(asset)) return null;
  const modern = group ? MODERN.test(asset) || (grid && GENERIC.test(asset)) : TALL_MODERN.test(asset);
  if (!modern) return null;
  if (/glass|mirror|steel|chrome|sky ?scraper/i.test(asset)) return 'glass';
  if (/apartment|flat|condo|residential|housing|hotel/i.test(asset)) return 'apartment';
  if (/office|corporate|commercial|business|bank|headquarters/i.test(asset)) return 'office';
  return 'mixed';
}

const GLASS = [0x6f9fc4, 0x5d8fb3, 0x86b4c9, 0x4f7e9c, 0x8fa9b8, 0x6b9488, 0x9aa7b5, 0x7a8fa8];
const CONCRETE = [0xd8d2c4, 0xc9c2b3, 0xb7b9bb, 0xe3ddd0, 0xa9a49a, 0xcfc6b8];
const PLASTER = [0xd9b48c, 0xc77d5b, 0xe6d8bf, 0xb86a4f, 0xd4c3a3, 0x9fb3a8, 0xe0c7a8, 0xc9a27e];
const TRIM = [0xd9dde2, 0x3b4048, 0xb8bec6, 0x2c3138];
const FLOOR: Record<Facade, number> = { glass: 3.8, office: 3.6, apartment: 3.0 };

const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/**
 * A building `height` m tall on a plot `maxWidth` m wide, the same for the same seed. Tall buildings step back in up
 * to three tiers; floors line up across tiers; the tallest get a spire or crown.
 */
export function towerSpec(seed: number, hint: FacadeHint, height: number, maxWidth: number): TowerSpec {
  const rng = mulberry32(seed);
  const facade: Facade = hint === 'mixed' ? (rng() < 0.45 ? 'glass' : rng() < 0.55 ? 'office' : 'apartment') : hint;
  const floor = FLOOR[facade];
  const bay = facade === 'apartment' ? 3.2 : 3;
  const body = pick(rng, facade === 'glass' ? GLASS : facade === 'office' ? CONCRETE : PLASTER);
  const trim = pick(rng, TRIM);
  const floors = Math.max(2, Math.round(height / floor));
  const w0 = maxWidth * (0.74 + rng() * 0.26), d0 = maxWidth * (0.74 + rng() * 0.26);
  const tierCount = floors >= 12 ? 1 + Math.floor(rng() * 3) : floors >= 8 && rng() < 0.5 ? 2 : 1;
  const tiers: Tier[] = [];
  let left = floors, y = 0, w = w0, d = d0;
  for (let i = 0; i < tierCount; i++) {
    const last = i === tierCount - 1;
    const share = last ? left : Math.max(2, Math.round(left * (0.5 + rng() * 0.2)));
    tiers.push({ w, d, h: share * floor, y });
    y += share * floor;
    left -= share;
    if (left <= 0) break;
    w *= 0.7 + rng() * 0.15;
    d *= 0.7 + rng() * 0.15;
  }
  const podium = floors >= 6 && rng() < 0.6 ? { w: Math.min(maxWidth, w0 * 1.12), d: Math.min(maxWidth, d0 * 1.12), h: 4.4 } : null;
  const r = rng();
  const roof: Roof = floors >= 12 ? (r < 0.35 ? 'spire' : r < 0.6 ? 'crown' : 'plant')
    : facade === 'apartment' ? (r < 0.5 ? 'tank' : 'plant') : r < 0.7 ? 'plant' : 'flat';
  return { facade, body, trim, floor, bay, podium, tiers, roof };
}
