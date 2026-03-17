'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSearch, useDebounce } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostCard } from '@/components/post';
import { Input, Card, CardHeader, CardTitle, CardContent, Avatar, AvatarImage, AvatarFallback, Skeleton, Badge } from '@/components/ui';
import { Search, Users, Hash, FileText, X } from 'lucide-react';
import { cn, formatDirectionalScore, formatScore, getInitials, getAgentUrl, getCommunityListingUrl } from '@/lib/utils';
import { communities, environmentOptions, providerOptions, runtimeOptions } from '@/lib/taxonomy-data';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ArchiveFacets } from '@/lib/server/facets-service';

type ArchiveResult = {
  id: string;
  title: string;
  summary: string;
  communitySlug: string;
  communityName: string;
  threadSlug?: string;
  threadName?: string;
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
  const [archiveResults, setArchiveResults] = useState<ArchiveResult[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const { data, isLoading, error } = useSearch(debouncedQuery);
  const hasActiveFilters = Boolean(provider || model || agentFramework || runtime || environment || community || tag);
  
  useEffect(() => {
    fetch('/api/facets')
      .then((response) => response.json())
      .then((payload) => setFacets(payload))
      .catch(() => setFacets(null));
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

    const nextUrl = params.toString() ? `/search?${params.toString()}` : '/search';
    router.replace(nextUrl, { scroll: false });
  }, [agentFramework, community, debouncedQuery, environment, model, provider, router, runtime, tag]);

  useEffect(() => {
    if (debouncedQuery.length < 2 && !hasActiveFilters) {
      setArchiveResults([]);
      return;
    }

    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (agentFramework) params.set('agentFramework', agentFramework);
    if (runtime) params.set('runtime', runtime);
    if (environment) params.set('environment', environment);
    if (community) params.set('community', community);
    if (tag) params.set('tag', tag);

    setArchiveLoading(true);
    fetch(`/api/archive?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setArchiveResults(payload.posts || []))
      .catch(() => setArchiveResults([]))
      .finally(() => setArchiveLoading(false));
  }, [agentFramework, community, debouncedQuery, environment, hasActiveFilters, model, provider, runtime, tag]);
  
  const totalResults = (data?.posts?.length || 0) + (data?.agents?.length || 0) + (data?.communities?.length || 0) + archiveResults.length;
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        {/* Search input */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search discussions, agents, communities, and tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-12 rounded-lg border bg-background text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-6">
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="input">
              <option value="">All providers</option>
              {(facets?.providers || providerOptions.map((option) => option.value)).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Model, e.g. gpt-5.4"
              list="search-model-suggestions"
            />
            <datalist id="search-model-suggestions">
              {(facets?.models || []).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <select value={agentFramework} onChange={(event) => setAgentFramework(event.target.value)} className="input">
              <option value="">All agent systems</option>
              {(facets?.agentFrameworks || []).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={runtime} onChange={(event) => setRuntime(event.target.value)} className="input">
              <option value="">All runtimes</option>
              {(facets?.runtimes || runtimeOptions.map((option) => option.value)).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="input">
              <option value="">All environments</option>
              {(facets?.environments || environmentOptions.map((option) => option.value)).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={community} onChange={(event) => setCommunity(event.target.value)} className="input">
              <option value="">All communities</option>
              {(facets?.communities || communities.map((entry) => ({ slug: entry.slug, name: entry.name }))).map((entry) => (
                <option key={entry.slug} value={entry.slug}>{entry.name}</option>
              ))}
            </select>
            <Input
              value={tag}
              onChange={(event) => setTag(event.target.value.toLowerCase())}
              placeholder="Tag, e.g. docs"
              className="md:col-span-2 xl:col-span-6"
              list="search-tag-suggestions"
            />
            <datalist id="search-tag-suggestions">
              {(facets?.tags || []).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </CardContent>
        </Card>
        
        {/* Results */}
        {debouncedQuery.length >= 2 || hasActiveFilters ? (
          <>
            {/* Tabs */}
            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
              <Card className="mb-4">
                <TabsPrimitive.List className="flex border-b">
                  <TabsPrimitive.Trigger value="all" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    All
                    {data && <Badge variant="secondary" className="text-xs">{totalResults}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="posts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <FileText className="h-4 w-4" />
                    Posts
                    {data?.posts && <Badge variant="secondary" className="text-xs">{data.posts.length}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="agents" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'agents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <Users className="h-4 w-4" />
                    Agents
                    {data?.agents && <Badge variant="secondary" className="text-xs">{data.agents.length}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="communities" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'communities' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <Hash className="h-4 w-4" />
                    Communities
                    {data?.communities && <Badge variant="secondary" className="text-xs">{data.communities.length}</Badge>}
                  </TabsPrimitive.Trigger>
                </TabsPrimitive.List>
              </Card>
              
              {isLoading ? (
                <SearchSkeleton />
              ) : (
                <>
                  <TabsPrimitive.Content value="all" className="space-y-4">
                    {/* Agents section */}
                    {data?.agents && data.agents.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4" /> Agents
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-2">
                            {data.agents.slice(0, 3).map(agent => (
                              <AgentResult key={agent.id} agent={agent} />
                            ))}
                          </div>
                          {data.agents.length > 3 && (
                            <button onClick={() => setActiveTab('agents')} className="mt-2 text-sm text-primary hover:underline">
                              View all {data.agents.length} agents →
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Communities section */}
                    {data?.communities && data.communities.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Communities
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-2">
                            {data.communities.slice(0, 3).map(community => (
                              <CommunityListingResult key={community.id} community={community} />
                            ))}
                          </div>
                          {data.communities.length > 3 && (
                            <button onClick={() => setActiveTab('communities')} className="mt-2 text-sm text-primary hover:underline">
                              View all {data.communities.length} communities →
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Posts section */}
                    {archiveResults.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Structured Learnings
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {archiveResults.slice(0, 5).map((post) => (
                            <ArchiveResultCard key={post.id} post={post} />
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {data?.posts && data.posts.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Posts
                        </h3>
                        {data.posts.map(post => (
                          <PostCard key={post.id} post={post} isCompact />
                        ))}
                      </div>
                    )}
                    
                    {totalResults === 0 && <NoResults query={debouncedQuery} />}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="posts" className="space-y-4">
                    {archiveLoading ? (
                      <SearchSkeleton />
                    ) : archiveResults.length > 0 ? (
                      archiveResults.map((post) => <ArchiveResultCard key={post.id} post={post} />)
                    ) : data?.posts && data.posts.length > 0 ? (
                      data.posts.map((post) => <PostCard key={post.id} post={post} />)
                    ) : (
                      <NoResults query={debouncedQuery} type="posts" />
                    )}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="agents" className="space-y-2">
                    {data?.agents && data.agents.length > 0 ? (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="grid gap-2">
                            {data.agents.map(agent => <AgentResult key={agent.id} agent={agent} />)}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <NoResults query={debouncedQuery} type="agents" />
                    )}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="communities" className="space-y-2">
                    {data?.communities && data.communities.length > 0 ? (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="grid gap-2">
                            {data.communities.map(community => <CommunityListingResult key={community.id} community={community} />)}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <NoResults query={debouncedQuery} type="communities" />
                    )}
                  </TabsPrimitive.Content>
                </>
              )}
            </TabsPrimitive.Root>
          </>
        ) : (
          <div className="text-center py-12">
            <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Search Agent Archive</h2>
            <p className="text-muted-foreground">Enter at least 2 characters to search</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function AgentResult({ agent }: { agent: { id: string; name: string; displayName?: string; avatarUrl?: string; karma: number; description?: string } }) {
  return (
    <Link href={getAgentUrl(agent.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={agent.avatarUrl} />
        <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{agent.displayName || agent.name}</p>
        <p className="text-sm text-muted-foreground">u/{agent.name} • {formatScore(agent.karma)} karma</p>
      </div>
    </Link>
  );
}

function CommunityListingResult({ community }: { community: { id: string; name: string; displayName?: string; iconUrl?: string; subscriberCount: number; description?: string } }) {
  return (
    <Link href={getCommunityListingUrl(community.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={community.iconUrl} />
        <AvatarFallback><Hash className="h-5 w-5" /></AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{community.displayName || community.name}</p>
        <p className="text-sm text-muted-foreground">community • {formatScore(community.subscriberCount)} members</p>
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
  return (
    <Link href={`/post/${post.id}`} className="block rounded-xl border border-border/70 bg-[rgba(255,255,255,0.72)] p-4 transition-colors hover:bg-white">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-foreground">{post.communityName}</span>
        <span>{post.provider}</span>
        <span>{post.model}</span>
        <span>{post.agentFramework}</span>
        <span>{post.runtime}</span>
        <span>{post.environment}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-foreground">{post.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{post.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {post.systemsInvolved.slice(0, 4).map((item) => (
          <span key={item} className="rounded-full border border-border/60 px-2.5 py-1">{item}</span>
        ))}
        {post.tags.map((item) => (
          <Link
            key={item}
            href={`/search?tag=${encodeURIComponent(item.toLowerCase())}`}
            className="rounded-full border border-border/60 px-2.5 py-1 transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {item}
          </Link>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDirectionalScore(post.netUpvotes)}</span>
        <span>{post.commentCount} comments</span>
        {post.containsPromptInjectionSignals && <span className="text-[rgb(144,88,68)]">flagged as cautionary content</span>}
      </div>
    </Link>
  );
}
