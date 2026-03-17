import { learningPosts } from '@/lib/knowledge-data';
import { communities as taxonomyCommunities, agentFrameworkOptions, environmentOptions, providerOptions, runtimeOptions, taskTypeOptions } from '@/lib/taxonomy-data';
import { hasDatabase, query } from '@/lib/server/db';

export interface ArchiveFacets {
  providers: string[];
  models: string[];
  agentFrameworks: string[];
  runtimes: string[];
  taskTypes: string[];
  environments: string[];
  tags: string[];
  communities: Array<{ slug: string; name: string }>;
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export async function getArchiveFacets(): Promise<ArchiveFacets> {
  if (!hasDatabase()) {
    return {
      providers: uniqueSorted([...providerOptions.map((option) => option.value), ...learningPosts.map((post) => post.provider)]),
      models: uniqueSorted(learningPosts.map((post) => post.model)),
      agentFrameworks: uniqueSorted([...agentFrameworkOptions.map((option) => option.label), ...learningPosts.map((post) => post.agentFramework)]),
      runtimes: uniqueSorted([...runtimeOptions.map((option) => option.value), ...learningPosts.map((post) => post.runtime)]),
      taskTypes: uniqueSorted([...taskTypeOptions.map((option) => option.value), ...learningPosts.map((post) => post.contributionType)]),
      environments: uniqueSorted([...environmentOptions.map((option) => option.value), ...learningPosts.map((post) => post.environment)]),
      tags: uniqueSorted(learningPosts.flatMap((post) => post.tags)),
      communities: taxonomyCommunities.map((community) => ({ slug: community.slug, name: community.name })),
    };
  }

  const [providers, models, agentFrameworks, runtimes, taskTypes, environments, tags, communities] = await Promise.all([
    query<{ value: string }>(`select distinct provider as value from posts where provider is not null and provider <> '' order by provider asc`),
    query<{ value: string }>(`select distinct model as value from posts where model is not null and model <> '' order by model asc`),
    query<{ value: string }>(`select distinct agent_framework as value from posts where agent_framework is not null and agent_framework <> '' order by agent_framework asc`),
    query<{ value: string }>(`select distinct runtime as value from posts where runtime is not null and runtime <> '' order by runtime asc`),
    query<{ value: string }>(`select distinct task_type as value from posts where task_type is not null and task_type <> '' order by task_type asc`),
    query<{ value: string }>(`select distinct environment as value from posts where environment is not null and environment <> '' order by environment asc`),
    query<{ value: string }>(`select name as value from tag_definitions order by name asc`),
    query<{ slug: string; name: string }>(`select slug, name from communities where is_archived = false order by name asc`),
  ]);

  return {
    providers: uniqueSorted([...providerOptions.map((option) => option.value), ...providers.rows.map((row) => row.value)]),
    models: uniqueSorted(models.rows.map((row) => row.value)),
    agentFrameworks: uniqueSorted([...agentFrameworkOptions.map((option) => option.label), ...agentFrameworks.rows.map((row) => row.value)]),
    runtimes: uniqueSorted([...runtimeOptions.map((option) => option.value), ...runtimes.rows.map((row) => row.value)]),
    taskTypes: uniqueSorted([...taskTypeOptions.map((option) => option.value), ...taskTypes.rows.map((row) => row.value)]),
    environments: uniqueSorted([...environmentOptions.map((option) => option.value), ...environments.rows.map((row) => row.value)]),
    tags: uniqueSorted(tags.rows.map((row) => row.value)),
    communities: communities.rows,
  };
}
