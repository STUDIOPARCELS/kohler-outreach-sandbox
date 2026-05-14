// Phase 9 — Gmail draft creation and (gated) live send.
//
// Default behavior is to create a Gmail draft. Live send only happens
// when ENABLE_LIVE_SEND is "true" AND the draft row's status is
// "human_approved". This is the prompt's safety contract.

import type { gmail_v1 } from "googleapis";
import { getAuthedGmailClient } from "@/lib/googleAuth";
import { getRuntimeEnvironment } from "@/lib/runtimeEnvironment";

export interface DraftMessage {
  to_email: string;
  to_name?: string | null;
  reply_to?: string | null;
  subject: string;
  body_text: string;
  body_html?: string | null;
  in_reply_to?: string | null;
  references?: string | null;
  thread_id?: string | null;
}

function encodeRfc2047(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildMime(msg: DraftMessage, fromEmail: string): string {
  const boundary = `kohler-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const toHeader = msg.to_name
    ? `${encodeRfc2047(msg.to_name)} <${msg.to_email}>`
    : msg.to_email;
  const headers = [
    `From: ${fromEmail}`,
    `To: ${toHeader}`,
    msg.reply_to ? `Reply-To: ${msg.reply_to}` : null,
    `Subject: ${encodeRfc2047(msg.subject)}`,
    msg.in_reply_to ? `In-Reply-To: ${msg.in_reply_to}` : null,
    msg.references ? `References: ${msg.references}` : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    msg.body_text,
  ].join("\r\n");

  const htmlPart = msg.body_html
    ? [
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        msg.body_html,
      ].join("\r\n")
    : null;

  const ending = `--${boundary}--`;

  return [headers.join("\r\n"), "", textPart, htmlPart, ending]
    .filter(Boolean)
    .join("\r\n");
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export type SendMode = "draft" | "send" | "dry_run";

export function pickSendMode(input: { explicit?: SendMode; approved: boolean }): SendMode {
  if (input.explicit === "dry_run") return "dry_run";
  if (input.explicit === "send") {
    return input.approved && getRuntimeEnvironment().liveSendEnabled ? "send" : "draft";
  }
  return "draft";
}

export interface GmailDispatchResult {
  mode: SendMode;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  gmail_draft_id: string | null;
  warnings: string[];
}

export async function dispatchGmailMessage(input: {
  message: DraftMessage;
  mode: SendMode;
}): Promise<GmailDispatchResult> {
  const warnings: string[] = [];

  if (input.mode === "dry_run") {
    return {
      mode: "dry_run",
      gmail_message_id: null,
      gmail_thread_id: input.message.thread_id ?? null,
      gmail_draft_id: null,
      warnings,
    };
  }

  let gmailClient: { gmail: gmail_v1.Gmail; account: { email: string } };
  try {
    const authed = await getAuthedGmailClient();
    gmailClient = { gmail: authed.gmail as gmail_v1.Gmail, account: authed.account };
  } catch (err) {
    return {
      mode: input.mode,
      gmail_message_id: null,
      gmail_thread_id: input.message.thread_id ?? null,
      gmail_draft_id: null,
      warnings: [`gmail auth failed: ${(err as Error).message}`],
    };
  }

  const mime = buildMime(input.message, gmailClient.account.email);
  const raw = base64Url(mime);

  if (input.mode === "draft") {
    const res = await gmailClient.gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          threadId: input.message.thread_id ?? undefined,
        },
      },
    });
    return {
      mode: "draft",
      gmail_message_id: res.data.message?.id ?? null,
      gmail_thread_id: res.data.message?.threadId ?? input.message.thread_id ?? null,
      gmail_draft_id: res.data.id ?? null,
      warnings,
    };
  }

  const res = await gmailClient.gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: input.message.thread_id ?? undefined,
    },
  });
  return {
    mode: "send",
    gmail_message_id: res.data.id ?? null,
    gmail_thread_id: res.data.threadId ?? input.message.thread_id ?? null,
    gmail_draft_id: null,
    warnings,
  };
}
