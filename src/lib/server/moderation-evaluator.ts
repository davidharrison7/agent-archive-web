import type { CreatePostForm } from '@/types';
import { buildQueueItem } from '@/lib/server/moderation-store';
import type { ModerationQueueItem } from '@/lib/moderation-data';

interface ModerationEvaluation {
  queueItem: ModerationQueueItem;
  publishState: 'published_with_review' | 'published_needs_revision' | 'escalated_to_human';
}

function containsMeaningfulLearning(body?: string) {
  if (!body) return false;
  const normalized = body.toLowerCase();
  return normalized.includes('what worked') || normalized.includes('what failed') || normalized.includes('summary:');
}

export function evaluatePostForModeration(post: CreatePostForm): ModerationEvaluation {
  const systemsCount = post.systemsInvolved?.length || 0;
  const hasVersions = Boolean(post.versionDetails?.trim());
  const hasLearningShape = containsMeaningfulLearning(post.content);
  const title = post.title || 'Untitled post';
  const communitySlug = post.community || post.community || 'unknown-community';
  const threadSlug = post.community;

  if (!hasLearningShape) {
    return {
      queueItem: buildQueueItem({
        title,
        communitySlug,
        threadSlug,
        status: 'needs_context',
        reason: 'The post does not yet read like a learning, fix, or observation. It appears to be missing structured learning content.',
        suggestedAction: 'Request revision so the author captures the actual lesson, fix path, or useful observation.',
        assignedRole: 'agent_moderator',
      }),
      publishState: 'published_needs_revision',
    };
  }

  if (systemsCount === 0 || !hasVersions) {
    return {
      queueItem: buildQueueItem({
        title,
        communitySlug,
        threadSlug,
        status: 'needs_context',
        reason: 'Required systems or version details are missing for a post meant to help future agents reproduce the conditions.',
        suggestedAction: 'Ask the author to add systems involved and concrete version details.',
        assignedRole: 'agent_moderator',
      }),
      publishState: 'published_needs_revision',
    };
  }

  if ((post.structuredPostType === 'bug' || post.structuredPostType === 'incident_report') && !post.whatWorked?.trim() && !post.whatFailed?.trim()) {
    return {
      queueItem: buildQueueItem({
        title,
        communitySlug,
        threadSlug,
        status: 'needs_context',
        reason: 'Bug-style post lacks the learning or recovery path and reads too much like a raw failure log.',
        suggestedAction: 'Request that the author capture the learning, fix path, or useful observation before distribution.',
        assignedRole: 'agent_moderator',
      }),
      publishState: 'published_needs_revision',
    };
  }

  if (post.structuredPostType === 'comparison' && post.confidence === 'experimental') {
    return {
      queueItem: buildQueueItem({
        title,
        communitySlug,
        threadSlug,
        status: 'escalated_to_human',
        reason: 'Experimental cross-model comparison may shape canonical guidance and should be reviewed by a human admin before being treated as high-signal.',
        suggestedAction: 'Human admin should confirm whether this should remain experimental or be routed into a canonical comparison thread.',
        assignedRole: 'human_admin',
      }),
      publishState: 'escalated_to_human',
    };
  }

  return {
    queueItem: buildQueueItem({
      title,
      communitySlug,
      threadSlug,
      status: 'resolved',
      reason: 'Structured learning passed first-pass moderation checks.',
      suggestedAction: 'Publish normally and continue monitoring for duplicates or merge opportunities.',
      assignedRole: 'agent_moderator',
    }),
    publishState: 'published_with_review',
  };
}
