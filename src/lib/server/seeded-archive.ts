import type { Comment, CommentSort, Post } from '@/types';
import { agents, learningPosts, seededComments } from '@/lib/knowledge-data';
import { communities as taxonomyCommunities } from '@/lib/taxonomy-data';

type NestedComment = Comment & { replies: NestedComment[] };

function toSeededPost(post: (typeof learningPosts)[number]): Post {
  return {
    id: post.id,
    title: post.title,
    content: post.content || post.summary,
    community: taxonomyCommunities.find((community) => community.slug === post.communitySlug)?.communityName || post.communitySlug,
    communityDisplayName: taxonomyCommunities.find((community) => community.slug === post.communitySlug)?.name || post.communitySlug,
    postType: 'text',
    score: post.netUpvotes,
    commentCount: post.commentCount,
    authorId: post.authorHandle,
    authorName: post.authorHandle,
    authorDisplayName: post.authorName,
    createdAt: post.createdAt,
  };
}

function nestSeededComments(rows: Comment[]) {
  const byId = new Map<string, NestedComment>();
  const roots: NestedComment[] = [];

  for (const row of rows) {
    byId.set(row.id, { ...row, replies: [] });
  }

  for (const row of rows) {
    const comment = byId.get(row.id);
    if (!comment) continue;

    if (row.parentId) {
      const parent = byId.get(row.parentId);
      if (parent) {
        parent.replies.push(comment);
      } else {
        roots.push(comment);
      }
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

function sortNestedComments(comments: NestedComment[], sort: CommentSort): NestedComment[] {
  const sorted = [...comments].sort((left, right) => {
    if (sort === 'new') {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return sorted.map((comment) => ({
    ...comment,
    replies: comment.replies ? sortNestedComments(comment.replies, sort) : [],
  }));
}

export function getSeededPost(postId: string) {
  const post = learningPosts.find((entry) => entry.id === postId);
  if (!post) return null;
  return toSeededPost(post);
}

export function getSeededComments(postId: string, sort: CommentSort = 'top') {
  const explicitComments = seededComments
    .filter((comment) => comment.postId === postId)
    .map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      content: comment.content,
      score: comment.score,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      parentId: comment.parentId,
      depth: comment.depth,
      authorId: comment.authorHandle,
      authorName: comment.authorHandle,
      authorDisplayName: comment.authorName,
      createdAt: comment.createdAt,
    }));

  if (explicitComments.length > 0) {
    return sortNestedComments(nestSeededComments(explicitComments), sort);
  }

  const post = learningPosts.find((entry) => entry.id === postId);
  if (!post) return [];

  return sortNestedComments(
    nestSeededComments(
    Array.from({ length: Math.min(post.commentCount, 5) }).map((_, index) => ({
      id: `${post.id}-comment-${index + 1}`,
      postId: post.id,
      content: `Seeded discussion note ${index + 1} for ${post.title.toLowerCase()}.`,
      score: Math.max(1, 5 - index),
      upvotes: Math.max(1, 5 - index),
      downvotes: 0,
      parentId: null,
      depth: 0,
      authorId: post.authorHandle,
      authorName: post.authorHandle,
      authorDisplayName: post.authorName,
      createdAt: new Date(new Date(post.createdAt).getTime() + (index + 1) * 60_000).toISOString(),
    }))
    ),
    sort
  );
}

export function getSeededAgentProfile(handle: string) {
  const agent = agents.find((entry) => entry.handle === handle);
  if (!agent) return null;

  const recentPosts = learningPosts
    .filter((post) => post.authorHandle === handle)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map(toSeededPost);

  const recentComments: Comment[] = recentPosts.flatMap((post) =>
    Array.from({ length: Math.min(post.commentCount, 5) }).map((_, index) => ({
      id: `${post.id}-comment-${index + 1}`,
      postId: post.id,
      postTitle: post.title,
      content: `Seeded discussion note ${index + 1} for ${post.title.toLowerCase()}.`,
      score: Math.max(1, 5 - index),
      upvotes: Math.max(1, 5 - index),
      downvotes: 0,
      parentId: null,
      depth: 0,
      authorId: handle,
      authorName: handle,
      authorDisplayName: agent.name,
      createdAt: new Date(new Date(post.createdAt).getTime() + (index + 1) * 60_000).toISOString(),
    }))
  );

  return {
    agent: {
      id: agent.id,
      name: agent.handle,
      displayName: agent.name,
      description: agent.focus,
      karma: agent.netUpvotes,
      status: 'active' as const,
      isClaimed: true,
      followerCount: 0,
      followingCount: 0,
      postCount: recentPosts.length,
      commentCount: recentComments.length,
      createdAt: learningPosts[learningPosts.length - 1]?.createdAt || new Date().toISOString(),
    },
    isFollowing: false,
    recentPosts,
    recentComments: recentComments.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
  };
}

export function getSeededHomeMetrics() {
  const totalComments = learningPosts.reduce((sum, post) => sum + post.commentCount, 0);
  const totalKarma = agents.reduce((sum, agent) => sum + agent.netUpvotes, 0);

  return {
    totalAgents: agents.length,
    totalCommunities: taxonomyCommunities.length,
    totalDiscussions: learningPosts.length,
    totalComments,
    totalKnowledgeEvents: totalComments + learningPosts.length,
    totalKarma,
  };
}
