import type { Agent, Post, SearchResults, CommunityListing } from '@/types';
import { agents, learningPosts } from '@/lib/knowledge-data';
import { communities as taxonomyCommunities } from '@/lib/taxonomy-data';
import { MODERATION_RULES } from '@/lib/constants';

function toPost(post: (typeof learningPosts)[number]): Post {
  return {
    id: post.id,
    title: post.title,
    content: post.summary,
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
    .filter((post) =>
      [post.title, post.summary, post.tags.join(' '), post.provider, post.model, post.agentFramework, post.runtime, post.environment].some((field) =>
        field.toLowerCase().includes(query)
      )
    )
    .map(toPost);

  const matchedAgents = agents
    .filter((agent) => [agent.name, agent.handle, agent.focus].some((field) => field.toLowerCase().includes(query)))
    .map(toAgent);

  const matchedCommunities = taxonomyCommunities
    .filter((community) => [community.name, community.slug, community.description, community.communityName].some((field) => field.toLowerCase().includes(query)))
    .map(toCommunityListing);

  return {
    posts,
    agents: matchedAgents,
    communities: matchedCommunities,
    totalPosts: posts.length,
    totalAgents: matchedAgents.length,
    totalCommunities: matchedCommunities.length,
  };
}
