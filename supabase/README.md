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

The account screen links an email to the existing anonymous user with `auth.updateUser`, so the user ID and shelf are preserved. The email must be confirmed before the account is considered linked.

The public anon/publishable key is intended for app clients; row-level security protects user data. Never put a Supabase service-role key or other private API key in an `EXPO_PUBLIC_` variable. Without these environment values, the app runs in local preview mode and swipe changes last only for the current session.