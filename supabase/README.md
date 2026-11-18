# Supabase Setup

1. Create a Supabase project and enable **Anonymous Sign-Ins** under Authentication provider settings.
2. Link this repository to the project and apply the database migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --remote
   ```

3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` using the project URL and public anon/publishable key from the Supabase API settings.
4. Restart Expo after changing `.env`:

   ```bash
   npx expo start --web
   ```

5. In **Authentication → URL Configuration**, add the app URLs to the Redirect URLs allow-list. For local web development, add `http://localhost:8081/**`. For native builds, allow the `booquip://**` scheme; Expo Go may use a development URL that must also be allowed.

## Book Catalog

### Retired migration history

The retired Substack-curation setup migrations `202611120008`, `202611120009`, and `202611120010` have been removed. The later `202611120011_remove_substack_curation.sql` remains: its conditional drops also handle databases that previously installed curation, and its taxonomy changes are part of the catalog migration chain. Trend-table migrations remain because legacy `trend-interceptor` requests still read those tables.

Existing projects may still record the three removed versions in `supabase_migrations.schema_migrations`. Before the next database push, inspect `npx supabase migration list` against the intended linked project. If those versions are recorded remotely, restore the historical files from Git or deliberately reconcile the migration ledger after reviewing a backup and the database state. Do not repair migration history blindly. This repository cleanup does not change remote schema or migration records.

When Supabase is configured, the app loads book metadata from `public.books`, category labels from `public.pillars`, and adaptations from `public.book_adaptations`; the bundled data in `lib/books.ts` remains a local/offline fallback if Supabase is unavailable. Archived books remain available to existing shelves and history, while chart sync can add active catalog entries. Add curated books and adaptations through migrations so configured clients share one source.

## Book Taglines

Discovery shows a short, curated tagline below the author in emphasized type. The `book_taglines` migration adds the optional `public.books.tagline` field and seeds taglines for the curated catalog. Apply the latest database migrations before using this app version with Supabase; the bundled catalog also includes taglines for offline preview.

The `chart_taglines` migration and updated `global-chart-sync` function generate missing Charts taglines in batches of 25, using the existing server-only `OPENAI_API_KEY`. `OPENAI_BOOK_TAGLINE_MODEL` optionally selects a model independently of other AI features. The hourly job preserves existing taglines, records attempt times for fair retries, and reports generation failures in `taglines`. Generated lines are editorial descriptions based on supplied metadata, not quotations from a book. Until a stored tagline is available, Charts shows a neutral reading invitation rather than an empty gap. Pull-to-refresh loads newly generated taglines into the app.

## Book Cover Storage

The `book_cover_storage` migration prepares the public `book-covers` bucket for covers with confirmed rehosting rights. It accepts JPEG, PNG, and WebP files up to 5 MiB. Public object URLs allow unauthenticated image downloads; client uploads, updates, and deletes are blocked by restrictive policies, even if another policy allows writes to other buckets. Backend imports must use the server-only service-role key. Never expose that key to the app.

Apply the migration with `npx supabase db push --remote`. This step does not import images or change catalog URLs. Existing external cover URLs remain in use. Do not copy Open Library or NYT-supplied covers into the bucket without establishing permission to rehost them.

### Importing Approved Covers

Run `pipeline/import-book-covers.mjs` with Node.js 22.18+ from a trusted backend/admin environment after installing development dependencies (`npm ci --include=dev`). It requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not put these credentials in the manifest, app, or repository.

Create a trusted JSON manifest outside version control with this shape:

```json
{
  "covers": [
    {
      "bookId": "catalog-book-id",
      "sourceUrl": "https://approved-provider.example/cover.jpg",
      "approvedForRehosting": true,
      "permissionReference": "Reference to permission covering storage, resizing, and public distribution"
    }
  ]
}
```

Only list images whose rights have actually been confirmed; the approval fields record your decision, not an automatic license check. Use reviewed HTTPS image URLs, not untrusted user submissions. Redirects are rejected; specify the final permitted image URL.

```bash
node pipeline/import-book-covers.mjs /secure/path/approved-covers.json
```

The importer validates and bounds downloads to 10 MiB and 40 million decoded pixels, converts single-frame JPEG/PNG/WebP images to WebP within 800 x 1200 without enlarging, and uploads sequentially to content-hashed paths. Existing objects are not overwritten. The default local journal, `pipeline/.cover-import/results.json`, is gitignored and atomically updated after each attempt. Keep it for provenance and recovery: it records the approval reference, source URL, original catalog cover URL, uploaded URL, checksum, and failures. Re-run the same command to skip successful objects that still exist and retry failures or missing objects. Do not run concurrent imports against the same journal.

An optional second argument selects a different journal path. Journals are project-specific. Errors are reported and cause a nonzero exit status. This importer does **not** update `books.cover_url` or chart ingestion; publishing uploaded covers is a separate step.

