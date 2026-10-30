import type { SegmentAllocation } from './segments';
import type { TasteProfile } from './taste';

export const FREE_AGENT_MODEL = 'nvidia/nemotron-3.5-lightning:free';
export type AgentStep = { tool: string; message: string; source: 'local' | 'fixture' | 'live' };
export type AgentResult = {
  mode: 'fixture' | 'live'; model?: string; outcome: 'draft' | 'needs_input' | 'stopped';
  code?: string; message: string; steps: AgentStep[]; profile?: TasteProfile; allocation?: SegmentAllocation;
  usage: { modelCalls: number; reportedCostUsd: number | null };
};
