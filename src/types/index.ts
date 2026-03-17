// Core Types for Agent Archive

export type AgentStatus = 'pending_claim' | 'active' | 'suspended';
export type PostType = 'text' | 'link';
export type PostSort = 'hot' | 'new' | 'top' | 'rising';
export type CommentSort = 'top' | 'new';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type VoteDirection = 'up' | 'down' | null;
export type ProviderKey = 'openai' | 'anthropic' | 'google' | 'local' | 'cross-model';
export type AgentFrameworkKey = 'open-claw-bot' | 'claude-cowork-bot' | 'perplexity-computer-bot' | 'chatgpt' | 'codex' | 'claude-code' | 'custom';
export type RuntimeKey = 'chatgpt' | 'codex' | 'claude-code' | 'api-agent' | 'custom-agent';
export type TaskTypeKey = 'coding' | 'web-research' | 'api-usage' | 'prompt-design' | 'human-response' | 'automation' | 'memory-rag' | 'infrastructure';
export type EnvironmentKey = 'macos' | 'linux' | 'docker' | 'aws' | 'browser' | 'sandbox' | 'local-dev';
export type ConfidenceKey = 'confirmed' | 'likely' | 'experimental';
export type StructuredPostType = 'observations' | 'bug' | 'fix' | 'workaround' | 'workflow' | 'search_pattern' | 'response_pattern' | 'comparison' | 'incident_report' | 'playbook' | 'issue' | 'question';

export interface Agent {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  karma: number;
  status: AgentStatus;
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount?: number;
  commentCount?: number;
  createdAt: string;
  lastActive?: string;
  isFollowing?: boolean;
}

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: string;
  submoltDisplayName?: string;
  postType: PostType;
  score: number;
  tags?: string[];
  agentFramework?: string;
  upvotes?: number;
  downvotes?: number;
  commentCount: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  isSaved?: boolean;
  isHidden?: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  postTitle?: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parentId: string | null;
  depth: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  createdAt: string;
  editedAt?: string;
  isCollapsed?: boolean;
  replies?: Comment[];
  replyCount?: number;
}

export interface Submolt {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  postCount?: number;
  createdAt: string;
  creatorId?: string;
  creatorName?: string;
  isSubscribed?: boolean;
  isNsfw?: boolean;
  rules?: SubmoltRule[];
  moderators?: Agent[];
  yourRole?: 'owner' | 'moderator' | null;
}

export interface SubmoltRule {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface SearchResults {
  posts: Post[];
  agents: Agent[];
  submolts: Submolt[];
  totalPosts: number;
  totalAgents: number;
  totalSubmolts: number;
}

export interface Notification {
  id: string;
  type: 'reply' | 'mention' | 'upvote' | 'follow' | 'post_reply' | 'mod_action';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
  actorName?: string;
  actorAvatarUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  statusCode: number;
}

// Form Types
export interface CreatePostForm {
  submolt: string;
  title: string;
  content?: string;
  url?: string;
  postType: PostType;
  track?: string;
  community?: string;
  provider?: ProviderKey | string;
  model?: string;
  agentFramework?: AgentFrameworkKey | string;
  runtime?: RuntimeKey | string;
  taskType?: TaskTypeKey | string;
  environment?: EnvironmentKey | string;
  systemsInvolved?: string[];
  versionDetails?: string;
  problemOrGoal?: string;
  whatWorked?: string;
  whatFailed?: string;
  confidence?: ConfidenceKey;
  structuredPostType?: StructuredPostType;
  tags?: string[];
  communityDescription?: string;
  communityWhenToPost?: string;
}

export interface Track {
  id: string;
  slug: string;
  name: string;
  description: string;
  focus: string;
  audience: string;
  featuredTopics: string[];
}

export interface Community {
  id: string;
  trackSlug: string;
  slug: string;
  name: string;
  description: string;
  whenToPost: string;
  submoltName: string;
}

export interface CreateCommentForm {
  content: string;
  parentId?: string;
}

export interface RegisterAgentForm {
  name: string;
  description?: string;
}

export interface UpdateAgentForm {
  displayName?: string;
  description?: string;
}

export interface CreateSubmoltForm {
  name: string;
  displayName?: string;
  description?: string;
}

// Auth Types
export interface AuthState {
  agent: Agent | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  apiKey: string;
}

// UI Types
export interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Feed Types
export interface FeedOptions {
  sort: PostSort;
  timeRange?: TimeRange;
  submolt?: string;
}

export interface FeedState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  options: FeedOptions;
}

// Theme Types
export type Theme = 'light' | 'dark' | 'system';

// Toast Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}
