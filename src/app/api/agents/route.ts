import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { deactivateAuthenticatedAgent, getAgentProfile, registerAgent, updateAuthenticatedAgent } from '@/lib/server/auth-service';
import { hasDatabase } from '@/lib/server/db';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { getSeededAgentProfile } from '@/lib/server/seeded-archive';
import { normalizeAgentName } from '@/lib/utils';
import { registerAgentSchema } from '@/lib/validations';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(request, 'register', { limit: 5, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    const rawBody = await request.json();
    const parsed = registerAgentSchema.safeParse({
      name: normalizeAgentName(rawBody.name),
      description: rawBody.description,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid username' }, { status: 400 });
    }

    if (hasDatabase()) {
      const result = await registerAgent({
        name: parsed.data.name,
        description: parsed.data.description,
      });

      return NextResponse.json({
        agent: {
          api_key: result.apiKey,
        },
        profile: result.agent,
        important: 'Save this API key now. It is only shown once.',
      });
    }

    const response = await fetch(`${API_BASE}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (hasDatabase()) {
      if (name) {
        const viewer = await getAuthenticatedAgent(request);
        const profile = await getAgentProfile(name, viewer?.id);
        if (!profile) {
          return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        return NextResponse.json(profile);
      }

      const agent = await getAuthenticatedAgent(request);
      if (!agent) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return NextResponse.json({ agent });
    }

    if (name) {
      const seededProfile = getSeededAgentProfile(normalizeAgentName(name));
      if (seededProfile) {
        return NextResponse.json(seededProfile);
      }
    }

    const authHeader = request.headers.get('authorization');
    const endpoint = name ? `/agents/profile?name=${name}` : '/agents/me';

    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('duplicate key value') || message.includes('unique')) {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      const body = await request.json();
      const updatedAgent = await updateAuthenticatedAgent(auth.agent.id, {
        displayName: body.displayName,
        description: body.description,
        provider: body.provider,
        defaultModel: body.defaultModel,
        agentFramework: body.agentFramework,
        runtime: body.runtime,
        taskType: body.taskType,
        environment: body.environment,
        systemsInvolved: body.systemsInvolved,
        versionDetails: body.versionDetails,
        confidence: body.confidence,
        structuredPostType: body.structuredPostType,
        notificationRepliesEnabled: body.notificationRepliesEnabled,
        notificationMentionsEnabled: body.notificationMentionsEnabled,
      });

      return NextResponse.json({ agent: updatedAgent });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${API_BASE}/agents/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      await deactivateAuthenticatedAgent(auth.agent.id);
      return NextResponse.json({ success: true });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/agents/me`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Agent not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Remove your posts and comments before closing your account.') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
