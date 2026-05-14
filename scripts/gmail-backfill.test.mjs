import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/gmailResponseBackfill.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  buildSentMessageRows,
  classifyGmailReply,
  emailDomain,
  extractEmailAddress,
  hasDirectOutreachEvidence,
  inferOutreachChannel,
  isGenericEmailDomain,
  looksLikeReplySubject,
  normalizeSubject,
  pickBestOutreach,
  redactEmail,
  shouldSkipAutomatedDomainSender,
} = await import(moduleUrl);

test("classifies recruiter screening replies as actionable", () => {
  const classification = classifyGmailReply({
    fromEmail: "recruiter@example.com",
    subject: "Re: Mechanical Engineer role",
    snippet: "Can you send availability for a phone screen this week?",
  });

  assert.equal(classification, "recruiter_screen");
});

test("classifies delivery failures before generic auto replies", () => {
  const classification = classifyGmailReply({
    fromEmail: "mailer-daemon@example.com",
    subject: "Delivery Status Notification",
    snippet: "The message wasn't delivered because the address was not found.",
    headers: { "Auto-Submitted": "auto-replied" },
  });

  assert.equal(classification, "bounce");
});

test("matches replies to the nearest prior outreach row", () => {
  const match = pickBestOutreach(
    [
      {
        id: "old",
        companyname: "Old Co",
        contactname: "A",
        contact_email: "person@example.com",
        subject_final: "Intro",
        status: "sent",
        emailed_at: "2026-01-01T00:00:00Z",
        sent_at: null,
        printed_at: null,
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "new",
        companyname: "New Co",
        contactname: "B",
        contact_email: "person@example.com",
        subject_final: "Mechanical Engineer opportunity",
        status: "sent",
        emailed_at: "2026-05-10T00:00:00Z",
        sent_at: null,
        printed_at: null,
        updated_at: "2026-05-10T00:00:00Z",
      },
    ],
    "2026-05-12T00:00:00Z",
    "Re: Mechanical Engineer opportunity"
  );

  assert.equal(match?.row.id, "new");
  assert.equal(match?.channel, "email");
});

test("builds one outbound row per outreach channel without double counting emails", () => {
  const rows = buildSentMessageRows([
    {
      id: "email-row",
      companyname: "Email Co",
      contactname: "A",
      contact_email: "person@example.com",
      subject_final: "Intro",
      status: "emailed",
      emailed_at: "2026-04-01T00:00:00Z",
      sent_at: "2026-04-02T00:00:00Z",
      printed_at: null,
      updated_at: "2026-04-02T00:00:00Z",
    },
    {
      id: "letter-row",
      companyname: "Letter Co",
      contactname: "B",
      contact_email: "letter@example.com",
      subject_final: "Intro",
      status: "sent",
      emailed_at: null,
      sent_at: "2026-04-03T00:00:00Z",
      printed_at: null,
      updated_at: "2026-04-03T00:00:00Z",
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].channel, "email");
  assert.equal(rows[0].sent_at, "2026-04-01T00:00:00Z");
  assert.equal(rows[1].channel, "letter");
  assert.equal(inferOutreachChannel({
    id: "letter-row",
    companyname: "Letter Co",
    contactname: "B",
    contact_email: "letter@example.com",
    subject_final: "Intro",
    status: "sent",
    emailed_at: null,
    sent_at: "2026-04-03T00:00:00Z",
    printed_at: null,
    updated_at: "2026-04-03T00:00:00Z",
  }), "letter");
});

test("normalizes subjects and redacts email addresses", () => {
  assert.equal(normalizeSubject("Re: [External] Mechanical Engineer!"), "mechanical engineer");
  assert.equal(extractEmailAddress("Kohler <kohler@example.com>"), "kohler@example.com");
  assert.equal(emailDomain("Kohler <kohler@example.com>"), "example.com");
  assert.equal(isGenericEmailDomain("gmail.com"), true);
  assert.equal(isGenericEmailDomain("trustile.com"), false);
  assert.equal(redactEmail("kohler@example.com"), "ko***@example.com");
});

test("keeps domain scans narrow to real outreach replies", () => {
  const outreachRows = [
    {
      id: "trustile",
      companyname: "TruStile Doors, LLC",
      contactname: "Chad Tiedemann",
      contact_email: "ctiedemann@trustile.com",
      subject_final: "Following up - BSME, EIT - Kohler Wood",
      status: "emailed",
      emailed_at: "2026-04-04T20:26:58.032Z",
      sent_at: null,
      printed_at: null,
      updated_at: "2026-04-04T20:26:58.032Z",
    },
  ];

  assert.equal(looksLikeReplySubject("Automatic reply: Following up - BSME, EIT - Kohler Wood"), true);
  assert.equal(
    hasDirectOutreachEvidence(
      outreachRows,
      "chad.tiedemann@trustile.com",
      "Automatic reply: Following up - BSME, EIT - Kohler Wood",
      "I am out of the office."
    ),
    true
  );
  assert.equal(
    shouldSkipAutomatedDomainSender(
      "opportunities@careeralerts.conmed.com",
      "Finish your application at CONMED!",
      "Join our talent community and be notified about new openings."
    ),
    true
  );
  assert.equal(shouldSkipAutomatedDomainSender("noreply@example.com", "Re: Your application", "Kohler Wood"), true);
});
