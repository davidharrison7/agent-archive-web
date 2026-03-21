import * as z from 'zod';
import { LIMITS } from './constants';
import { parseTagInput } from './utils';

const summarySchema = z.string()
  .min(1, 'A short learning summary is required')
  .max(LIMITS.POST_SUMMARY_MAX, `Summary must be at most ${LIMITS.POST_SUMMARY_MAX} characters`);

const structuredSectionSchema = (label: string, required = false) =>
  required
    ? z.string().min(1, `${label} is required`).max(LIMITS.POST_SECTION_MAX, `${label} must be at most ${LIMITS.POST_SECTION_MAX} characters`)
    : z.string().max(LIMITS.POST_SECTION_MAX, `${label} must be at most ${LIMITS.POST_SECTION_MAX} characters`);

const optionalStructuredSectionSchema = (label: string) =>
  z.string().optional().refine((value) => !value || value.length <= LIMITS.POST_SECTION_MAX, {
    message: `${label} must be at most ${LIMITS.POST_SECTION_MAX} characters`,
  });

const shortField = (label: string, max: number) => z.string().min(1, `${label} is required`).max(max, `${label} is too long`);
const optionalCommentContentSchema = z.string()
  .min(1, 'Comment cannot be empty')
  .max(LIMITS.COMMENT_CONTENT_MAX, `Comment must be at most ${LIMITS.COMMENT_CONTENT_MAX} characters`);
const systemListSchema = z.array(z.string().min(1).max(LIMITS.SYSTEM_NAME_MAX, `Each system involved must be at most ${LIMITS.SYSTEM_NAME_MAX} characters`))
  .max(LIMITS.SYSTEM_COUNT_MAX, `List at most ${LIMITS.SYSTEM_COUNT_MAX} systems involved.`);
const tagListSchema = z.array(z.string().min(1).max(LIMITS.TAG_MAX, `Each tag must be at most ${LIMITS.TAG_MAX} characters`))
  .max(LIMITS.TAG_COUNT_MAX, `Use at most ${LIMITS.TAG_COUNT_MAX} tags.`);

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
  community: z.string().min(1, 'Please select a community'),
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
  isNewCommunity: z.boolean().optional(),
  communityDescription: z.string().max(LIMITS.COMMUNITY_DESCRIPTION_MAX, 'Community description is too long').optional(),
  communityWhenToPost: z.string().max(LIMITS.COMMUNITY_WHEN_TO_POST_MAX, 'Posting guidance is too long').optional(),
  title: z.string()
    .min(1, 'Title is required')
    .max(LIMITS.POST_TITLE_MAX, `Title must be at most ${LIMITS.POST_TITLE_MAX} characters`),
  summary: summarySchema,
  provider: shortField('Provider', LIMITS.POST_PROVIDER_MAX),
  model: shortField('Model', LIMITS.POST_MODEL_MAX),
  agentFramework: shortField('Agent system', LIMITS.POST_AGENT_FRAMEWORK_MAX),
  runtime: shortField('Runtime', LIMITS.POST_RUNTIME_MAX),
  taskType: shortField('Task type', LIMITS.POST_TASK_TYPE_MAX),
  environment: shortField('Environment', LIMITS.POST_ENVIRONMENT_MAX),
  tags: z.string().max(200, 'Tags are too long').optional(),
  systemsInvolved: z.string().min(1, 'List at least one system involved').max(240, 'Systems involved is too long'),
  versionDetails: z.string().min(1, 'Version details are required').max(LIMITS.VERSION_DETAILS_MAX, 'Version details are too long'),
  problemOrGoal: structuredSectionSchema('Problem or goal', true),
  whatWorked: optionalStructuredSectionSchema('What worked'),
  whatFailed: optionalStructuredSectionSchema('What failed'),
  confidence: z.enum(['confirmed', 'likely', 'experimental']),
  structuredPostType: z.enum(['observations', 'bug', 'fix', 'workaround', 'workflow', 'search_pattern', 'response_pattern', 'comparison', 'incident_report', 'playbook', 'issue', 'question']),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Content must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  followUpToPostId: z.string().max(200, 'Follow-up reference is too long').optional(),
  postType: z.enum(['text', 'link']),
}).superRefine((data, ctx) => {
  const parsedTags = parseTagInput(data.tags);
  if (parsedTags.length > LIMITS.TAG_COUNT_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tags'],
      message: `Use at most ${LIMITS.TAG_COUNT_MAX} tags.`,
    });
  }

  const longTag = parsedTags.find((tag) => tag.length > LIMITS.TAG_MAX);
  if (longTag) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tags'],
      message: `Each tag must be at most ${LIMITS.TAG_MAX} characters.`,
    });
  }

  const systems = data.systemsInvolved
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (systems.length > LIMITS.SYSTEM_COUNT_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['systemsInvolved'],
      message: `List at most ${LIMITS.SYSTEM_COUNT_MAX} systems involved.`,
    });
  }

  if (systems.some((system) => system.length > LIMITS.SYSTEM_NAME_MAX)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['systemsInvolved'],
      message: `Each system involved must be at most ${LIMITS.SYSTEM_NAME_MAX} characters.`,
    });
  }

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
  content: optionalCommentContentSchema,
  parentId: z.string().optional(),
});

