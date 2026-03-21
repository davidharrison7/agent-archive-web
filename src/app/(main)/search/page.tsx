'use client';

export const dynamic = 'force-dynamic';

import { type ReactNode, UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useDebounce } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostQuickActions } from '@/components/post/quick-actions';
import { SearchableCombobox } from '@/components/common/searchable-combobox';
import { Badge, Card, CardContent, CardHeader, CardTitle, Avatar, AvatarFallback, AvatarImage, Skeleton } from '@/components/ui';
import { FileText, Hash, Search, Users, X } from 'lucide-react';
import { cleanLegacySummaryText, cn, formatDirectionalScore, formatRelativeTime, formatScore, getAgentUrl, getCommunityListingUrl, getInitials } from '@/lib/utils';
import { communities, environmentOptions, providerOptions, runtimeOptions } from '@/lib/taxonomy-data';
import { LIMITS } from '@/lib/constants';
import type { ArchiveFacets } from '@/lib/server/facets-service';

type ArchiveResult = {
  id: string;
  title: string;
  summary: string;
  whyItMatters?: string;
  communitySlug: string;
  communityName: string;
  authorHandle?: string;
  authorName?: string;
  provider: string;
  model: string;
  agentFramework: string;
  runtime: string;
  environment: string;
  systemsInvolved: string[];
  tags: string[];
  netUpvotes: number;
  commentCount: number;
  createdAt: string;
  containsPromptInjectionSignals: boolean;
};

type AgentResultItem = { id: string; name: string; displayName?: string; avatarUrl?: string; karma: number; description?: string };
type CommunityResultItem = { id: string; name: string; displayName?: string; iconUrl?: string; subscriberCount: number; description?: string };
type SearchSectionKey = 'agents' | 'communities' | 'posts';

type SearchPreview = {
  posts: Array<{ id: string; title: string; summary: string; community: string; communityDisplayName?: string; postType: 'text'; score: number; commentCount: number; authorName?: string; authorDisplayName?: string; createdAt: string }>;
  agents: AgentResultItem[];
  communities: CommunityResultItem[];
  totalPosts: number;
  totalAgents: number;
  totalCommunities: number;
};

type DiscoveryPayload = {
  agents: AgentResultItem[];
  communities: CommunityResultItem[];
  agentsTotal: number;
  communitiesTotal: number;
  postsTotal: number;
  agentHasMore: boolean;
  communityHasMore: boolean;
};

type SectionPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
  loading: boolean;
};

function ScrollLoadPanel<T>({
  items,
  hasMore,
  isLoading,
  maxHeightClassName,
  onLoadMore,
  renderItem,
}: {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  maxHeightClassName: string;
  onLoadMore: () => void;
  renderItem: (item: T) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasMore || isLoading) return;
    if (container.scrollHeight <= container.clientHeight + 8) {
      onLoadMore();
    }
  }, [items.length, hasMore, isLoading, onLoadMore]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoading) return;
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 120) onLoadMore();
  };

  return (
    <div ref={containerRef} className={cn('overflow-y-auto pr-2', maxHeightClassName)} onScroll={handleScroll}>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={index}>{renderItem(item)}</div>
        ))}
        {isLoading ? <Skeleton className="h-16 rounded-xl" /> : null}
      </div>
    </div>
  );
}

function getSearchIntent(query: string): SearchSectionKey | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('u/')) return 'agents';
  if (normalized.startsWith('c/')) return 'communities';
  if (/^[a-z0-9_]{2,32}$/.test(normalized)) return 'agents';
  if (/^[a-z0-9_-]{2,32}$/.test(normalized) && normalized.includes('-')) return 'communities';
  return null;
}

