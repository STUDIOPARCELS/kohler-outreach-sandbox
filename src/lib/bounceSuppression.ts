import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface BouncedContact {
  email: string;
  companyname: string | null;
  contactName: string | null;
  receivedAt: string | null;
  reason: string | null;
  messageId: string;
}

function normalizeEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function extractEmails(value: string | null | undefined): string[] {
  const matches = (value || "").match(EMAIL_PATTERN) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

function metadataEmail(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { contact_email?: unknown }).contact_email;
  return typeof value === "string" ? normalizeEmail(value) : null;
}

function metadataText(metadata: unknown, key: "companyname" | "contact_name"): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summarizeBounce(snippet: string | null | undefined): string | null {
  const text = (snippet || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/address not found/i.test(text)) return "Address not found";
  if (/recipient address rejected/i.test(text)) return "Recipient address rejected";
  if (/does not exist/i.test(text)) return "Mailbox does not exist";
  return text.slice(0, 140);
}

export async function loadBouncedContacts(limit = 250): Promise<BouncedContact[]> {
  const { data, error } = await supabaseAdmin
    .from("email_messages")
    .select("id, gmail_message_id, received_at, snippet, metadata")
    .eq("classification", "bounce")
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const byEmail = new Map<string, BouncedContact>();
  for (const row of data || []) {
    const email = metadataEmail(row.metadata);
    if (!email) continue;
    const existing = byEmail.get(email);
    if (existing && existing.receivedAt && row.received_at && existing.receivedAt >= row.received_at) continue;
    byEmail.set(email, {
      email,
      companyname: metadataText(row.metadata, "companyname"),
      contactName: metadataText(row.metadata, "contact_name"),
      receivedAt: row.received_at || null,
      reason: summarizeBounce(row.snippet),
      messageId: row.gmail_message_id || row.id,
    });
  }

  return Array.from(byEmail.values());
}

export async function findBouncedRecipients(value: string | null | undefined): Promise<BouncedContact[]> {
  const recipients = new Set(extractEmails(value));
  if (recipients.size === 0) return [];
  const bounced = await loadBouncedContacts();
  return bounced.filter((row) => recipients.has(row.email));
}
