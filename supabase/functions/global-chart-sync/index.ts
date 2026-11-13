const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-chart-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const edgeRuntime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get: (name: string) => string | undefined };
    serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

type ChartSource = {
  id: string;
  provider: string;
  list_id: string;
  list_name: string;
  source_url: string;
};

type OpenLibraryLink = {
  book_id: string;
  work_key: string;
};

type ChartEntryRecord = {
  source_id: string;
  chart_date: string;
  rank: number;
  title: string;
  author: string;
  isbn13: string | null;
  source_item_id: string | null;
  source_url: string;
  entry_key: string;
  published_year: number | null;
  short_take: string | null;
  cover_url: string | null;
};

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

function validDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeIsbn(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const isbn = value.replace(/[^\dX]/gi, '').toUpperCase();
  return /^\d{13}$/.test(isbn) ? isbn : null;
}

function getPublicationYear(...values: unknown[]): number | null {
  for (const value of values) {
    const match = typeof value === 'number'
      ? String(value).match(/^(\d{4})$/)
      : typeof value === 'string'
        ? value.match(/^(\d{4})/)
        : null;
    if (match) {
      const year = Number(match[1]);
      if (year >= 1000 && year <= new Date().getUTCFullYear() + 1) return year;
    }
  }
  return null;
}

function getDescription(value: unknown): string | null {
  const description = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'value' in value && typeof value.value === 'string'
      ? value.value
      : null;
  return description?.trim().slice(0, 500) || null;
}

function getCoverUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

