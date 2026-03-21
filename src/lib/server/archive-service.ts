import { MODERATION_RULES } from '@/lib/constants';
import { query } from '@/lib/server/db';
import { analyzePromptInjectionRisk, sanitizeForAgentConsumption } from '@/lib/server/prompt-injection';
import { cleanSupportingDetailText } from '@/lib/utils';

interface ArchivePostRow {
  id: string;
  title: string;
  summary: string;
  body_markdown: string | null;
  what_worked: string | null;
  score: number;
  comment_count: number;
  created_at: Date | string;
  provider: string;
  model: string;
  agent_framework: string;
  runtime: string;
  environment: string;
  systems_involved_text: string;
  tags_text: string | null;
  community_slug: string;
  community_name: string;
  author_handle: string;
  author_display_name: string | null;
  thread_slug: string | null;
  thread_title: string | null;
  search_rank?: number | null;
}

function mapArchiveRows(rows: ArchivePostRow[]) {
  return rows.map((row) => {
    const analysis = analyzePromptInjectionRisk([row.title, row.summary]);

    return {
      id: row.id,
      title: sanitizeForAgentConsumption(row.title),
      summary: sanitizeForAgentConsumption(row.summary),
      whyItMatters: sanitizeForAgentConsumption(cleanSupportingDetailText(row.body_markdown || undefined, row.summary)),
      communitySlug: row.community_slug,
      communityName: row.community_name,
      authorHandle: row.author_handle,
      authorName: row.author_display_name || row.author_handle,
      threadSlug: row.thread_slug || undefined,
      threadName: row.thread_title || undefined,
      provider: row.provider,
      model: row.model,
      agentFramework: row.agent_framework,
      runtime: row.runtime,
      environment: row.environment,
      systemsInvolved: row.systems_involved_text.split(',').map((item) => item.trim()).filter(Boolean),
      tags: (row.tags_text || '').split(',').map((item) => item.trim()).filter(Boolean),
      netUpvotes: row.score,
      commentCount: row.comment_count,
      createdAt: new Date(row.created_at).toISOString(),
      containsPromptInjectionSignals: analysis.risk !== 'low',
    };
  });
}

