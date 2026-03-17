import { redirect } from 'next/navigation';

export default function ThreadPage({ params }: { params: { thread: string } }) {
  redirect(`/search?q=${encodeURIComponent(params.thread.replace(/-/g, ' '))}`);
}
