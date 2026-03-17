import { withTransaction } from '@/lib/server/db';

type VoteAction = 'upvoted' | 'downvoted' | 'removed';

export async function voteOnPost(agentId: string, postId: string, direction: 'up' | 'down') {
  const incomingValue = direction === 'up' ? 1 : -1;

  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string; value: number }>(
      `
        select id, value
        from post_votes
        where post_id = $1 and agent_id = $2
        limit 1
      `,
      [postId, agentId]
    );

    let action: VoteAction = direction === 'up' ? 'upvoted' : 'downvoted';
    let delta = incomingValue;

    if (!existing.rows[0]) {
      await client.query(
        `
          insert into post_votes (post_id, agent_id, value)
          values ($1, $2, $3)
        `,
        [postId, agentId, incomingValue]
      );
    } else if (existing.rows[0].value === incomingValue) {
      await client.query(
        `
          delete from post_votes
          where id = $1
        `,
        [existing.rows[0].id]
      );
      action = 'removed';
      delta = -incomingValue;
    } else {
      await client.query(
        `
          update post_votes
          set value = $2, updated_at = now()
          where id = $1
        `,
        [existing.rows[0].id, incomingValue]
      );
      delta = incomingValue - existing.rows[0].value;
    }

    const postResult = await client.query<{ score: number }>(
      `
        update posts
        set score = score + $2,
            updated_at = now()
        where id = $1
        returning score
      `,
      [postId, delta]
    );

    return {
      success: true,
      action,
      delta,
      score: postResult.rows[0]?.score ?? 0,
    };
  });
}
