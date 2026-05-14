// Phase 8 — outreach template renderers. Six templates produce
// `{ subject, body_text, body_html }` from a typed context.

import { getRuntimeEnvironment } from "@/lib/runtimeEnvironment";

export type TemplateKey =
  | "active_job_em"
  | "active_job_recruiter"
  | "company_intro"
  | "mines_alumni"
  | "pe_track"
  | "physical_letter";

export interface OutreachContext {
  candidate: {
    name: string;
    email: string | null;
    portfolio_url: string;
    resume_url: string | null;
    is_eit: boolean;
    is_mines_alumni: boolean;
  };
  contact: {
    full_name: string | null;
    first_name: string | null;
    title: string | null;
    is_mines_alumni: boolean;
    is_possible_pe: boolean;
  };
  company: {
    name: string;
    niche: string | null;
    city: string | null;
    careers_url: string | null;
  };
  job: {
    title: string | null;
    location: string | null;
    apply_url: string | null;
    fit_summary: string | null;
  } | null;
  fit?: {
    matched_skills: string[];
    pe_signals: string[];
    overall_score: number;
  } | null;
  notes?: string | null;
}

export interface RenderedTemplate {
  template_key: TemplateKey;
  subject: string;
  body_text: string;
  body_html: string;
  variables: Record<string, unknown>;
}

const SIGNATURE_TEXT_LINES = [
  "—",
  "Kohler Wood, BSME, EIT",
  "Colorado School of Mines",
];

