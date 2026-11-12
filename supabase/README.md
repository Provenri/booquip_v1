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

The private Digital source registry and metadata-only RSS review workflow are
documented in `pipeline/README.md`. They do not publish or change the catalog.

When Supabase is configured, the app loads book metadata from `public.books`, adaptations from `public.book_adaptations`, and shelf/pillar definitions from `public.subcategories` and `public.pillars`; the bundled data in `lib/books.ts` remains a local/offline fallback if Supabase is unavailable. The catalog migration adds 56 titles for 80 total, with 10 titles in each of the eight shelves. Add future catalog and adaptation records through migrations so configured app clients share one source.

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

The book-card on-ramp runs in the `book-on-ramp` Edge Function. Keep the OpenAI API key in Supabase Functions secrets, never in an `EXPO_PUBLIC_` variable:

```bash
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key
npx supabase functions deploy book-on-ramp
```

The function requires a signed-in Supabase session and uses `gpt-4o-mini` by default. To choose another supported model for this feature only, set the server-side `OPENAI_BOOK_ON_RAMP_MODEL` secret. Future AI functions should use their own model setting, such as `OPENAI_SOCIAL_GHOSTWRITER_MODEL`, so changing one feature never changes another.

## Social Ghostwriter

The Read shelf's **Draft** action opens an editable LinkedIn or X post. The authenticated `social-ghostwriter` Edge Function verifies that the selected book is in the caller's Read shelf before generating a draft. It uses `gpt-4o` by default, independently of the On-Ramp model; to choose another supported model, set `OPENAI_SOCIAL_GHOSTWRITER_MODEL` as a Supabase Function secret.

```bash
npx supabase functions deploy social-ghostwriter
```

## Trend Interceptor

The Read shelf's **Reply to trend** tool accepts pasted text only; it does not fetch social feeds or publish replies. Users can ground a reply in one selected Read-shelf book or ask the authenticated `trend-interceptor` Edge Function to consider their entire Read shelf. The function derives the book list from the caller's RLS-protected swipe rows and limits pasted text to 2,000 characters. It uses `gpt-4o` by default, independently of other AI features; set `OPENAI_TREND_INTERCEPTOR_MODEL` as a Supabase Function secret to select another supported model.

```bash
npx supabase functions deploy trend-interceptor
```

The account screen links an email to the existing anonymous user with `auth.updateUser`, so the user ID and shelf are preserved. The email must be confirmed before the account is considered linked.

The public anon/publishable key is intended for app clients; row-level security protects user data. Never put a Supabase service-role key or other private API key in an `EXPO_PUBLIC_` variable. Without these environment values, the app runs in local preview mode and swipe changes last only for the current session.