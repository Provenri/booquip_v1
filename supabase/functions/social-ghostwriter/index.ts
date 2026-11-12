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

  const apiKey = edgeRuntime.env.get('OPENAI_API_KEY');
  const supabaseUrl = edgeRuntime.env.get('SUPABASE_URL');
  const anonKey = edgeRuntime.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!apiKey || !supabaseUrl || !anonKey) return jsonResponse(503, { error: 'Social Ghostwriter is not configured yet.' });
  if (!authorization) return jsonResponse(401, { error: 'Sign in to generate a social draft.' });

  let payload: { bookId?: unknown; platform?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }
  if (!payload || typeof payload !== 'object') return jsonResponse(400, { error: 'Invalid request body.' });

  if (
    typeof payload.bookId !== 'string' || payload.bookId.length < 1 || payload.bookId.length > 100 ||
    (payload.platform !== 'linkedin' && payload.platform !== 'x')
  ) {
    return jsonResponse(400, { error: 'Book or platform is invalid.' });
  }

  const headers = { apikey: anonKey, Authorization: authorization };
  try {
    const swipesUrl = new URL('/rest/v1/user_swipes', supabaseUrl);
    swipesUrl.searchParams.set('select', 'book_id');
    swipesUrl.searchParams.set('book_id', `eq.${payload.bookId}`);
    swipesUrl.searchParams.set('state', 'eq.read');
    const swipeResponse = await fetch(swipesUrl, { headers });
    if (!swipeResponse.ok) return jsonResponse(502, { error: 'Could not verify the book on your Read shelf.' });
    const swipes = await swipeResponse.json();
    if (!Array.isArray(swipes) || swipes.length === 0) {
      return jsonResponse(403, { error: 'Only books on your Read shelf can be used for a post.' });
    }

    const booksUrl = new URL('/rest/v1/books', supabaseUrl);
    booksUrl.searchParams.set('select', 'title,author,published_year,note');
    booksUrl.searchParams.set('id', `eq.${payload.bookId}`);
    booksUrl.searchParams.set('limit', '1');
    const bookResponse = await fetch(booksUrl, { headers });
    if (!bookResponse.ok) return jsonResponse(502, { error: 'Could not load book details.' });
    const books = await bookResponse.json();
    const book = Array.isArray(books) ? books[0] : null;
    if (!book) return jsonResponse(404, { error: 'Book details were not found.' });

    const platformPrompt = payload.platform === 'x'
      ? 'Write one concise X post under 260 characters, including spaces.'
      : 'Write one thoughtful LinkedIn post under 900 characters, with short, readable paragraphs.';
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: edgeRuntime.env.get('OPENAI_SOCIAL_GHOSTWRITER_MODEL') ?? 'gpt-4o',
        temperature: 0.7,
        max_tokens: payload.platform === 'x' ? 140 : 360,
        messages: [
          {
            role: 'system',
            content: `You are BooQuip’s Social Ghostwriter. ${platformPrompt} Write original commentary about why the book’s idea matters now. Use only the supplied book metadata and short take; do not invent facts, quotations, or personal anecdotes. Do not quote or imitate the book. Return only the draft text, with no labels or explanation.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: book.title,
              author: book.author,
              year: book.published_year,
              shortTake: book.note,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!openAiResponse.ok) return jsonResponse(502, { error: 'The AI service could not draft a post. Try again shortly.' });
    const result = await openAiResponse.json();
    const draft = result.choices?.[0]?.message?.content?.trim();
    if (typeof draft !== 'string' || !draft) return jsonResponse(502, { error: 'The AI service returned an empty draft. Try again.' });

    return jsonResponse(200, { draft });
  } catch {
    return jsonResponse(502, { error: 'The AI service is temporarily unavailable. Try again shortly.' });
  }
});