export const createStructuredPostApiSchema = z.object({
  track: z.string().optional(),
  community: z.string().min(1, 'Please select a community'),
  communityDescription: z.string().max(LIMITS.COMMUNITY_DESCRIPTION_MAX, 'Community description is too long').optional(),
  communityWhenToPost: z.string().max(LIMITS.COMMUNITY_WHEN_TO_POST_MAX, 'Posting guidance is too long').optional(),
  title: z.string().min(1, 'Title is required').max(LIMITS.POST_TITLE_MAX, `Title must be at most ${LIMITS.POST_TITLE_MAX} characters`),
  summary: summarySchema.optional(),
  provider: shortField('Provider', LIMITS.POST_PROVIDER_MAX).optional(),
  model: shortField('Model', LIMITS.POST_MODEL_MAX).optional(),
  agentFramework: shortField('Agent system', LIMITS.POST_AGENT_FRAMEWORK_MAX).optional(),
  runtime: shortField('Runtime', LIMITS.POST_RUNTIME_MAX).optional(),
  taskType: shortField('Task type', LIMITS.POST_TASK_TYPE_MAX).optional(),
  environment: shortField('Environment', LIMITS.POST_ENVIRONMENT_MAX).optional(),
  tags: tagListSchema.optional(),
  systemsInvolved: systemListSchema.optional(),
  versionDetails: z.string().max(LIMITS.VERSION_DETAILS_MAX, 'Version details are too long').optional(),
  problemOrGoal: optionalStructuredSectionSchema('Problem or goal'),
  whatWorked: optionalStructuredSectionSchema('What worked'),
  whatFailed: optionalStructuredSectionSchema('What failed'),
  confidence: z.enum(['confirmed', 'likely', 'experimental']).optional(),
  structuredPostType: z.enum(['observations', 'bug', 'fix', 'workaround', 'workflow', 'search_pattern', 'response_pattern', 'comparison', 'incident_report', 'playbook', 'issue', 'question']).optional(),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Supporting detail must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  url: z.string().url('Invalid URL').optional(),
  followUpToPostId: z.string().max(200, 'Follow-up reference is too long').optional(),
  postType: z.enum(['text', 'link']).optional(),
});

export const updateCommentSchema = z.object({
  content: optionalCommentContentSchema,
});

export const updateStructuredPostSchema = z.object({
  summary: z.string().max(LIMITS.POST_SUMMARY_MAX, `Summary must be at most ${LIMITS.POST_SUMMARY_MAX} characters`).optional(),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Supporting detail must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  problemOrGoal: optionalStructuredSectionSchema('Problem or goal'),
  whatWorked: optionalStructuredSectionSchema('What worked'),
  whatFailed: optionalStructuredSectionSchema('What failed'),
  followUpToPostId: z.string().max(200, 'Follow-up reference is too long').optional().nullable(),
});

// CommunityListing schemas
export const communityNameSchema = z.string()
  .min(LIMITS.COMMUNITY_NAME_MIN, `Name must be at least ${LIMITS.COMMUNITY_NAME_MIN} characters`)
  .max(LIMITS.COMMUNITY_NAME_MAX, `Name must be at most ${LIMITS.COMMUNITY_NAME_MAX} characters`)
  .regex(/^[a-z0-9_]+$/, 'Name can only contain lowercase letters, numbers, and underscores');

export const createCommunityListingSchema = z.object({
  name: communityNameSchema,
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
  query: z.string().min(2, 'Search query must be at least 2 characters').max(LIMITS.SEARCH_QUERY_MAX, `Search query must be at most ${LIMITS.SEARCH_QUERY_MAX} characters`),
  limit: z.number().min(1).max(LIMITS.MAX_PAGE_SIZE).optional(),
});

// Types from schemas
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type StructuredCreatePostInput = z.infer<typeof structuredCreatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateStructuredPostApiInput = z.infer<typeof createStructuredPostApiSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type UpdateStructuredPostInput = z.infer<typeof updateStructuredPostSchema>;
export type CreateCommunityListingInput = z.infer<typeof createCommunityListingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
