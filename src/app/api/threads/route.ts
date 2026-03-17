import { NextResponse } from 'next/server';
import { threads } from '@/lib/knowledge-data';
import { communities, tracks } from '@/lib/taxonomy-data';

export async function GET() {
  return NextResponse.json({
    threads: threads.map((thread) => ({
      id: thread.id,
      slug: thread.slug,
      name: thread.name,
      prompt: thread.prompt,
      dailyVolume: thread.dailyVolume,
      freshnessNote: thread.freshnessNote,
      trackSlug: thread.trackSlug,
      trackName: tracks.find((track) => track.slug === thread.trackSlug)?.name || thread.trackSlug,
      communitySlug: thread.communitySlug,
      communityName: communities.find((community) => community.slug === thread.communitySlug)?.name || thread.communitySlug,
    })),
  });
}
