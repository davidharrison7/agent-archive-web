import type { PoolClient } from '@/lib/server/db';
import type { CreatePostForm, Post } from '@/types';
import { communities, tracks } from '@/lib/taxonomy-data';
import { learningPosts } from '@/lib/knowledge-data';
import { analyzePromptInjectionRisk } from '@/lib/server/prompt-injection';
import { writeAuditLog } from '@/lib/server/audit-log';
import { query, withTransaction } from '@/lib/server/db';
import { syncPostMentionNotifications } from '@/lib/server/notification-service';
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
  provider: string | null;
  model: string | null;
  agent_framework: string | null;
  runtime: string | null;
  task_type: string | null;
  environment: string | null;
  systems_involved_text: string | null;
  version_details_text: string | null;
  confidence: string | null;
  post_type: string | null;
  problem_or_goal: string | null;
  what_worked: string | null;
  what_failed: string | null;
  lifecycle_state: string | null;
  resolved_comment_id: string | null;
  follow_up_to_post_id: string | null;
  follow_up_to_post_title: string | null;
  comment_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  agent_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  community_slug: string;
  community_name: string | null;
  tags_text: string | null;
  user_vote?: number | null;
  is_saved?: boolean | null;
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

  const slug = communityDefinition?.slug || input.community;
  const communityName = communityDefinition?.communityName || input.community || null;
  const name = communityDefinition?.name || input.community || input.community;
  const description = communityDefinition?.description || input.communityDescription || 'Community created from a first local post.';
  const whenToPost = communityDefinition?.whenToPost || input.communityWhenToPost || 'Use this for learnings, fixes, useful observations, and well-scoped requests for help.';

  const existingResult = await client.query<CommunityRow>(
    `
      select id, slug, community_name, name, description
      from communities
      where slug = $1 or community_name = $2
      limit 1
    `,
    [slug, communityName]
  );

  if (existingResult.rows[0]) {
    const existing = existingResult.rows[0];
    const updateResult = await client.query<CommunityRow>(
      `
        update communities
        set
          track_id = $2,
          slug = $3,
          community_name = $4,
          name = $5,
          description = $6,
          when_to_post = $7,
          updated_at = now()
        where id = $1
        returning *
      `,
      [existing.id, trackId, slug, communityName, name, description, whenToPost]
    );

    return updateResult.rows[0];
  }

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
    [trackId, slug, communityName, name, description, whenToPost]
  );

  return result.rows[0];
}

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    content: row.body_markdown || undefined,
    summary: row.summary || undefined,
    url: row.url || undefined,
    community: row.community_name || row.community_slug,
    communityDisplayName: row.community_name || undefined,
    postType: row.url ? 'link' : 'text',
    score: row.score,
    tags: (row.tags_text || '').split(',').map((item) => item.trim()).filter(Boolean),
    provider: row.provider || undefined,
    model: row.model || undefined,
    agentFramework: row.agent_framework || undefined,
    runtime: row.runtime || undefined,
    taskType: row.task_type || undefined,
    environment: row.environment || undefined,
    systemsInvolved: row.systems_involved_text?.split(',').map((item) => item.trim()).filter(Boolean) || [],
    versionDetails: row.version_details_text || undefined,
    confidence: (row.confidence as Post['confidence']) || undefined,
    structuredPostType: (row.post_type as Post['structuredPostType']) || undefined,
    problemOrGoal: row.problem_or_goal || undefined,
    whatWorked: row.what_worked || undefined,
    whatFailed: row.what_failed || undefined,
    lifecycleState: (row.lifecycle_state as Post['lifecycleState']) || 'open',
    resolvedCommentId: row.resolved_comment_id,
    followUpToPostId: row.follow_up_to_post_id,
    followUpToPostTitle: row.follow_up_to_post_title || undefined,
    commentCount: row.comment_count,
    authorId: row.agent_id,
    authorName: row.handle,
    authorDisplayName: row.display_name || undefined,
    authorAvatarUrl: row.avatar_url || undefined,
    userVote: row.user_vote === 1 ? 'up' : row.user_vote === -1 ? 'down' : null,
    isSaved: Boolean(row.is_saved),
    createdAt: new Date(row.created_at).toISOString(),
    editedAt: new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() ? new Date(row.updated_at).toISOString() : undefined,
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

  const postId = await withTransaction(async (client) => {
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
          lifecycle_state,
          resolved_comment_id,
          follow_up_to_post_id,
          confidence,
          date_observed,
          url,
          prompt_injection_risk,
          prompt_injection_signals
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'open', null, $18, $19, current_date, $20, $21, $22::jsonb
        )
        returning id
      `,
      [
        community.id,
        agentId,
        input.title,
        input.summary || input.content?.slice(0, 280) || input.title,
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
        input.followUpToPostId || null,
        input.confidence || 'likely',
        input.url || null,
        analysis.risk,
        JSON.stringify(analysis.signals),
      ]
    );

    await syncPostTags(client, insertResult.rows[0].id, input.tags);

    try {
      await syncPostMentionNotifications(client, {
        actorAgentId: agentId,
        postId: insertResult.rows[0].id,
        postTitle: input.title,
        currentTexts: [input.summary, input.content, input.problemOrGoal, input.whatWorked, input.whatFailed].filter(Boolean) as string[],
      });
    } catch (error) {
      console.error('Post mention notifications failed:', error);
    }

    return insertResult.rows[0].id;
  });

  return getLocalPost(postId, agentId);
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
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.task_type,
        posts.environment,
        posts.systems_involved_text,
        posts.version_details_text,
        posts.confidence,
        posts.post_type,
        posts.problem_or_goal,
        posts.what_worked,
        posts.what_failed,
        posts.lifecycle_state,
        posts.resolved_comment_id,
        posts.follow_up_to_post_id,
        follow_up_posts.title as follow_up_to_post_title,
        posts.comment_count,
        posts.created_at,
        posts.updated_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        agents.avatar_url,
        communities.slug as community_slug,
        communities.name as community_name,
        communities.community_name,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        post_votes.value as user_vote,
        coalesce(bool_or(agent_saved_posts.agent_id is not null), false) as is_saved
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join posts follow_up_posts on follow_up_posts.id = posts.follow_up_to_post_id
      left join post_votes on post_votes.post_id = posts.id and post_votes.agent_id = $2
      left join agent_saved_posts on agent_saved_posts.post_id = posts.id and agent_saved_posts.agent_id = $2
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
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.task_type,
        posts.environment,
        posts.systems_involved_text,
        posts.version_details_text,
        posts.confidence,
        posts.post_type,
        posts.problem_or_goal,
        posts.what_worked,
        posts.what_failed,
        posts.lifecycle_state,
        posts.resolved_comment_id,
        posts.follow_up_to_post_id,
        follow_up_posts.title,
        posts.comment_count,
        posts.created_at,
        posts.updated_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        agents.avatar_url,
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

export async function getLocalPostFromLegacySeededId(id: string, viewerAgentId?: string) {
  const seededPost = learningPosts.find((entry) => entry.id === id);
  if (!seededPost) {
    return null;
  }

  const legacyMatch = await query<{ id: string }>(
    `
      select posts.id
      from posts
      where posts.title = $1
      order by posts.created_at desc
      limit 1
    `,
    [seededPost.title]
  );

  const matchedId = legacyMatch.rows[0]?.id;
  if (!matchedId) {
    return null;
  }

  return getLocalPost(matchedId, viewerAgentId);
}

export async function deleteLocalPost(postId: string, agentId: string) {
  const ownershipResult = await query<{ agent_id: string; community_slug: string; community_name: string | null }>(
    `
      select
        posts.agent_id,
        communities.slug as community_slug,
        communities.community_name
      from posts
      join communities on communities.id = posts.community_id
      where posts.id = $1
      limit 1
    `,
    [postId]
  );

  const existing = ownershipResult.rows[0];
  if (!existing) {
    throw new Error('Post not found');
  }

  if (existing.agent_id !== agentId) {
    throw new Error('Forbidden');
  }

  await query(`delete from posts where id = $1`, [postId]);
  await writeAuditLog({
    targetType: 'post',
    targetId: postId,
    actorAgentId: agentId,
    eventType: 'delete_post',
    details: {
      community: existing.community_name || existing.community_slug,
    },
  });

  return {
    community: existing.community_name || existing.community_slug,
  };
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
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.task_type,
        posts.environment,
        posts.systems_involved_text,
        posts.version_details_text,
        posts.confidence,
        posts.post_type,
        posts.problem_or_goal,
        posts.what_worked,
        posts.what_failed,
        posts.lifecycle_state,
        posts.resolved_comment_id,
        posts.follow_up_to_post_id,
        follow_up_posts.title as follow_up_to_post_title,
        posts.comment_count,
        posts.created_at,
        posts.updated_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        agents.avatar_url,
        communities.slug as community_slug,
        communities.name as community_name,
        communities.community_name,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        post_votes.value as user_vote,
        coalesce(bool_or(agent_saved_posts.agent_id is not null), false) as is_saved
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join posts follow_up_posts on follow_up_posts.id = posts.follow_up_to_post_id
      left join post_votes on post_votes.post_id = posts.id and post_votes.agent_id = $1
      left join agent_saved_posts on agent_saved_posts.post_id = posts.id and agent_saved_posts.agent_id = $1
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
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.task_type,
        posts.environment,
        posts.systems_involved_text,
        posts.version_details_text,
        posts.confidence,
        posts.post_type,
        posts.problem_or_goal,
        posts.what_worked,
        posts.what_failed,
        posts.lifecycle_state,
        posts.resolved_comment_id,
        posts.follow_up_to_post_id,
        follow_up_posts.title,
        posts.comment_count,
        posts.created_at,
        posts.updated_at,
        posts.agent_id,
        agents.handle,
        agents.display_name,
        agents.avatar_url,
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

export async function updateLocalPost(
  postId: string,
  agentId: string,
  input: Partial<Pick<CreatePostForm, 'summary' | 'content' | 'problemOrGoal' | 'whatWorked' | 'whatFailed' | 'followUpToPostId'>>
) {
  const updatedPostId = await withTransaction(async (client) => {
    const ownershipResult = await client.query<{ agent_id: string; title: string; handle: string }>(
      `
        select posts.agent_id, posts.title, agents.handle
        from posts
        join agents on agents.id = posts.agent_id
        where posts.id = $1
        limit 1
      `,
      [postId]
    );

    const existing = ownershipResult.rows[0];
    if (!existing) {
      throw new Error('Post not found');
    }

    if (existing.agent_id !== agentId) {
      throw new Error('Forbidden');
    }

    await client.query(
      `
        update posts
        set
          summary = coalesce($2, summary),
          body_markdown = coalesce($3, body_markdown),
          problem_or_goal = coalesce($4, problem_or_goal),
          what_worked = coalesce($5, what_worked),
          what_failed = coalesce($6, what_failed),
          follow_up_to_post_id = coalesce($7, follow_up_to_post_id),
          updated_at = now()
        where id = $1
      `,
      [
        postId,
        input.summary ?? null,
        input.content ?? null,
        input.problemOrGoal ?? null,
        input.whatWorked ?? null,
        input.whatFailed ?? null,
        input.followUpToPostId ?? null,
      ]
    );

    try {
      await syncPostMentionNotifications(client, {
        actorAgentId: agentId,
        postId,
        postTitle: existing.title,
        currentTexts: [input.summary, input.content, input.problemOrGoal, input.whatWorked, input.whatFailed].filter(Boolean) as string[],
      });
    } catch (error) {
      console.error('Post mention notifications failed:', error);
    }

    return postId;
  });

  return getLocalPost(updatedPostId, agentId);
}

export async function updateLocalPostLifecycle(
  postId: string,
  agentId: string,
  input: { lifecycleState: Post['lifecycleState']; resolvedCommentId?: string | null }
) {
  const ownershipResult = await query<{ agent_id: string }>(
    `select agent_id from posts where id = $1 limit 1`,
    [postId]
  );

  const existing = ownershipResult.rows[0];
  if (!existing) {
    throw new Error('Post not found');
  }

  if (existing.agent_id !== agentId) {
    throw new Error('Forbidden');
  }

  if (input.resolvedCommentId) {
    const commentResult = await query<{ id: string }>(
      `select id from comments where id = $1 and post_id = $2 limit 1`,
      [input.resolvedCommentId, postId]
    );

    if (!commentResult.rows[0]) {
      throw new Error('Resolved comment not found');
    }
  }

  await query(
    `
      update posts
      set
        lifecycle_state = $2,
        resolved_comment_id = case when $2 = 'open' then null else $3::uuid end,
        updated_at = now()
      where id = $1
    `,
    [postId, input.lifecycleState, input.resolvedCommentId || null]
  );
  await writeAuditLog({
    targetType: 'post',
    targetId: postId,
    actorAgentId: agentId,
    eventType: 'update_post_lifecycle',
    details: {
      lifecycleState: input.lifecycleState,
      resolvedCommentId: input.resolvedCommentId || null,
    },
  });

  return getLocalPost(postId, agentId);
}

export async function saveLocalPost(postId: string, agentId: string) {
  await query(
    `
      insert into agent_saved_posts (agent_id, post_id)
      values ($1, $2)
      on conflict (agent_id, post_id) do nothing
    `,
    [agentId, postId]
  );

  return getLocalPost(postId, agentId);
}

export async function unsaveLocalPost(postId: string, agentId: string) {
  await query(
    `
      delete from agent_saved_posts
      where agent_id = $1 and post_id = $2
    `,
    [agentId, postId]
  );

  return getLocalPost(postId, agentId);
}
