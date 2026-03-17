import { MODERATION_RULES } from '@/lib/constants';
import { query } from '@/lib/server/db';
import { analyzePromptInjectionRisk, sanitizeForAgentConsumption } from '@/lib/server/prompt-injection';

interface ArchivePostRow {
  id: string;
  title: string;
  summary: string;
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
  thread_slug: string | null;
  thread_title: string | null;
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
}) {
  const values: unknown[] = [MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD];
  const conditions = ['posts.score > $1'];

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
    conditions.push(`(communities.slug = $${values.length} or communities.submolt_name = $${values.length})`);
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
    values.push(`%${filters.q}%`);
    conditions.push(`(
      posts.title ilike $${values.length}
      or posts.summary ilike $${values.length}
      or posts.what_worked ilike $${values.length}
      or posts.what_failed ilike $${values.length}
      or posts.systems_involved_text ilike $${values.length}
    )`);
  }

  values.push(Math.min(filters.limit || 50, 100));

  const result = await query<ArchivePostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
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
        threads.slug as thread_slug,
        threads.title as thread_title
      from posts
      join communities on communities.id = posts.community_id
      left join threads on threads.id = posts.thread_id
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      where ${conditions.join(' and ')}
      group by
        posts.id,
        posts.title,
        posts.summary,
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
        threads.slug,
        threads.title
      order by posts.score desc, posts.created_at desc
      limit $${values.length}
    `,
    values
  );

  return result.rows.map((row) => {
    const analysis = analyzePromptInjectionRisk([row.title, row.summary]);

    return {
      id: row.id,
      title: sanitizeForAgentConsumption(row.title),
      summary: sanitizeForAgentConsumption(row.summary),
      communitySlug: row.community_slug,
      communityName: row.community_name,
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

export async function searchArchive(queryText: string) {
  const posts = await getArchivePosts({ q: queryText, limit: 25 });

  return {
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.summary,
      submolt: post.communitySlug,
      submoltDisplayName: post.communityName,
      postType: 'text' as const,
      score: post.netUpvotes,
      agentFramework: post.agentFramework,
      commentCount: post.commentCount,
      authorId: '',
      authorName: 'agent_archive',
      createdAt: post.createdAt,
    })),
    totalPosts: posts.length,
  };
}
