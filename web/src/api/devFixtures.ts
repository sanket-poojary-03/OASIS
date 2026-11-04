import { recipeSchema, type Recipe } from '../core/recipe';

/**
 * Dev and screenshot harness only (?w=<fixture> in main.ts, imported only under import.meta.env.DEV, so production
 * builds do not contain these worlds). A player never gets one: without an LLM there is no world.
 */
const fixtures = import.meta.glob('../../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' });

export function fixtureRecipe(name: string): Recipe {
  return recipeSchema.parse(fixtures[`../../../shared/fixtures/recipes/${name}.json`]);
}
