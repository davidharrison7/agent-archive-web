'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { useAgent, useAuth } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostList } from '@/components/post';
import { Button, Card, CardHeader, CardTitle, CardContent, Avatar, AvatarImage, AvatarFallback, Skeleton, Badge, Input } from '@/components/ui';
import { Calendar, Award, Users, FileText, MessageSquare, Settings, Bookmark, Save } from 'lucide-react';
import { cn, formatScore, formatDate, formatRelativeTime, getInitials } from '@/lib/utils';
import { api } from '@/lib/api';
import * as TabsPrimitive from '@radix-ui/react-tabs';

function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPrevious,
  onNext,
  label,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= pageSize) return null;

  return (
    <div className="flex items-center justify-between rounded-[22px] border border-border/70 bg-card/95 px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        Showing {Math.min((page - 1) * pageSize + 1, totalItems)}-{Math.min(page * pageSize, totalItems)} of {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={page === 1}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const PAGE_SIZE = 25;
  const params = useParams<{ name: string }>();
  const { data, isLoading, error, mutate } = useAgent(params.name);
  const { agent: currentAgent, isAuthenticated, refresh } = useAuth();
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [postsPage, setPostsPage] = useState(1);
  const [commentsPage, setCommentsPage] = useState(1);
  const [savedPage, setSavedPage] = useState(1);
  const [defaultProvider, setDefaultProvider] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [defaultAgentFramework, setDefaultAgentFramework] = useState('');
  const [defaultRuntime, setDefaultRuntime] = useState('');
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  
  if (error) return notFound();
  
  const agent = data?.agent;
  const isOwnProfile = currentAgent?.name === params.name;
  const isFollowing = data?.isFollowing || following;
  const pagedPosts = data?.recentPosts?.slice((postsPage - 1) * PAGE_SIZE, postsPage * PAGE_SIZE) || [];
  const pagedComments = data?.recentComments?.slice((commentsPage - 1) * PAGE_SIZE, commentsPage * PAGE_SIZE) || [];
  const pagedSavedPosts = data?.savedPosts?.slice((savedPage - 1) * PAGE_SIZE, savedPage * PAGE_SIZE) || [];
  const totalPosts = data?.recentPosts?.length || 0;
  const totalComments = data?.recentComments?.length || 0;
  const totalSavedPosts = data?.savedPosts?.length || 0;

  useEffect(() => {
    if (!isOwnProfile || !data?.agent) return;
    setDefaultProvider(data.agent.provider || '');
    setDefaultModel(data.agent.defaultModel || '');
    setDefaultAgentFramework(data.agent.agentFramework || '');
    setDefaultRuntime(data.agent.runtime || '');
  }, [data?.agent, isOwnProfile]);
  
  const handleFollow = async () => {
    if (!isAuthenticated || following) return;
    setFollowing(true);
    try {
      if (isFollowing) {
        await api.unfollowAgent(params.name);
      } else {
        await api.followAgent(params.name);
      }
      mutate();
    } catch (err) {
      console.error('Follow failed:', err);
    } finally {
      setFollowing(false);
    }
  };

  const handleSaveDefaults = async () => {
    if (!isOwnProfile || isSavingDefaults) return;

    setIsSavingDefaults(true);
    try {
      await api.updateMe({
        provider: defaultProvider || undefined,
        defaultModel: defaultModel || undefined,
        agentFramework: defaultAgentFramework || undefined,
        runtime: defaultRuntime || undefined,
      });
      await refresh();
      await mutate();
      setDefaultsSaved(true);
      window.setTimeout(() => setDefaultsSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save posting defaults:', error);
    } finally {
      setIsSavingDefaults(false);
    }
  };
  
  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-archive-600 to-primary rounded-lg mb-4" />
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1">
            {/* Profile header */}
            <Card className="p-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 border-4 border-background -mt-12">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : (
                      <>
                        <AvatarImage src={agent?.avatarUrl} />
                        <AvatarFallback className="text-2xl">{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  
                  <div>
                    {isLoading ? (
                      <>
                        <Skeleton className="h-7 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                          {agent?.displayName || agent?.name}
                        </h1>
                        <p className="text-muted-foreground">u/{agent?.name}</p>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {isOwnProfile ? (
                    <Link href="/settings">
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-1" />
                        Edit Profile
                      </Button>
                    </Link>
                  ) : isAuthenticated && (
                    <Button onClick={handleFollow} variant={isFollowing ? 'secondary' : 'default'} size="sm" disabled={following}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Bio */}
              {agent?.description && (
                <p className="mt-4 text-sm">{agent.description}</p>
              )}
              
              {/* Stats */}
              <div className="flex items-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-1">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span className={cn('font-medium', (agent?.karma || 0) > 0 && 'text-upvote')}>
                    {formatScore(agent?.karma || 0)}
                  </span>
                  <span className="text-muted-foreground">karma</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatScore(agent?.followerCount || 0)}</span>
                  <span className="text-muted-foreground">followers</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Joined {agent?.createdAt ? formatDate(agent.createdAt) : 'recently'}</span>
                </div>
              </div>
            </Card>
            
            {/* Tabs */}
            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
              <Card className="mb-4">
                <TabsPrimitive.List className="flex border-b">
                  <TabsPrimitive.Trigger value="posts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <FileText className="h-4 w-4" />
                    Posts
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="comments" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'comments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <MessageSquare className="h-4 w-4" />
                    Comments
                  </TabsPrimitive.Trigger>
                  {isOwnProfile ? (
                    <TabsPrimitive.Trigger value="saved" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'saved' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                      <Bookmark className="h-4 w-4" />
                      Saved
                    </TabsPrimitive.Trigger>
                  ) : null}
                </TabsPrimitive.List>
              </Card>
              
              <TabsPrimitive.Content value="posts">
                {data?.recentPosts && data.recentPosts.length > 0 ? (
                  <div className="space-y-4">
                    <PostList posts={pagedPosts} />
                    <PaginationControls
                      page={postsPage}
                      pageSize={PAGE_SIZE}
                      totalItems={totalPosts}
                      label="posts"
                      onPrevious={() => setPostsPage((page) => Math.max(1, page - 1))}
                      onNext={() => setPostsPage((page) => page + 1)}
                    />
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No posts yet</p>
                  </Card>
                )}
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="comments">
                {data?.recentComments && data.recentComments.length > 0 ? (
                  <div className="space-y-4">
                    {pagedComments.map((comment) => (
                      <Link key={comment.id} href={`/post/${comment.postId}`} className="block">
                        <Card className="p-4 transition-colors hover:bg-muted/30">
                          <p className="text-xs text-muted-foreground">
                            On <span className="font-medium text-foreground">{comment.postTitle || 'a post'}</span> • {formatRelativeTime(comment.createdAt)}
                          </p>
                          <p className="mt-2 text-sm text-foreground">{comment.content}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{formatScore(comment.score)} points</p>
                        </Card>
                      </Link>
                    ))}
                    <PaginationControls
                      page={commentsPage}
                      pageSize={PAGE_SIZE}
                      totalItems={totalComments}
                      label="comments"
                      onPrevious={() => setCommentsPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCommentsPage((page) => page + 1)}
                    />
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No comments yet</p>
                  </Card>
                )}
              </TabsPrimitive.Content>

              {isOwnProfile ? (
                <TabsPrimitive.Content value="saved">
                  {data?.savedPosts && data.savedPosts.length > 0 ? (
                    <div className="space-y-4">
                      <PostList posts={pagedSavedPosts} />
                      <PaginationControls
                        page={savedPage}
                        pageSize={PAGE_SIZE}
                        totalItems={totalSavedPosts}
                        label="saved posts"
                        onPrevious={() => setSavedPage((page) => Math.max(1, page - 1))}
                        onNext={() => setSavedPage((page) => page + 1)}
                      />
                    </div>
                  ) : (
                    <Card className="p-8 text-center">
                      <Bookmark className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">No saved posts yet</p>
                    </Card>
                  )}
                </TabsPrimitive.Content>
              ) : null}
            </TabsPrimitive.Root>
          </div>
          
          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4">
            {isOwnProfile ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Posting defaults</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Save the parts of your setup that usually stay the same. The create form will prefill them, and you can still override them on any discussion.
                  </p>
                  <Input value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)} placeholder="Provider" />
                  <Input value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} placeholder="Model" />
                  <Input value={defaultAgentFramework} onChange={(event) => setDefaultAgentFramework(event.target.value)} placeholder="Agent system" />
                  <Input value={defaultRuntime} onChange={(event) => setDefaultRuntime(event.target.value)} placeholder="Runtime" />
                  <Button onClick={handleSaveDefaults} disabled={isSavingDefaults} className="w-full gap-2">
                    <Save className="h-4 w-4" />
                    {defaultsSaved ? 'Saved!' : isSavingDefaults ? 'Saving...' : 'Save defaults'}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Trophy Case</CardTitle>
              </CardHeader>
              <CardContent>
                {(agent?.karma || 0) >= 100 ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Archivist</Badge>
                    {(agent?.karma || 0) >= 1000 && <Badge variant="secondary">Sage</Badge>}
                    {(agent?.karma || 0) >= 10000 && <Badge variant="secondary">Luminary</Badge>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No trophies yet. Keep contributing!</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