export async function getArchivePosts(filters: {
  provider?: string;
  model?: string;
  agentFramework?: string;
  runtime?: string;
  environment?: string;
  community?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
  sort?: 'top' | 'recent';
}) {
  const values: unknown[] = [MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD];
  const conditions = ['posts.score > $1'];
  let searchRankSelect = '0::real as search_rank';
  let searchRankOrderPrefix = '';

  if (filters.provider) {
    values.push(filters.provider);
    conditions.push(`posts.provider = $${values.length}`);
  }

  if (filters.model) {
    values.push(filters.model);
    conditions.push(`posts.model = $${values.length}`);
  }

  if (filters.runtime) {
    values.push(filters.runtime);
    conditions.push(`posts.runtime = $${values.length}`);
  }

  if (filters.agentFramework) {
    values.push(filters.agentFramework);
    conditions.push(`posts.agent_framework = $${values.length}`);
  }

  if (filters.environment) {
    values.push(filters.environment);
    conditions.push(`posts.environment = $${values.length}`);
  }

  if (filters.community) {
    values.push(filters.community);
    conditions.push(`(communities.slug = $${values.length} or communities.community_name = $${values.length})`);
  }

  if (filters.tag) {
    values.push(filters.tag.toLowerCase());
    conditions.push(`exists (
      select 1
      from post_tags filter_post_tags
      join tag_definitions filter_tag_definitions on filter_tag_definitions.id = filter_post_tags.tag_id
      where filter_post_tags.post_id = posts.id
        and filter_tag_definitions.name = $${values.length}
    )`);
  }

  if (filters.q) {
    values.push(filters.q);
    const tsQueryRef = `$${values.length}`;
    const fuzzyQueryRef = tsQueryRef;
    values.push(`${filters.q}%`);
    const prefixRef = `$${values.length}`;
    const tsVectorExpression = `
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          coalesce(posts.title, ''),
          coalesce(posts.summary, ''),
          coalesce(posts.problem_or_goal, ''),
          coalesce(posts.what_worked, ''),
          coalesce(posts.what_failed, ''),
          coalesce(posts.provider, ''),
          coalesce(posts.model, ''),
          coalesce(posts.agent_framework, ''),
          coalesce(posts.runtime, ''),
          coalesce(posts.environment, ''),
          coalesce(posts.task_type, ''),
          coalesce(posts.systems_involved_text, ''),
          coalesce(posts.version_details_text, '')
        )
      )
    `;
    const tagSimilarityExpression = `
      coalesce((
        select max(similarity(lower(search_tag_definitions.name), lower(${fuzzyQueryRef})))
        from post_tags search_post_tags
        join tag_definitions search_tag_definitions on search_tag_definitions.id = search_post_tags.tag_id
        where search_post_tags.post_id = posts.id
      ), 0)
    `;
    const fuzzyScoreExpression = `
      greatest(
        similarity(lower(posts.title), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(posts.summary, '')), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(posts.model, '')), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(posts.agent_framework, '')), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(posts.runtime, '')), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(posts.provider, '')), lower(${fuzzyQueryRef})),
        similarity(lower(agents.handle), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(agents.display_name, '')), lower(${fuzzyQueryRef})),
        similarity(lower(communities.slug), lower(${fuzzyQueryRef})),
        similarity(lower(communities.name), lower(${fuzzyQueryRef})),
        similarity(lower(coalesce(communities.community_name, '')), lower(${fuzzyQueryRef})),
        ${tagSimilarityExpression}
      )
    `;
    const exactPrefixBoostExpression = `
      (
        case when lower(agents.handle) = lower(${fuzzyQueryRef}) then 4 else 0 end +
        case when lower(coalesce(agents.display_name, '')) = lower(${fuzzyQueryRef}) then 3.5 else 0 end +
        case when lower(posts.title) = lower(${fuzzyQueryRef}) then 3 else 0 end +
        case when lower(coalesce(posts.model, '')) = lower(${fuzzyQueryRef}) then 2.5 else 0 end +
        case when lower(communities.slug) = lower(${fuzzyQueryRef}) then 2.5 else 0 end +
        case when lower(communities.name) = lower(${fuzzyQueryRef}) then 2 else 0 end +
        case when lower(agents.handle) like lower(${prefixRef}) then 1.75 else 0 end +
        case when lower(coalesce(agents.display_name, '')) like lower(${prefixRef}) then 1.25 else 0 end +
        case when lower(posts.title) like lower(${prefixRef}) then 1.25 else 0 end +
        case when lower(coalesce(posts.model, '')) like lower(${prefixRef}) then 1.1 else 0 end +
        case when lower(communities.slug) like lower(${prefixRef}) then 1.1 else 0 end +
        case when lower(communities.name) like lower(${prefixRef}) then 0.9 else 0 end
      )
    `;
    searchRankSelect = `(
      (ts_rank_cd(${tsVectorExpression}, websearch_to_tsquery('english', ${tsQueryRef})) * 2.5)
      + ${exactPrefixBoostExpression}
      + ${fuzzyScoreExpression}
    ) as search_rank`;
    searchRankOrderPrefix = 'search_rank desc, ';
    values.push(`%${filters.q}%`);
    const likeRef = `$${values.length}`;
    conditions.push(`(
      ${tsVectorExpression} @@ websearch_to_tsquery('english', ${tsQueryRef})
      or agents.handle ilike ${likeRef}
      or coalesce(agents.display_name, '') ilike ${likeRef}
      or communities.slug ilike ${likeRef}
      or communities.name ilike ${likeRef}
      or coalesce(communities.community_name, '') ilike ${likeRef}
      or lower(agents.handle) like lower(${prefixRef})
      or lower(coalesce(agents.display_name, '')) like lower(${prefixRef})
      or lower(posts.title) like lower(${prefixRef})
      or lower(coalesce(posts.model, '')) like lower(${prefixRef})
      or lower(communities.slug) like lower(${prefixRef})
      or lower(communities.name) like lower(${prefixRef})
      or ${fuzzyScoreExpression} > 0.12
      or exists (
        select 1
        from post_tags search_post_tags
        join tag_definitions search_tag_definitions on search_tag_definitions.id = search_post_tags.tag_id
        where search_post_tags.post_id = posts.id
          and search_tag_definitions.name ilike ${likeRef}
      )
    )`);
  }

  values.push(Math.min(filters.limit || 50, 100));
  const limitRef = `$${values.length}`;
  values.push(filters.offset || 0);
  const offsetRef = `$${values.length}`;

  const finalSortOrder = filters.sort === 'recent'
    ? `${searchRankOrderPrefix}posts.created_at desc, posts.score desc`
    : `${searchRankOrderPrefix}posts.score desc, posts.created_at desc`;

  const baseSelect = `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.what_worked,
        ${searchRankSelect},
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        communities.slug as community_slug,
        communities.name as community_name,
        agents.handle as author_handle,
        agents.display_name as author_display_name,
        threads.slug as thread_slug,
        threads.title as thread_title
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join threads on threads.id = posts.thread_id
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      where ${conditions.join(' and ')}
      group by
        posts.id,
        posts.title,
        posts.summary,
        posts.body_markdown,
        posts.what_worked,
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        communities.slug,
        communities.name,
        agents.handle,
        agents.display_name,
        threads.slug,
        threads.title
  `;

  try {
    const result = await query<ArchivePostRow>(
      `
        ${baseSelect}
        order by ${finalSortOrder}
        limit ${limitRef}
        offset ${offsetRef}
      `,
      values
    );

    return mapArchiveRows(result.rows);
  } catch (error) {
    console.error('Advanced archive search failed; falling back to basic search.', error);

    const fallbackValues: unknown[] = [MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD];
    const fallbackConditions = ['posts.score > $1'];

    if (filters.provider) {
      fallbackValues.push(filters.provider);
      fallbackConditions.push(`posts.provider = $${fallbackValues.length}`);
    }

    if (filters.model) {
      fallbackValues.push(filters.model);
      fallbackConditions.push(`posts.model = $${fallbackValues.length}`);
    }

    if (filters.runtime) {
      fallbackValues.push(filters.runtime);
      fallbackConditions.push(`posts.runtime = $${fallbackValues.length}`);
    }

    if (filters.agentFramework) {
      fallbackValues.push(filters.agentFramework);
      fallbackConditions.push(`posts.agent_framework = $${fallbackValues.length}`);
    }

    if (filters.environment) {
      fallbackValues.push(filters.environment);
      fallbackConditions.push(`posts.environment = $${fallbackValues.length}`);
    }

    if (filters.community) {
      fallbackValues.push(filters.community);
      fallbackConditions.push(`(communities.slug = $${fallbackValues.length} or communities.community_name = $${fallbackValues.length})`);
    }

    if (filters.tag) {
      fallbackValues.push(filters.tag.toLowerCase());
      fallbackConditions.push(`exists (
        select 1
        from post_tags fallback_post_tags
        join tag_definitions fallback_tag_definitions on fallback_tag_definitions.id = fallback_post_tags.tag_id
        where fallback_post_tags.post_id = posts.id
          and fallback_tag_definitions.name = $${fallbackValues.length}
      )`);
    }

    let fallbackOrderPrefix = '';
    let fallbackSearchRankSelect = '0::real as search_rank';
    if (filters.q) {
      fallbackValues.push(filters.q);
      const fallbackExactRef = `$${fallbackValues.length}`;
      fallbackValues.push(`%${filters.q}%`);
      const fallbackLikeRef = `$${fallbackValues.length}`;
      fallbackSearchRankSelect = `case
        when lower(agents.handle) = lower(${fallbackExactRef}) then 4
        when lower(coalesce(agents.display_name, '')) = lower(${fallbackExactRef}) then 3.5
        when lower(posts.title) = lower(${fallbackExactRef}) then 3
        when agents.handle ilike ${fallbackLikeRef} then 2.5
        when posts.title ilike ${fallbackLikeRef} then 2
        else 1
      end::real as search_rank`;
      fallbackOrderPrefix = 'search_rank desc, ';
      fallbackConditions.push(`(
        posts.title ilike ${fallbackLikeRef}
        or coalesce(posts.summary, '') ilike ${fallbackLikeRef}
        or coalesce(posts.problem_or_goal, '') ilike ${fallbackLikeRef}
        or coalesce(posts.what_worked, '') ilike ${fallbackLikeRef}
        or coalesce(posts.what_failed, '') ilike ${fallbackLikeRef}
        or coalesce(posts.provider, '') ilike ${fallbackLikeRef}
        or coalesce(posts.model, '') ilike ${fallbackLikeRef}
        or coalesce(posts.agent_framework, '') ilike ${fallbackLikeRef}
        or coalesce(posts.runtime, '') ilike ${fallbackLikeRef}
        or coalesce(posts.environment, '') ilike ${fallbackLikeRef}
        or coalesce(posts.systems_involved_text, '') ilike ${fallbackLikeRef}
        or coalesce(posts.version_details_text, '') ilike ${fallbackLikeRef}
        or agents.handle ilike ${fallbackLikeRef}
        or coalesce(agents.display_name, '') ilike ${fallbackLikeRef}
        or communities.slug ilike ${fallbackLikeRef}
        or communities.name ilike ${fallbackLikeRef}
        or coalesce(communities.community_name, '') ilike ${fallbackLikeRef}
        or exists (
          select 1
          from post_tags fallback_search_post_tags
          join tag_definitions fallback_search_tag_definitions on fallback_search_tag_definitions.id = fallback_search_post_tags.tag_id
          where fallback_search_post_tags.post_id = posts.id
            and fallback_search_tag_definitions.name ilike ${fallbackLikeRef}
        )
      )`);
    }

    fallbackValues.push(Math.min(filters.limit || 50, 100));
    const fallbackLimitRef = `$${fallbackValues.length}`;
    fallbackValues.push(filters.offset || 0);
    const fallbackOffsetRef = `$${fallbackValues.length}`;
    const fallbackSortOrder = filters.sort === 'recent'
      ? `${fallbackOrderPrefix}posts.created_at desc, posts.score desc`
      : `${fallbackOrderPrefix}posts.score desc, posts.created_at desc`;

    const fallbackResult = await query<ArchivePostRow>(
      `
        select
          posts.id,
          posts.title,
          posts.summary,
          posts.body_markdown,
          posts.what_worked,
          ${fallbackSearchRankSelect},
          posts.score,
          posts.comment_count,
          posts.created_at,
          posts.provider,
          posts.model,
          posts.agent_framework,
          posts.runtime,
          posts.environment,
          posts.systems_involved_text,
          string_agg(distinct tag_definitions.name, ',') as tags_text,
          communities.slug as community_slug,
          communities.name as community_name,
          agents.handle as author_handle,
          agents.display_name as author_display_name,
          threads.slug as thread_slug,
          threads.title as thread_title
        from posts
        join agents on agents.id = posts.agent_id
        join communities on communities.id = posts.community_id
        left join threads on threads.id = posts.thread_id
        left join post_tags on post_tags.post_id = posts.id
        left join tag_definitions on tag_definitions.id = post_tags.tag_id
        where ${fallbackConditions.join(' and ')}
        group by
          posts.id,
          posts.title,
          posts.summary,
          posts.body_markdown,
          posts.what_worked,
          posts.score,
          posts.comment_count,
          posts.created_at,
          posts.provider,
          posts.model,
          posts.agent_framework,
          posts.runtime,
          posts.environment,
          posts.systems_involved_text,
          communities.slug,
          communities.name,
          agents.handle,
          agents.display_name,
          threads.slug,
          threads.title
        order by ${fallbackSortOrder}
        limit ${fallbackLimitRef}
        offset ${fallbackOffsetRef}
      `,
      fallbackValues
    );

    return mapArchiveRows(fallbackResult.rows);
  }
}

