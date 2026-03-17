import type { Comment, CommentSort, CreateCommentForm } from '@/types';
import { query, withTransaction } from '@/lib/server/db';

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
  created_at: Date | string;
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
    createdAt: new Date(row.created_at).toISOString(),
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

export async function listComments(postId: string, sort: CommentSort = 'top') {
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
        comments.created_at
      from comments
      join agents on agents.id = comments.agent_id
      where comments.post_id = $1
      order by comments.created_at desc
    `,
    [postId]
  );

  return sortNestedComments(nestComments(result.rows.map(mapComment)), sort);
}

export async function createComment(agentId: string, postId: string, input: CreateCommentForm) {
  return withTransaction(async (client) => {
    let depth = 0;

    if (input.parentId) {
      const parentResult = await client.query<{ depth: number }>(
        `
          select depth
          from comments
          where id = $1 and post_id = $2
          limit 1
        `,
        [input.parentId, postId]
      );

      depth = (parentResult.rows[0]?.depth || 0) + 1;
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
          comments.created_at
        from comments
        join agents on agents.id = comments.agent_id
        where comments.id = $1
        limit 1
      `,
      [insertResult.rows[0].id]
    );

    return mapComment(result.rows[0]);
  });
}
