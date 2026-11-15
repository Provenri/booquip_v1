// @ts-ignore Deno requires explicit TypeScript extensions.
import { isQuipStance, isQuipStyle, isRecord, parseQuipIdea, parseQuipResult } from '../_shared/quip.ts';
// @ts-ignore Deno requires explicit TypeScript extensions.
import { buildQuipPrompt, LEGACY_QUIP_PROMPT, QUIP_IDEA_PROMPT } from './prompt.ts';

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
  if (!apiKey || !supabaseUrl || !anonKey) return jsonResponse(503, { error: 'Trend Interceptor is not configured yet.' });
  if (!authorization) return jsonResponse(401, { error: 'Sign in to generate a trend reply.' });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }
  if (!isRecord(payload)) return jsonResponse(400, { error: 'Invalid request body.' });
  if (payload.mode !== undefined && payload.mode !== 'idea') {
    return jsonResponse(400, { error: 'The Quip operation is invalid.' });
  }
  const isIdea = payload.mode === 'idea';
  if (isIdea && (payload.trendText !== undefined || payload.trendTopicId !== undefined ||
    payload.stance !== undefined || payload.style !== undefined || payload.includeRelevance !== undefined)) {
    return jsonResponse(400, { error: 'Idea generation accepts selected books only.' });
  }
  if (!isIdea && (
    typeof payload.trendText !== 'string' || payload.trendText.trim().length < 1 || payload.trendText.length > 2000 ||
    (payload.trendTopicId !== undefined && (typeof payload.trendTopicId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.trendTopicId)))
  )) {
    return jsonResponse(400, { error: 'Pasted text is invalid.' });
  }
  if (payload.bookIds !== undefined && (
    !Array.isArray(payload.bookIds) || payload.bookIds.length < 1 || payload.bookIds.length > 200 ||
    payload.bookIds.some((bookId) => typeof bookId !== 'string' || bookId.length < 1 || bookId.length > 120)
  )) {
    return jsonResponse(400, { error: 'The selected books are invalid.' });
  }
  const requestedBookIds = Array.isArray(payload.bookIds) ? payload.bookIds.filter((id): id is string => typeof id === 'string') : undefined;
  if (requestedBookIds && new Set(requestedBookIds).size !== requestedBookIds.length) {
    return jsonResponse(400, { error: 'The selected books contain duplicates.' });
  }
  if (
    (payload.stance !== undefined && !isQuipStance(payload.stance)) ||
    (payload.style !== undefined && !isQuipStyle(payload.style)) ||
    (payload.includeRelevance !== undefined && typeof payload.includeRelevance !== 'boolean')
  ) {
    return jsonResponse(400, { error: 'The selected stance, style, or relevance option is invalid.' });
  }
  const includeRelevance = payload.includeRelevance === true;
  if ((includeRelevance || isIdea) && !requestedBookIds) {
    return jsonResponse(400, { error: 'Select the books to include in this Quip.' });
  }
  const stance = isQuipStance(payload.stance) ? payload.stance : 'neutral';
  const style = isQuipStyle(payload.style) ? payload.style : 'natural';
  if (!includeRelevance && (stance !== 'neutral' || style !== 'natural')) {
    return jsonResponse(400, { error: 'Stance and style require the updated Quip response format.' });
  }

  const headers = { apikey: anonKey, Authorization: authorization };
  try {
    const swipesUrl = new URL('/rest/v1/user_swipes', supabaseUrl);
    swipesUrl.searchParams.set('select', 'book_id');
    swipesUrl.searchParams.set('state', 'eq.read');
    swipesUrl.searchParams.set('quip_enabled', 'eq.true');
    if (requestedBookIds) {
      swipesUrl.searchParams.set('book_id', `in.(${requestedBookIds.map((bookId) => JSON.stringify(bookId)).join(',')})`);
    }
    const swipeResponse = await fetch(swipesUrl, { headers });
    if (!swipeResponse.ok) return jsonResponse(502, { error: 'Could not verify the book on your Read shelf.' });
    const swipes: unknown = await swipeResponse.json();
    if (!Array.isArray(swipes) || !swipes.every((swipe) => isRecord(swipe) && typeof swipe.book_id === 'string')) {
      return jsonResponse(502, { error: 'Could not verify the selected Read books.' });
    }
    if (swipes.length === 0) {
      return jsonResponse(403, { error: 'Turn Quip on for a Read book before drafting a reply.' });
    }
    const bookIds = swipes.map((swipe: { book_id: string }) => swipe.book_id);
    if (requestedBookIds && (bookIds.length !== requestedBookIds.length || requestedBookIds.some((id) => !bookIds.includes(id)))) {
      return jsonResponse(409, { error: 'Some selected books are no longer Quip-enabled on your Read shelf. Refresh and try again.' });
    }

    const booksUrl = new URL('/rest/v1/books', supabaseUrl);
    booksUrl.searchParams.set('select', 'id,title,author,published_year,note');
    booksUrl.searchParams.set('id', `in.(${bookIds.map((bookId) => JSON.stringify(bookId)).join(',')})`);
    const bookResponse = await fetch(booksUrl, { headers });
    if (!bookResponse.ok) return jsonResponse(502, { error: 'Could not load book details.' });
    type BookContext = { id: string; title: string; author: string; published_year: number | null; note: string };
    const bookData: unknown = await bookResponse.json();
    if (!Array.isArray(bookData) || !bookData.every((book): book is BookContext =>
      isRecord(book) && typeof book.id === 'string' && typeof book.title === 'string' &&
      typeof book.author === 'string' && typeof book.note === 'string' &&
      (typeof book.published_year === 'number' || book.published_year === null)
    )) return jsonResponse(502, { error: 'Some Read-shelf book details were invalid.' });
    const books = bookData;
    if (books.length !== bookIds.length || new Set(books.map((book) => book.id)).size !== bookIds.length ||
      books.some((book) => !bookIds.includes(book.id))) {
      return jsonResponse(404, { error: 'Some Read-shelf book details were not found.' });
    }

    let selectedTrend: Record<string, unknown> | null = null;
    let relatedNews: Array<Record<string, unknown>> = [];
    if (typeof payload.trendTopicId === 'string') {
      const trendUrl = new URL('/rest/v1/quip_trend_topics', supabaseUrl);
      trendUrl.searchParams.set('select', 'id,country_code,topic,approx_traffic,published_at,expires_at');
      trendUrl.searchParams.set('id', `eq.${payload.trendTopicId}`);
      trendUrl.searchParams.set('expires_at', `gt.${new Date().toISOString()}`);
      trendUrl.searchParams.set('limit', '1');
      const trendResponse = await fetch(trendUrl, { headers });
      if (!trendResponse.ok) return jsonResponse(502, { error: 'Could not load the selected trend.' });
      const trends = await trendResponse.json();
      selectedTrend = Array.isArray(trends) ? trends[0] ?? null : null;
      if (!selectedTrend) return jsonResponse(409, { error: 'That trend has expired. Choose a recent topic and try again.' });

      const newsUrl = new URL('/rest/v1/quip_trend_news_items', supabaseUrl);
      newsUrl.searchParams.set('select', 'headline,snippet,source_name');
      newsUrl.searchParams.set('trend_topic_id', `eq.${payload.trendTopicId}`);
      newsUrl.searchParams.set('order', 'position.asc');
      newsUrl.searchParams.set('limit', '3');
      const newsResponse = await fetch(newsUrl, { headers });
      if (!newsResponse.ok) return jsonResponse(502, { error: 'Could not load the selected trend context.' });
      const news = await newsResponse.json();
      relatedNews = Array.isArray(news) ? news : [];
    }

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: edgeRuntime.env.get('OPENAI_TREND_INTERCEPTOR_MODEL') ?? 'gpt-4o',
        temperature: 0.7,
        max_tokens: isIdea ? 160 : includeRelevance ? 300 + books.length * 65 : 240,
        ...(includeRelevance || isIdea ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          {
            role: 'system',
            content: isIdea ? QUIP_IDEA_PROMPT : includeRelevance ? buildQuipPrompt(stance, style) : LEGACY_QUIP_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              ideas: includeRelevance || isIdea
                ? books.map((book) => ({ bookId: book.id, title: book.title, author: book.author, shortTake: book.note }))
                : books.map((book) => book.note),
              ...(!isIdea ? {
                pastedTopic: typeof payload.trendText === 'string' ? payload.trendText.trim() : '',
                selectedTrend,
                relatedNews,
              } : {}),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(includeRelevance || isIdea ? 45000 : 20000),
    });

    if (!openAiResponse.ok) return jsonResponse(502, { error: isIdea ? 'The AI service could not suggest an idea. Try again shortly.' : 'The AI service could not draft a reply. Try again shortly.' });
    const result = await openAiResponse.json();
    const content = result.choices?.[0]?.message?.content;
    const reply = typeof content === 'string' ? content.trim() : null;
    if (typeof reply !== 'string' || !reply) return jsonResponse(502, { error: 'The AI service returned an empty reply. Try again.' });

    if (isIdea) {
      try {
        if (result.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete idea response.');
        const value: unknown = JSON.parse(reply);
        if (isRecord(value) && Object.keys(value).length === 1 &&
          value.error === 'These books need more descriptive summaries before an idea can be suggested.') {
          return jsonResponse(422, { error: value.error });
        }
        return jsonResponse(200, { idea: parseQuipIdea(value) });
      } catch (error) {
        console.error('Invalid Quip idea response:', error);
        return jsonResponse(502, { error: 'The AI service returned an invalid or unfinished idea. Please try again.' });
      }
    }
    if (includeRelevance) {
      if (result.choices?.[0]?.finish_reason !== 'stop') {
        return jsonResponse(502, { error: 'The AI service did not finish the Quip and relevance assessment. Please generate again.' });
      }
      try {
        return jsonResponse(200, parseQuipResult(JSON.parse(reply), bookIds));
      } catch (error) {
        console.error('Invalid Quip generation response:', error);
        return jsonResponse(502, { error: 'The AI service returned an invalid Quip or incomplete book relevance. Please generate again.' });
      }
    }
    return jsonResponse(200, { reply });
  } catch (error) {
    console.error('Quip generation failed:', error);
    return jsonResponse(502, { error: 'The AI service is temporarily unavailable. Try again shortly.' });
  }
});