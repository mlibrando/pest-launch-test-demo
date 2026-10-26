# Pest Launch Call Grader (demo)

Upload recorded sales/service calls, transcribe them, and grade each one against a rubric that Claude extracts from the company's own training manuals. The dashboard shows per-call scorecards, coaching notes and policy violations, plus an overview of score trends.

## Architecture

- **Next.js 16 (App Router) + React 19.** Pages live in `app/(dashboard)` (`/overview`, `/calls`) and `app/(auth)/login`. All mutations and data reads go through server actions in `app/actions`; there are no API routes.
- **Postgres via Prisma 7** (`@prisma/adapter-pg`). Schema in `prisma/schema.prisma`, client generated to `generated/prisma`. Core models: `Company` → `Rep` → `Call` (with `CriterionResult` and `PolicyViolation`), plus `Document` and versioned `RubricSet`s (`DRAFT` / `ACTIVE` / `ARCHIVED`).
- **Supabase Storage** holds the files: call audio in the `call-recordings` bucket and training manuals in `rubric-documents`.
- **AssemblyAI** transcribes calls with speaker labels, primed with the company and rep names as key terms.
- **Claude** (`lib/llm.ts`) does the analysis:
  - Rubric extraction (`lib/rubric-extraction.ts`): Sonnet turns uploaded manuals (PDF/DOCX) into scorecards, policies and open questions, saved as a draft rubric set to review and activate.
  - Call analysis (`lib/call-analysis.ts`): Haiku classifies the call (category, direction, outcome) and corrects the rep intro; Sonnet assesses it criterion by criterion with quoted evidence. Scores and tiers are computed in code (`lib/scoring.ts`), not by the model.
- **Call pipeline** (`lib/call-pipeline.ts`): each call moves `UPLOADED → TRANSCRIBING → TRANSCRIBED → ANALYZING → DONE` (or `FAILED`). The pipeline is driven by polling: while any call is in progress, the Calls page refetches every few seconds, and each poll advances the queue by one step. Postgres advisory locks keep concurrent pollers from double-submitting, so only one call transcribes and one analyzes at a time. Analyses that go quiet for 10 minutes (e.g. after a server restart) are requeued.
- **Auth**: a single admin login. The password hash lives in env, the session is a signed JWT cookie (`jose`), and `proxy.ts` redirects unauthenticated requests to `/login`. Server actions check the session again on their own.

## Setup

Requires Node 20+, Yarn 1, a Postgres database (Supabase works), a Supabase project with the two storage buckets above, and AssemblyAI and Anthropic API keys.

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Generate the admin credentials:

   ```bash
   yarn hash-password '<your password>'
   ```

   This prints `ADMIN_PASSWORD_HASH` and `JWT_SECRET` lines to paste into `.env.local`.

3. Create `.env.local`:

   ```bash
   DATABASE_URL=        # pooled connection used by the app
   DIRECT_URL=          # direct connection used by Prisma migrations
   SUPABASE_URL=
   SUPABASE_SECRET_KEY=
   SUPABASE_BUCKET=
   ASSEMBLYAI_API_KEY=
   ANTHROPIC_API_KEY=
   ADMIN_USERNAME=
   ADMIN_PASSWORD_HASH=
   JWT_SECRET=
   ```

4. Apply the migrations and generate the Prisma client:

   ```bash
   npx prisma migrate deploy --config prisma7.config.ts
   npx prisma generate --config prisma7.config.ts
   ```

5. Start the dev server and sign in at [http://localhost:3000](http://localhost:3000):

   ```bash
   yarn dev
   ```

To use it, upload training manuals and activate the resulting rubric set, then upload calls on the Calls page. Calls wait at `TRANSCRIBED` until a rubric set is active.

### Tests

```bash
yarn test                                                                  # unit tests in lib/*.test.ts
npx tsx --conditions=react-server scripts/test-pipeline.ts ./samples/call.mp3   # end-to-end smoke test
```

The smoke test makes paid AssemblyAI and Claude calls and leaves the call in the database.

## Known limitations

- **Single admin, no tenants.** There is one fixed login from env vars. Companies exist in the data model, but nothing scopes users or data to a company, so anyone signed in sees everything.
- **No pagination.** The calls table and overview queries load everything at once, which won't hold up past a modest number of calls.
- **Polling instead of webhooks or a job queue.** The pipeline only moves forward while someone has the Calls page open. Transcription status comes from polling AssemblyAI instead of its webhook, and calls are processed one at a time with no background workers, retries or scheduling.

## What I'd do next

1. **Real multi-tenant separation.** It was kept simple for the demo. Next would be users and organizations with roles, every query scoped to the signed-in user's company (ideally enforced with Postgres row-level security too), and per-tenant storage paths and rubric sets.
2. **Batch processing with real jobs and queues**, using BullMQ on Redis. Uploads enqueue transcription jobs, AssemblyAI webhooks enqueue analysis jobs, and workers run them concurrently with retries, backoff and rate limits for the external APIs. The UI would then only read status, through polling or server-sent events, instead of driving the pipeline.