### Publishing Uploaded Covers

Use the import journal with `pipeline/publish-book-covers.mjs` in the same trusted environment and with the same server-only credentials. Preview changes first:

```bash
node pipeline/publish-book-covers.mjs pipeline/.cover-import/results.json
node pipeline/publish-book-covers.mjs pipeline/.cover-import/results.json --apply
```

The default is read-only. Only successfully uploaded entries with approval records are eligible. Before updating each `books.cover_url`, the publisher checks the target project and object path, downloads the public Storage URL without credentials, and verifies its SHA-256 checksum. Failed imports and unavailable or mismatched objects leave the existing URL unchanged. It updates only records whose current cover still matches the original value saved by the importer, including null values, and checks that exactly one row changed. Conflicts and failures are reported with a nonzero exit status; other eligible books continue. Re-runs recognize already-published URLs. Keep the import journal, which preserves the original URLs for recovery.

Apply the `approved_cover_imports` migration before publishing. The publisher sets `books.hosted_cover_url` alongside `cover_url`; a database trigger keeps that hosted URL in place during future catalog upserts while retaining provider URLs in `cover_source_url`.

### Automatic Supabase Cover Imports

The `approved_cover_imports` migration queues existing and newly inserted catalog books in the backend-only `book_cover_imports` table. Queue entries start **unapproved**. Neither catalog ingestion nor this migration grants rehosting rights. Source URLs and permission references must be reviewed by an administrator; do not blanket-approve a provider. For a cover with confirmed permission, use the SQL editor or a trusted service-role client:

```sql
update public.book_cover_imports
set source_url = 'https://approved-provider.example/cover.jpg',
    permission_reference = 'Reference to permission covering resizing and public distribution',
    approved_for_rehosting = true
where book_id = 'catalog-book-id';
```

Deploy `global-chart-sync` after applying the migration:

```bash
npx supabase functions deploy global-chart-sync
```

The existing hourly Supabase job processes one approved, unpublished cover per invocation before metadata ingestion; new catalog titles become eligible on a later invocation after approval. No GitHub Actions worker or new credentials are needed. The Edge-compatible ImageScript optimizer decodes JPEG, PNG, or WebP, applies orientation, limits input to 10 MiB and 4 million decoded pixels, and produces JPEG within 800 x 1200 without enlarging. JPEG output avoids native Node.js dependencies and keeps Edge CPU usage low. The optional manual Node tools still produce WebP.

Uploads use content-hashed paths and long cache lifetimes. Before publishing, the job fetches the public URL without credentials and checks its SHA-256 hash. A database function atomically rechecks approval, attempt ownership, Storage object existence, and the previous catalog URL before publishing and recording provenance. Metadata sync cannot overwrite `hosted_cover_url`. Retries may re-upload identical bytes at the same hash path; changed image content gets a different path.

Attempts use a ten-minute lease to prevent overlapping sync invocations from processing the same approval. Failures retain the current cover URL, save `last_error`, and are eligible for a later retry; inspect the sync report's `covers` section and `book_cover_imports`. Changing a source, permission reference, or approval resets its pending status and invalidates in-flight publication. Existing approval records are not automatically replaced or reapproved when upstream metadata changes.

Revoking approval stops future imports but does not remove a published image. For a takedown, also clear the book's `hosted_cover_url` (the trigger restores its last provider URL) and remove the Storage object through a trusted administrator. Retain any required permission/provenance records before replacing or deleting an approval.

## Book Keywords

Discovery cards display three stored keywords when available. Apply the latest migrations and deploy `global-chart-sync` to enable keyword generation for existing books and new chart imports. The scheduled sync uses the server-side `OPENAI_API_KEY` and processes up to 25 pending books per run; `OPENAI_BOOK_KEYWORDS_MODEL` optionally selects a model. Books without sufficient information or a successful generation remain pending and are retried on later syncs. Offline preview does not generate keywords. Check the sync report's `keywords` section for generation errors.

The hourly `global-chart-sync` job also requires the deployed function, the `CHART_SYNC_SECRET` function secret, and the `chart_sync_url` and `chart_sync_secret` Vault entries described by the scheduling migration. Until the migration is applied and the sync runs, the new keyword data is not available.

Google Trends collection, related-news caching, and AI trend summaries have been retired from `global-chart-sync`. Deploy the updated function with `npx supabase functions deploy global-chart-sync` to stop that work in the scheduled job. Book-chart ingestion, Open Library ratings snapshots, approved cover imports, keywords, and taglines remain unchanged. The sync report no longer includes `googleTrends`, and `OPENAI_TREND_SUMMARY_MODEL` is no longer used. Existing Quip trend tables and their migrations are retained; this change does not delete stored data.

