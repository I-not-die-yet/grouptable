import { z } from 'zod';

export const requirements = ['vegetarian', 'vegan', 'dairyFree', 'glutenFree', 'peanutFree', 'treeNutFree', 'shellfishFree', 'fishFree', 'eggFree', 'soyFree', 'sesameFree', 'mild'] as const;
export type Requirement = typeof requirements[number];
export const requirementLabels: Record<Requirement, string> = {
  vegetarian: 'Vegetarian', vegan: 'Vegan', dairyFree: 'No dairy', glutenFree: 'No gluten', peanutFree: 'No peanuts', treeNutFree: 'No tree nuts', shellfishFree: 'No shellfish', fishFree: 'No fish', eggFree: 'No egg', soyFree: 'No soy', sesameFree: 'No sesame', mild: 'Not spicy',
};
const attributeSchema = z.object(Object.fromEntries(requirements.map(key => [key, z.enum(['yes', 'no', 'unknown'])])) as Record<Requirement, z.ZodEnum<{ yes: 'yes'; no: 'no'; unknown: 'unknown' }>>);
export const menuSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string(), priceCents: z.number().int().positive(), stock: z.number().int().min(0), attributes: attributeSchema,
});
export type MenuItem = z.infer<typeof menuSchema>;
export const attendeeSchema = z.object({
  id: z.string().regex(/^guest-(?:[1-9]|[12][0-9]|30)$/), source: z.string().max(2000),
  requirements: z.array(z.enum(requirements)).max(requirements.length).refine(a => new Set(a).size === a.length),
  unresolved: z.array(z.string().min(1).max(300)).max(30), confirmed: z.boolean(),
});
export type Attendee = z.infer<typeof attendeeSchema>;
export const mealRequestSchema = z.object({
  headcount: z.number().int().min(1).max(30), budgetCents: z.number().int().min(1).max(100_000_000), currency: z.literal('HKD'), deliveryCents: z.literal(8000), revision: z.number().int().nonnegative(), attendees: z.array(attendeeSchema).min(1).max(30),
}).superRefine((r, ctx) => {
  if (r.attendees.length !== r.headcount || r.attendees.some((a, i) => a.id !== `guest-${i + 1}`)) ctx.addIssue({ code: 'custom', message: 'Every guest must appear exactly once, in order.' });
});
export type MealRequest = z.infer<typeof mealRequestSchema>;
export const assignmentSchema = z.object({ attendeeId: z.string(), itemId: z.string() }).strict();
export type Assignment = z.infer<typeof assignmentSchema>;
export type Allocation = { assignments: Assignment[]; subtotalCents: number; deliveryCents: number; totalCents: number };
export type AllocationResult = { ok: true; allocation: Allocation; searched: number } | { ok: false; code: 'UNRESOLVED' | 'INFEASIBLE' | 'SEARCH_LIMIT'; message: string; searched: number };
export const money = (cents: number) => new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(cents / 100);
export const decimalMoney = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
export const blankAttendee = (i: number): Attendee => ({ id: `guest-${i + 1}`, source: '', requirements: [], unresolved: ['No reply has been confirmed.'], confirmed: false });
export const newRequest = (headcount = 6): MealRequest => ({ headcount, budgetCents: 60000, currency: 'HKD', deliveryCents: 8000, revision: 0, attendees: Array.from({ length: headcount }, (_, i) => blankAttendee(i)) });
