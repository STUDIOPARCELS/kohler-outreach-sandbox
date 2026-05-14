#!/usr/bin/env python3
"""Backfill Kohler Gmail replies/bounces through Gmail IMAP.

Uses existing GMAIL_USER/GMAIL_APP_PASSWORD credentials. No email is sent.
Secrets are loaded from local env files and are never printed.
"""

from __future__ import annotations

import argparse
import email
import imaplib
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path
from typing import Any


EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
ACTIONABLE = {"positive_reply", "recruiter_screen", "apply_online", "referral", "needs_follow_up"}
GENERIC_EMAIL_DOMAINS = {
    "aol.com",
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "icloud.com",
    "live.com",
    "me.com",
    "msn.com",
    "outlook.com",
    "proton.me",
    "protonmail.com",
    "yahoo.com",
}


def load_env(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = Path(path)
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def mask_email(value: str | None) -> str | None:
    if not value or "@" not in value:
        return value
    local, domain = value.lower().split("@", 1)
    return f"{local[:2]}***@{domain}"


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def email_domain(value: str | None) -> str | None:
    normalized = normalize_email(value)
    if "@" not in normalized:
        return None
    domain = normalized.rsplit("@", 1)[1].strip()
    return domain or None


def is_generic_email_domain(domain: str | None) -> bool:
    return not domain or domain in GENERIC_EMAIL_DOMAINS


def extract_emails(value: str | None) -> list[str]:
    return sorted(set(email.lower() for email in EMAIL_PATTERN.findall(value or "")))


def decode_mime(value: str | None) -> str:
    if not value:
        return ""
    parts = []
    for payload, charset in decode_header(value):
        if isinstance(payload, bytes):
            parts.append(payload.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(payload)
    return "".join(parts)


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def normalize_subject(value: str | None) -> str:
    text = value or ""
    text = re.sub(r"^(\s*(re|fw|fwd)\s*:\s*)+", "", text, flags=re.I)
    text = re.sub(r"\[[^\]]+\]", " ", text)
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def looks_like_reply_subject(value: str | None) -> bool:
    return bool(re.match(r"^\s*(re|fw|fwd|automatic reply)\s*:", value or "", flags=re.I))


def token_set(value: str | None) -> set[str]:
    stop_words = {
        "and",
        "associates",
        "company",
        "corp",
        "corporation",
        "engineers",
        "engineering",
        "group",
        "inc",
        "llc",
        "systems",
        "technologies",
        "technology",
        "the",
    }
    text = re.sub(r"[^a-z0-9\s]", " ", (value or "").lower())
    return {token for token in text.split() if len(token) >= 4 and token not in stop_words}


def should_skip_automated_domain_sender(from_email: str | None, subject: str | None, snippet: str | None) -> bool:
    sender = normalize_email(from_email)
    local = sender.split("@", 1)[0] if "@" in sender else sender
    text = f"{subject or ''} {snippet or ''}".lower()
    if re.search(r"mailer-daemon|postmaster", sender):
        return False
    if re.search(r"^((no-?|do-?not-?)reply|noreply|donotreply)$", local):
        return True
    if re.search(r"career|job|talent|alert|notification|opportunit|workday|greenhouse|lever|ashby|icims|successfactors", sender):
        return True
    return bool(re.search(r"finish your application|talent community|job alert|career alert|new openings in your area", text))


def direct_outreach_evidence(rows: list[dict[str, Any]], from_email: str | None, subject: str | None, snippet: str | None) -> list[str]:
    text = f"{from_email or ''} {subject or ''} {snippet or ''}".lower()
    evidence: list[str] = []
    for marker in ("kohler", "kwood12802", "akwood1", "solokit", "bsme", "eit"):
        if marker in text:
            evidence.append(f"marker:{marker}")
    if looks_like_reply_subject(subject):
        evidence.append("reply_subject")

    for row in rows:
        contact = normalize_email(row.get("contact_email"))
        if contact and contact in text:
            evidence.append("contact_email")
        for token in token_set(row.get("contactname")):
            if token in text:
                evidence.append(f"contact_token:{token}")

    return sorted(set(evidence))


def subject_similarity(left: str | None, right: str | None) -> float:
    a = {token for token in normalize_subject(left).split() if len(token) > 2}
    b = {token for token in normalize_subject(right).split() if len(token) > 2}
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def plain_text(message: email.message.Message) -> str:
    bodies: list[str] = []
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get_content_disposition() == "attachment":
                continue
            if part.get_content_type() != "text/plain":
                continue
            payload = part.get_payload(decode=True)
            if payload:
                bodies.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
    else:
        payload = message.get_payload(decode=True)
        if payload:
            bodies.append(payload.decode(message.get_content_charset() or "utf-8", errors="replace"))
    return "\n".join(bodies)


def classify_reply(from_email: str | None, subject: str | None, snippet: str | None, headers: dict[str, str]) -> str:
    sender = normalize_email(from_email)
    text = f"{subject or ''} {snippet or ''}".lower()
    auto_submitted = headers.get("auto-submitted", "").lower()
    precedence = headers.get("precedence", "").lower()

    if (
        re.search(r"mailer-daemon|postmaster|no-?reply@|do-?not-?reply@", sender)
        or re.search(r"delivery status notification|delivery failure|undeliver(?:ed|able)|address not found|message wasn'?t delivered|mail delivery failed|returned mail", text)
    ):
        return "bounce"
    if re.search(r"out of office|automatic reply|auto(?:matic)? response|\booo\b", text) or (auto_submitted and auto_submitted != "no") or precedence in {"bulk", "auto_reply"}:
        return "out_of_office"
    if re.search(r"finish your application|talent community|job alert|career alert|new openings in your area", text):
        return "auto_reply"
    if re.search(r"not moving forward|unfortunately|not a fit|no current openings|we'?ll keep (your|his) (resume|information)|position has been filled", text):
        return "rejection"
    if re.search(r"phone screen|screening call|schedule (a )?(call|conversation|interview)|availability|recruiter|talent acquisition|interview", text):
        return "recruiter_screen"
    if re.search(r"happy to (chat|talk|connect|discuss)|let'?s (talk|chat|connect|set up)|would like to (talk|chat|connect|discuss)|sounds (interesting|great|good)|please send (your|his) resume|forward(ed|ing)? (this|your|his)", text):
        return "positive_reply"
    if re.search(r"apply online|submit (an )?application|careers portal|application portal", text):
        return "apply_online"
    if re.search(r"referr(al|ed)|introduc(e|tion)|connect (you|him) with|passed (this|it) along", text):
        return "referral"
    if re.search(r"\?|can you|could you|please confirm|follow up|circle back", text):
        return "needs_follow_up"
    if auto_submitted or precedence == "list":
        return "auto_reply"
    return "unknown"


def sent_times(row: dict[str, Any]) -> list[tuple[str, float]]:
    pairs = []
    for key in ("emailed_at", "sent_at", "printed_at", "updated_at"):
        parsed = parse_time(row.get(key))
        if parsed:
            pairs.append((key, parsed))
    return pairs


def infer_channel(row: dict[str, Any]) -> str:
    if row.get("emailed_at"):
        return "email"
    if row.get("sent_at") or row.get("printed_at"):
        return "letter"
    return "unknown"


def pick_best_outreach(rows: list[dict[str, Any]], received_at: str | None, reply_subject: str | None) -> dict[str, Any] | None:
    if not rows:
        return None
    received_ts = parse_time(received_at) or datetime.now(tz=timezone.utc).timestamp()
    best = None
    for row in rows:
        score = 0.0
        matched_by = "contact_email"
        past = [(name, ts) for name, ts in sent_times(row) if ts <= received_ts + 86400]
        if past:
            name, ts = min(past, key=lambda item: abs(received_ts - item[1]))
            days_ago = max(0.0, (received_ts - ts) / 86400)
            score += 120 - min(days_ago, 120)
            matched_by = name
        similarity = subject_similarity(row.get("subject_final"), reply_subject)
        if similarity > 0:
            score += similarity * 50
            matched_by = f"{matched_by}+subject"
        if row.get("emailed_at"):
            score += 10
        if row.get("sent_at") or row.get("printed_at"):
            score += 5
        if not best or score > best["score"]:
            best = {"row": row, "score": score, "matched_by": matched_by}
    if not best:
        return None
    return {"row": best["row"], "matched_by": best["matched_by"], "channel": infer_channel(best["row"])}


class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, table: str, query: str = "", body: Any = None, prefer: str | None = None) -> Any:
        url = f"{self.url}/rest/v1/{table}{query}"
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else None


def imap_date(value: str) -> str:
    return datetime.fromisoformat(value).strftime("%d-%b-%Y")


def fetch_message(mail: imaplib.IMAP4_SSL, uid: bytes) -> tuple[str | None, email.message.Message] | None:
    typ, data = mail.uid("FETCH", uid, "(X-GM-THRID RFC822)")
    if typ != "OK":
        return None
    thread_id = None
    raw_message = None
    for item in data:
        if isinstance(item, tuple):
            prefix, payload = item
            match = re.search(rb"X-GM-THRID\s+(\d+)", prefix)
            if match:
                thread_id = match.group(1).decode("ascii")
            raw_message = payload
            break
    if not raw_message:
        return None
    return thread_id, email.message_from_bytes(raw_message)


def build_sent_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sent = []
    for row in rows:
        base = {
            "outreach_id": row["id"],
            "source_table": "reachout_company_inserts",
            "source_id": row["id"],
            "companyname": row.get("companyname"),
            "contact_email": normalize_email(row.get("contact_email")) or None,
            "subject": row.get("subject_final"),
            "status": row.get("status"),
            "metadata": {
                "contactname": row.get("contactname"),
                "job_title": row.get("job_title"),
                "job_url": row.get("job_url"),
                "emailed_at": row.get("emailed_at"),
                "sent_at": row.get("sent_at"),
                "printed_at": row.get("printed_at"),
            },
        }
        if row.get("emailed_at"):
            sent.append({**base, "channel": "email", "sent_at": row["emailed_at"]})
        elif row.get("sent_at") or row.get("printed_at"):
            sent.append({**base, "channel": "letter", "sent_at": row.get("sent_at") or row.get("printed_at")})
    return sent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-contacts", type=int, default=1000)
    parser.add_argument("--no-domain-scan", action="store_true")
    parser.add_argument("--limit-per-domain", type=int, default=25)
    args = parser.parse_args()

    sandbox_env = load_env(".env.local")
    gmail_env = {**load_env(".env.production.local"), **sandbox_env}
    # Prefer the production-local Gmail credentials if local env intentionally omits them.
    gmail_env.update({k: v for k, v in load_env(".env.production.local").items() if k.startswith("GMAIL_") or k == "REPLY_TO_EMAIL"})

    supabase = SupabaseRest(
        sandbox_env.get("KOHLER_SUPABASE_URL") or sandbox_env.get("SUPABASE_URL") or "",
        sandbox_env.get("KOHLER_SUPABASE_KEY") or sandbox_env.get("SUPABASE_SERVICE_ROLE_KEY") or "",
    )

    select = urllib.parse.quote("id,companyname,contactname,contact_email,subject_final,status,emailed_at,sent_at,printed_at,updated_at,job_title,job_url", safe=",")
    outreach_rows = supabase.request("GET", "reachout_company_inserts", f"?select={select}&limit=2000&order=updated_at.desc.nullslast")
    outreach_rows = [
        row for row in outreach_rows
        if (row.get("status") or "").lower() != "draft" and (row.get("emailed_at") or row.get("sent_at") or row.get("printed_at"))
    ]
    by_email: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in outreach_rows:
        normalized = normalize_email(row.get("contact_email"))
        if normalized:
            by_email[normalized].append(row)
        domain = email_domain(normalized)
        if not is_generic_email_domain(domain):
            by_domain[domain].append(row)

    contact_emails = sorted(by_email.keys())[: args.max_contacts]
    contact_domains = sorted(by_domain.keys())[: args.max_contacts]
    sent_rows = build_sent_rows(outreach_rows)

    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
    mail.login(gmail_env["GMAIL_USER"], gmail_env["GMAIL_APP_PASSWORD"])
    mail.select('"[Gmail]/All Mail"', readonly=True)

    start = imap_date(args.start_date)
    before = imap_date((datetime.fromisoformat(args.end_date) + timedelta(days=1)).date().isoformat())
    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []
    scan_errors = []
    domain_messages_skipped = 0

    def add_candidate(
        uid: bytes,
        source_contact: str | None = None,
        source_rows: list[dict[str, Any]] | None = None,
        bounce_scan: bool = False,
        match_mode: str = "contact_email",
    ) -> None:
        nonlocal domain_messages_skipped
        fetched = fetch_message(mail, uid)
        if not fetched:
            return
        gmail_thread_id, message = fetched
        subject = decode_mime(message.get("Subject"))
        sender = normalize_email(getaddresses([message.get("From", "")])[0][1] if getaddresses([message.get("From", "")]) else "")
        to_emails = [addr.lower() for _, addr in getaddresses([message.get("To", ""), message.get("Cc", "")]) if addr]
        body = plain_text(message)
        snippet = re.sub(r"\s+", " ", body).strip()[:500]
        received_at = parse_date(message.get("Date"))
        headers = {
            "from": message.get("From", ""),
            "to": message.get("To", ""),
            "cc": message.get("Cc", ""),
            "subject": subject,
            "date": message.get("Date", ""),
            "auto-submitted": message.get("Auto-Submitted", ""),
            "precedence": message.get("Precedence", ""),
            "message-id": message.get("Message-ID", ""),
            "in-reply-to": message.get("In-Reply-To", ""),
        }
        header_id = re.sub(r"\s+", "", message.get("Message-ID", "")).strip("<>")
        gmail_message_id = f"imap:{header_id}" if header_id else f"imap-uid:{uid.decode('ascii')}"
        if gmail_message_id in seen:
            return
        seen.add(gmail_message_id)

        matched_email = source_contact
        if bounce_scan:
            body_emails = set(extract_emails("\n".join(str(value) for value in headers.values()) + "\n" + body))
            matched = sorted(body_emails & set(by_email.keys()))
            matched_email = matched[0] if matched else None
            if not matched_email:
                return

        rows_for_match = source_rows or by_email.get(matched_email or sender, [])
        match = pick_best_outreach(rows_for_match, received_at, subject)
        classification = classify_reply(sender, subject, snippet, headers)
        if bounce_scan:
            classification = "bounce"
        evidence = direct_outreach_evidence(rows_for_match, sender, subject, snippet)
        if match_mode == "company_domain":
            automated_sender = should_skip_automated_domain_sender(sender, subject, snippet)
            if automated_sender and classification != "out_of_office":
                domain_messages_skipped += 1
                return
            if not evidence and classification == "unknown":
                domain_messages_skipped += 1
                return

        match_row = (match or {}).get("row", {}) if match else {}
        candidates.append({
            "gmail_thread_id": f"imap-gmail:{gmail_thread_id}" if gmail_thread_id else f"imap-thread:{gmail_message_id}",
            "gmail_message_id": gmail_message_id,
            "direction": "incoming",
            "from_email": sender or None,
            "to_emails": to_emails,
            "subject": subject or None,
            "snippet": snippet or None,
            "received_at": received_at,
            "internal_date_ms": int((parse_time(received_at) or 0) * 1000) or None,
            "label_ids": [],
            "classification": classification,
            "is_auto_reply": classification in {"out_of_office", "auto_reply"},
            "raw_headers": headers,
            "metadata": {
                "source": "gmail_imap_backfill",
                "contact_email": matched_email or match_row.get("contact_email") or sender or None,
                "contact_name": match_row.get("contactname"),
                "companyname": match_row.get("companyname"),
                "matched_outreach_id": match_row.get("id"),
                "matched_by": f"{match.get('matched_by')}+{match_mode}" if match else match_mode,
                "match_mode": match_mode,
                "match_evidence": evidence,
                "channel": (match or {}).get("channel") if match else "unknown",
            },
        })

    for contact in contact_emails:
        try:
            typ, data = mail.uid("SEARCH", None, "SINCE", start, "BEFORE", before, "FROM", contact)
            if typ == "OK":
                for uid in (data[0] or b"").split():
                    add_candidate(uid, source_contact=contact)
        except Exception as exc:
            scan_errors.append({"contactEmail": mask_email(contact), "error": str(exc)[:160]})

    if not args.no_domain_scan:
        for domain in contact_domains:
            try:
                typ, data = mail.uid("SEARCH", None, "SINCE", start, "BEFORE", before, "FROM", domain)
                if typ != "OK":
                    continue
                for uid in (data[0] or b"").split()[: max(0, args.limit_per_domain)]:
                    add_candidate(uid, source_rows=by_domain.get(domain, []), match_mode="company_domain")
            except Exception as exc:
                scan_errors.append({"contactEmail": f"domain:{domain}", "error": str(exc)[:160]})

    bounce_uids: set[bytes] = set()
    for field, value in [("FROM", "mailer-daemon"), ("FROM", "postmaster"), ("SUBJECT", "Undelivered"), ("SUBJECT", "Delivery"), ("SUBJECT", "Failure"), ("SUBJECT", "Returned")]:
        try:
            typ, data = mail.uid("SEARCH", None, "SINCE", start, "BEFORE", before, field, value)
            if typ == "OK":
                bounce_uids.update((data[0] or b"").split())
        except Exception as exc:
            scan_errors.append({"contactEmail": "(bounce-search)", "error": str(exc)[:160]})

    for uid in sorted(bounce_uids):
        add_candidate(uid, bounce_scan=True)

    mail.logout()

    classification_counts = Counter(row["classification"] for row in candidates)
    result = {
        "dryRun": args.dry_run,
        "mailbox": mask_email(gmail_env.get("GMAIL_USER")),
        "startDate": args.start_date,
        "endDate": args.end_date,
        "outreachRows": len(outreach_rows),
        "sentMessagesPrepared": len(sent_rows),
        "contactEmailsScanned": len(contact_emails),
        "contactDomainsScanned": 0 if args.no_domain_scan else len(contact_domains),
        "domainMessagesSkipped": domain_messages_skipped,
        "candidateReplies": len(candidates),
        "actionableReplies": sum(1 for row in candidates if row["classification"] in ACTIONABLE),
        "classificationCounts": dict(classification_counts),
        "scanErrors": scan_errors[:12],
        "samples": [
            {
                "companyname": row["metadata"].get("companyname"),
                "contactEmail": mask_email(row["metadata"].get("contact_email")),
                "fromEmail": mask_email(row.get("from_email")),
                "subject": row.get("subject"),
                "receivedAt": row.get("received_at"),
                "classification": row.get("classification"),
                "matchedBy": row["metadata"].get("matched_by"),
                "matchMode": row["metadata"].get("match_mode"),
                "channel": row["metadata"].get("channel"),
            }
            for row in candidates[:12]
        ],
        "writeResult": {"sentMessagesUpserted": 0, "emailThreadsUpserted": 0, "emailMessagesUpserted": 0},
    }

    if not args.dry_run:
        if sent_rows:
            query = "?on_conflict=" + urllib.parse.quote("source_table,source_id,channel")
            supabase.request("POST", "sent_messages", query, sent_rows, "resolution=merge-duplicates,return=representation")
        thread_rows = {}
        rank = {"positive_reply": 100, "recruiter_screen": 95, "referral": 90, "needs_follow_up": 80, "apply_online": 70, "rejection": 45, "bounce": 40, "out_of_office": 30, "auto_reply": 20, "unknown": 0}
        for row in candidates:
            key = row["gmail_thread_id"]
            meta = row["metadata"]
            current = thread_rows.get(key)
            if not current:
                thread_rows[key] = {
                    "gmail_thread_id": key,
                    "companyname": meta.get("companyname"),
                    "contact_email": meta.get("contact_email"),
                    "outreach_id": meta.get("matched_outreach_id"),
                    "matched_by": meta.get("matched_by"),
                    "first_message_at": row.get("received_at"),
                    "last_message_at": row.get("received_at"),
                    "classification": row["classification"],
                    "needs_follow_up": row["classification"] in ACTIONABLE,
                    "metadata": {
                        "source": "gmail_imap_backfill",
                        "channel": meta.get("channel"),
                        "match_mode": meta.get("match_mode"),
                        "match_evidence": meta.get("match_evidence"),
                        "sample_message_id": row["gmail_message_id"],
                    },
                }
            else:
                received = row.get("received_at")
                if received and (not current["first_message_at"] or received < current["first_message_at"]):
                    current["first_message_at"] = received
                if received and (not current["last_message_at"] or received > current["last_message_at"]):
                    current["last_message_at"] = received
                if rank[row["classification"]] > rank[current["classification"]]:
                    current["classification"] = row["classification"]
                current["needs_follow_up"] = current["needs_follow_up"] or row["classification"] in ACTIONABLE
        thread_result = []
        if thread_rows:
            query = "?on_conflict=" + urllib.parse.quote("gmail_thread_id") + "&select=id,gmail_thread_id"
            thread_result = supabase.request("POST", "email_threads", query, list(thread_rows.values()), "resolution=merge-duplicates,return=representation")
        thread_ids = {row["gmail_thread_id"]: row["id"] for row in thread_result or []}
        message_rows = [{**row, "email_thread_id": thread_ids.get(row["gmail_thread_id"])} for row in candidates]
        if message_rows:
            query = "?on_conflict=" + urllib.parse.quote("gmail_message_id")
            supabase.request("POST", "email_messages", query, message_rows, "resolution=merge-duplicates,return=representation")
        result["writeResult"] = {
            "sentMessagesUpserted": len(sent_rows),
            "emailThreadsUpserted": len(thread_rows),
            "emailMessagesUpserted": len(message_rows),
        }

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