Run the chart-sync handler regression test with `node --experimental-test-module-mocks --test supabase/functions/global-chart-sync/index.test.mjs`. It mocks the cover importer and network requests; no deployed services are called.

## TMDb Adaptation Matching

`TMDB_API_KEY` is held as a Supabase Function secret. The one-time `tmdb-adaptation-sync` function searches only pending curated adaptations, sequentially with a 300 ms pause, and stores a TMDb ID only when media type, normalized title, and release year all match exactly. It then requests credits once for each exact match and caches only the first three credited names. It stores lookup/credits check times so completed records are not repeatedly queried. It does not retrieve posters, overviews, or provider listings, and the app makes no TMDb requests while users browse.

For a future catalog refresh, set a temporary random `TMDB_SYNC_SECRET` in Supabase Function secrets, deploy `tmdb-adaptation-sync`, and invoke it from a secure admin environment using the `x-tmdb-sync-secret` header. After it finishes, unset `TMDB_SYNC_SECRET` and delete the temporary deployed function. Keep the required TMDb attribution in the app wherever matched TMDb data is shown.

## Account Deletion

Linked, confirmed users can permanently delete their account from the account panel. The `delete-user-account` Edge Function verifies the caller's session and derives the deletion target from that identity; it never accepts a user ID from the client. Profiles and swipe data are removed by their `ON DELETE CASCADE` foreign keys.

```bash
npx supabase functions deploy delete-user-account
```

The function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY` runtime secret. Never expose that key to the app or add it to an `EXPO_PUBLIC_` variable.

## AI On-Ramp

The book-card **30s read** loads from `book_on_ramp_cache`; the legacy live-generation `book-on-ramp` Edge Function has been removed. The shared prompt and admin cache generator remain in use. Generate cached reads from a trusted admin environment using server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`:

```bash
npm run onramp:cache -- --limit 5
```

The generator uses `gpt-4o-mini` by default; `OPENAI_BOOK_ON_RAMP_MODEL` optionally selects another model. To remove an existing deployed legacy endpoint, run `npx supabase functions delete book-on-ramp` against the intended linked project. Older installed builds that still call that endpoint will no longer be able to generate live reads after deletion; current clients continue using cached reads.

## Legacy Social Ghostwriter

The current app has no social-post Draft action. The retained `social-ghostwriter` Edge Function supports legacy callers, verifies the selected book against the caller's Read shelf, and uses `gpt-4o` by default. `OPENAI_SOCIAL_GHOSTWRITER_MODEL` optionally selects another model.

```bash
npx supabase functions deploy social-ghostwriter
```

## Quip Generation

The screenshot input and `screenshot-topic-reader` function have been removed from the repository. To retire an existing deployed endpoint, run `npx supabase functions delete screenshot-topic-reader` against the intended linked project. Removing local source does not delete a deployed function.

The current Quip page sends the user's idea and exactly one To read or Finished book ID to the authenticated `trend-interceptor` Edge Function with `workflow: "single-book"`. It verifies ownership through the caller's RLS-protected shelf row in state `tbr` or `read`, without requiring the legacy `quip_enabled` flag. Single-book seed text is limited to 280 characters; legacy requests retain their 2,000-character limit. The prompt uses only the supplied metadata and summary and must not imply the user has read or finished the book. Nothing is published automatically.

Clients send `stance` (`pro`, `neutral`, `cons`) and `style` (`natural`, `curious`, `witty`); the UI labels `natural` as Neutral. The response is `{ "reply": "..." }`, with a maximum of 280 characters enforced by server and client. Relevance options and other styles are rejected for this workflow. The function uses `gpt-4o` by default; set the server-only `OPENAI_TREND_INTERCEPTOR_MODEL` secret to choose another model supporting JSON-object responses. The client imposes a 60-second generation deadline.

Ready-made Quips load from the shared book cache, not this endpoint. See the [Quip setup and cache-generation instructions](../README.md#quip) for migrations, admin credentials, and batch commands. Both To read and Finished books can use ready-made Quips and custom generation. Legacy multi-book requests remain restricted to Quip-enabled Read-shelf books.

Requests without `workflow` retain legacy multi-book, trend-context, relevance, extra-style, and idea-generation support. Those compatibility paths are not exposed by the current UI and still require Quip-enabled Read books. The current app has no screenshot input, trend picker, or automatic idea-generation action. AI consent is a client UX control, not server authorization or a stored legal record.

Deploy the updated function before distributing single-book clients:

```bash
npx supabase functions deploy trend-interceptor
```

The account screen links an email to the existing anonymous user with `auth.updateUser`, so the user ID and shelf are preserved. The email must be confirmed before the account is considered linked.

The public anon/publishable key is intended for app clients; row-level security protects user data. Never put a Supabase service-role key or other private API key in an `EXPO_PUBLIC_` variable. Without these environment values, the app runs in local preview mode and swipe changes last only for the current session.