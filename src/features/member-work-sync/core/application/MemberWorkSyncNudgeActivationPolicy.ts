import {
  isReviewPickupAgenda,
  isStrictReviewPickupItem,
} from './MemberWorkSyncNudgeAgendaPredicates';
import {
  decideMemberWorkSyncTargetedRecovery,
  type MemberWorkSyncTargetedRecoveryReason,
} from './MemberWorkSyncTargetedRecoveryPolicy';

import type { MemberWorkSyncStatus, MemberWorkSyncTeamMetrics } from '../../contracts';

export type MemberWorkSyncNudgeActivationReason =
  | 'shadow_ready'
  | MemberWorkSyncTargetedRecoveryReason
  | 'review_pickup_required'
  | 'status_not_nudgeable'
  | 'blocking_metrics'
  | 'phase2_not_ready';

export interface MemberWorkSyncNudgeActivationDecision {
  active: boolean;
  reason: MemberWorkSyncNudgeActivationReason;
}

const BLOCKING_PHASE2_REASONS = new Set([
  'would_nudge_rate_high',
  'fingerprint_churn_high',
  'report_rejection_rate_high',
]);

function hasBlockingMetrics(metrics: MemberWorkSyncTeamMetrics): boolean {
  return metrics.phase2Readiness.reasons.some((reason) => BLOCKING_PHASE2_REASONS.has(reason));
}

function isReviewPickupRequiredCandidate(status: MemberWorkSyncStatus): boolean {
  return (
    status.state === 'needs_sync' &&
    status.shadow?.wouldNudge === true &&
    status.agenda.items.length > 0 &&
    status.agenda.items.every(isStrictReviewPickupItem)
  );
}

export function decideMemberWorkSyncNudgeActivation(input: {
  status: MemberWorkSyncStatus;
  metrics: MemberWorkSyncTeamMetrics;
}): MemberWorkSyncNudgeActivationDecision {
  if (input.status.state !== 'needs_sync' || input.status.agenda.items.length === 0) {
    return { active: false, reason: 'status_not_nudgeable' };
  }

  if (
    input.metrics.phase2Readiness.state === 'collecting_shadow_data' &&
    isReviewPickupRequiredCandidate(input.status)
  ) {
    return { active: true, reason: 'review_pickup_required' };
  }

  const targetedRecovery = decideMemberWorkSyncTargetedRecovery(input.status);
  if (targetedRecovery.active) {
    return { active: true, reason: targetedRecovery.reason };
  }

  if (hasBlockingMetrics(input.metrics)) {
    return { active: false, reason: 'blocking_metrics' };
  }

  if (isReviewPickupRequiredCandidate(input.status)) {
    return { active: true, reason: 'review_pickup_required' };
  }

  if (input.metrics.phase2Readiness.state === 'shadow_ready') {
    return { active: true, reason: 'shadow_ready' };
  }

  return { active: false, reason: 'phase2_not_ready' };
}