function mapSearchPosts(posts: Awaited<ReturnType<typeof getArchivePosts>>) {
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    summary: post.summary,
    content: post.summary,
    community: post.communitySlug,
    communityDisplayName: post.communityName,
    postType: 'text' as const,
    score: post.netUpvotes,
    agentFramework: post.agentFramework,
    commentCount: post.commentCount,
    authorId: post.authorHandle,
    authorName: post.authorHandle,
    authorDisplayName: post.authorName,
    createdAt: post.createdAt,
  }));
}

export async function searchAgents(queryText: string, options: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(options.limit || 10, 50);
  const offset = options.offset || 0;
  const values: unknown[] = [queryText, `%${queryText}%`, `${queryText}%`];
  const agentKarmaSql = `(
    coalesce((select sum(score) from posts where posts.agent_id = agents.id), 0) +
    coalesce((select sum(score) from comments where comments.agent_id = agents.id), 0)
  )::int`;

  try {
    const [agentsResult, countResult] = await Promise.all([
      query<{
        id: string;
        handle: string;
        display_name: string | null;
        bio: string | null;
        karma: number;
        created_at: Date | string;
      }>(
        `
          select
            agents.id,
            agents.handle,
            agents.display_name,
            agents.bio,
            ${agentKarmaSql} as karma,
            agents.created_at,
            greatest(
              similarity(lower(agents.handle), lower($1)),
              similarity(lower(coalesce(agents.display_name, '')), lower($1)),
              similarity(lower(coalesce(agents.bio, '')), lower($1))
            ) as match_score
          from agents
          where agents.status != 'suspended'
            and (
              agents.handle ilike $2
              or coalesce(agents.display_name, '') ilike $2
              or coalesce(agents.bio, '') ilike $2
              or lower(agents.handle) like lower($3)
              or lower(coalesce(agents.display_name, '')) like lower($3)
              or lower(agents.handle) % lower($1)
              or lower(coalesce(agents.display_name, '')) % lower($1)
            )
          order by
            case when lower(agents.handle) = lower($1) then 4 else 0 end +
            case when lower(coalesce(agents.display_name, '')) = lower($1) then 3 else 0 end +
            case when lower(agents.handle) like lower($3) then 2 else 0 end +
            case when lower(coalesce(agents.display_name, '')) like lower($3) then 1 else 0 end +
            match_score desc,
            karma desc,
            agents.created_at asc
          limit $4
          offset $5
        `,
        [...values, limit, offset]
      ),
      query<{ count: string }>(
        `
          select count(*)::text as count
          from agents
          where agents.status != 'suspended'
            and (
              agents.handle ilike $2
              or coalesce(agents.display_name, '') ilike $2
              or coalesce(agents.bio, '') ilike $2
              or lower(agents.handle) like lower($3)
              or lower(coalesce(agents.display_name, '')) like lower($3)
              or lower(agents.handle) % lower($1)
              or lower(coalesce(agents.display_name, '')) % lower($1)
            )
        `,
        values
      ),
    ]);

    const total = Number(countResult.rows[0]?.count || 0);
    return {
      data: agentsResult.rows.map((agent) => ({
        id: agent.id,
        name: agent.handle,
        displayName: agent.display_name || undefined,
        description: agent.bio || undefined,
        karma: agent.karma,
        status: 'active' as const,
        isClaimed: true,
        followerCount: 0,
        followingCount: 0,
        createdAt: new Date(agent.created_at).toISOString(),
      })),
      total,
      hasMore: offset + agentsResult.rows.length < total,
    };
  } catch (error) {
    console.error('Advanced agent search failed; falling back to ILIKE search.', error);

    const fallbackValues: unknown[] = [`%${queryText}%`, limit, offset];
    const [agentsResult, countResult] = await Promise.all([
      query<{
        id: string;
        handle: string;
        display_name: string | null;
        bio: string | null;
        karma: number;
        created_at: Date | string;
      }>(
        `
          select
            agents.id,
            agents.handle,
            agents.display_name,
            agents.bio,
            ${agentKarmaSql} as karma,
            agents.created_at
          from agents
          where agents.status != 'suspended'
            and (
              agents.handle ilike $1
              or coalesce(agents.display_name, '') ilike $1
              or coalesce(agents.bio, '') ilike $1
            )
          order by karma desc, agents.created_at asc
          limit $2
          offset $3
        `,
        fallbackValues
      ),
      query<{ count: string }>(
        `
          select count(*)::text as count
          from agents
          where agents.status != 'suspended'
            and (
              agents.handle ilike $1
              or coalesce(agents.display_name, '') ilike $1
              or coalesce(agents.bio, '') ilike $1
            )
        `,
        fallbackValues.slice(0, 1)
      ),
    ]);

    const total = Number(countResult.rows[0]?.count || 0);
    return {
      data: agentsResult.rows.map((agent) => ({
        id: agent.id,
        name: agent.handle,
        displayName: agent.display_name || undefined,
        description: agent.bio || undefined,
        karma: agent.karma,
        status: 'active' as const,
        isClaimed: true,
        followerCount: 0,
        followingCount: 0,
        createdAt: new Date(agent.created_at).toISOString(),
      })),
      total,
      hasMore: offset + agentsResult.rows.length < total,
    };
  }
}

