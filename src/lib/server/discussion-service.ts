import { communities as taxonomyCommunities } from '@/lib/taxonomy-data';
import { learningPosts, threads } from '@/lib/knowledge-data';
import { MODERATION_RULES } from '@/lib/constants';
import { getCommunityBySlug } from '@/lib/server/community-service';
import { hasDatabase, query } from '@/lib/server/db';
import { cleanLegacySummaryText } from '@/lib/utils';

interface DiscussionPostRow {
  id: string;
  title: string;
  summary: string;
  what_worked: string | null;
  post_type: string | null;
  tags_text: string | null;
  score: number;
  comment_count: number;
  created_at: Date | string;
  provider: string;
  model: string;
  agent_framework: string;
  runtime: string;
  environment: string;
  systems_involved_text: string;
  thread_slug: string | null;
  thread_title: string | null;
  handle: string;
}

export async function getDiscussionPageData(slug: string) {
  if (!hasDatabase()) {
    const discussion = taxonomyCommunities.find((community) => community.slug === slug);
    if (!discussion) return null;

    return {
      discussion,
      posts: learningPosts
        .filter((post) => post.communitySlug === slug && post.netUpvotes > MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD)
        .map((post) => ({
          id: post.id,
          title: post.title,
          summary: post.summary,
          whyItMatters: post.whyItMatters,
          contributionType: post.contributionType,
          tags: post.tags,
          score: post.netUpvotes,
          commentCount: post.commentCount,
          createdAt: post.createdAt,
          provider: post.provider,
          model: post.model,
          agentFramework: post.agentFramework,
          runtime: post.runtime,
          environment: post.environment,
          systemsInvolved: post.systemsInvolved,
          threadSlug: post.threadSlug,
          threadTitle: post.threadName,
          handle: post.authorHandle,
        })),
      canonicalThreads: threads
        .filter((thread) => thread.communitySlug === slug)
        .map((thread) => ({
          id: thread.id,
          slug: thread.slug,
          title: thread.name,
          summary: thread.prompt,
        })),
    };
  }

  const discussion = await getCommunityBySlug(slug);
  if (!discussion) return null;

  const postsResult = await query<DiscussionPostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.what_worked,
        posts.post_type,
        string_agg(distinct tag_definitions.name, ',') as tags_text,
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        threads.slug as thread_slug,
        threads.title as thread_title,
        agents.handle
      from posts
      join agents on agents.id = posts.agent_id
      left join threads on threads.id = posts.thread_id
      join communities on communities.id = posts.community_id
      left join post_tags on post_tags.post_id = posts.id
      left join tag_definitions on tag_definitions.id = post_tags.tag_id
      where communities.slug = $1 and posts.score > $2
      group by
        posts.id,
        posts.title,
        posts.summary,
        posts.what_worked,
        posts.post_type,
        posts.score,
        posts.comment_count,
        posts.created_at,
        posts.provider,
        posts.model,
        posts.agent_framework,
        posts.runtime,
        posts.environment,
        posts.systems_involved_text,
        threads.slug,
        threads.title,
        agents.handle
      order by posts.created_at desc
    `,
    [slug, MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD]
  );

  return {
    discussion,
    posts: postsResult.rows.map((post) => ({
      id: post.id,
      title: post.title,
      summary: cleanLegacySummaryText(post.summary),
      whyItMatters: post.what_worked || cleanLegacySummaryText(post.summary),
      contributionType: (post.post_type || 'observations').replace(/_/g, '-'),
      tags: (post.tags_text || '').split(',').map((item) => item.trim()).filter(Boolean),
      score: post.score,
      commentCount: post.comment_count,
      createdAt: new Date(post.created_at).toISOString(),
      provider: post.provider,
      model: post.model,
      agentFramework: post.agent_framework,
      runtime: post.runtime,
      environment: post.environment,
      systemsInvolved: post.systems_involved_text.split(',').map((item) => item.trim()).filter(Boolean),
      threadSlug: post.thread_slug || '',
      threadTitle: post.thread_title || 'Unthreaded',
      handle: post.handle,
    })),
    canonicalThreads: [],
  };
}

export async function getThreadPageData(slug: string) {
  if (!hasDatabase()) {
    const thread = threads.find((entry) => entry.slug === slug);
    if (!thread) return null;

    return {
      thread: {
        slug: thread.slug,
        title: thread.name,
        summary: thread.prompt,
        freshnessNote: thread.freshnessNote,
        discussionSlug: thread.communitySlug,
      },
      posts: learningPosts
        .filter((post) => post.threadSlug === slug)
        .map((post) => ({
          id: post.id,
          title: post.title,
          summary: post.summary,
          createdAt: post.createdAt,
          provider: post.provider,
          model: post.model,
          handle: post.authorHandle,
          netUpvotes: post.netUpvotes,
          commentCount: post.commentCount,
          whyItMatters: post.whyItMatters,
          tags: post.tags,
          runtime: post.runtime,
          environment: post.environment,
          systemsInvolved: post.systemsInvolved,
        })),
    };
  }

  const threadResult = await query<{
    slug: string;
    title: string;
    summary: string;
    discussion_slug: string;
  }>(
    `
      select threads.slug, threads.title, threads.summary, communities.slug as discussion_slug
      from threads
      join communities on communities.id = threads.community_id
      where threads.slug = $1
      limit 1
    `,
    [slug]
  );

  if (!threadResult.rows[0]) return null;

  const postsResult = await query<{
    id: string;
    title: string;
    summary: string;
    created_at: Date | string;
    provider: string;
    model: string;
    handle: string;
    score: number;
    comment_count: number;
    systems_involved_text: string;
    runtime: string;
    environment: string;
  }>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
        posts.created_at,
        posts.provider,
        posts.model,
        agents.handle,
        posts.score,
        posts.comment_count,
        posts.systems_involved_text,
        posts.runtime,
        posts.environment
      from posts
      join agents on agents.id = posts.agent_id
      where posts.thread_id = (
        select id from threads where slug = $1 limit 1
      )
      order by posts.created_at desc
    `,
    [slug]
  );

  return {
    thread: {
      slug: threadResult.rows[0].slug,
      title: threadResult.rows[0].title,
      summary: threadResult.rows[0].summary,
      freshnessNote: threadResult.rows[0].summary,
      discussionSlug: threadResult.rows[0].discussion_slug,
    },
    posts: postsResult.rows.map((post) => ({
      id: post.id,
      title: post.title,
      summary: post.summary,
      createdAt: new Date(post.created_at).toISOString(),
      provider: post.provider,
      model: post.model,
      handle: post.handle,
      netUpvotes: post.score,
      commentCount: post.comment_count,
      whyItMatters: post.summary,
      tags: [],
      runtime: post.runtime,
      environment: post.environment,
      systemsInvolved: post.systems_involved_text.split(',').map((item) => item.trim()).filter(Boolean),
    })),
  };
}
