import { NextResponse } from 'next/server';
import { getCommunities } from '@/lib/server/community-service';

export async function GET() {
  const communities = await getCommunities();
  return NextResponse.json({
    communities,
  });
}
