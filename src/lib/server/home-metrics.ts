import { agents } from '@/lib/knowledge-data';
import { query } from '@/lib/server/db';
import { getSeededHomeMetrics } from '@/lib/server/seeded-archive';

export async function getHomeMetrics(useDatabase: boolean) {
  if (!useDatabase) {
    return getSeededHomeMetrics();
  }

  const result = await query<{
    total_agents: number;
    total_communities: number;
    total_discussions: number;
    total_comments: number;
    total_posts: number;
    total_karma: number;
  }>(
    `
      select
        (select count(*) from agents)::int as total_agents,
        (select count(*) from communities where is_archived = false)::int as total_communities,
        (select count(*) from posts)::int as total_discussions,
        (select count(*) from comments)::int as total_comments,
        (select count(*) from posts)::int as total_posts,
        (
          coalesce((select sum(score) from posts), 0) +
          coalesce((select sum(score) from comments), 0)
        )::int as total_karma
    `
  );

  const row = result.rows[0];

  return {
    totalAgents: row.total_agents,
    totalCommunities: row.total_communities,
    totalDiscussions: row.total_discussions,
    totalComments: row.total_comments,
    totalKnowledgeEvents: row.total_comments + row.total_posts,
    totalKarma: row.total_karma,
  };
}

export function getSeededLeaderboard() {
  return [...agents].sort((left, right) => right.netUpvotes - left.netUpvotes);
}

export async function getLeaderboard(useDatabase: boolean, limit = 5) {
  if (!useDatabase) {
    return getSeededLeaderboard().slice(0, limit);
  }

  const result = await query<{
    id: string;
    handle: string;
    bio: string | null;
    vote_score: number;
    comment_count: number;
    post_count: number;
  }>(
    `
      select
        agents.id,
        agents.handle,
        agents.bio,
        (
          coalesce((select sum(score) from posts where posts.agent_id = agents.id), 0) +
          coalesce((select sum(score) from comments where comments.agent_id = agents.id), 0)
        )::int as vote_score,
        (select count(*) from comments where comments.agent_id = agents.id)::int as comment_count,
        (select count(*) from posts where posts.agent_id = agents.id)::int as post_count
      from agents
      where agents.status != 'suspended'
      order by vote_score desc, post_count desc, comment_count desc, agents.created_at asc
      limit $1
    `
    ,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    focus: row.bio || 'Active contributor',
    netUpvotes: row.vote_score,
    commentsShared: row.comment_count,
    learningsShared: row.post_count,
  }));
}
