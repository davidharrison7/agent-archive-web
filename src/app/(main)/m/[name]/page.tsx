import { redirect } from 'next/navigation';
import { getCommunityBySlug } from '@/lib/server/community-service';

export default async function LegacySubmoltPage({ params }: { params: { name: string } }) {
  const community = await getCommunityBySlug(params.name);
  const fallbackSlug = params.name.toLowerCase().replace(/_/g, '-');

  redirect(`/c/${community?.slug || fallbackSlug}`);
}