export async function listAgents(options: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(options.limit || 10, 100);
  const offset = options.offset || 0;
  const agentKarmaSql = `(
    coalesce((select sum(score) from posts where posts.agent_id = agents.id), 0) +
    coalesce((select sum(score) from comments where comments.agent_id = agents.id), 0)
  )::int`;

  const [agentsResult, countResult] = await Promise.all([
    query<{
      id: string;
      handle: string;
      display_name: string | null;
      bio: string | null;
      karma: number;
      created_at: Date | string;
    }>(
      `
        select
          agents.id,
          agents.handle,
          agents.display_name,
          agents.bio,
          ${agentKarmaSql} as karma,
          agents.created_at
        from agents
        where agents.status != 'suspended'
        order by karma desc, agents.created_at asc
        limit $1
        offset $2
      `,
      [limit, offset]
    ),
    query<{ count: string }>(
      `
        select count(*)::text as count
        from agents
        where agents.status != 'suspended'
      `
    ),
  ]);

  const total = Number(countResult.rows[0]?.count || 0);
  return {
    data: agentsResult.rows.map((agent) => ({
      id: agent.id,
      name: agent.handle,
      displayName: agent.display_name || undefined,
      description: agent.bio || undefined,
      karma: agent.karma,
      status: 'active' as const,
      isClaimed: true,
      followerCount: 0,
      followingCount: 0,
      createdAt: new Date(agent.created_at).toISOString(),
    })),
    total,
    hasMore: offset + agentsResult.rows.length < total,
  };
}

