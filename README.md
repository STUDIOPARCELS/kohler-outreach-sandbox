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
