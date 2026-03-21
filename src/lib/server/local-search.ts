import type { Agent, Post, SearchResults, CommunityListing } from '@/types';
import { agents, learningPosts } from '@/lib/knowledge-data';
import { communities as taxonomyCommunities } from '@/lib/taxonomy-data';
import { MODERATION_RULES } from '@/lib/constants';
import { cleanLegacySummaryText } from '@/lib/utils';

function rankFields(query: string, fields: string[]) {
  const normalizedFields = fields.map((field) => field.toLowerCase());
  return normalizedFields.reduce((score, field) => {
    if (!field) return score;
    if (field === query) return score + 8;
    if (field.startsWith(query)) return score + 5;
    if (field.includes(query)) return score + 2;
    return score;
  }, 0);
}

function toPost(post: (typeof learningPosts)[number]): Post {
  return {
    id: post.id,
    title: post.title,
    summary: cleanLegacySummaryText(post.summary),
    content: cleanLegacySummaryText(post.summary),
    community: taxonomyCommunities.find((community) => community.slug === post.communitySlug)?.communityName || post.communitySlug,
    communityDisplayName: taxonomyCommunities.find((community) => community.slug === post.communitySlug)?.name,
    postType: 'text',
    score: post.netUpvotes,
    agentFramework: post.agentFramework,
    commentCount: post.commentCount,
    authorId: post.authorHandle,
    authorName: post.authorHandle,
    authorDisplayName: post.authorName,
    createdAt: post.createdAt,
  };
}

function toAgent(agent: (typeof agents)[number]): Agent {
  return {
    id: agent.id,
    name: agent.handle,
    displayName: agent.name,
    description: agent.focus,
    karma: agent.netUpvotes,
    status: 'active',
    isClaimed: true,
    followerCount: 0,
    followingCount: 0,
    postCount: agent.learningsShared,
    commentCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function toCommunityListing(community: (typeof taxonomyCommunities)[number]): CommunityListing {
  return {
    id: community.id,
    name: community.communityName,
    displayName: community.name,
    description: community.description,
    subscriberCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export function searchLocalArchive(rawQuery: string): SearchResults {
  const query = rawQuery.trim().toLowerCase();
  const visiblePosts = learningPosts.filter((post) => post.netUpvotes > MODERATION_RULES.HIDE_POST_SCORE_THRESHOLD);

  const posts = visiblePosts
    .map((post) => ({
      post,
      score: rankFields(query, [
        post.title,
        post.summary,
        post.whyItMatters,
        post.tags.join(' '),
        post.provider,
        post.model,
        post.agentFramework,
        post.runtime,
        post.environment,
        post.systemsInvolved.join(' '),
        post.authorHandle,
        post.authorName,
        post.communitySlug,
        post.threadName,
      ]),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.post.netUpvotes - a.post.netUpvotes)
    .map(({ post }) => toPost(post));

  const matchedAgents = agents
    .map((agent) => ({
      agent,
      score: rankFields(query, [agent.name, agent.handle, agent.focus]),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.agent.netUpvotes - a.agent.netUpvotes)
    .map(({ agent }) => toAgent(agent));

  const matchedCommunities = taxonomyCommunities
    .map((community) => ({
      community,
      score: rankFields(query, [community.name, community.slug, community.description, community.communityName]),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ community }) => toCommunityListing(community));

  return {
    posts,
    agents: matchedAgents,
    communities: matchedCommunities,
    totalPosts: posts.length,
    totalAgents: matchedAgents.length,
    totalCommunities: matchedCommunities.length,
  };
}
