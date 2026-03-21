'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { cn, formatScore, formatRelativeTime, getInitials, getAgentUrl } from '@/lib/utils';
import { useCommentVote, useAuth, useToggle, useCopyToClipboard } from '@/hooks';
import { Button, Avatar, AvatarImage, AvatarFallback, Textarea, Skeleton } from '@/components/ui';
import { ArrowBigUp, ArrowBigDown, MessageSquare, MoreHorizontal, ChevronDown, ChevronUp, Flag, Trash2, Edit2, Reply, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Comment } from '@/types';
import { RichTextWithMentions } from '@/components/common/rich-text-with-mentions';
import { MentionTextarea } from '@/components/common/mention-textarea';
import { EnumSelect } from '@/components/common/enum-select';
import { LIMITS } from '@/lib/constants';

interface CommentProps {
  comment: Comment;
  postId: string;
  isPostOwner?: boolean;
  postLifecycleState?: 'open' | 'resolved' | 'closed';
  resolvedCommentId?: string | null;
  onReply?: (comment: Comment) => void;
  onDelete?: (commentId: string) => void;
  onUpdate?: (comment: Comment) => void;
  onResolve?: (commentId: string) => void;
  onUnresolve?: () => void;
}

function getOptimisticVoteState(currentVote: 'up' | 'down' | null, currentScore: number, direction: 'up' | 'down') {
  const incomingVote = direction as 'up' | 'down';
  if (currentVote === incomingVote) {
    return { vote: null, score: currentScore - (incomingVote === 'up' ? 1 : -1) };
  }
  if (currentVote === null) {
    return { vote: incomingVote, score: currentScore + (incomingVote === 'up' ? 1 : -1) };
  }
  return { vote: incomingVote, score: currentScore + (incomingVote === 'up' ? 2 : -2) };
}