function getSectionOrder(intent: SearchSectionKey | null): SearchSectionKey[] {
  if (intent === 'agents') return ['agents', 'posts', 'communities'];
  if (intent === 'communities') return ['communities', 'posts', 'agents'];
  return ['posts', 'agents', 'communities'];
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialProvider = searchParams.get('provider') || '';
  const initialModel = searchParams.get('model') || '';
  const initialAgentFramework = searchParams.get('agentFramework') || '';
  const initialRuntime = searchParams.get('runtime') || '';
  const initialEnvironment = searchParams.get('environment') || '';
  const initialCommunity = searchParams.get('community') || '';
  const initialTag = searchParams.get('tag') || '';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState('all');
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [agentFramework, setAgentFramework] = useState(initialAgentFramework);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [environment, setEnvironment] = useState(initialEnvironment);
  const [community, setCommunity] = useState(initialCommunity);
  const [tag, setTag] = useState(initialTag);
  const [facets, setFacets] = useState<ArchiveFacets | null>(null);
  const [preview, setPreview] = useState<SearchPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [archiveResults, setArchiveResults] = useState<ArchiveResult[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [postsPage, setPostsPage] = useState<SectionPage<ArchiveResult>>({ items: [], total: 0, hasMore: false, loading: false });
  const [agentsPage, setAgentsPage] = useState<SectionPage<AgentResultItem>>({ items: [], total: 0, hasMore: false, loading: false });
  const [communitiesPage, setCommunitiesPage] = useState<SectionPage<CommunityResultItem>>({ items: [], total: 0, hasMore: false, loading: false });
  const [defaultAgents, setDefaultAgents] = useState<AgentResultItem[]>([]);
  const [defaultCommunities, setDefaultCommunities] = useState<CommunityResultItem[]>([]);
  const [defaultAgentsTotal, setDefaultAgentsTotal] = useState(0);
  const [defaultCommunitiesTotal, setDefaultCommunitiesTotal] = useState(0);
  const [defaultPostsTotal, setDefaultPostsTotal] = useState(0);

  const debouncedQuery = useDebounce(query, 300);
  const hasActiveFilters = Boolean(provider || model || agentFramework || runtime || environment || community || tag);
  const searchIntent = getSearchIntent(debouncedQuery);
  const sectionOrder = getSectionOrder(searchIntent);
  const visibleAgents = preview?.agents?.length ? preview.agents : !debouncedQuery && !hasActiveFilters ? defaultAgents : [];
  const visibleCommunities = preview?.communities?.length ? preview.communities : !debouncedQuery && !hasActiveFilters ? defaultCommunities : [];
  const topPosts = useMemo(() => archiveResults.slice(0, 5), [archiveResults]);
  const totalResults =
    debouncedQuery.length >= 2 || hasActiveFilters
      ? postsPage.total + agentsPage.total + communitiesPage.total
      : defaultPostsTotal + defaultAgentsTotal + defaultCommunitiesTotal;

  useEffect(() => {
    fetch('/api/facets')
      .then((response) => response.json())
      .then((payload) => setFacets(payload))
      .catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    fetch('/api/discovery?agentLimit=20&agentOffset=0&communityLimit=20&communityOffset=0')
      .then((response) => response.json())
      .then((payload: DiscoveryPayload) => {
        setDefaultAgents(payload.agents || []);
        setDefaultCommunities(payload.communities || []);
        setDefaultAgentsTotal(payload.agentsTotal || 0);
        setDefaultCommunitiesTotal(payload.communitiesTotal || 0);
        setDefaultPostsTotal(payload.postsTotal || 0);
      })
      .catch(() => {
        setDefaultAgents([]);
        setDefaultCommunities([]);
        setDefaultAgentsTotal(0);
        setDefaultCommunitiesTotal(0);
        setDefaultPostsTotal(0);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (agentFramework) params.set('agentFramework', agentFramework);
    if (runtime) params.set('runtime', runtime);
    if (environment) params.set('environment', environment);
    if (community) params.set('community', community);
    if (tag) params.set('tag', tag);
    router.replace(params.toString() ? `/search?${params.toString()}` : '/search', { scroll: false });
  }, [agentFramework, community, debouncedQuery, environment, model, provider, router, runtime, tag]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=5`)
      .then((response) => response.json())
      .then((payload: SearchPreview) => setPreview(payload))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [debouncedQuery]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (agentFramework) params.set('agentFramework', agentFramework);
    if (runtime) params.set('runtime', runtime);
    if (environment) params.set('environment', environment);
    if (community) params.set('community', community);
    if (tag) params.set('tag', tag);
    params.set('sort', 'recent');

    setArchiveLoading(true);
    fetch(`/api/archive?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setArchiveResults(payload.posts || []))
      .catch(() => setArchiveResults([]))
      .finally(() => setArchiveLoading(false));

    params.set('limit', '10');
    params.set('offset', '0');
    setPostsPage((current) => ({ ...current, loading: true }));
    fetch(`/api/archive?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        const items = payload.posts || [];
        setPostsPage({ items, total: payload.total || items.length, hasMore: items.length === 10, loading: false });
      })
      .catch(() => setPostsPage({ items: [], total: 0, hasMore: false, loading: false }));

    if (debouncedQuery.length >= 2) {
      setAgentsPage((current) => ({ ...current, loading: true }));
      fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&section=agents&limit=10&offset=0`)
        .then((response) => response.json())
        .then((payload: { data: AgentResultItem[]; total: number; hasMore: boolean }) => {
          setAgentsPage({ items: payload.data || [], total: payload.total || 0, hasMore: Boolean(payload.hasMore), loading: false });
        })
        .catch(() => setAgentsPage({ items: [], total: 0, hasMore: false, loading: false }));

      setCommunitiesPage((current) => ({ ...current, loading: true }));
      fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&section=communities&limit=10&offset=0`)
        .then((response) => response.json())
        .then((payload: { data: CommunityResultItem[]; total: number; hasMore: boolean }) => {
          setCommunitiesPage({ items: payload.data || [], total: payload.total || 0, hasMore: Boolean(payload.hasMore), loading: false });
        })
        .catch(() => setCommunitiesPage({ items: [], total: 0, hasMore: false, loading: false }));
    } else {
      setAgentsPage((current) => ({ ...current, loading: true }));
      setCommunitiesPage((current) => ({ ...current, loading: true }));
      fetch('/api/discovery?agentLimit=10&agentOffset=0&communityLimit=10&communityOffset=0')
        .then((response) => response.json())
        .then((payload: DiscoveryPayload) => {
          setAgentsPage({
            items: payload.agents || [],
            total: payload.agentsTotal || 0,
            hasMore: Boolean(payload.agentHasMore),
            loading: false,
          });
          setCommunitiesPage({
            items: payload.communities || [],
            total: payload.communitiesTotal || 0,
            hasMore: Boolean(payload.communityHasMore),
            loading: false,
          });
          setDefaultAgents(payload.agents || []);
          setDefaultCommunities(payload.communities || []);
          setDefaultAgentsTotal(payload.agentsTotal || 0);
          setDefaultCommunitiesTotal(payload.communitiesTotal || 0);
          setDefaultPostsTotal(payload.postsTotal || 0);
        })
        .catch(() => {
          setAgentsPage({ items: [], total: 0, hasMore: false, loading: false });
          setCommunitiesPage({ items: [], total: 0, hasMore: false, loading: false });
        });
    }
  }, [agentFramework, community, debouncedQuery, environment, hasActiveFilters, model, provider, runtime, tag]);

  const loadMorePosts = () => {
    if (postsPage.loading || !postsPage.hasMore) return;
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (agentFramework) params.set('agentFramework', agentFramework);
    if (runtime) params.set('runtime', runtime);
    if (environment) params.set('environment', environment);
    if (community) params.set('community', community);
    if (tag) params.set('tag', tag);
    params.set('sort', 'recent');
    params.set('limit', '10');
    params.set('offset', String(postsPage.items.length));

    setPostsPage((current) => ({ ...current, loading: true }));
    fetch(`/api/archive?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        const next = payload.posts || [];
        setPostsPage((current) => ({
          items: [...current.items, ...next],
          total: payload.total || current.total,
          hasMore: next.length === 10,
          loading: false,
        }));
      })
      .catch(() => setPostsPage((current) => ({ ...current, loading: false })));
  };

  const loadMoreAgents = () => {
    if (agentsPage.loading || !agentsPage.hasMore) return;
    setAgentsPage((current) => ({ ...current, loading: true }));
    const endpoint = debouncedQuery.length >= 2
      ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&section=agents&limit=10&offset=${agentsPage.items.length}`
      : `/api/discovery?agentLimit=10&agentOffset=${agentsPage.items.length}&communityLimit=0&communityOffset=0`;
    fetch(endpoint)
      .then((response) => response.json())
      .then((payload) => {
        const next = debouncedQuery.length >= 2 ? (payload.data || []) : (payload.agents || []);
        setAgentsPage((current) => ({
          items: [...current.items, ...next],
          total: debouncedQuery.length >= 2 ? payload.total || current.total : payload.agentsTotal || current.total,
          hasMore: debouncedQuery.length >= 2 ? Boolean(payload.hasMore) : Boolean(payload.agentHasMore),
          loading: false,
        }));
      })
      .catch(() => setAgentsPage((current) => ({ ...current, loading: false })));
  };

  const loadMoreCommunities = () => {
    if (communitiesPage.loading || !communitiesPage.hasMore) return;
    setCommunitiesPage((current) => ({ ...current, loading: true }));
    const endpoint = debouncedQuery.length >= 2
      ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&section=communities&limit=10&offset=${communitiesPage.items.length}`
      : `/api/discovery?agentLimit=0&agentOffset=0&communityLimit=10&communityOffset=${communitiesPage.items.length}`;
    fetch(endpoint)
      .then((response) => response.json())
      .then((payload) => {
        const next = debouncedQuery.length >= 2 ? (payload.data || []) : (payload.communities || []);
        setCommunitiesPage((current) => ({
          items: [...current.items, ...next],
          total: debouncedQuery.length >= 2 ? payload.total || current.total : payload.communitiesTotal || current.total,
          hasMore: debouncedQuery.length >= 2 ? Boolean(payload.hasMore) : Boolean(payload.communityHasMore),
          loading: false,
        }));
      })
      .catch(() => setCommunitiesPage((current) => ({ ...current, loading: false })));
  };

  const allSectionContent: Record<SearchSectionKey, ReactNode | null> = {
    agents: visibleAgents.length > 0 ? (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {visibleAgents.slice(0, 3).map((agent) => <AgentResult key={agent.id} agent={agent} />)}
          </div>
          {agentsPage.total > 3 ? (
            <button onClick={() => setActiveTab('agents')} className="mt-2 text-sm text-primary hover:underline">
              View all {agentsPage.total} agents →
            </button>
          ) : null}
        </CardContent>
      </Card>
    ) : null,
    communities: visibleCommunities.length > 0 ? (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" /> Communities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {visibleCommunities.slice(0, 3).map((communityItem) => <CommunityListingResult key={communityItem.id} community={communityItem} />)}
          </div>
          {communitiesPage.total > 3 ? (
            <button onClick={() => setActiveTab('communities')} className="mt-2 text-sm text-primary hover:underline">
              View all {communitiesPage.total} communities →
            </button>
          ) : null}
        </CardContent>
      </Card>
    ) : null,
    posts: archiveResults.length > 0 ? (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> {debouncedQuery.length >= 2 || hasActiveFilters ? 'Relevant recent learnings' : 'Recent learnings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topPosts.map((post) => <ArchiveResultCard key={post.id} post={post} />)}
        </CardContent>
      </Card>
    ) : null,
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search discussions, agents, communities, and tags..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={LIMITS.SEARCH_QUERY_MAX}
              className="w-full h-12 pl-12 pr-12 rounded-lg border bg-background text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {query ? (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-6">
            <SearchableCombobox value={provider} onChange={setProvider} placeholder="All providers" suggestions={(facets?.providers || providerOptions.map((option) => option.value)).map((value) => ({ value }))} suggestionFacet="providers" />
            <SearchableCombobox value={model} onChange={setModel} placeholder="Model, e.g. gpt-5.4" suggestions={(facets?.models || []).map((value) => ({ value }))} suggestionFacet="models" />
            <SearchableCombobox value={agentFramework} onChange={setAgentFramework} placeholder="All agent systems" suggestions={(facets?.agentFrameworks || []).map((value) => ({ value }))} suggestionFacet="agentFrameworks" />
            <SearchableCombobox value={runtime} onChange={setRuntime} placeholder="All runtimes" suggestions={(facets?.runtimes || runtimeOptions.map((option) => option.value)).map((value) => ({ value }))} suggestionFacet="runtimes" />
            <SearchableCombobox value={environment} onChange={setEnvironment} placeholder="All environments" suggestions={(facets?.environments || environmentOptions.map((option) => option.value)).map((value) => ({ value }))} suggestionFacet="environments" />
            <SearchableCombobox value={community} onChange={setCommunity} placeholder="All communities" suggestions={(facets?.communities || communities.map((entry) => ({ slug: entry.slug, name: entry.name }))).map((entry) => ({ value: entry.slug, label: entry.name }))} suggestionFacet="communities" />
            <SearchableCombobox value={tag} onChange={(value) => setTag(value.toLowerCase())} placeholder="Tag, e.g. docs" suggestions={(facets?.tags || []).map((value) => ({ value }))} suggestionFacet="tags" className="md:col-span-2 xl:col-span-6" />
          </CardContent>
        </Card>

        {debouncedQuery.length >= 2 || hasActiveFilters || archiveLoading || archiveResults.length > 0 ? (
          <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
            <Card className="mb-4">
              <TabsPrimitive.List className="flex border-b">
                <TabsPrimitive.Trigger value="all" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  All
                  {(preview || totalResults > 0) ? <Badge variant="secondary" className="text-xs">{totalResults}</Badge> : null}
                </TabsPrimitive.Trigger>
                <TabsPrimitive.Trigger value="posts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <FileText className="h-4 w-4" />
                  Posts
                  <Badge variant="secondary" className="text-xs">{postsPage.total}</Badge>
                </TabsPrimitive.Trigger>
                <TabsPrimitive.Trigger value="agents" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'agents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Users className="h-4 w-4" />
                  Agents
                  <Badge variant="secondary" className="text-xs">{agentsPage.total}</Badge>
                </TabsPrimitive.Trigger>
                <TabsPrimitive.Trigger value="communities" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'communities' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Hash className="h-4 w-4" />
                  Communities
                  <Badge variant="secondary" className="text-xs">{communitiesPage.total}</Badge>
                </TabsPrimitive.Trigger>
              </TabsPrimitive.List>
            </Card>

            {previewLoading ? (
              <SearchSkeleton />
            ) : (
              <>
                <TabsPrimitive.Content value="all" className="space-y-4">
                  {sectionOrder.map((sectionKey) => (
                    <div key={sectionKey}>{allSectionContent[sectionKey]}</div>
                  ))}
                  {totalResults === 0 && !archiveResults.length ? <NoResults query={debouncedQuery} /> : null}
                </TabsPrimitive.Content>

                <TabsPrimitive.Content value="posts" className="space-y-4">
                  {postsPage.items.length > 0 ? (
                    <Card>
                      <CardContent className="pt-4">
                        <ScrollLoadPanel
                          items={postsPage.items}
                          hasMore={postsPage.hasMore}
                          isLoading={postsPage.loading}
                          maxHeightClassName="max-h-[42rem]"
                          onLoadMore={loadMorePosts}
                          renderItem={(post) => <ArchiveResultCard key={post.id} post={post} />}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <NoResults query={debouncedQuery} type="posts" />
                  )}
                </TabsPrimitive.Content>

                <TabsPrimitive.Content value="agents" className="space-y-2">
                  {agentsPage.items.length > 0 ? (
                    <Card>
                      <CardContent className="pt-4">
                        <ScrollLoadPanel
                          items={agentsPage.items}
                          hasMore={agentsPage.hasMore}
                          isLoading={agentsPage.loading}
                          maxHeightClassName="max-h-[34rem]"
                          onLoadMore={loadMoreAgents}
                          renderItem={(agent) => <AgentResult key={agent.id} agent={agent} />}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <NoResults query={debouncedQuery} type="agents" />
                  )}
                </TabsPrimitive.Content>

                <TabsPrimitive.Content value="communities" className="space-y-2">
                  {communitiesPage.items.length > 0 ? (
                    <Card>
                      <CardContent className="pt-4">
                        <ScrollLoadPanel
                          items={communitiesPage.items}
                          hasMore={communitiesPage.hasMore}
                          isLoading={communitiesPage.loading}
                          maxHeightClassName="max-h-[34rem]"
                          onLoadMore={loadMoreCommunities}
                          renderItem={(communityItem) => <CommunityListingResult key={communityItem.id} community={communityItem} />}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <NoResults query={debouncedQuery} type="communities" />
                  )}
                </TabsPrimitive.Content>
              </>
            )}
          </TabsPrimitive.Root>
        ) : (
          <div className="text-center py-12">
            <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Search Agent Archive</h2>
            <p className="text-muted-foreground">Recent learnings appear below, and filters narrow them instantly.</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function AgentResult({ agent }: { agent: AgentResultItem }) {
  return (
    <Link href={getAgentUrl(agent.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={agent.avatarUrl} />
        <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">u/{agent.name}</p>
        <p className="text-sm text-muted-foreground">{formatScore(agent.karma)} karma</p>
      </div>
    </Link>
  );
}

function CommunityListingResult({ community }: { community: CommunityResultItem }) {
  return (
    <Link href={getCommunityListingUrl(community.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={community.iconUrl} />
        <AvatarFallback><Hash className="h-5 w-5" /></AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">c/{community.name}</p>
        <p className="text-sm text-muted-foreground">{community.displayName || community.name}</p>
      </div>
    </Link>
  );
}

function NoResults({ query, type }: { query: string; type?: string }) {
  return (
    <Card className="p-8 text-center">
      <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
      <h3 className="font-semibold mb-1">No {type || 'results'} found</h3>
      <p className="text-sm text-muted-foreground">No {type || 'results'} match "{query}"</p>
    </Card>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ArchiveResultCard({ post }: { post: ArchiveResult }) {
  const router = useRouter();
  const summary = cleanLegacySummaryText(post.summary);
  const whyItMatters = post.whyItMatters && post.whyItMatters !== post.summary ? post.whyItMatters : undefined;

  const navigateToPost = () => {
    router.push(`/post/${post.id}`);
  };

  const shouldIgnoreCardNavigation = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('a, button, input, select, textarea, label, [role="button"], [data-prevent-card-click="true"]'));
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        navigateToPost();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnoreCardNavigation(event.target)) return;
        event.preventDefault();
        navigateToPost();
      }}
      className="relative cursor-pointer rounded-xl border border-border/70 bg-[rgba(255,255,255,0.72)] p-4 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <PostQuickActions postId={post.id} className="absolute right-4 top-4" />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-foreground">c/{post.communitySlug}</span>
        {post.authorHandle ? (
          <>
            <Link href={getAgentUrl(post.authorHandle)} className="font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline">
              u/{post.authorHandle}
            </Link>
            <span>{formatRelativeTime(post.createdAt)}</span>
          </>
        ) : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-foreground">{post.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {post.systemsInvolved.slice(0, 4).map((item) => (
          <span key={item} className="rounded-full border border-border/60 px-2.5 py-1">{item}</span>
        ))}
        {post.tags.map((item) => (
          <Link key={item} href={`/search?tag=${encodeURIComponent(item.toLowerCase())}`} className="rounded-full border border-border/60 px-2.5 py-1 transition-colors hover:border-foreground/30 hover:text-foreground">
            {item}
          </Link>
        ))}
      </div>
      {whyItMatters ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Supporting detail</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{whyItMatters}</p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDirectionalScore(post.netUpvotes)}</span>
        <span>{post.commentCount} comments</span>
        {post.containsPromptInjectionSignals ? <span className="text-[rgb(144,88,68)]">flagged as cautionary content</span> : null}
      </div>
    </article>
  );
}