function getChartBookId(entry: ChartEntryRecord) {
  const sourceKind = entry.source_id.startsWith('openlibrary-') ? 'openlibrary' : 'nyt';
  const sourceKey = entry.source_item_id
    ? entry.source_item_id.replace(/^\/works\//, '')
    : `${entry.title}-${entry.author}`.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `chart-${sourceKind}-${sourceKey}`.slice(0, 120);
}

edgeRuntime.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const syncSecret = edgeRuntime.env.get('CHART_SYNC_SECRET');
  const supabaseUrl = edgeRuntime.env.get('SUPABASE_URL');
  const serviceRoleKey = edgeRuntime.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const requestSecret = request.headers.get('x-chart-sync-secret') ?? '';
  if (!syncSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { error: 'Chart sync is not configured.' });
  }
  if (!constantTimeEquals(requestSecret, syncSecret)) return jsonResponse(401, { error: 'Unauthorized.' });

  const supabaseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const restUrl = (table: string) => new URL(`/rest/v1/${table}`, supabaseUrl);

  async function upsertChartEntries(rows: ChartEntryRecord[]) {
    if (rows.length === 0) return false;
    const bookRows = rows.map((entry) => ({
      id: getChartBookId(entry),
      title: entry.title,
      author: entry.author || 'Author not listed',
      published_year: entry.published_year,
      isbn: entry.isbn13,
      pillar: 'charts',
      note: entry.short_take ?? 'No publisher synopsis is available for this chart entry.',
      cover_color: entry.source_id.startsWith('openlibrary-') ? '#477d6c' : '#6177a2',
      cover_url: entry.cover_url,
      is_active: true,
    }));
    const booksUrl = restUrl('books');
    booksUrl.searchParams.set('on_conflict', 'id');
    const booksResponse = await fetch(booksUrl, {
      method: 'POST',
      headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(bookRows),
    });
    if (!booksResponse.ok) return false;

    const linkedRows = rows.map((entry) => ({
      ...entry,
      book_id: getChartBookId(entry),
      match_status: 'matched',
      matched_by: entry.isbn13 ? 'isbn' : entry.source_item_id ? 'source_item' : 'title_author',
    }));
    const entriesUrl = restUrl('chart_entries');
    entriesUrl.searchParams.set('on_conflict', 'source_id,chart_date,rank');
    const entriesResponse = await fetch(entriesUrl, {
      method: 'POST',
      headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(linkedRows),
    });
    return entriesResponse.ok;
  }

  try {
    const report = {
      nyt: { configured: Boolean(edgeRuntime.env.get('NYT_API_KEY')), sources: 0, entries: 0, errors: 0 },
      openLibrary: { configured: Boolean(edgeRuntime.env.get('OPENLIBRARY_USER_AGENT')), trendSources: 0, trendEntries: 0, links: 0, snapshots: 0, errors: 0 },
    };

    const nytApiKey = edgeRuntime.env.get('NYT_API_KEY');
    if (nytApiKey) {
      const sourcesUrl = restUrl('chart_sources');
      sourcesUrl.searchParams.set('select', 'id,provider,list_id,list_name,source_url');
      sourcesUrl.searchParams.set('provider', 'eq.nyt');
      sourcesUrl.searchParams.set('enabled', 'eq.true');
      sourcesUrl.searchParams.set('order', 'id.asc');
      sourcesUrl.searchParams.set('limit', '10');
      const sourcesResponse = await fetch(sourcesUrl, { headers: supabaseHeaders });
      if (!sourcesResponse.ok) return jsonResponse(502, { error: 'Could not load enabled chart sources.' });
      const sources = await sourcesResponse.json() as ChartSource[];

      for (const source of sources) {
        report.nyt.sources += 1;
        try {
          const apiUrl = new URL(source.source_url);
          apiUrl.searchParams.set('api-key', nytApiKey);
          const apiResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
          if (!apiResponse.ok) {
            report.nyt.errors += 1;
            continue;
          }

          const payload = await apiResponse.json();
          const result = payload?.results;
          const chartDate = validDate(result?.bestsellers_date) ?? validDate(result?.published_date);
          const books = Array.isArray(result?.books) ? result.books : [];
          if (!chartDate || books.length === 0) {
            report.nyt.errors += 1;
            continue;
          }

          const rows = books.flatMap((book: Record<string, unknown>) => {
            const rank = Number(book.rank);
            const title = typeof book.title === 'string' ? book.title.trim() : '';
            if (!Number.isInteger(rank) || rank < 1 || !title) return [];
            const details = Array.isArray(book.book_details)
              ? book.book_details[0] as Record<string, unknown> | undefined
              : book.book_details && typeof book.book_details === 'object'
                ? book.book_details as Record<string, unknown>
                : undefined;
            const isbn13 = normalizeIsbn(book.primary_isbn13) ?? normalizeIsbn(details?.primary_isbn13);
            const description = getDescription(details?.description ?? book.description);
            return [{
              source_id: source.id,
              chart_date: chartDate,
              rank,
              title,
              author: typeof book.author === 'string' ? book.author.trim() : '',
              isbn13,
              source_item_id: isbn13,
              source_url: source.source_url,
              entry_key: `${source.id}:${chartDate}:${rank}`,
              published_year: getPublicationYear(book.first_publish_year, details?.first_published, details?.publication_date),
              short_take: description ?? `No publisher synopsis is available. This title ranked ${rank} on the ${source.list_name} list dated ${chartDate}.`,
              cover_url: getCoverUrl(details?.book_image ?? book.book_image),
            }];
          });

          if (rows.length === 0) {
            report.nyt.errors += 1;
            continue;
          }
          if (!await upsertChartEntries(rows)) {
            report.nyt.errors += 1;
            continue;
          }
          report.nyt.entries += rows.length;
        } catch {
          report.nyt.errors += 1;
        }
      }
    }

    const userAgent = edgeRuntime.env.get('OPENLIBRARY_USER_AGENT');
    if (userAgent) {
      try {
        const trendSourcesUrl = restUrl('chart_sources');
        trendSourcesUrl.searchParams.set('select', 'id,source_url');
        trendSourcesUrl.searchParams.set('provider', 'eq.openlibrary');
        trendSourcesUrl.searchParams.set('chart_kind', 'eq.reader_trend');
        trendSourcesUrl.searchParams.set('enabled', 'eq.true');
        trendSourcesUrl.searchParams.set('order', 'id.asc');
        trendSourcesUrl.searchParams.set('limit', '10');
        const trendSourcesResponse = await fetch(trendSourcesUrl, { headers: supabaseHeaders });
        if (!trendSourcesResponse.ok) {
          report.openLibrary.errors += 1;
        } else {
          const trendSources = await trendSourcesResponse.json() as Array<{ id: string; source_url: string }>;
          for (const source of trendSources) {
            report.openLibrary.trendSources += 1;
            try {
              const trendUrl = new URL(source.source_url);
              if (trendUrl.origin !== 'https://openlibrary.org' || trendUrl.pathname !== '/trending/weekly.json') {
                report.openLibrary.errors += 1;
                continue;
              }
              trendUrl.searchParams.set('limit', '25');
              const trendResponse = await fetch(trendUrl, {
                headers: { 'User-Agent': userAgent },
                signal: AbortSignal.timeout(10000),
              });
              if (!trendResponse.ok) {
                report.openLibrary.errors += 1;
                continue;
              }

              const trendPayload = await trendResponse.json();
              const works = Array.isArray(trendPayload?.works) ? trendPayload.works.slice(0, 25) : [];
              const chartDate = new Date().toISOString().slice(0, 10);
              const rows: ChartEntryRecord[] = [];
              for (const [index, rawWork] of works.entries()) {
                const work = rawWork as Record<string, unknown>;
                const workKey = typeof work.key === 'string' && /^\/works\/OL[0-9]+W$/.test(work.key) ? work.key : null;
                const title = typeof work.title === 'string' ? work.title.trim() : '';
                if (!workKey || !title) continue;
                if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1000));

                let workDetails: Record<string, unknown> = {};
                try {
                  const workUrl = new URL(`https://openlibrary.org${workKey}.json`);
                  const workResponse = await fetch(workUrl, {
                    headers: { 'User-Agent': userAgent },
                    signal: AbortSignal.timeout(10000),
                  });
                  if (workResponse.ok) workDetails = await workResponse.json();
                  else report.openLibrary.errors += 1;
                } catch {
                  report.openLibrary.errors += 1;
                }
                const authors = Array.isArray(work.author_name)
                  ? work.author_name.filter((author): author is string => typeof author === 'string' && author.trim().length > 0)
                  : [];
                const coverId = typeof work.cover_i === 'number'
                  ? work.cover_i
                  : Array.isArray(workDetails.covers) && typeof workDetails.covers[0] === 'number'
                    ? workDetails.covers[0]
                    : null;
                const description = getDescription(workDetails.description);
                rows.push({
                  source_id: source.id,
                  chart_date: chartDate,
                  rank: index + 1,
                  title,
                  author: authors.join(', '),
                  isbn13: null,
                  source_item_id: workKey,
                  source_url: `https://openlibrary.org${workKey}`,
                  entry_key: `${source.id}:${chartDate}:${index + 1}`,
                  published_year: getPublicationYear(work.first_publish_year, workDetails.first_publish_date),
                  short_take: description ?? `No publisher synopsis is available. This title appears in Open Library's weekly reader-trending list dated ${chartDate}.`,
                  cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
                });
              }
              if (rows.length === 0) {
                report.openLibrary.errors += 1;
                continue;
              }

              if (!await upsertChartEntries(rows)) {
                report.openLibrary.errors += 1;
                continue;
              }
              report.openLibrary.trendEntries += rows.length;
            } catch {
              report.openLibrary.errors += 1;
            }
          }
        }
      } catch {
        report.openLibrary.errors += 1;
      }

      const linksUrl = restUrl('openlibrary_book_links');
      linksUrl.searchParams.set('select', 'book_id,work_key');
      linksUrl.searchParams.set('order', 'last_checked_at.asc.nullsfirst,book_id.asc');
      linksUrl.searchParams.set('limit', '10');
      const linksResponse = await fetch(linksUrl, { headers: supabaseHeaders });
      if (!linksResponse.ok) return jsonResponse(502, { error: 'Could not load verified Open Library links.', report });
      const links = await linksResponse.json() as OpenLibraryLink[];

      for (const [index, link] of links.entries()) {
        report.openLibrary.links += 1;
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const workId = link.work_key.slice('/works/'.length);
          const ratingsUrl = new URL(`https://openlibrary.org/works/${encodeURIComponent(workId)}/ratings.json`);
          const ratingsResponse = await fetch(ratingsUrl, {
            headers: { 'User-Agent': userAgent },
            signal: AbortSignal.timeout(10000),
          });
          if (!ratingsResponse.ok) {
            report.openLibrary.errors += 1;
            continue;
          }

          const ratings = await ratingsResponse.json();
          const summary = ratings?.summary;
          const ratingsCount = summary?.count;
          const average = typeof summary?.average === 'number' ? summary.average : null;
          if (typeof ratingsCount !== 'number' || !Number.isInteger(ratingsCount) || ratingsCount < 0 || (average !== null && (average < 0 || average > 5))) {
            report.openLibrary.errors += 1;
            continue;
          }

          const snapshotUrl = restUrl('openlibrary_activity_snapshots');
          snapshotUrl.searchParams.set('on_conflict', 'book_id,snapshot_date');
          const snapshotResponse = await fetch(snapshotUrl, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              book_id: link.book_id,
              snapshot_date: new Date().toISOString().slice(0, 10),
              ratings_count: ratingsCount,
              ratings_average: average,
              source_url: ratingsUrl.toString(),
            }),
          });
          if (!snapshotResponse.ok) {
            report.openLibrary.errors += 1;
            continue;
          }
          report.openLibrary.snapshots += 1;
        } catch {
          report.openLibrary.errors += 1;
        }

        try {
          const checkedUrl = restUrl('openlibrary_book_links');
          checkedUrl.searchParams.set('book_id', `eq.${link.book_id}`);
          const checkedResponse = await fetch(checkedUrl, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ last_checked_at: new Date().toISOString() }),
          });
          if (!checkedResponse.ok) report.openLibrary.errors += 1;
        } catch {
          report.openLibrary.errors += 1;
        }
      }
    }

    const hasErrors = report.nyt.errors > 0 || report.openLibrary.errors > 0;
    return jsonResponse(hasErrors ? 207 : 200, report);
  } catch {
    return jsonResponse(502, { error: 'Chart sync failed.' });
  }
});