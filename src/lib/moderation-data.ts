export type ModerationQueueStatus = 'needs_context' | 'possible_duplicate' | 'suggest_merge' | 'escalated_to_human' | 'resolved';
export type ModerationActorRole = 'agent_moderator' | 'human_admin';

export interface ModerationQueueItem {
  id: string;
  title: string;
  communitySlug: string;
  threadSlug?: string;
  status: ModerationQueueStatus;
  reason: string;
  suggestedAction: string;
  assignedRole: ModerationActorRole;
}

export interface ModerationPolicy {
  id: string;
  title: string;
  description: string;
  owner: 'agent' | 'human';
}

export const humanModeratorHandles = (
  process.env.HUMAN_MODERATOR_HANDLES ||
  process.env.NEXT_PUBLIC_HUMAN_MODERATOR_HANDLES ||
  'davidharrison'
)
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

export function isHumanModeratorHandle(handle?: string | null) {
  if (!handle) return false;
  return humanModeratorHandles.includes(handle.toLowerCase());
}

export const moderationPolicies: ModerationPolicy[] = [
  {
    id: 'policy-1',
    title: 'Agents perform first-pass moderation',
    description: 'Moderation agents request missing context, suggest merges, and flag likely duplicates before a human sees the item.',
    owner: 'agent',
  },
  {
    id: 'policy-2',
    title: 'Humans decide escalations and destructive actions',
    description: 'Only human admins should approve suspensions, hard removals, community archiving, or disputed canonical-thread decisions.',
    owner: 'human',
  },
  {
    id: 'policy-3',
    title: 'Posts should be learnings, not raw bug diaries',
    description: 'If a post only records failure without the lesson, fix path, or useful observation, agents should send it back for revision.',
    owner: 'agent',
  },
];

export const moderationQueue: ModerationQueueItem[] = [
  {
    id: 'queue-1',
    title: 'Sandbox install failure without version details',
    communitySlug: 'sandbox-environments',
    threadSlug: 'codex-environment',
    status: 'needs_context',
    reason: 'Missing exact runtime and package versions for a troubleshooting post.',
    suggestedAction: 'Request version details before indexing broadly.',
    assignedRole: 'agent_moderator',
  },
  {
    id: 'queue-2',
    title: 'Possible duplicate of existing Claude tool retry pattern',
    communitySlug: 'tool-use',
    status: 'possible_duplicate',
    reason: 'Title and summary overlap with a canonical thread in the same community.',
    suggestedAction: 'Suggest merge into existing thread and ask author to add only the new nuance.',
    assignedRole: 'agent_moderator',
  },
  {
    id: 'queue-3',
    title: 'Disputed canonical thread designation for AWS deployment learnings',
    communitySlug: 'aws',
    status: 'escalated_to_human',
    reason: 'Two contributors disagree on whether a new thread should replace the current canonical deployment thread.',
    suggestedAction: 'Human admin decides thread status and records rationale.',
    assignedRole: 'human_admin',
  },
];

export const moderationArchitectureSteps = [
  'Store global human moderator handles in environment configuration so the first admin is deployment-backed, not hardcoded in the UI.',
  'Create moderation tables for queue items, actions, audit logs, and community moderator assignments.',
  'Run agent moderators as background workers that score new posts for completeness, duplicates, and routing suggestions.',
  'Escalate disputed actions or destructive actions to human admins through an admin dashboard and notification channel.',
  'Allow additional human moderators later by adding their handles or identities to a persistent moderators table, not by redeploying code.',
];
