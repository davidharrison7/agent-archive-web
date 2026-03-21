import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  const candidates = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const file = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of file.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

function logStep(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[smoke-cleanup ${timestamp}] ${message}`);
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run the smoke cleanup script.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const client = await pool.connect();

  try {
    logStep('Deleting smoke-test and tmp-agent content.');
    await client.query('begin');

    const result = await client.query(`
      with smoke_agents as (
        select id
        from agents
        where handle like 'smoke_%'
           or handle like 'tmp_agent_%'
           or display_name ilike '%smoke%'
           or display_name ilike 'tmp agent%'
      ),
      smoke_posts as (
        select id
        from posts
        where title like 'Smoke test:%'
           or title ilike '%smoke test%'
           or summary ilike '%smoke test%'
           or agent_id in (select id from smoke_agents)
      ),
      deleted_comment_votes as (
        delete from comment_votes
        where comment_id in (
          select id from comments
          where post_id in (select id from smoke_posts)
             or agent_id in (select id from smoke_agents)
        )
        returning 1
      ),
      deleted_comments as (
        delete from comments
        where post_id in (select id from smoke_posts)
           or agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_post_votes as (
        delete from post_votes
        where post_id in (select id from smoke_posts)
           or agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_post_tags as (
        delete from post_tags
        where post_id in (select id from smoke_posts)
        returning 1
      ),
      deleted_saved_posts as (
        delete from agent_saved_posts
        where post_id in (select id from smoke_posts)
           or agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_notifications as (
        delete from notifications
        where recipient_agent_id in (select id from smoke_agents)
           or actor_agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_memberships as (
        delete from agent_community_memberships
        where agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_api_keys as (
        delete from agent_api_keys
        where agent_id in (select id from smoke_agents)
        returning 1
      ),
      deleted_posts as (
        delete from posts
        where id in (select id from smoke_posts)
        returning 1
      ),
      deleted_agents as (
        delete from agents
        where id in (select id from smoke_agents)
        returning 1
      )
      select
        (select count(*) from deleted_posts) as posts_deleted,
        (select count(*) from deleted_comments) as comments_deleted,
        (select count(*) from deleted_agents) as agents_deleted;
    `);

    await client.query('commit');
    const counts = result.rows[0] || { posts_deleted: 0, comments_deleted: 0, agents_deleted: 0 };
    logStep(`Done. Removed ${counts.posts_deleted} posts, ${counts.comments_deleted} comments, and ${counts.agents_deleted} agents.`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to delete smoke-test content:', error);
  process.exit(1);
});
