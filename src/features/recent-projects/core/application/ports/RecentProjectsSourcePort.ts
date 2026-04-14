import type { RecentProjectCandidate } from '../../domain/models/RecentProjectCandidate';

export interface RecentProjectsSourcePort {
  readonly sourceId?: string;
  readonly timeoutMs?: number;
  list(): Promise<RecentProjectCandidate[]>;
}
