const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-tmdb-sync-secret',
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

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function normalizeTitle(title: string) {
  return title.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getReleaseYear(date: unknown) {
  if (typeof date !== 'string') return null;
  const match = date.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

edgeRuntime.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const tmdbApiKey = edgeRuntime.env.get('TMDB_API_KEY');
  const syncSecret = edgeRuntime.env.get('TMDB_SYNC_SECRET');
  const supabaseUrl = edgeRuntime.env.get('SUPABASE_URL');
  const serviceRoleKey = edgeRuntime.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const requestSecret = request.headers.get('x-tmdb-sync-secret') ?? '';
  if (!tmdbApiKey || !syncSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { error: 'TMDb sync is not configured.' });
  }
  if (!constantTimeEquals(requestSecret, syncSecret)) return jsonResponse(401, { error: 'Unauthorized.' });

  const supabaseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  try {
    const adaptationsUrl = new URL('/rest/v1/book_adaptations', supabaseUrl);
    adaptationsUrl.searchParams.set('select', 'id,title,format,release_year');
    adaptationsUrl.searchParams.set('tmdb_lookup_status', 'eq.pending');
    adaptationsUrl.searchParams.set('order', 'id.asc');
    adaptationsUrl.searchParams.set('limit', '50');
    const adaptationsResponse = await fetch(adaptationsUrl, { headers: supabaseHeaders });
    if (!adaptationsResponse.ok) return jsonResponse(502, { error: 'Could not load pending adaptation records.' });
    const adaptations = await adaptationsResponse.json();
    if (!Array.isArray(adaptations)) return jsonResponse(502, { error: 'Adaptation records were invalid.' });

    const counts = { matched: 0, not_found: 0, ambiguous: 0, year_mismatch: 0 };
    let processed = 0;

    for (const [index, adaptation] of adaptations.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 300));

      const mediaType = adaptation.format === 'film' ? 'movie' : 'tv';
      const searchUrl = new URL(`https://api.themoviedb.org/3/search/${mediaType}`);
      searchUrl.searchParams.set('api_key', tmdbApiKey);
      searchUrl.searchParams.set('query', adaptation.title);
      searchUrl.searchParams.set(mediaType === 'movie' ? 'year' : 'first_air_date_year', String(adaptation.release_year));
      searchUrl.searchParams.set('include_adult', 'false');
      searchUrl.searchParams.set('language', 'en-US');

      const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (searchResponse.status === 429) {
        return jsonResponse(429, { processed, remaining: adaptations.length - processed, counts, error: 'TMDb rate limit reached. Resume later; completed records are cached.' });
      }
      if (!searchResponse.ok) return jsonResponse(502, { processed, remaining: adaptations.length - processed, counts, error: 'TMDb lookup failed. Resume later; completed records are cached.' });

      const searchResult = await searchResponse.json();
      const candidates = Array.isArray(searchResult.results) ? searchResult.results as Array<Record<string, unknown>> : [];
      const wantedTitle = normalizeTitle(adaptation.title);
      const exactTitleMatches = candidates.filter((candidate) => {
        const primaryTitle = typeof candidate.title === 'string'
          ? candidate.title
          : typeof candidate.name === 'string'
            ? candidate.name
            : '';
        const originalTitle = typeof candidate.original_title === 'string'
          ? candidate.original_title
          : typeof candidate.original_name === 'string'
            ? candidate.original_name
            : '';
        return normalizeTitle(primaryTitle) === wantedTitle || normalizeTitle(originalTitle) === wantedTitle;
      });
      const exactYearMatches = exactTitleMatches.filter((candidate) => {
        const releaseDate = mediaType === 'movie' ? candidate.release_date : candidate.first_air_date;
        return getReleaseYear(releaseDate) === adaptation.release_year;
      });

      let lookupStatus: keyof typeof counts;
      let tmdbId: number | null = null;
      if (exactYearMatches.length === 1 && typeof exactYearMatches[0].id === 'number') {
        lookupStatus = 'matched';
        tmdbId = exactYearMatches[0].id as number;
      } else if (exactYearMatches.length > 1) {
        lookupStatus = 'ambiguous';
      } else if (exactTitleMatches.length > 0) {
        lookupStatus = 'year_mismatch';
      } else {
        lookupStatus = 'not_found';
      }

      const updateUrl = new URL('/rest/v1/book_adaptations', supabaseUrl);
      updateUrl.searchParams.set('id', `eq.${adaptation.id}`);
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          tmdb_id: tmdbId,
          tmdb_lookup_status: lookupStatus,
          tmdb_checked_at: new Date().toISOString(),
        }),
      });
      if (!updateResponse.ok) return jsonResponse(502, { processed, remaining: adaptations.length - processed, counts, error: 'Could not cache a TMDb match.' });

      counts[lookupStatus] += 1;
      processed += 1;
    }

    return jsonResponse(200, { processed, remaining: 0, counts });
  } catch {
    return jsonResponse(502, { error: 'TMDb sync failed. Completed records remain cached; try again later.' });
  }
});