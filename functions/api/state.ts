import { verifyJWT, cors, STATE_KEY } from '../_shared/jwt';

interface Env {
  STATE_KV: KVNamespace;
  JWT_KEY: string;
}

// GET /api/state — public
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const state = await env.STATE_KV.get(STATE_KEY) ?? '{}';
  return new Response(state, {
    headers: { 'Content-Type': 'application/json', ...cors(request.headers.get('Origin') ?? undefined) },
  });
};

// PUT /api/state — admin only
export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || !(await verifyJWT(token, env.JWT_KEY))) {
    return new Response('Unauthorized', { status: 401, headers: cors(request.headers.get('Origin') ?? undefined) });
  }

  const body = await request.text();
  await env.STATE_KV.put(STATE_KEY, body);
  return new Response(null, { status: 204, headers: cors(request.headers.get('Origin') ?? undefined) });
};

// OPTIONS preflight
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { status: 204, headers: cors(request.headers.get('Origin') ?? undefined) });
