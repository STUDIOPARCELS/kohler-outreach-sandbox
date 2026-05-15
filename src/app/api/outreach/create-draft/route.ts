// Session E (reconciled to live KOHLER OS schema 2026-05-15).
//
// POST /api/outreach/create-draft
//   { companyname, contact_id?, job_id?, template_key?,
//     recommended_action?, channel?, campaign_id? }
//
// Resolves company / contact / job, picks a template, renders it, then:
//   - inserts one row in `outreach_actions` (live shape)
//   - inserts one row in `email_drafts` (channel=email) OR `letters`
//     (channel=letter)
//
// Live outreach_actions schema (verified):
//   id uuid · companyname text · job_listing_id text · contact_id text
//   campaign_id text · action_type text (12-value enum) · status text
//   (pending|in_progress|completed|skipped|canceled) · priority int
//   title text · notes text · metadata jsonb · ...
// There is NO template_key / recommended_action / channel / company_id
// column — those go into metadata. action_type for a draft is
// 'create_draft'.

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
  campaign_id?: string;
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

  // contacts: live columns are contactname / linkedin (Session C added
  // is_mines_alumni / is_possible_pe / email_confidence).
  type ContactRow = {
    id: number | null;
    contactname: string | null;
    title: string | null;
    email: string | null;
    is_mines_alumni: boolean | null;
    is_possible_pe: boolean | null;
  };
  let contact: ContactRow | null = null;

  if (body.contact_id) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, contactname, title, email, is_mines_alumni, is_possible_pe")
      .eq("id", body.contact_id)
      .maybeSingle();
    contact = (data ?? null) as ContactRow | null;
  } else {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, contactname, title, email, is_mines_alumni, is_possible_pe")
      .eq("companyname", company.companyname)
      .order("email_confidence", { ascending: false, nullsFirst: false })
      .limit(1);
    contact = ((data ?? [])[0] ?? null) as ContactRow | null;
  }

  // job_listings: long-form text is `summary`; no body_text/description/
  // niche columns. Niche comes from the company.
  type JobRow = {
    id: number;
    title: string;
    location: string | null;
    apply_url: string | null;
    job_url: string | null;
    summary: string | null;
    relevance_reason: string | null;
  };
  let job: JobRow | null = null;
  if (body.job_id) {
    const { data } = await supabaseAdmin
      .from("job_listings")
      .select("id, title, location, apply_url, job_url, summary, relevance_reason")
      .eq("id", body.job_id)
      .maybeSingle();
    job = (data ?? null) as JobRow | null;
  }

  const fit = job
    ? scoreJobForKohler({
        title: job.title,
        body_text: job.summary,
        description: job.summary,
        location: job.location,
        niche: company.niche,
        company_name: company.companyname,
        match_reason: job.relevance_reason,
        apply_url: job.apply_url,
        job_url: job.job_url,
      })
    : null;

  const candidate = defaultCandidate();
  const contactName = contact?.contactname ?? null;
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
      full_name: contactName,
      first_name: (contactName ?? "").split(/\s+/)[0] || null,
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
  const recommendedAction = body.recommended_action ?? fit?.recommended_action ?? null;

  // Insert into the LIVE outreach_actions shape.
  const { data: actionRow, error: actionErr } = await supabaseAdmin
    .from("outreach_actions")
    .insert({
      companyname: company.companyname,
      job_listing_id: job ? String(job.id) : null,
      contact_id: contact?.id != null ? String(contact.id) : null,
      campaign_id: body.campaign_id ?? null,
      action_type: "create_draft",
      status: "pending",
      title: `Draft (${rendered.template_key}) for ${company.companyname}`,
      source: "create-draft-route",
      metadata: {
        template_key: rendered.template_key,
        channel,
        recommended_action: recommendedAction,
        rendered_subject: rendered.subject,
      },
    })
    .select("id")
    .single();

  if (actionErr) {
    return NextResponse.json({ ok: false, error: actionErr.message, rendered }, { status: 500 });
  }

  const actionId = (actionRow as { id: string }).id;

  if (channel === "letter") {
    const { error: letterErr } = await supabaseAdmin.from("letters").insert({
      outreach_action_id: actionId,
      to_name: contactName,
      to_address: null,
      body_text: rendered.body_text,
      status: "draft",
    });
    if (letterErr) return NextResponse.json({ ok: false, error: letterErr.message }, { status: 500 });
  } else {
    const { error: draftErr } = await supabaseAdmin.from("email_drafts").insert({
      outreach_action_id: actionId,
      to_email: contact?.email ?? null,
      to_name: contactName,
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
    contact_used: contact ? { id: contact.id, contactname: contactName } : null,
  });
}
