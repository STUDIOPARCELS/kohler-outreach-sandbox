// Phase 8 — create an outreach draft.
//
// POST /api/outreach/create-draft
//   { companyname, contact_id?, job_id?, template_key?,
//     recommended_action?, channel? }
//
// Resolves the company, contact, and job, picks the best template (or
// uses the supplied one), renders the email, and writes:
//   - one row in `outreach_actions` (status="drafted")
//   - one row in `email_drafts` (status="draft")
// for email channels. For `channel="letter"`, writes a `letters` row
// instead.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  defaultCandidate,
  pickTemplate,
  renderTemplate,
  type OutreachContext,
  type TemplateKey,
} from "@/lib/outreach/templates";
import { scoreJobForKohler } from "@/lib/kohlerFitScore";

export const dynamic = "force-dynamic";

interface RequestBody {
  companyname?: string;
  contact_id?: number;
  job_id?: number;
  template_key?: TemplateKey;
  recommended_action?: string;
  channel?: "email" | "letter";
  campaign_id?: number;
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    /* allow empty */
  }

  if (!body.companyname) {
    return NextResponse.json({ error: "companyname required" }, { status: 400 });
  }

  const { data: companyRows } = await supabaseAdmin
    .from("companies")
    .select("id, companyname, city, niche, careers_url")
    .ilike("companyname", body.companyname)
    .limit(1);
  const company = (companyRows?.[0] ?? null) as
    | { id: number; companyname: string; city: string | null; niche: string | null; careers_url: string | null }
    | null;
  if (!company) {
    return NextResponse.json({ error: `company "${body.companyname}" not found` }, { status: 404 });
  }

  type ContactRow = {
    id: number | null;
    full_name: string | null;
    title: string | null;
    email: string | null;
    is_mines_alumni: boolean | null;
    is_possible_pe: boolean | null;
  };
  let contact: ContactRow | null = null;

  if (body.contact_id) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, title, email, is_mines_alumni, is_possible_pe")
      .eq("id", body.contact_id)
      .maybeSingle();
    contact = (data ?? null) as ContactRow | null;
  } else {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, title, email, is_mines_alumni, is_possible_pe")
      .eq("companyname", company.companyname)
      .order("email_confidence", { ascending: false, nullsFirst: false })
      .limit(1);
    contact = ((data ?? [])[0] ?? null) as ContactRow | null;
  }

  type JobRow = {
    id: number;
    title: string;
    location: string | null;
    apply_url: string | null;
    job_url: string | null;
    body_text: string | null;
    description: string | null;
    niche: string | null;
    relevance_reason: string | null;
  };
  let job: JobRow | null = null;
  if (body.job_id) {
    const { data } = await supabaseAdmin
      .from("job_listings")
      .select("id, title, location, apply_url, job_url, body_text, description, niche, relevance_reason")
      .eq("id", body.job_id)
      .maybeSingle();
    job = (data ?? null) as JobRow | null;
  }

  const fit = job
    ? scoreJobForKohler({
        title: job.title,
        body_text: job.body_text,
        description: job.description,
        location: job.location,
        niche: job.niche ?? company.niche,
        company_name: company.companyname,
        match_reason: job.relevance_reason,
        apply_url: job.apply_url,
        job_url: job.job_url,
      })
    : null;

  const candidate = defaultCandidate();
  const templateKey: TemplateKey =
    body.template_key ??
    pickTemplate({
      recommended_action: body.recommended_action ?? fit?.recommended_action ?? "monitor",
      hasJob: !!job,
      contact_is_mines: !!contact?.is_mines_alumni,
      contact_is_pe: !!contact?.is_possible_pe,
    });

  const context: OutreachContext = {
    candidate,
    contact: {
      full_name: contact?.full_name ?? null,
      first_name: (contact?.full_name ?? "").split(/\s+/)[0] || null,
      title: contact?.title ?? null,
      is_mines_alumni: !!contact?.is_mines_alumni,
      is_possible_pe: !!contact?.is_possible_pe,
    },
    company: {
      name: company.companyname,
      niche: company.niche,
      city: company.city,
      careers_url: company.careers_url,
    },
    job: job
      ? {
          title: job.title,
          location: job.location,
          apply_url: job.apply_url ?? job.job_url,
          fit_summary: job.relevance_reason,
        }
      : null,
    fit: fit
      ? {
          matched_skills: fit.explanation_json.matched_skills,
          pe_signals: fit.explanation_json.pe_signals,
          overall_score: fit.overall_score,
        }
      : null,
  };

  const rendered = renderTemplate(templateKey, context);

  const channel = body.channel ?? "email";

  const { data: actionRow, error: actionErr } = await supabaseAdmin
    .from("outreach_actions")
    .insert({
      campaign_id: body.campaign_id ?? null,
      company_id: company.id,
      companyname: company.companyname,
      contact_id: contact?.id ?? null,
      job_id: job?.id ?? null,
      template_key: rendered.template_key,
      recommended_action: body.recommended_action ?? fit?.recommended_action ?? null,
      status: "drafted",
      channel,
    })
    .select("id")
    .single();

  if (actionErr) {
    if (/does not exist/i.test(actionErr.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "outreach_actions table missing — apply supabase/migrations/0004_outreach_workflow.sql",
          rendered,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: actionErr.message }, { status: 500 });
  }

  const actionId = (actionRow as { id: number }).id;

  if (channel === "letter") {
    const { error: letterErr } = await supabaseAdmin
      .from("letters")
      .insert({
        outreach_action_id: actionId,
        to_name: contact?.full_name ?? null,
        to_address: null,
        body_text: rendered.body_text,
        status: "draft",
      });
    if (letterErr) return NextResponse.json({ ok: false, error: letterErr.message }, { status: 500 });
  } else {
    const { error: draftErr } = await supabaseAdmin
      .from("email_drafts")
      .insert({
        outreach_action_id: actionId,
        to_email: contact?.email ?? null,
        to_name: contact?.full_name ?? null,
        reply_to: candidate.email,
        subject: rendered.subject,
        body_html: rendered.body_html,
        body_text: rendered.body_text,
        template_key: rendered.template_key,
        variables: rendered.variables,
        status: "draft",
      });
    if (draftErr) return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    outreach_action_id: actionId,
    channel,
    rendered,
    contact_used: contact ? { id: contact.id, full_name: contact.full_name } : null,
  });
}
