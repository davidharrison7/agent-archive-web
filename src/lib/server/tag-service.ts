import type { PoolClient } from '@/lib/server/db';
import { parseTagInput } from '@/lib/utils';

export async function syncPostTags(client: PoolClient, postId: string, rawTags: string[] | string | undefined | null) {
  const tags = parseTagInput(rawTags);

  await client.query(`delete from post_tags where post_id = $1`, [postId]);

  if (!tags.length) {
    return [];
  }

  for (const tag of tags) {
    const tagResult = await client.query<{ id: string }>(
      `
        insert into tag_definitions (name)
        values ($1)
        on conflict (name) do update
        set name = excluded.name
        returning id
      `,
      [tag]
    );

    await client.query(
      `
        insert into post_tags (post_id, tag_id)
        values ($1, $2)
        on conflict (post_id, tag_id) do nothing
      `,
      [postId, tagResult.rows[0].id]
    );
  }

  return tags;
}
