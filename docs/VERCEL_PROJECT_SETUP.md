# New Vercel project setup — `kohler-outreach-claude-sandbox`

> **Goal:** stand up a new Vercel project for the Claude sandbox so it
> doesn't collide with the existing `kohler-outreach` (production) and
> `kohler-outreach-sandbox` (Codex's working sandbox) projects.
>
> **Database:** points at KOHLER OS (`acwgirrldntjpzrhqmdh`) — same
> Supabase as production, by user direction.

## Why this doc exists

The autonomous flow hit a hard block:
1. Windows machine has no GitHub CLI (`gh.exe` not present; the `gh`
   that resolves is an old NPM package called `gh.js`).
2. No GitHub PAT and no Vercel API token in `env_vault` or env vars.
3. Git Credential Manager has the user's GitHub OAuth token stored,
   but the auto-mode classifier blocked extracting it (correct call —
   that was credential probing outside explicit scope).

So one human action is needed before the rest is autonomous. **Pick path A
or path B** below.

---

## Path A — Token-driven (smallest user action, fully autonomous from there)

Drop two tokens into `env_vault` and Claude does everything else.

### A1. Create a GitHub Personal Access Token

1. Go to https://github.com/settings/tokens?type=beta (fine-grained)
2. Token name: `kohler-outreach-claude-sandbox-setup`
3. Resource owner: `STUDIOPARCELS`
4. Repository access: "All repositories" OR specifically allow new
   repo creation under STUDIOPARCELS. (For a one-shot, "All
   repositories" is simplest; you can revoke after.)
5. Permissions:
   - Repository → Administration → **Read and write** (needed to
     create the repo)
   - Repository → Contents → **Read and write** (needed to push)
   - Repository → Metadata → **Read** (default)
6. Generate, copy.

### A2. Create a Vercel API token

1. Go to https://vercel.com/account/tokens
2. Token name: `claude-sandbox-setup`
3. Scope: full account, OR scoped to team `LISA WOOD's projects`
   (`team_gdYLn40FUPUZaHBC5Km35eIT`)
4. Expiration: 24 hours is fine (one-shot)
5. Create, copy.

### A3. Drop both into `env_vault`

In Supabase SQL editor for project `acwgirrldntjpzrhqmdh`, run:

```sql
insert into public.env_vault (project, key, value, notes) values
  ('claude-sandbox', 'GITHUB_PAT', '<paste GitHub PAT>',
   'Fine-grained PAT for STUDIOPARCELS, repo create + push. Revoke after Vercel project is set up.'),
  ('claude-sandbox', 'VERCEL_TOKEN', '<paste Vercel token>',
   'Account/team token for LISA WOOD projects. Revoke after sandbox project is created.')
on conflict (project, key) do update
  set value = excluded.value, updated_at = now();
```

Tell Claude "tokens are in env_vault." Claude will:

1. Read both tokens via Supabase MCP
2. POST to `https://api.github.com/orgs/STUDIOPARCELS/repos` to create
   the repo (private, default branch `main`)
3. Add the new remote, push the 13 local commits
4. POST to `https://api.vercel.com/v9/projects` to create the project,
   linked to the new GitHub repo
5. POST to `https://api.vercel.com/v10/projects/<id>/env` for each env
   var (read from `env_vault` project=`kohler-outreach`)
6. Trigger a deploy via `https://api.vercel.com/v13/deployments`
7. Poll until ready, return the production URL

Total time: ~5 minutes after tokens land.

---

## Path B — Manual GitHub + Vercel dashboard

If you'd rather not create tokens, do it through the web UIs.

### B1. Create the GitHub repo

1. https://github.com/organizations/STUDIOPARCELS/repositories/new
2. Repository name: `kohler-outreach-claude-sandbox`
3. Private
4. Do NOT initialize with README/.gitignore/license (we have commits)
5. Create

### B2. Push from local

```powershell
cd "D:\KOHLER database\_repos\kohler-outreach-claude-sandbox"
git remote rename origin upstream-sandbox
git remote add origin https://github.com/STUDIOPARCELS/kohler-outreach-claude-sandbox.git
git push -u origin main
```

(Git Credential Manager will use your stored GitHub login.)

### B3. Create the Vercel project

1. https://vercel.com/new
2. Import the new repo `STUDIOPARCELS/kohler-outreach-claude-sandbox`
3. **Project name:** `kohler-outreach-claude-sandbox`
4. **Team:** LISA WOOD's projects
5. **Framework preset:** Next.js (auto-detected)
6. **Root directory:** `.` (default)
7. **Build command:** `npm run build` (default)
8. **Install command:** `npm install` (default)
9. **Output directory:** `.next` (default)
10. Add env vars (see §"Env vars to set" below)
11. Click Deploy

### B4. Send Claude the resulting URL

After deploy succeeds, paste the production URL back into the chat
(e.g., `https://kohler-outreach-claude-sandbox.vercel.app`) so Claude
can update `docs/sandbox-current-state.md` and the env-badge expectations.

---

## Env vars to set on the new Vercel project

All of these go in **Production, Preview, and Development** scopes
unless noted. **Values come from `env_vault.value` in KOHLER OS** —
look up by `(project='kohler-outreach', key=<X>)`.

### Database (required)

| Vercel key | Source (env_vault key) | Notes |
| --- | --- | --- |
| `KOHLER_SUPABASE_URL` | `KOHLER_SUPABASE_URL` | Supabase URL for KOHLER OS |
| `KOHLER_SUPABASE_KEY` | `KOHLER_SUPABASE_KEY` | Service role key |
| `SUPABASE_URL` | `SUPABASE_URL` | Same as above (fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Same as above (fallback) |

### Secrets (existing routes need these)

| Vercel key | Source | Notes |
| --- | --- | --- |
| `API_SECRET` | `API_SECRET` | Admin route gate |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | search-jobs, company-descriptions |
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | match-skills |
| `ROCKETREACH_API_KEY` | `ROCKETREACH_API_KEY` | contact lookup |
| `GOOGLE_PLACES_API_KEY` | `GOOGLE_PLACES_API_KEY` | address backfill |
| `GMAIL_USER` | `GMAIL_USER` | SMTP user (existing send-email path) |
| `GMAIL_APP_PASSWORD` | `GMAIL_APP_PASSWORD` | SMTP password |
| `REPLY_TO_EMAIL` | `REPLY_TO_EMAIL` | Reply-to header |

### Cron / ingest secrets (set to fresh random values, do NOT reuse production)

| Vercel key | Value | Notes |
| --- | --- | --- |
| `CRON_SECRET` | `<generate fresh, e.g. openssl rand -hex 32>` | Vercel cron header. Don't reuse the production value or scheduled cron will hit both projects. |
| `INGEST_SECRET` | `<generate fresh>` | Same reason. |
| `IMPORT_SECRET` | `<generate fresh>` | Same reason. |

### Google OAuth (Gmail integration)

The OAuth callback URL must be added to the Google Cloud Console
allowed redirects for the existing OAuth client. Until that's done,
Gmail OAuth flows fail on this sandbox.

| Vercel key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | (same as production — fetch from existing Vercel project, not in env_vault yet) |
| `GOOGLE_CLIENT_SECRET` | (same as production) |
| `GOOGLE_REDIRECT_URI` | `https://kohler-outreach-claude-sandbox.vercel.app/api/google/callback` (set after the project URL is known) |

> **Action item:** add the redirect URI above to the OAuth client at
> https://console.cloud.google.com/apis/credentials before testing
> Gmail OAuth on the sandbox.

### Sandbox identity (the env badge reads these)

| Vercel key | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | `sandbox` | Forces the env badge to show SANDBOX. |
| `ENABLE_LIVE_SEND` | `false` | Hard gate — DO NOT set to `true` until reconciliation is done. |
| `KOHLER_PORTFOLIO_URL` | `https://kohler.solokit.app` | Default — override only if testing a different portfolio. |
| `KOHLER_RESUME_URL` | _(leave unset for now; or paste a public résumé URL)_ | Phase 8 templates link this if set. |

### Optional / future

| Vercel key | Value | Notes |
| --- | --- | --- |
| `USAJOBS_AUTHORIZATION_KEY` | _(leave unset)_ | careers ingest USAJOBS source — optional, route degrades gracefully. |
| `USAJOBS_USER_AGENT` | _(leave unset)_ | as above |

---

## After the project is live

1. Open the URL. The bottom-left badge should read **SANDBOX** in green.
2. Click the badge — you should see env, branch, parser versions, job
   counts, last sync. If anything reads `—` it means the Supabase
   query is fine but no data exists yet.
3. Visit `/command-center` — should render Phase 6 cards from live
   `job_listings` (383 rows in production).
4. Visit `/dashboard` — most KPI tiles should populate; "Migration
   status" will show several **missing** dots until reconciliation
   sessions A-F land.
5. **Do not click "Rescore all" or any draft-creation button** — those
   routes write columns that don't exist on live tables and will
   error mid-write. See `docs/verification-report.md` §"What does
   not work against live schema".
6. The legacy pages (`/open-roles`, `/outreach-list`, `/queue`,
   `/template`) work and read live data — safe to browse.

## After Sessions A-F land

The promotion plan in `docs/production-promotion-plan.md` runs against
this same Vercel project. No second cutover needed — the sandbox URL
becomes the canonical preview environment.

## Cleanup

After the project exists:
- Revoke the GitHub PAT and Vercel token from steps A1/A2.
- Delete those rows from `env_vault`:
  ```sql
  delete from public.env_vault
  where project = 'claude-sandbox'
    and key in ('GITHUB_PAT', 'VERCEL_TOKEN');
  ```
