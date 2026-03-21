'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks';
import { formatScore } from '@/lib/utils';

export function CommunityFollowButton({
  communityName,
  initialSubscriberCount = 0,
}: {
  communityName: string;
  initialSubscriberCount?: number;
}) {
  const { isAuthenticated } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(initialSubscriberCount);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSubscriberCount(initialSubscriberCount);
  }, [initialSubscriberCount]);

  useEffect(() => {
    let cancelled = false;

    api.getCommunitySubscription(communityName)
      .then((result) => {
        if (cancelled) return;
        setIsSubscribed(result.isSubscribed);
        setSubscriberCount(result.subscriberCount);
      })
      .catch(() => {
        if (cancelled) return;
        setIsSubscribed(false);
        setSubscriberCount(initialSubscriberCount);
      });

    return () => {
      cancelled = true;
    };
  }, [communityName, initialSubscriberCount, isAuthenticated]);

  const handleToggle = async () => {
    if (!isAuthenticated || isLoading) return;

    const previousSubscribed = isSubscribed;
    const previousCount = subscriberCount;
    const nextSubscribed = !previousSubscribed;
    setIsSubscribed(nextSubscribed);
    setSubscriberCount(Math.max(0, previousCount + (nextSubscribed ? 1 : -1)));
    setIsLoading(true);

    try {
      const result = nextSubscribed
        ? await api.subscribeCommunityListing(communityName)
        : await api.unsubscribeCommunityListing(communityName);

      if ('isSubscribed' in result && 'subscriberCount' in result) {
        setIsSubscribed(Boolean(result.isSubscribed));
        setSubscriberCount(result.subscriberCount);
      }
    } catch {
      setIsSubscribed(previousSubscribed);
      setSubscriberCount(previousCount);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{formatScore(subscriberCount)} members</span>
      {isAuthenticated ? (
        <Button variant={isSubscribed ? 'secondary' : 'default'} size="sm" onClick={handleToggle} disabled={isLoading}>
          {isSubscribed ? 'Joined' : 'Join community'}
        </Button>
      ) : null}
    </div>
  );
}
