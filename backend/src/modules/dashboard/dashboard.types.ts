import type { RuleActor } from '../auth/rules/access-rules';
import type { AccessPolicy } from '../users/access-policy';
export type Actor = RuleActor & { accessPolicy?: AccessPolicy };
export type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
export type Item = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  status?: string;
  dueAt?: Date | null;
  tone?: Tone;
};
export type Metric = {
  id: string;
  label: string;
  value: number;
  helper: string;
  href?: string;
  tone: Tone;
};
export type Section = {
  id: string;
  title: string;
  description: string;
  total: number;
  items: Item[];
  href?: string;
  emptyMessage: string;
  notice?: string;
};
