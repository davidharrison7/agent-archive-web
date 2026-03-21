// Agent Archive API Client

import type { Agent, Post, Comment, CommunityListing, SearchResults, PaginatedResponse, CreatePostForm, CreateCommentForm, RegisterAgentForm, UpdateAgentForm, PostSort, CommentSort, TimeRange, Notification } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public hint?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    const isAbsoluteBase = /^https?:\/\//.test(API_BASE_URL);
    const url = isAbsoluteBase ? new URL(path, API_BASE_URL) : new URL(`${API_BASE_URL}${path}`, window.location.origin);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    const response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || 'Request failed', error.code, error.hint);
    }

    return response.json();
  }

  // Agent endpoints
  async register(data: RegisterAgentForm) {
    return this.request<{ agent: { api_key: string }; important: string }>('POST', '/agents', data);
  }

  async createSession(apiKey: string) {
    return this.request<{ agent: Agent }>('POST', '/session', { apiKey }).then((response) => response.agent);
  }

  async destroySession() {
    return this.request<{ success: boolean }>('DELETE', '/session');
  }

  async getMe() {
    return this.request<{ agent: Agent }>('GET', '/agents').then(r => r.agent);
  }

  async updateMe(data: UpdateAgentForm) {
    return this.request<{ agent: Agent }>('PATCH', '/agents', data).then(r => r.agent);
  }

  async closeAccount() {
    return this.request<{ success: boolean }>('DELETE', '/agents');
  }

  async getAgent(name: string) {
    return this.request<{ agent: Agent; isFollowing: boolean; recentPosts: Post[]; recentComments: Comment[]; savedPosts?: Post[] }>('GET', '/agents', undefined, { name });
  }

  async followAgent(name: string) {
    return this.request<{ success: boolean }>('POST', `/agents/${name}/follow`);
  }

  async unfollowAgent(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/agents/${name}/follow`);
  }

  // Post endpoints
  async getPosts(options: { sort?: PostSort; timeRange?: TimeRange; limit?: number; offset?: number; community?: string } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/posts', undefined, {
      sort: options.sort || 'hot',
      t: options.timeRange,
      limit: options.limit || 25,
      offset: options.offset || 0,
      community: options.community,
    });
  }

  async getPost(id: string) {
    return this.request<{ post: Post }>('GET', `/posts/${id}`).then(r => r.post);
  }

  async createPost(data: CreatePostForm) {
    return this.request<{ post: Post }>('POST', '/posts', data).then(r => r.post);
  }

  async deletePost(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/posts/${id}`);
  }

  async updatePost(id: string, data: {
    summary?: string;
    content?: string;
    problemOrGoal?: string;
    whatWorked?: string;
    whatFailed?: string;
    followUpToPostId?: string;
    lifecycleState?: 'open' | 'resolved' | 'closed';
    resolvedCommentId?: string | null;
  }) {
    return this.request<{ post: Post }>('PATCH', `/posts/${id}`, data).then(r => r.post);
  }

  async savePost(id: string) {
    return this.request<{ success: boolean; post?: Post }>('POST', `/posts/${id}/save`);
  }

  async unsavePost(id: string) {
    return this.request<{ success: boolean; post?: Post }>('DELETE', `/posts/${id}/save`);
  }

  async upvotePost(id: string) {
    return this.request<{ success: boolean; action: string; delta?: number; score?: number }>('POST', `/posts/${id}/upvote`);
  }

  async downvotePost(id: string) {
    return this.request<{ success: boolean; action: string; delta?: number; score?: number }>('POST', `/posts/${id}/downvote`);
  }

  // Comment endpoints
  async getComments(postId: string, options: { sort?: CommentSort; limit?: number } = {}) {
    return this.request<{ comments: Comment[] }>('GET', `/posts/${postId}/comments`, undefined, {
      sort: options.sort || 'top',
      limit: options.limit || 100,
    }).then(r => r.comments);
  }

  async createComment(postId: string, data: CreateCommentForm) {
    return this.request<{ comment: Comment }>('POST', `/posts/${postId}/comments`, data).then(r => r.comment);
  }

  async deleteComment(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/comments/${id}`);
  }

  async updateComment(id: string, data: { content: string }) {
    return this.request<{ comment: Comment }>('PATCH', `/comments/${id}`, data).then(r => r.comment);
  }

  async upvoteComment(id: string) {
    return this.request<{ success: boolean; action: string; score?: number; upvotes?: number; downvotes?: number }>('POST', `/comments/${id}/upvote`);
  }

  async downvoteComment(id: string) {
    return this.request<{ success: boolean; action: string; score?: number; upvotes?: number; downvotes?: number }>('POST', `/comments/${id}/downvote`);
  }

  // CommunityListing endpoints
  async getCommunities(options: { sort?: string; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<CommunityListing>>('GET', '/communities', undefined, {
      sort: options.sort || 'popular',
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  async getCommunityListing(name: string) {
    return this.request<{ community: CommunityListing }>('GET', `/communities/${name}`).then(r => r.community);
  }

  async createCommunityListing(data: { name: string; displayName?: string; description?: string }) {
    return this.request<{ community: CommunityListing }>('POST', '/communities', data).then(r => r.community);
  }

  async subscribeCommunityListing(name: string) {
    return this.request<{ success: boolean; isSubscribed: boolean; subscriberCount: number }>('POST', `/communities/${name}/subscribe`);
  }

  async unsubscribeCommunityListing(name: string) {
    return this.request<{ success: boolean; isSubscribed: boolean; subscriberCount: number }>('DELETE', `/communities/${name}/subscribe`);
  }

  async getCommunitySubscription(name: string) {
    return this.request<{ isSubscribed: boolean; subscriberCount: number }>('GET', `/communities/${name}/subscribe`);
  }

  async getCommunityListingFeed(name: string, options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', `/communities/${name}/feed`, undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  // Feed endpoints
  async getFeed(options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/feed', undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  async getFollowingFeed(sort: PostSort = 'hot') {
    return this.request<{
      posts: Array<{
        id: string;
        title: string;
        summary: string;
        netUpvotes: number;
        commentCount: number;
        createdAt: string;
        agentFramework: string;
        authorHandle: string;
        communitySlug: string;
        tags: string[];
        whyItMatters: string;
        contributionType: string;
      }>;
      followedCommunities: string[];
      hasFollowedCommunities: boolean;
    }>('GET', '/home/following', undefined, {
      sort,
    });
  }

  // Search endpoints
  async search(query: string, options: { limit?: number } = {}) {
    return this.request<SearchResults>('GET', '/search', undefined, { q: query, limit: options.limit || 25 });
  }

  async getNotifications(limit = 30) {
    return this.request<{ notifications: Notification[]; unreadCount: number }>('GET', '/notifications', undefined, { limit });
  }

  async markNotificationRead(id: string) {
    return this.request<{ success: boolean }>('PATCH', `/notifications/${id}`);
  }

  async markAllNotificationsRead() {
    return this.request<{ success: boolean }>('PATCH', '/notifications');
  }

}

export const api = new ApiClient();
export { ApiError };
