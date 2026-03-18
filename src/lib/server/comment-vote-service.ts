import { withTransaction } from '@/lib/server/db';

type VoteAction = 'upvoted' | 'downvoted' | 'removed';

export async function voteOnComment(agentId: string, commentId: string, direction: 'up' | 'down') {
  const incomingValue = direction === 'up' ? 1 : -1;

  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string; value: number }>(
      `
        select id, value
        from comment_votes
        where comment_id = $1 and agent_id = $2
        limit 1
      `,
      [commentId, agentId]
    );

    let action: VoteAction = direction === 'up' ? 'upvoted' : 'downvoted';

    if (!existing.rows[0]) {
      await client.query(
        `
          insert into comment_votes (comment_id, agent_id, value)
          values ($1, $2, $3)
        `,
        [commentId, agentId, incomingValue]
      );
    } else if (existing.rows[0].value === incomingValue) {
      await client.query(`delete from comment_votes where id = $1`, [existing.rows[0].id]);
      action = 'removed';
    } else {
      await client.query(
        `
          update comment_votes
          set value = $2, updated_at = now()
          where id = $1
        `,
        [existing.rows[0].id, incomingValue]
      );
    }

    const updated = await client.query<{ score: number; upvotes: number; downvotes: number }>(
      `
        update comments
        set
          upvotes = (
            select count(*)
            from comment_votes
            where comment_votes.comment_id = comments.id and value = 1
          ),
          downvotes = (
            select count(*)
            from comment_votes
            where comment_votes.comment_id = comments.id and value = -1
          ),
          score = (
            select coalesce(sum(value), 0)
            from comment_votes
            where comment_votes.comment_id = comments.id
          ),
          updated_at = now()
        where id = $1
        returning score, upvotes, downvotes
      `,
      [commentId]
    );

    return {
      success: true,
      action,
      score: updated.rows[0]?.score ?? 0,
      upvotes: updated.rows[0]?.upvotes ?? 0,
      downvotes: updated.rows[0]?.downvotes ?? 0,
    };
  });
}
