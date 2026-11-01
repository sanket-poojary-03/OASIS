import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipeSchema, type Recipe } from '../src/core/recipe';

const root = fileURLToPath(new URL('../../shared/fixtures/', import.meta.url));

export const RECIPE_FIXTURES = ['fishing-valley', 'desert-canyon', 'snowy-mountains', 'tropical-island'] as const;

export function loadRecipeFixture(name: string): Recipe {
  return recipeSchema.parse(JSON.parse(readFileSync(resolve(root, 'recipes', `${name}.json`), 'utf8')));
}

export function loadOpsFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(root, 'ops', `${name}.json`), 'utf8'));
}