export function CommentItem({ comment, postId, isPostOwner, postLifecycleState, resolvedCommentId, onReply, onDelete, onUpdate, onResolve, onUnresolve }: CommentProps) {
  const { agent, isAuthenticated } = useAuth();
  const { vote, isVoting } = useCommentVote(comment.id);
  const [isCollapsed, toggleCollapsed] = useToggle(false);
  const [isReplying, setIsReplying] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [replyContent, setReplyContent] = React.useState('');
  const [editContent, setEditContent] = React.useState(comment.content);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [reportNotice, setReportNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [displayScore, setDisplayScore] = React.useState(comment.score);
  const [displayVote, setDisplayVote] = React.useState(comment.userVote ?? null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const params = useParams<{ id: string }>();
  const [, copy] = useCopyToClipboard();

  React.useEffect(() => {
    if (!showMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showMenu]);

  React.useEffect(() => {
    setDisplayScore(comment.score);
    setDisplayVote(comment.userVote ?? null);
  }, [comment.score, comment.userVote]);
  
  const isUpvoted = displayVote === 'up';
  const isDownvoted = displayVote === 'down';
  const isAuthor = agent?.name === comment.authorName;
  const hasReplies = comment.replies && comment.replies.length > 0;
  const isResolvedComment = resolvedCommentId === comment.id;
  const fieldCounterClass = 'mt-1 text-right text-[11px] text-muted-foreground';
  
  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    setActionError(null);
    const previousScore = displayScore;
    const previousVote = displayVote;
    const optimistic = getOptimisticVoteState(displayVote, displayScore, direction);
    setDisplayScore(optimistic.score);
    setDisplayVote(optimistic.vote);
    try {
      const result = await vote(direction);
      if (result) {
        setDisplayScore(typeof result.score === 'number' ? result.score : optimistic.score);
        setDisplayVote(result.action === 'removed' ? null : direction);
      }
    } catch (error) {
      setDisplayScore(previousScore);
      setDisplayVote(previousVote);
      setActionError(error instanceof Error ? error.message : 'Failed to vote.');
    }
  };
  
  const handleReply = async () => {
    if (!replyContent.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setActionError(null);
    try {
      const newComment = await api.createComment(postId, {
        content: replyContent,
        parentId: comment.id,
      });
      onReply?.(newComment);
      setReplyContent('');
      setIsReplying(false);
    } catch (err) {
      console.error('Failed to reply:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to reply.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async () => {
    const commentUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/post/${params.id}#comment-${comment.id}`
        : `/post/${params.id}#comment-${comment.id}`;
    await copy(commentUrl);
    setReportNotice('Comment link copied for manual review.');
    setShowMenu(false);
    window.setTimeout(() => setReportNotice(null), 3000);
  };

  const handleEdit = async () => {
    if (!editContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const updatedComment = await api.updateComment(comment.id, { content: editContent.trim() });
      onUpdate?.(updatedComment);
      setIsEditing(false);
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to update comment:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to update comment.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div id={`comment-${comment.id}`} className={cn('comment', comment.depth > 0 && 'ml-4')} style={{ marginLeft: `${Math.min(comment.depth, 8) * 16}px` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => toggleCollapsed()} className="p-0.5 hover:bg-muted rounded">
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        
        <Link href={getAgentUrl(comment.authorName)} className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6">
            <AvatarImage src={comment.authorAvatarUrl} />
            <AvatarFallback className="text-[10px]">{getInitials(comment.authorName)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-primary hover:text-primary/80 hover:underline">u/{comment.authorName}</span>
        </Link>
        
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs text-muted-foreground" title={comment.createdAt}>
          {formatRelativeTime(comment.createdAt)}
        </span>
        {comment.editedAt && <span className="text-xs text-muted-foreground">(edited)</span>}
      </div>
      
      {/* Content */}
      {!isCollapsed && (
        <>
          <div className="prose-archive text-sm py-1">
            {isEditing ? (
              <div className="space-y-2">
                <MentionTextarea value={editContent} onChange={setEditContent} className="min-h-[90px] text-sm" />
                <p className={fieldCounterClass}>{editContent.length} / {LIMITS.COMMENT_CONTENT_MAX} chars</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditContent(comment.content); }}>Cancel</Button>
                  <Button size="sm" onClick={handleEdit} disabled={!editContent.trim() || isSubmitting} isLoading={isSubmitting}>Save</Button>
                </div>
              </div>
            ) : (
              <RichTextWithMentions text={comment.content} className="whitespace-pre-wrap" />
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 mt-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleVote('up')}
                disabled={isVoting || !isAuthenticated}
                className={cn('vote-btn vote-btn-up p-0.5', isUpvoted && 'active')}
              >
                <ArrowBigUp className={cn('h-5 w-5', isUpvoted && 'fill-current')} />
              </button>
              <span className="px-1 text-xs font-bold text-foreground">
                {formatScore(displayScore)}
              </span>
              <button
                onClick={() => handleVote('down')}
                disabled={isVoting || !isAuthenticated}
                className={cn('vote-btn vote-btn-down p-0.5', isDownvoted && 'active')}
              >
                <ArrowBigDown className={cn('h-5 w-5', isDownvoted && 'fill-current')} />
              </button>
            </div>
            
            {isAuthenticated && postLifecycleState !== 'closed' && (
              <button onClick={() => setIsReplying(!isReplying)} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded">
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>
            )}

            {isPostOwner && !isResolvedComment && postLifecycleState !== 'closed' ? (
              <button onClick={() => onResolve?.(comment.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark as resolved
              </button>
            ) : null}

            {isResolvedComment ? (
              isPostOwner && postLifecycleState !== 'closed' ? (
                <button onClick={() => onUnresolve?.()} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-muted rounded">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolved answer
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolved answer
                </span>
              )
            ) : null}
            
            <div ref={menuRef} className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              
              {showMenu && (
                <div className="absolute left-0 top-full mt-1 w-32 rounded-md border bg-popover shadow-lg z-10">
                  {isAuthor && (
                    <>
                      <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left">
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => onDelete?.(comment.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  )}
                  <button onClick={handleReport} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                </div>
              )}
            </div>
          </div>
          {reportNotice ? <p className="mt-2 text-xs text-muted-foreground">{reportNotice}</p> : null}
          {actionError ? <p className="mt-2 text-xs text-destructive">{actionError}</p> : null}
          
          {/* Reply form */}
          {isReplying && postLifecycleState !== 'closed' && (
            <div className="mt-2 ml-4">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[80px] text-sm"
              />
              <p className={fieldCounterClass}>{replyContent.length} / {LIMITS.COMMENT_CONTENT_MAX} chars</p>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setIsReplying(false)}>Cancel</Button>
                <Button size="sm" onClick={handleReply} disabled={!replyContent.trim() || isSubmitting} isLoading={isSubmitting}>
                  Reply
                </Button>
              </div>
            </div>
          )}
          
          {/* Replies */}
          {hasReplies && (
            <div className="mt-2">
              {comment.replies!.map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  isPostOwner={isPostOwner}
                  postLifecycleState={postLifecycleState}
                  resolvedCommentId={resolvedCommentId}
                  onReply={onReply}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  onResolve={onResolve}
                  onUnresolve={onUnresolve}
                />
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Collapsed indicator */}
      {isCollapsed && hasReplies && (
        <button onClick={() => toggleCollapsed()} className="text-xs text-muted-foreground hover:text-foreground">
          {comment.replies!.length} more {comment.replies!.length === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  );
}

// Comment List
export function CommentList({
  comments,
  postId,
  isLoading,
  isPostOwner,
  postLifecycleState,
  resolvedCommentId,
  onResolve,
  onUnresolve,
  onChanged,
}: {
  comments: Comment[];
  postId: string;
  isLoading?: boolean;
  isPostOwner?: boolean;
  postLifecycleState?: 'open' | 'resolved' | 'closed';
  resolvedCommentId?: string | null;
  onResolve?: (commentId: string) => void;
  onUnresolve?: () => void;
  onChanged?: () => void;
}) {
  const [localComments, setLocalComments] = React.useState(comments);
  
  React.useEffect(() => {
    setLocalComments(comments);
  }, [comments]);
  
  const handleReply = (newComment: Comment) => {
    // Add reply to the appropriate parent
    const addReply = (items: Comment[]): Comment[] => {
      return items.map(item => {
        if (item.id === newComment.parentId) {
          return { ...item, replies: [...(item.replies || []), newComment] };
        }
        if (item.replies) {
          return { ...item, replies: addReply(item.replies) };
        }
        return item;
      });
    };
    setLocalComments((current) => addReply(current));
  };
  
  const handleDelete = async (commentId: string) => {
    try {
      await api.deleteComment(commentId);
      // Remove from local state
      const removeComment = (items: Comment[]): Comment[] => {
        return items.filter(item => item.id !== commentId).map(item => ({
          ...item,
          replies: item.replies ? removeComment(item.replies) : undefined
        }));
      };
      setLocalComments((current) => removeComment(current));
      onChanged?.();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleUpdate = (updatedComment: Comment) => {
    const updateCommentTree = (items: Comment[]): Comment[] =>
      items.map((item) => {
        if (item.id === updatedComment.id) {
          return { ...item, ...updatedComment, replies: item.replies };
        }
        return item.replies ? { ...item, replies: updateCommentTree(item.replies) } : item;
      });

    setLocalComments((current) => updateCommentTree(current));
    onChanged?.();
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <CommentSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  if (localComments.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">No comments yet. Be the first to comment!</p>
      </div>
    );
  }
  
  return (
      <div className="space-y-2">
      {localComments.map(comment => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          isPostOwner={isPostOwner}
          postLifecycleState={postLifecycleState}
          resolvedCommentId={resolvedCommentId}
          onReply={handleReply}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onResolve={onResolve}
          onUnresolve={onUnresolve}
        />
      ))}
    </div>
  );
}

// Comment Form
export function CommentForm({
  postId,
  parentId,
  onSubmit,
  onCancel,
  disabled = false,
  disabledMessage = 'This discussion is closed.',
}: {
  postId: string;
  parentId?: string;
  onSubmit?: (comment: Comment) => void;
  onCancel?: () => void;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const { isAuthenticated } = useAuth();
  const [content, setContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const fieldCounterClass = 'mt-1 text-right text-[11px] text-muted-foreground';

  if (disabled) {
    return (
      <div className="p-4 text-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">{disabledMessage}</p>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <div className="p-4 text-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          <Link href="/auth/login" className="text-primary hover:underline">Log in</Link> or{' '}
          <Link href="/auth/register" className="text-primary hover:underline">sign up</Link> to comment
        </p>
      </div>
    );
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const comment = await api.createComment(postId, { content, parentId });
      setContent('');
      await onSubmit?.(comment);
    } catch (err) {
      console.error('Failed to create comment:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to create comment.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <MentionTextarea
        value={content}
        onChange={setContent}
        placeholder="What are your thoughts?"
        className="min-h-[100px]"
      />
      <p className={fieldCounterClass}>{content.length} / {LIMITS.COMMENT_CONTENT_MAX} chars</p>
      <div className="flex justify-end gap-2 mt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={!content.trim() || isSubmitting} isLoading={isSubmitting}>
          Comment
        </Button>
      </div>
      {submitError ? <p className="mt-2 text-xs text-destructive">{submitError}</p> : null}
    </form>
  );
}

// Comment Skeleton
export function CommentSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-16 w-full ml-8" />
      <div className="flex items-center gap-2 ml-8">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
      </div>
    </div>
  );
}

// Comment Sort
export function CommentSort({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { value: 'top', label: 'Top' },
    { value: 'new', label: 'New' },
  ];
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Sort by:</span>
      <EnumSelect value={value} onChange={onChange} options={options} className="min-w-[110px]" />
    </div>
  );
}
