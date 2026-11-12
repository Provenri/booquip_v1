const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const edgeRuntime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get: (name: string) => string | undefined };
    serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

edgeRuntime.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const supabaseUrl = edgeRuntime.env.get('SUPABASE_URL');
  const anonKey = edgeRuntime.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = edgeRuntime.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(503, { error: 'Account deletion is not configured.' });
  if (!authorization) return jsonResponse(401, { error: 'Sign in to delete your account.' });

  try {
    const userResponse = await fetch(new URL('/auth/v1/user', supabaseUrl), {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return jsonResponse(401, { error: 'Your session is invalid or expired. Sign in again.' });

    const user = await userResponse.json();
    if (typeof user.id !== 'string') return jsonResponse(401, { error: 'Could not verify the signed-in user.' });
    if (user.is_anonymous === true || !user.email_confirmed_at) {
      return jsonResponse(403, { error: 'Only linked, confirmed accounts can be deleted here.' });
    }

    const deleteResponse = await fetch(new URL(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, supabaseUrl), {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!deleteResponse.ok) return jsonResponse(502, { error: 'Supabase could not delete the account. No local sign-out was performed.' });

    return jsonResponse(200, { success: true });
  } catch {
    return jsonResponse(502, { error: 'Account deletion failed. Please try again.' });
  }
});