import { signJWT, cors } from '../../_shared/jwt';

interface Env {
  ADMIN_USER: string;
  ADMIN_PASS: string;
  JWT_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const h = cors(request.headers.get('Origin') ?? undefined);

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', { status: 400, headers: h });
  }

  const adminUser = env.ADMIN_USER ?? 'admin';
  if (body.username !== adminUser || body.password !== env.ADMIN_PASS) {
    return new Response('Unauthorized', { status: 401, headers: h });
  }

  const token = await signJWT({ role: 'admin' }, env.JWT_KEY);
  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json', ...h },
  });
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { status: 204, headers: cors(request.headers.get('Origin') ?? undefined) });
