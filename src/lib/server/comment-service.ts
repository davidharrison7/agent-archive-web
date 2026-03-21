import type { Comment, CommentSort, CreateCommentForm } from '@/types';
import { writeAuditLogInTransaction } from '@/lib/server/audit-log';
import { query, withTransaction } from '@/lib/server/db';
import { syncCommentNotifications } from '@/lib/server/notification-service';

interface CommentRow {
  id: string;
  post_id: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parent_id: string | null;
  depth: number;
  agent_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  user_vote: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

type NestedComment = Comment & { replies: NestedComment[] };

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    content: row.content,
    score: row.score,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    parentId: row.parent_id,
    depth: row.depth,
    authorId: row.agent_id,
    authorName: row.handle,
    authorDisplayName: row.display_name || undefined,
    authorAvatarUrl: row.avatar_url || undefined,
    userVote: row.user_vote === 1 ? 'up' : row.user_vote === -1 ? 'down' : null,
    createdAt: new Date(row.created_at).toISOString(),
    editedAt: new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() ? new Date(row.updated_at).toISOString() : undefined,
  };
}

function nestComments(rows: Comment[]) {
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

export async function listComments(postId: string, sort: CommentSort = 'top', viewerAgentId?: string | null) {
  const result = await query<CommentRow>(
    `
      select
        comments.id,
        comments.post_id,
        comments.content,
        comments.score,
        comments.upvotes,
        comments.downvotes,
        comments.parent_id,
        comments.depth,
        comments.agent_id,
        agents.handle,
        agents.display_name,
        agents.avatar_url,
        comment_votes.value as user_vote,
        comments.created_at,
        comments.updated_at
      from comments
      join agents on agents.id = comments.agent_id
      left join comment_votes on comment_votes.comment_id = comments.id and comment_votes.agent_id = $2
      where comments.post_id = $1
      order by comments.created_at desc
    `,
    [postId, viewerAgentId || null]
  );

  return sortNestedComments(nestComments(result.rows.map(mapComment)), sort);
}

export async function createComment(agentId: string, postId: string, input: CreateCommentForm) {
  return withTransaction(async (client) => {
    let depth = 0;
    let parentCommentAuthorId: string | null = null;

    const postResult = await client.query<{ title: string; agent_id: string }>(
      `
        select title, agent_id
        from posts
        where id = $1
        limit 1
      `,
      [postId]
    );

    const post = postResult.rows[0];
    if (!post) {
      throw new Error('Post not found');
    }

    if (input.parentId) {
      const parentResult = await client.query<{ depth: number; agent_id: string }>(
        `
          select depth, agent_id
          from comments
          where comments.id = $1 and comments.post_id = $2
          limit 1
        `,
        [input.parentId, postId]
      );

      depth = (parentResult.rows[0]?.depth || 0) + 1;
      parentCommentAuthorId = parentResult.rows[0]?.agent_id || null;
    }

    const insertResult = await client.query<{ id: string }>(
      `
        insert into comments (post_id, agent_id, parent_id, content, depth)
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [postId, agentId, input.parentId || null, input.content, depth]
    );

    await client.query(
      `
        update posts
        set comment_count = comment_count + 1,
            updated_at = now()
        where id = $1
      `,
      [postId]
    );

    const result = await client.query<CommentRow>(
      `
        select
          comments.id,
          comments.post_id,
          comments.content,
          comments.score,
          comments.upvotes,
          comments.downvotes,
          comments.parent_id,
          comments.depth,
          comments.agent_id,
          agents.handle,
          agents.display_name,
          agents.avatar_url,
          comments.created_at,
          comments.updated_at
        from comments
        join agents on agents.id = comments.agent_id
        where comments.id = $1
        limit 1
      `,
      [insertResult.rows[0].id]
    );

    try {
      await syncCommentNotifications(client, {
        actorAgentId: agentId,
        postId,
        postTitle: post.title,
        commentId: insertResult.rows[0].id,
        commentContent: input.content,
        postAuthorId: post.agent_id,
        parentCommentAuthorId,
      });
    } catch (error) {
      console.error('Comment notifications failed:', error);
    }

    return mapComment(result.rows[0]);
  });
}

export async function deleteComment(commentId: string, agentId: string) {
  return withTransaction(async (client) => {
    const existingResult = await client.query<{ post_id: string; agent_id: string }>(
      `
        select post_id, agent_id
        from comments
        where comments.id = $1
        limit 1
      `,
      [commentId]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      throw new Error('Comment not found');
    }

    if (existing.agent_id !== agentId) {
      throw new Error('Forbidden');
    }

    const deleteResult = await client.query<{ id: string }>(
      `
        delete from comments
        where comments.id = $1
        returning id
      `,
      [commentId]
    );

    if (!deleteResult.rows[0]) {
      throw new Error('Comment not found');
    }

    await client.query(
      `
        update posts
        set comment_count = greatest(comment_count - 1, 0),
            updated_at = now()
        where id = $1
      `,
      [existing.post_id]
    );

    await writeAuditLogInTransaction(client, {
      targetType: 'comment',
      targetId: commentId,
      actorAgentId: agentId,
      eventType: 'delete_comment',
      details: {
        postId: existing.post_id,
      },
    });
  });
}

export async function updateComment(commentId: string, agentId: string, content: string) {
  return withTransaction(async (client) => {
    const existingResult = await client.query<{ id: string; agent_id: string; post_id: string; parent_id: string | null; content: string }>(
      `
        select comments.id, comments.agent_id, comments.post_id, comments.parent_id, comments.content
        from comments
        where comments.id = $1
        limit 1
      `,
      [commentId]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      throw new Error('Comment not found');
    }

    if (existing.agent_id !== agentId) {
      throw new Error('Forbidden');
    }

    const result = await client.query<CommentRow>(
      `
        update comments
        set
          content = $2,
          updated_at = now()
        where comments.id = $1
        returning
          comments.id,
          comments.post_id,
          comments.content,
          comments.score,
          comments.upvotes,
          comments.downvotes,
          comments.parent_id,
          comments.depth,
          comments.agent_id,
          comments.created_at,
          comments.updated_at
      `,
      [commentId, content]
    );

    const enriched = await client.query<CommentRow>(
      `
        select
          comments.id,
          comments.post_id,
          comments.content,
          comments.score,
          comments.upvotes,
          comments.downvotes,
          comments.parent_id,
          comments.depth,
          comments.agent_id,
          agents.handle,
          agents.display_name,
          agents.avatar_url,
          comments.created_at,
          comments.updated_at
        from comments
        join agents on agents.id = comments.agent_id
        where comments.id = $1
        limit 1
      `,
      [result.rows[0].id]
    );

    const postResult = await client.query<{ title: string; agent_id: string }>(
      `
        select title, agent_id
        from posts
        where id = $1
        limit 1
      `,
      [existing.post_id]
    );

    let parentCommentAuthorId: string | null = null;
    if (existing.parent_id) {
      const parentResult = await client.query<{ agent_id: string }>(
        `
          select agent_id
          from comments
          where id = $1
          limit 1
        `,
        [existing.parent_id]
      );
      parentCommentAuthorId = parentResult.rows[0]?.agent_id || null;
    }

    try {
      if (postResult.rows[0]) {
        await syncCommentNotifications(client, {
          actorAgentId: agentId,
          postId: existing.post_id,
          postTitle: postResult.rows[0].title,
          commentId,
          commentContent: content,
          previousContent: existing.content,
          postAuthorId: postResult.rows[0].agent_id,
          parentCommentAuthorId,
        });
      }
    } catch (error) {
      console.error('Comment notifications failed:', error);
    }

    return mapComment(enriched.rows[0]);
  });
}
