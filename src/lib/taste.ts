// House-authored cuisine bridges, not Qloo ratings of these fictional meals.
// Deliberately leave ambiguous dishes unmapped. Dietary labels never contribute.
import type { MenuItem } from './domain';

export type Restaurant = { id: string; name: string; address: string };
export type Cuisine = { id: string; name: string; affinity: number };
export type MealMatch = { itemId: string; score: number; cuisines: string[]; reason: string };
export type TasteProfile = { id: string; mode: 'fixture' | 'live'; seeds: Restaurant[]; cuisines: Cuisine[]; matches: MealMatch[] };
const prefix = 'urn:tag:cuisine:qloo:';
const chinese = ['chinese', 'cantonese'];
export const mealCuisineBridges: Record<string, { tags: string[]; reason: string }> = {
  'egg-fried-rice': { tags: chinese, reason: 'House mapping: Chinese/Cantonese associations → Chinese-inspired egg fried rice.' },
  'beef-bowl': { tags: chinese, reason: 'House mapping: Chinese/Cantonese associations → Chinese-inspired ginger beef and broccoli.' },
  'peanut-noodles': { tags: chinese, reason: 'House mapping: Chinese/Cantonese associations → Chinese-inspired peanut sesame noodles.' },
  'mushroom-pasta': { tags: ['italian'], reason: 'House mapping: Italian associations → Italian-inspired penne with mushroom cream sauce.' },
  'paneer-rice': { tags: ['indian'], reason: 'House mapping: Indian associations → Indian-inspired paneer in tomato sauce.' },
};
const culinary = new Set(['chinese', 'cantonese', 'taiwanese', 'thai', 'teochew', 'singaporean', 'italian', 'indian', 'japanese', 'korean', 'vietnamese', 'french', 'greek', 'mediterranean', 'mexican', 'spanish', 'american', 'lebanese', 'turkish', 'indonesian', 'malaysian', 'shanghai_style', 'hong_kong_style', 'dim_sum', 'sichuan']);
export function isCuisineId(id: string) { return id.startsWith(prefix) && culinary.has(id.slice(prefix.length)); }
export function matchMeals(cuisines: Cuisine[], menu: MenuItem[]): MealMatch[] {
  return menu.flatMap(item => {
    const bridge = mealCuisineBridges[item.id];
    if (!bridge) return [];
    const matches = cuisines.filter(c => bridge.tags.some(tag => c.id === prefix + tag) && Number.isFinite(c.affinity) && c.affinity > 0 && c.affinity <= 1);
    return matches.length ? [{ itemId: item.id, score: Math.max(...matches.map(c => c.affinity)), cuisines: matches.map(c => c.name), reason: bridge.reason }] : [];
  });
}
export const tasteScores = (matches: MealMatch[]) => Object.fromEntries(matches.map(match => [match.itemId, match.score]));
