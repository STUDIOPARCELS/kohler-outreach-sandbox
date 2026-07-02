# Kohler Outreach

Internal tool for generating, editing, and batch-printing outreach letters and #10 envelopes.

Built with Next.js (App Router), TypeScript, Tailwind CSS, and Supabase.

## Setup

### 1. Create a GitHub Repo

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/kohler-outreach.git
git push -u origin main
```

### 2. Install Dependencies (local dev)

```bash
npm install
```

### 3. Local Development

Create a `.env.local` file:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and import the GitHub repo.
2. In **Project Settings > Environment Variables**, add:

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | `https://your-project.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |

3. Click **Deploy**.
4. After adding env vars, trigger a **Redeploy** from the Deployments tab.

## Features

- **Outreach List** — Browse companies without open roles, filter by tier, search, check contacts
- **Company Detail** — Edit company fields, manage contacts, create/edit outreach drafts
- **Letters Queue** — View all drafts, filter by status, multi-select for batch actions
- **Template** — Edit the outreach letter template, preview rendered letters
- **Open Roles** — Browse companies with open roles, expand to see relevant jobs
- **Print Letters** — Batch print letters with page breaks, footers, and preserved formatting
- **Print Envelopes** — Batch print #10 envelopes with calibration guide toggle

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run test:fit` / `test:schema` / `test:gmail` / `test:bounce` / `test:freshness` | Node test suites (also run in CI) |

## CI and the Nightly Freshness Probe

Two GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`** — on every push and pull request: typecheck (`tsc --noEmit`),
  the five test suites, and `next build`. Needs no secrets.
- **`freshness.yml`** — daily at 15:00 UTC (after the 14:00 UTC ingest) plus
  manual dispatch. Runs `scripts/check-freshness.mjs`, which fails when no
  sync run completed in the last 48h, a `sync_runs` row is stuck in
  `running` for over 2h, or `job_listings` shows no activity in 72h.

The freshness probe needs two repository secrets. Add them under
**repo Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The project's service-role key |

Until both secrets exist, the probe logs a "secrets not configured — skipping"
notice and exits green instead of failing.
