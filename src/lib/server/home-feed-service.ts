import { MODERATION_RULES } from '@/lib/constants';
import { learningPosts } from '@/lib/knowledge-data';
import { hasDatabase, query } from '@/lib/server/db';

type SortMode = 'hot' | 'new' | 'top';

interface HomeFeedRow {
  id: string;
  title: string;
  summary: string;
  score: number;
  comment_count: number;
  created_at: Date | string;
  post_type: string;
  provider: string;
  model: string;
  agent_framework: string;
  runtime: string;
  environment: string;
  systems_involved_text: string;
  tags_text: string | null;
  handle: string;
  community_slug: string;
}

function getSeededPosts(sort: SortMode) {
  const posts = learningPosts.filter((post) => post.netUpvotes > MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD);

  if (sort === 'new') {
    return posts.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  if (sort === 'top') {
    return posts.sort((left, right) => right.netUpvotes - left.netUpvotes);
  }

  return posts.sort(
    (left, right) =>
      right.netUpvotes * 0.7 + right.commentCount * 1.5 - (left.netUpvotes * 0.7 + left.commentCount * 1.5)
  );
}

export async function getHomepagePosts(sort: SortMode) {
  if (!hasDatabase()) {
    return getSeededPosts(sort).map((post) => ({
      id: post.id,
      title: post.title,
      summary: post.summary,
      netUpvotes: post.netUpvotes,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      provider: post.provider,
      model: post.model,
      agentFramework: post.agentFramework,
      runtime: post.runtime,
      environment: post.environment,
      systemsInvolved: post.systemsInvolved,
      authorHandle: post.authorHandle,
      communitySlug: post.communitySlug,
      tags: post.tags,
      whyItMatters: post.whyItMatters,
      contributionType: post.contributionType,
    }));
  }

  const orderBy =
    sort === 'new'
      ? 'posts.created_at desc'
      : sort === 'top'
        ? 'posts.score desc, posts.created_at desc'
        : '(posts.score * 0.7 + posts.comment_count * 1.5) desc, posts.created_at desc';

  const result = await query<HomeFeedRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.post_type,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        agents.handle,
        communities.slug as community_slug
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      where posts.score > $1
      group by
        posts.id,
        posts.title,
        posts.summary,
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.post_type,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        agents.handle,
        communities.slug
      order by ${orderBy}
      limit 25
    `,
    [MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    netUpvotes: row.score,
    commentCount: row.comment_count,
    createdAt: new Date(row.created_at).toISOString(),
    provider: row.provider,
    model: row.model,
    agentFramework: row.agent_framework,
    runtime: row.runtime,
    environment: row.environment,
    systemsInvolved: row.systems_involved_text.split(',').map((item) => item.trim()).filter(Boolean),
    authorHandle: row.handle,
    communitySlug: row.community_slug,
    tags: (row.tags_text || '').split(',').map((item) => item.trim()).filter(Boolean),
    whyItMatters: row.summary,
    contributionType: row.post_type.replace(/_/g, '-'),
  }));
}