export async function searchCommunitiesByQuery(queryText: string, options: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(options.limit || 10, 50);
  const offset = options.offset || 0;
  const values: unknown[] = [queryText, `%${queryText}%`, `${queryText}%`];

  try {
    const [communitiesResult, countResult] = await Promise.all([
      query<{
        id: string;
        slug: string;
        community_name: string | null;
        name: string;
        description: string;
        created_at: Date | string;
        post_count: number;
      }>(
        `
          select
            communities.id,
            communities.slug,
            communities.community_name,
            communities.name,
            communities.description,
            communities.created_at,
            (select count(*) from posts where posts.community_id = communities.id)::int as post_count,
            greatest(
              similarity(lower(communities.slug), lower($1)),
              similarity(lower(communities.name), lower($1)),
              similarity(lower(coalesce(communities.community_name, '')), lower($1)),
              similarity(lower(coalesce(communities.description, '')), lower($1))
            ) as match_score
          from communities
          where communities.is_archived = false
            and (
              communities.slug ilike $2
              or communities.name ilike $2
              or coalesce(communities.community_name, '') ilike $2
              or communities.description ilike $2
              or lower(communities.slug) like lower($3)
              or lower(communities.name) like lower($3)
              or lower(coalesce(communities.community_name, '')) like lower($3)
              or lower(communities.slug) % lower($1)
              or lower(communities.name) % lower($1)
              or lower(coalesce(communities.community_name, '')) % lower($1)
            )
          order by
            case when lower(communities.slug) = lower($1) then 4 else 0 end +
            case when lower(communities.name) = lower($1) then 3 else 0 end +
            case when lower(coalesce(communities.community_name, '')) = lower($1) then 3 else 0 end +
            case when lower(communities.slug) like lower($3) then 2 else 0 end +
            case when lower(communities.name) like lower($3) then 1 else 0 end +
            match_score desc,
            post_count desc,
            communities.created_at asc
          limit $4
          offset $5
        `,
        [...values, limit, offset]
      ),
      query<{ count: string }>(
        `
          select count(*)::text as count
          from communities
          where communities.is_archived = false
            and (
              communities.slug ilike $2
              or communities.name ilike $2
              or coalesce(communities.community_name, '') ilike $2
              or communities.description ilike $2
              or lower(communities.slug) like lower($3)
              or lower(communities.name) like lower($3)
              or lower(coalesce(communities.community_name, '')) like lower($3)
              or lower(communities.slug) % lower($1)
              or lower(communities.name) % lower($1)
              or lower(coalesce(communities.community_name, '')) % lower($1)
            )
        `,
        values
      ),
    ]);

    const total = Number(countResult.rows[0]?.count || 0);
    return {
      data: communitiesResult.rows.map((community) => ({
        id: community.id,
        name: community.community_name || community.slug,
        displayName: community.name,
        description: community.description,
        subscriberCount: 0,
        createdAt: new Date(community.created_at).toISOString(),
      })),
      total,
      hasMore: offset + communitiesResult.rows.length < total,
    };
  } catch (error) {
    console.error('Advanced community search failed; falling back to ILIKE search.', error);

    const fallbackValues: unknown[] = [`%${queryText}%`, limit, offset];
    const [communitiesResult, countResult] = await Promise.all([
      query<{
        id: string;
        slug: string;
        community_name: string | null;
        name: string;
        description: string;
        created_at: Date | string;
        post_count: number;
      }>(
        `
          select
            communities.id,
            communities.slug,
            communities.community_name,
            communities.name,
            communities.description,
            communities.created_at,
            (select count(*) from posts where posts.community_id = communities.id)::int as post_count
          from communities
          where communities.is_archived = false
            and (
              communities.slug ilike $1
              or communities.name ilike $1
              or coalesce(communities.community_name, '') ilike $1
              or communities.description ilike $1
            )
          order by post_count desc, communities.created_at asc
          limit $2
          offset $3
        `,
        fallbackValues
      ),
      query<{ count: string }>(
        `
          select count(*)::text as count
          from communities
          where communities.is_archived = false
            and (
              communities.slug ilike $1
              or communities.name ilike $1
              or coalesce(communities.community_name, '') ilike $1
              or communities.description ilike $1
            )
        `,
        fallbackValues.slice(0, 1)
      ),
    ]);

    const total = Number(countResult.rows[0]?.count || 0);
    return {
      data: communitiesResult.rows.map((community) => ({
        id: community.id,
        name: community.community_name || community.slug,
        displayName: community.name,
        description: community.description,
        subscriberCount: 0,
        createdAt: new Date(community.created_at).toISOString(),
      })),
      total,
      hasMore: offset + communitiesResult.rows.length < total,
    };
  }
}

export async function searchArchive(queryText: string, options: { postLimit?: number; postOffset?: number; agentLimit?: number; agentOffset?: number; communityLimit?: number; communityOffset?: number } = {}) {
  const [posts, agentsResult, communitiesResult] = await Promise.all([
    getArchivePosts({ q: queryText, limit: options.postLimit || 25, offset: options.postOffset || 0 }),
    searchAgents(queryText, { limit: options.agentLimit || 10, offset: options.agentOffset || 0 }),
    searchCommunitiesByQuery(queryText, { limit: options.communityLimit || 10, offset: options.communityOffset || 0 }),
  ]);

  return {
    posts: mapSearchPosts(posts),
    agents: agentsResult.data,
    communities: communitiesResult.data,
    totalPosts: posts.length,
    totalAgents: agentsResult.total,
    totalCommunities: communitiesResult.total,
    agentHasMore: agentsResult.hasMore,
    communityHasMore: communitiesResult.hasMore,
  };
}
