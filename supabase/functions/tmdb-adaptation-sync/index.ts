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

    const castUrl = new URL('/rest/v1/book_adaptations', supabaseUrl);
    castUrl.searchParams.set('select', 'id,format,tmdb_id');
    castUrl.searchParams.set('tmdb_lookup_status', 'eq.matched');
    castUrl.searchParams.set('tmdb_cast_checked_at', 'is.null');
    castUrl.searchParams.set('tmdb_id', 'not.is.null');
    castUrl.searchParams.set('order', 'id.asc');
    castUrl.searchParams.set('limit', '50');
    const castRowsResponse = await fetch(castUrl, { headers: supabaseHeaders });
    if (!castRowsResponse.ok) return jsonResponse(502, { processed, counts, error: 'Could not load matched adaptations for cast lookup.' });
    const castRows = await castRowsResponse.json();
    if (!Array.isArray(castRows)) return jsonResponse(502, { processed, counts, error: 'Matched adaptations were invalid.' });

    let castProcessed = 0;
    let castEmpty = 0;
    for (const [index, adaptation] of castRows.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 300));

      const mediaType = adaptation.format === 'film' ? 'movie' : 'tv';
      const creditType = mediaType === 'movie' ? 'credits' : 'aggregate_credits';
      const creditsUrl = new URL(`https://api.themoviedb.org/3/${mediaType}/${adaptation.tmdb_id}/${creditType}`);
      creditsUrl.searchParams.set('api_key', tmdbApiKey);
      creditsUrl.searchParams.set('language', 'en-US');
      const creditsResponse = await fetch(creditsUrl, { signal: AbortSignal.timeout(10000) });
      if (creditsResponse.status === 429) {
        return jsonResponse(429, { processed, castProcessed, castRemaining: castRows.length - castProcessed, counts, error: 'TMDb rate limit reached. Cast credits can be resumed later.' });
      }
      if (!creditsResponse.ok) return jsonResponse(502, { processed, castProcessed, castRemaining: castRows.length - castProcessed, counts, error: 'TMDb credits lookup failed. Cast credits can be resumed later.' });

      const credits = await creditsResponse.json();
      const cast = Array.isArray(credits.cast) ? credits.cast as Array<Record<string, unknown>> : [];
      const castMembers = cast
        .filter((member) => typeof member.name === 'string' && member.name.trim().length > 0)
        .sort((left, right) => Number(left.order ?? 9999) - Number(right.order ?? 9999))
        .map((member) => (member.name as string).trim())
        .filter((name, memberIndex, names) => names.indexOf(name) === memberIndex)
        .slice(0, 3);

      const updateCastUrl = new URL('/rest/v1/book_adaptations', supabaseUrl);
      updateCastUrl.searchParams.set('id', `eq.${adaptation.id}`);
      const updateCastResponse = await fetch(updateCastUrl, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ tmdb_cast: castMembers, tmdb_cast_checked_at: new Date().toISOString() }),
      });
      if (!updateCastResponse.ok) return jsonResponse(502, { processed, castProcessed, counts, error: 'Could not cache cast credits.' });
      if (castMembers.length === 0) castEmpty += 1;
      castProcessed += 1;
    }

    return jsonResponse(200, { processed, remaining: 0, counts, castProcessed, castEmpty });
  } catch {
    return jsonResponse(502, { error: 'TMDb sync failed. Completed records remain cached; try again later.' });
  }
});