function signatureText(context: OutreachContext): string {
  return [
    ...SIGNATURE_TEXT_LINES,
    context.candidate.email ?? "",
    `Portfolio: ${context.candidate.portfolio_url}`,
    context.candidate.resume_url ? `Résumé: ${context.candidate.resume_url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function signatureHtml(context: OutreachContext): string {
  return `
<p style="margin-top:1.25em;color:#555;font-size:13px;line-height:1.5">
—<br>
<strong>Kohler Wood</strong>, BSME, EIT<br>
Colorado School of Mines<br>
${context.candidate.email ? `<a href="mailto:${context.candidate.email}">${context.candidate.email}</a><br>` : ""}
Portfolio: <a href="${context.candidate.portfolio_url}">${context.candidate.portfolio_url}</a><br>
${context.candidate.resume_url ? `Résumé: <a href="${context.candidate.resume_url}">${context.candidate.resume_url}</a>` : ""}
</p>`.trim();
}

function asHtml(text: string, signature: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
  return `${paragraphs}\n${signature}`;
}

function firstName(full: string | null): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

function fitParagraph(context: OutreachContext): string {
  const skills = context.fit?.matched_skills ?? [];
  if (skills.length === 0) return "";
  const top = skills.slice(0, 5).join(", ");
  return `My background pairs well with the role: ${top}.`;
}

function peParagraph(context: OutreachContext): string {
  const signals = context.fit?.pe_signals ?? [];
  if (signals.length === 0) {
    return "I'm pursuing professional engineer (PE) licensure and look for roles that support EIT-track experience.";
  }
  return `The posting mentions ${signals.slice(0, 3).join(", ")} — exactly the supervision and design experience I'm targeting on the way to a PE.`;
}

export function renderTemplate(
  key: TemplateKey,
  context: OutreachContext
): RenderedTemplate {
  const sigText = signatureText(context);
  const sigHtml = signatureHtml(context);
  const contactFirst = firstName(context.contact.first_name ?? context.contact.full_name);

  const variables: Record<string, unknown> = {
    candidate_name: context.candidate.name,
    portfolio_url: context.candidate.portfolio_url,
    resume_url: context.candidate.resume_url,
    company_name: context.company.name,
    contact_first_name: contactFirst,
    contact_full_name: context.contact.full_name,
    job_title: context.job?.title ?? null,
    job_apply_url: context.job?.apply_url ?? null,
  };

  switch (key) {
    case "active_job_em": {
      const subject = context.job?.title
        ? `${context.job.title} at ${context.company.name} — quick intro`
        : `Engineering at ${context.company.name} — quick intro`;
      const lines = [
        `Hi ${contactFirst},`,
        "",
        `I'm Kohler Wood, a Colorado School of Mines mechanical engineering grad (EIT) based in Lakewood. I noticed ${context.company.name} has the ${context.job?.title ?? "open mechanical role"} posted and wanted to reach out directly to whoever owns the design team.`,
        "",
        fitParagraph(context),
        "",
        "If you have ten minutes for a quick intro call I'd appreciate the time. My portfolio is below; happy to send résumé and references on request.",
        "",
      ].filter((l) => l !== "" || true);
      const text = lines.join("\n");
      return {
        template_key: key,
        subject,
        body_text: `${text}\n${sigText}`,
        body_html: asHtml(text, sigHtml),
        variables,
      };
    }
    case "active_job_recruiter": {
      const subject = `${context.job?.title ?? "Mechanical Engineer"} — Kohler Wood, BSME / EIT`;
      const text = [
        `Hi ${contactFirst},`,
        "",
        `I just applied to ${context.job?.title ?? "the mechanical engineering role"} at ${context.company.name}${context.job?.apply_url ? ` (${context.job.apply_url})` : ""}.`,
        "",
        `${fitParagraph(context)} I'm in Lakewood, CO and ready to interview on short notice.`,
        "",
        "If it would help to speak before you screen the application, I'm happy to do a 15-minute call this week.",
        "",
      ].join("\n");
      return {
        template_key: key,
        subject,
        body_text: `${text}\n${sigText}`,
        body_html: asHtml(text, sigHtml),
        variables,
      };
    }
    case "company_intro": {
      const subject = `${context.company.name} engineering — exploratory note from Kohler Wood`;
      const text = [
        `Hi ${contactFirst},`,
        "",
        `I'm reaching out cold because ${context.company.name}'s work in ${context.company.niche ?? "engineering"} is one of the reasons I focused my BSME at Colorado School of Mines on ${context.fit?.matched_skills?.slice(0, 2).join(" and ") || "design and manufacturing"}.`,
        "",
        `Even if there's no current opening, I'd love a 15-minute conversation to learn what your team prioritizes when an EIT-track engineer is added. ${fitParagraph(context)}`,
        "",
        "Portfolio is below; I can share my résumé if useful.",
        "",
      ].join("\n");
      return {
        template_key: key,
        subject,
        body_text: `${text}\n${sigText}`,
        body_html: asHtml(text, sigHtml),
        variables,
      };
    }
    case "mines_alumni": {
      const subject = `Hi from a fellow Mines grad — ${context.company.name}`;
      const text = [
        `Hi ${contactFirst},`,
        "",
        `Saw your Colorado School of Mines connection and wanted to introduce myself. I'm Kohler Wood, BSME / EIT, also out of Mines, now based in Lakewood and looking for the right early-career mechanical engineering role.`,
        "",
        `${context.company.name}'s work in ${context.company.niche ?? "this space"} is on my short list. ${fitParagraph(context)}`,
        "",
        "If you have a few minutes for a Mines-to-Mines conversation, I'd value your perspective on where I'd add value on your team.",
        "",
      ].join("\n");
      return {
        template_key: key,
        subject,
        body_text: `${text}\n${sigText}`,
        body_html: asHtml(text, sigHtml),
        variables,
      };
    }
    case "pe_track": {
      const subject = `EIT looking for a PE-track role at ${context.company.name}`;
      const text = [
        `Hi ${contactFirst},`,
        "",
        `I'm Kohler Wood, BSME / EIT (Colorado School of Mines). I'm specifically targeting roles where I can build the design experience needed for the PE exam under supervision.`,
        "",
        peParagraph(context),
        "",
        "Could we talk for 15 minutes about what an early-career PE-track hire looks like at " +
          `${context.company.name}?`,
        "",
      ].join("\n");
      return {
        template_key: key,
        subject,
        body_text: `${text}\n${sigText}`,
        body_html: asHtml(text, sigHtml),
        variables,
      };
    }
    case "physical_letter": {
      const subject = `Letter to ${context.contact.full_name ?? context.company.name}`;
      const lines = [
        `Dear ${context.contact.full_name ?? `${context.company.name} hiring team`},`,
        "",
        `I am writing to introduce myself: Kohler Wood, BSME / EIT, Colorado School of Mines. I have been following ${context.company.name}'s work in ${context.company.niche ?? "engineering"} and would value the chance to discuss how I might contribute as an early-career engineer on your team.`,
        "",
        fitParagraph(context),
        "",
        peParagraph(context),
        "",
        `My portfolio is at ${context.candidate.portfolio_url}${context.candidate.resume_url ? `, and my résumé at ${context.candidate.resume_url}` : ""}. I would welcome the opportunity to talk further.`,
        "",
        "Sincerely,",
        "",
        "Kohler Wood",
      ].join("\n");
      return {
        template_key: key,
        subject,
        body_text: lines,
        body_html: asHtml(lines, ""),
        variables,
      };
    }
  }
}

export function pickTemplate(args: {
  recommended_action: string;
  hasJob: boolean;
  contact_is_mines: boolean;
  contact_is_pe: boolean;
}): TemplateKey {
  switch (args.recommended_action) {
    case "apply_now":
    case "email_engineering_manager":
      return args.hasJob ? "active_job_em" : "company_intro";
    case "email_recruiter":
      return args.hasJob ? "active_job_recruiter" : "company_intro";
    case "alumni_outreach":
      return "mines_alumni";
    case "pe_track_outreach":
      return "pe_track";
    case "physical_letter":
      return "physical_letter";
    case "monitor":
    case "skip":
    default:
      return "company_intro";
  }
}

export function defaultCandidate(): OutreachContext["candidate"] {
  const env = getRuntimeEnvironment();
  return {
    name: "Kohler Wood",
    email: env.candidateEmail,
    portfolio_url: env.portfolioUrl,
    resume_url: env.resumeUrl,
    is_eit: true,
    is_mines_alumni: true,
  };
}
