# Digital Curation Pilot

This is a private command-line review queue, not a public application screen.
It never changes books or shelf assignments. No publications are pre-approved,
no polling is scheduled, and no AI extraction is performed.

## Setup

Apply `supabase/migrations/202611120008_digital_curation.sql` after authenticating
the Supabase CLI:

```bash
npx supabase login
npx supabase db push --remote
```

Use Python 3.10 or later; there are no additional dependencies. Set `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` privately in the admin terminal environment.
Never paste the service-role key into chat, commit it, or use an `EXPO_PUBLIC_`
variable. The tool does not read the app's environment file. A service-role key
has broad database privileges: run this only from a trusted local/admin machine.

The three tables have RLS enabled, no public access policies, and explicitly
revoked anon/authenticated grants. Only service-role access is granted. Any
future admin interface must authenticate actual curators, not all app users.

## Approve a Source

Select three to five publications with the product owner first. Check each
publication's terms and permitted metadata reuse before enabling it. Public RSS
availability alone does not grant unrestricted reuse rights.

```bash
python3 pipeline/curate.py register --name "Selected publication" \
  --feed-url https://publication.substack.com/feed \
  --terms-url https://publication.substack.com/terms
python3 pipeline/curate.py sources
python3 pipeline/curate.py approve-source SOURCE_UUID \
  --reviewer "Curator name" --terms-reviewed
python3 pipeline/curate.py import SOURCE_UUID --dry-run
python3 pipeline/curate.py import SOURCE_UUID
python3 pipeline/curate.py posts --source-id SOURCE_UUID
```

The URL above is an example, not a recommended or approved source. Custom
domains are out of scope for this initial pilot. The fetcher permits HTTPS
Substack feed URLs only, rejects redirects, uses a 15-second network timeout,
limits each feed to 2 MiB, and imports at most 20 posts per call. Imports have a
24-hour per-source cooldown, checked before fetching and atomically enforced at
database insertion. Dry runs fetch but do not store or start the cooldown;
avoid repeated dry runs. Run sequentially, not in parallel.

Only post title, publication/source relation, canonical URL, publication date,
and import time are retained. The XML response may contain article text supplied
by the publisher, but descriptions and article bodies are discarded in memory.
No linked articles, paywalled content, subscriber data, or images are fetched.
Duplicate canonical URLs are ignored. The listings show the latest 100 rows;
use the Supabase Table Editor for older records or source disablement.

## Propose and Review

Inspect the source manually and record original notes, not copied paragraphs.
Publisher/author statements may substantiate digital origins; a recommendation
alone does not establish origins or viral popularity. Approval attests to the
curator's review, not automated fact verification.

```bash
python3 pipeline/curate.py propose --post-id POST_UUID \
  --title "Book title" --author "Author name" \
  --shelf substack-longform-pioneers --evidence-type digital_origin \
  --evidence-url https://publication.substack.com/p/source \
  --rationale "Original explanation of what this source establishes"
python3 pipeline/curate.py candidates
python3 pipeline/curate.py review CANDIDATE_UUID --status needs_evidence \
  --reviewer "Curator name" --notes "What remains to verify"
```

An optional `--book-id` connects a candidate to an existing catalog record.
Otherwise retain the proposed title/author for later edition matching. Available
evidence types are `digital_origin`, `recommendation`, and `digital_traction`.
Review states are `pending`, `needs_evidence`, `rejected`, and `approved`.
Approval/rejection require reviewer, timestamp, and review notes. Recommendation
evidence alone cannot be approved as a classification. Confirm the proposed shelf
fits the evidence; this is a human decision, not a popularity calculation.

Approved candidates remain in this private queue. Publishing a rationale or
changing catalog assignments is a separate, explicitly authorized future step.
Existing Digital titles are not retroactively verified by this pilot.

## Local Validation

```bash
python3 -m unittest discover -s pipeline -p 'test_*.py' -v
python3 pipeline/curate.py --help
```

Tests use fixtures and mocks, not live Substack or Supabase requests. Before
using the remote queue, verify in a disposable/staging database that anonymous
and authenticated clients cannot access its tables or importer RPC, while a
service-role importer can insert posts and enforce review/cooldown constraints.

The rollback-only database integration check is:

```bash
npx supabase db query --remote --file pipeline/test_curation.sql --yes
```

It asserts public-role grants and RLS settings, exercises the importer as
`service_role`, verifies approval, cooldown, deduplication, and review checks,
and rolls back all fixtures. It passed against the linked database on
2026-11-12; the queue was verified empty afterward. No public catalog rows
are modified by this test.

## Proposed Publications (Not Approved)

Initial suggestions for human evaluation are Story Club (`storyclub.substack.com`),
Book Post (`bookpost.substack.com`), The Honest Broker
(`thehonestbroker.substack.com`), and The Biblioracle
(`thebiblioracle.substack.com`). These are discovery leads, not verified evidence
of book origins, digital popularity, or permission to reuse metadata.

All four proposed `/feed` URLs returned HTTP 403 from this workspace on
2026-11-12. Publication identity, terms, and permitted automated access still
need verification. Do not approve a source or bypass restrictions merely to
populate the queue. No source was registered, approved, or imported. Obtain
permission or select a suitable accessible source before starting a live pilot.