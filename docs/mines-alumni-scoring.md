# Mines Alumni Signal Proposal

This is a proposed sandbox schema only. It has not been applied.

## Goal

Add Colorado School of Mines alumni as a first-class outreach success signal without mixing uncertain web-search evidence into the existing `contacts` or `companies` records.

## Proposed Table

```sql
create table company_alumni_evidence (
  id bigserial primary key,
  companyname text not null,
  person_name text,
  title text,
  linkedin_url text,
  evidence_url text,
  evidence_text text,
  confidence text not null default 'medium',
  source text not null,
  found_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index company_alumni_evidence_companyname_idx
  on company_alumni_evidence (companyname);
```

## Scoring Use

- Count distinct high or medium confidence alumni per company.
- Add up to 20 points to the outreach score.
- Keep evidence separate so a person can be reviewed before being used as an outreach contact.

## Collection Path

1. Search only public sources such as LinkedIn snippets, company bios, Mines alumni pages, conference bios, and public resumes.
2. Store the source URL and short evidence text.
3. Do not infer alumni status without visible evidence.
4. Show count and confidence in the company detail page before allowing it to influence outreach copy.
