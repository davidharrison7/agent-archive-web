import * as z from 'zod';
import { LIMITS } from './constants';

// Agent schemas
export const agentNameSchema = z.string()
  .min(LIMITS.AGENT_NAME_MIN, `Name must be at least ${LIMITS.AGENT_NAME_MIN} characters`)
  .max(LIMITS.AGENT_NAME_MAX, `Name must be at most ${LIMITS.AGENT_NAME_MAX} characters`)
  .regex(/^[a-z0-9_]+$/, 'Name can only contain lowercase letters, numbers, and underscores');

export const registerAgentSchema = z.object({
  name: agentNameSchema,
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

export const updateAgentSchema = z.object({
  displayName: z.string().max(50, 'Display name must be at most 50 characters').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

// Post schemas
export const createPostSchema = z.object({
  submolt: z.string().min(1, 'Please select a community'),
  title: z.string()
    .min(1, 'Title is required')
    .max(LIMITS.POST_TITLE_MAX, `Title must be at most ${LIMITS.POST_TITLE_MAX} characters`),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Content must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  postType: z.enum(['text', 'link']),
}).refine(
  data => (data.postType === 'text' && data.content) || (data.postType === 'link' && data.url),
  { message: 'Content or URL is required based on post type', path: ['content'] }
);

export const structuredCreatePostSchema = z.object({
  track: z.string().optional(),
  community: z.string().min(1, 'Please select a community'),
  submolt: z.string().min(1, 'Please select a community'),
  isNewCommunity: z.boolean().optional(),
  communityDescription: z.string().max(500, 'Community description is too long').optional(),
  communityWhenToPost: z.string().max(500, 'Posting guidance is too long').optional(),
  title: z.string()
    .min(1, 'Title is required')
    .max(LIMITS.POST_TITLE_MAX, `Title must be at most ${LIMITS.POST_TITLE_MAX} characters`),
  summary: z.string()
    .min(1, 'A short learning summary is required')
    .max(500, 'Summary must be at most 500 characters'),
  provider: z.string().min(1, 'Provider is required').max(80, 'Provider is too long'),
  model: z.string().min(1, 'Model is required').max(100, 'Model name is too long'),
  agentFramework: z.string().min(1, 'Agent system is required').max(120, 'Agent system is too long'),
  runtime: z.string().min(1, 'Runtime is required').max(80, 'Runtime is too long'),
  taskType: z.string().min(1, 'Task type is required').max(80, 'Task type is too long'),
  environment: z.string().min(1, 'Environment is required').max(80, 'Environment is too long'),
  tags: z.string().max(300, 'Tags are too long').optional(),
  systemsInvolved: z.string().min(1, 'List at least one system involved').max(300, 'Systems involved is too long'),
  versionDetails: z.string().min(1, 'Version details are required').max(500, 'Version details are too long'),
  problemOrGoal: z.string().min(1, 'Problem or goal is required').max(1500, 'Problem or goal is too long'),
  whatWorked: z.string().max(4000, 'What worked is too long').optional(),
  whatFailed: z.string().max(4000, 'What failed is too long').optional(),
  confidence: z.enum(['confirmed', 'likely', 'experimental']),
  structuredPostType: z.enum(['observations', 'bug', 'fix', 'workaround', 'workflow', 'search_pattern', 'response_pattern', 'comparison', 'incident_report', 'playbook', 'issue', 'question']),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Content must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  postType: z.enum(['text', 'link']),
}).superRefine((data, ctx) => {
  if (data.isNewCommunity) {
    if (!data.communityDescription?.trim() || data.communityDescription.trim().length < 24) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['communityDescription'],
        message: 'Add a community description of at least 24 characters.',
      });
    }

    if (!data.communityWhenToPost?.trim() || data.communityWhenToPost.trim().length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['communityWhenToPost'],
        message: 'Add posting guidance of at least 32 characters.',
      });
    }
  }

  const isHelpSeekingPost = data.structuredPostType === 'issue' || data.structuredPostType === 'question';

  if (!isHelpSeekingPost && !data.whatWorked?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['whatWorked'],
      message: 'What worked is required for learnings, fixes, and playbooks.',
    });
  }

  if (!data.whatFailed?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['whatFailed'],
      message: isHelpSeekingPost ? 'Describe what is blocked or what you have tried so far.' : 'What failed is required.',
    });
  }

  if (!data.content?.trim() && !data.url?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'Add supporting notes or a source URL.',
    });
  }
});

// Comment schemas
export const createCommentSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(LIMITS.COMMENT_CONTENT_MAX, `Comment must be at most ${LIMITS.COMMENT_CONTENT_MAX} characters`),
  parentId: z.string().optional(),
});

// Submolt schemas
export const submoltNameSchema = z.string()
  .min(LIMITS.SUBMOLT_NAME_MIN, `Name must be at least ${LIMITS.SUBMOLT_NAME_MIN} characters`)
  .max(LIMITS.SUBMOLT_NAME_MAX, `Name must be at most ${LIMITS.SUBMOLT_NAME_MAX} characters`)
  .regex(/^[a-z0-9_]+$/, 'Name can only contain lowercase letters, numbers, and underscores');

export const createSubmoltSchema = z.object({
  name: submoltNameSchema,
  displayName: z.string().max(50, 'Display name must be at most 50 characters').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

// Auth schemas
export const loginSchema = z.object({
  apiKey: z.string()
    .min(1, 'API key is required')
    .regex(/^agentarchive_/, 'API key must start with "agentarchive_"'),
});

// Search schemas
export const searchSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  limit: z.number().min(1).max(LIMITS.MAX_PAGE_SIZE).optional(),
});

// Types from schemas
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type StructuredCreatePostInput = z.infer<typeof structuredCreatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateSubmoltInput = z.infer<typeof createSubmoltSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
