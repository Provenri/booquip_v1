# BooQuip Rebuild Instructions

## Goal

Rebuild BooQuip as a copyright-conscious book discovery and Quip app. Start the
catalog and backend from scratch, while reusing suitable app code and patterns
after reviewing their provenance and dependencies.

This document records product and engineering direction, not legal advice or a
guarantee that a particular source or implementation is lawful. Verify current
provider terms and obtain legal advice where needed.

## Scope and working rules

- Keep this branch limited to this instruction file. Do implementation work in
  a separate branch created for the rebuild.
- Do not use the current app's seed catalog or import its catalog records,
  summaries, taglines, keywords, cover URLs or images, chart entries, or
  adaptation descriptions into the new catalog.
- Before reusing existing code, assets, prompts, or generated content, review
  their provenance, licenses, and third-party dependencies. Prefer reusable
  application logic over existing content and visual assets.
- `Rewrite.txt` is a source of ideas, not a binding specification. Verify its
  technical, provider, cost, and legal assumptions before adopting them.

## Catalog and content

- Start with an explicitly defined, minimal set of bibliographic fields, such
  as title, author, publication date, ISBN, language, and publisher.
- Prefer factual metadata, but still check source terms and any applicable
  database rights. Record provenance and usage restrictions for each source.
- Do not ingest book text, descriptions, blurbs, first sentences, publisher
  copy, biographies, or other expressive text unless the rights and permitted
  use are established.
- Do not scrape or re-host cover art. Use an image only when the chosen source's
  current terms clearly permit the intended display and caching. Otherwise,
  render an original typographic cover from factual metadata.
- Keep any source-required attribution, affiliate disclosure, link behavior,
  cache limits, and takedown/contact process with the integration that requires
  it. Do not assume a provider grants rights merely because its API is public.

## Categories

Keep **Screen**, **Charts**, and **Classics** as candidate product categories;
their names alone do not decide whether the app's underlying data is suitable.
Define and validate each category before populating it:

- **Screen:** Include books with verifiable film or television adaptations.
  Use permitted factual adaptation metadata; avoid unlicensed plot text,
  promotional copy, and artwork.
- **Charts:** Include third-party rankings only when the source's terms and
  applicable rights permit the intended collection, display, and retention.
  Otherwise, replace this category or define it around data the app may
  legitimately produce and use itself.
- **Classics:** Treat this as an editorial category, not as proof that a work
  is public domain. If a public-domain category is introduced, check the work
  and the specific edition or translation for the relevant territories.

Document each category's eligibility rules and data source. If a category
cannot be populated from a suitable source, change its definition or omit it
rather than importing questionable material.

## Reusable app functionality

Reuse suitable, verified code from the existing app where it saves effort and
does not carry over unsuitable content or dependencies. Candidate areas include
the Expo/React Native setup, navigation and layout patterns, accessibility,
shelf interactions, authentication flows, request timeouts, cache handling,
and isolated pure helpers with their tests.

Do not assume screenshots, exported designs, fonts, icons, images, catalog data,
or third-party libraries are reusable without checking their licenses and
provenance. Replace or remove anything whose rights or obligations are unclear.

## New backend and OpenAI

- Create a separate Supabase project for the rebuild. Confirm the linked
  project before applying migrations or deploying functions; do not modify the
  existing project's schema, data, storage, or deployed functions.
- Define a fresh schema, migrations, access policies, and Edge Functions for
  the new app. Do not migrate existing seed data or user records by default.
- Keep Supabase service-role credentials and OpenAI API keys in trusted server
  environments only. The app may use the public Supabase client configuration,
  protected by appropriate row-level security.
- Call OpenAI from server-side functions. Send only the minimum metadata and
  user-provided input needed for a request; do not send full book text or
  unlicensed source material. Keep output limits, validation, error handling,
  and user consent explicit.

## Suggested implementation sequence

1. Audit the existing code, dependencies, assets, prompts, and content; record
   what is safe to reuse and what must be replaced.
2. Select catalog sources and document their terms, fields, attribution, and
   retention rules. Define category eligibility from those sources.
3. Design the new Supabase schema and access policies, then create and verify
   the separate project before deploying anything.
4. Rebuild the app using approved reusable logic and newly prepared content.
5. Test catalog filtering, source attribution, access control, AI request
   validation, and offline or missing-data behavior before release.

## Rebuild completion checks

- The new catalog is populated from reviewed sources, not copied from the old
  app's seed data.
- Every external data and image source has documented provenance and permitted
  use; unsupported content is excluded or replaced.
- Screen, Charts, and Classics have explicit eligibility rules and viable
  sources, or have been revised or removed.
- The new app uses a verified, separate Supabase project and its own secrets,
  schema, policies, and functions.
- No private credentials or unreviewed copyrighted content are bundled with the
  app or committed to the repository.
