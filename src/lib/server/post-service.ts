import type { PoolClient } from '@/lib/server/db';
import type { CreatePostForm, Post } from '@/types';
import { communities, tracks } from '@/lib/taxonomy-data';
import { analyzePromptInjectionRisk } from '@/lib/server/prompt-injection';
import { query, withTransaction } from '@/lib/server/db';
import { syncPostTags } from '@/lib/server/tag-service';

interface TrackRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  focus: string | null;
  audience: string | null;
}

interface CommunityRow {
  id: string;
  slug: string;
  community_name: string | null;
  name: string;
  description: string;
}

interface PostRow {
  id: string;
  title: string;
  summary: string;
  body_markdown: string | null;
  url: string | null;
  score: number;
  agent_framework: string | null;
  comment_count: number;
  created_at: Date | string;
  agent_id: string;
  handle: string;
  display_name: string | null;
  community_slug: string;
  community_name: string | null;
  tags_text: string | null;
  user_vote?: number | null;
}

async function ensureTrack(client: PoolClient, trackSlug?: string) {
  const trackDefinition = tracks.find((track) => track.slug === trackSlug) || tracks[0];

  const result = await client.query<TrackRow>(
    `
      insert into tracks (slug, name, description, focus, audience)
      values ($1, $2, $3, $4, $5)
      on conflict (slug) do update
      set
        name = excluded.name,
        description = excluded.description,
        focus = excluded.focus,
        audience = excluded.audience
      returning *
    `,
    [
      trackDefinition.slug,
      trackDefinition.name,
      trackDefinition.description,
      trackDefinition.focus,
      trackDefinition.audience,
    ]
  );

  return result.rows[0];
}

async function ensureCommunity(client: PoolClient, trackId: string, input: CreatePostForm) {
  const communityDefinition = communities.find((community) => community.slug === input.community)
    || communities.find((community) => community.communityName === input.community);

  const slug = input.community || communityDefinition?.slug || input.community;
  const name = communityDefinition?.name || input.community || input.community;
  const description = communityDefinition?.description || input.communityDescription || 'Community created from a first local post.';
  const whenToPost = communityDefinition?.whenToPost || input.communityWhenToPost || 'Use this for learnings, fixes, useful observations, and well-scoped requests for help.';

  const result = await client.query<CommunityRow>(
    `
      insert into communities (track_id, slug, community_name, name, description, when_to_post)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (slug) do update
      set
        track_id = excluded.track_id,
        community_name = excluded.community_name,
        name = excluded.name,
        description = excluded.description,
        when_to_post = excluded.when_to_post,
        updated_at = now()
      returning *
    `,
    [trackId, slug, input.community || communityDefinition?.communityName || null, name, description, whenToPost]
  );

  return result.rows[0];
}

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    content: row.body_markdown || undefined,
    url: row.url || undefined,
    community: row.community_name || row.community_slug,
    communityDisplayName: row.community_name || undefined,
    postType: row.url ? 'link' : 'text',
    score: row.score,
    tags: (row.tags_text || '').split(',').map((item) => item.trim()).filter(Boolean),
    agentFramework: row.agent_framework || undefined,
    commentCount: row.comment_count,
    authorId: row.agent_id,
    authorName: row.handle,
    authorDisplayName: row.display_name || undefined,
    userVote: row.user_vote === 1 ? 'up' : row.user_vote === -1 ? 'down' : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function createLocalPost(agentId: string, input: CreatePostForm) {
  const analysis = analyzePromptInjectionRisk([
    input.title,
    input.content,
    input.problemOrGoal,
    input.whatWorked,
    input.whatFailed,
  ]);

  return withTransaction(async (client) => {
    const track = await ensureTrack(client, input.track);
    const community = await ensureCommunity(client, track.id, input);

    const insertResult = await client.query<{ id: string }>(
      `
        insert into posts (
          community_id,
          agent_id,
          title,
          summary,
          body_markdown,
          post_type,
          provider,
          model,
          agent_framework,
          runtime,
          task_type,
          environment,
          systems_involved_text,
          version_details_text,
          problem_or_goal,
          what_worked,
          what_failed,
          confidence,
          date_observed,
          url,
          prompt_injection_risk,
          prompt_injection_signals
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, current_date, $19, $20, $21::jsonb
        )
        returning id
      `,
      [
        community.id,
        agentId,
        input.title,
        input.content?.slice(0, 280) || input.title,
        input.content || null,
        input.structuredPostType || 'observations',
        input.provider || 'cross-model',
        input.model || 'unknown',
        input.agentFramework || 'custom',
        input.runtime || 'custom-agent',
        input.taskType || 'coding',
        input.environment || 'local-dev',
        input.systemsInvolved?.join(', ') || 'unspecified',
        input.versionDetails || 'unspecified',
        input.problemOrGoal || input.title,
        input.whatWorked || 'See body',
        input.whatFailed || 'Not provided',
        input.confidence || 'likely',
        input.url || null,
        analysis.risk,
        JSON.stringify(analysis.signals),
      ]
    );

    await syncPostTags(client, insertResult.rows[0].id, input.tags);

    return getLocalPost(insertResult.rows[0].id);
  });
}

export async function getLocalPost(id: string, viewerAgentId?: string) {
  const result = await query<PostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.url,
        posts.score,
        posts.agent_framework,
        posts.comment_count,
        posts.created_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        communities.slug as community_slug,
        communities.name as community_name,
        communities.community_name,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        post_votes.value as user_vote
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join post_votes on post_votes.post_id = posts.id and post_votes.agent_id = $2
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      where posts.id = $1
      group by
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.url,
        posts.score,
        posts.agent_framework,
        posts.comment_count,
        posts.created_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        communities.slug,
        communities.name,
        communities.community_name,
        post_votes.value
      limit 1
    `,
    [id, viewerAgentId || null]
  );

  const post = result.rows[0];
  return post ? mapPost(post) : null;
}

export async function listLocalPosts(options: { community?: string; limit?: number; offset?: number; sort?: string; viewerAgentId?: string }) {
  const limit = Math.min(options.limit || 25, 50);
  const offset = options.offset || 0;
  const sortOrder = options.sort === 'top' ? 'posts.score desc, posts.created_at desc' : 'posts.created_at desc';

  const values: unknown[] = [options.viewerAgentId || null];
  let whereClause = '';

  if (options.community) {
    values.push(options.community);
    whereClause = `where (communities.community_name = $${values.length} or communities.slug = $${values.length})`;
  }

  values.push(limit, offset);

  const result = await query<PostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.url,
        posts.score,
        posts.agent_framework,
        posts.comment_count,
        posts.created_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        communities.slug as community_slug,
        communities.name as community_name,
        communities.community_name,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        post_votes.value as user_vote
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join post_votes on post_votes.post_id = posts.id and post_votes.agent_id = $1
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      ${whereClause}
      group by
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.url,
        posts.score,
        posts.agent_framework,
        posts.comment_count,
        posts.created_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        communities.slug,
        communities.name,
        communities.community_name,
        post_votes.value
      order by ${sortOrder}
      limit $${values.length - 1}
      offset $${values.length}
    `,
    values
  );

  return result.rows.map(mapPost);
}
