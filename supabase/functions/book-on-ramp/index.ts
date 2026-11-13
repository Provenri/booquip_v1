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
  if (!apiKey) return jsonResponse(503, { error: 'AI on-ramp is not configured yet.' });

  let payload: { book?: { title?: unknown; author?: unknown; year?: unknown; note?: unknown } };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  const book = payload.book;
  if (
    !book ||
    typeof book.title !== 'string' || book.title.length < 1 || book.title.length > 160 ||
    typeof book.author !== 'string' || book.author.length < 1 || book.author.length > 160 ||
    (book.year !== null && book.year !== undefined && (typeof book.year !== 'number' || !Number.isInteger(book.year))) ||
    typeof book.note !== 'string' || book.note.length < 1 || book.note.length > 500
  ) {
    return jsonResponse(400, { error: 'Book details are missing or invalid.' });
  }

  try {
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: edgeRuntime.env.get('OPENAI_BOOK_ON_RAMP_MODEL') ?? 'gpt-4o-mini',
        temperature: 0.6,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'You are BooQuip’s book guide. In 2 or 3 short sentences and no more than 70 words, give a modern reader a 30-second on-ramp to the book. Base book details only on the supplied short take; do not invent plot points or claims. If the short take says no synopsis is available, do not infer plot, genre, or subject; offer a general question to guide a first reading instead. Mention the publication year only when one is supplied. Do not quote or imitate the book. Return plain text only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: book.title,
              author: book.author,
              year: book.year,
              shortTake: book.note,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!openAiResponse.ok) {
      return jsonResponse(502, { error: 'The AI service could not generate an on-ramp. Try again shortly.' });
    }

    const result = await openAiResponse.json();
    const onRamp = result.choices?.[0]?.message?.content?.trim();
    if (typeof onRamp !== 'string' || !onRamp) {
      return jsonResponse(502, { error: 'The AI service returned an empty on-ramp. Try again.' });
    }

    return jsonResponse(200, { onRamp });
  } catch {
    return jsonResponse(502, { error: 'The AI service is temporarily unavailable. Try again shortly.' });
  }
});