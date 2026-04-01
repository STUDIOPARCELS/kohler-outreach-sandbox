"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

interface FollowupRow {
  id: string;
  companyname: string;
  contactname?: string;
  contact_title?: string;
  contact_email?: string;
  body_final?: string;
  subject_final?: string;
  status: string;
  sent_at?: string;
  emailed_at?: string;
  followup2_at?: string;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function generateFollowup1Body(row: FollowupRow): string {
  const firstName = row.contactname?.split(" ")[0] || "Hiring Manager";
  const company = row.companyname.replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?)$/i, "").trim();

  return `Hello ${firstName},

I hope you received my recent letter expressing interest in ${company}. I am a recent BSME from Colorado School of Mines and I am committed to the Denver area. I just received my EIT and would love to interview with your team.

I have included my resume, and my projects and study are at kohler.solokit.app. Thank you, and I hope to hear from you.

Sincerely,

Kohler Wood
208-720-4635
Lakewood, CO
akwood1@mines.edu`;
}

function generateFollowup2Body(row: FollowupRow): string {
  const firstName = row.contactname?.split(" ")[0] || "Hiring Manager";
  const company = row.companyname.replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?)$/i, "").trim();

  return `Hello ${firstName},

I wanted to follow up one last time regarding opportunities at ${company}. I remain very interested and am available to interview at your convenience.

My projects and study are at kohler.solokit.app. Thank you, and I hope to hear from you.

Sincerely,

Kohler Wood
208-720-4635
Lakewood, CO
akwood1@mines.edu`;
}

type Stage = "letter" | "followup1" | "followup2" | "done";

function getStage(row: FollowupRow): Stage {
  if (row.followup2_at) return "done";
  if (row.emailed_at) return "followup2";
  return "followup1";
}

function getBucket(row: FollowupRow): "pending" | "ready1" | "ready2" | "done" {
  const days = daysAgo(row.sent_at!);
  const stage = getStage(row);
  if (stage === "done") return "done";
  if (stage === "followup2") {
    const daysSinceEmail = daysAgo(row.emailed_at!);
    return daysSinceEmail >= 7 ? "ready2" : "pending";
  }
  // stage === followup1
  return days >= 7 ? "ready1" : "pending";
}

export default function FollowupsPage() {
  const toast = useToast();
  const [items, setItems] = useState<FollowupRow[]>([]);
  const [needsEmailItems, setNeedsEmailItems] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<FollowupRow | null>(null);
  const [activeTab, setActiveTab] = useState<"letter" | "followup">("letter");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [attachResume, setAttachResume] = useState(true);
  const [dark, setDark] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/followup-candidates");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems(data.all || []);
      setNeedsEmailItems(data.needsEmail || []);
    } catch (err) {
      toast("Failed to load follow-ups", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function openModal(row: FollowupRow) {
    setModalRow(row);
    const stage = getStage(row);
    if (stage === "followup2") {
      setEditSubject(`Following up — Mechanical Engineer, EIT — ${row.companyname}`);
      setEditBody(generateFollowup2Body(row));
    } else {
      setEditSubject(`Following up — Mechanical Engineer, EIT — ${row.companyname}`);
      setEditBody(generateFollowup1Body(row));
    }
    setAttachResume(true);
    setActiveTab("letter");
  }

  async function handleSend() {
    if (!modalRow) return;
    const stage = getStage(modalRow);
    const followupNumber = stage === "followup2" ? 2 : 1;
    if (!window.confirm(`Send follow-up #${followupNumber} to ${modalRow.contact_email}?\n\nThis will send immediately.`)) return;
    setSending(modalRow.id);
    try {
      const res = await fetch("/api/approve-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId: modalRow.id, to: modalRow.contact_email, subject: editSubject, body: editBody, attachResume, followupNumber }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`Follow-up #${followupNumber} sent to ${modalRow.contact_email}`);
      setModalRow(null);
      load();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSending(null);
    }
  }

  // Bucket items
  const pending = items.filter((r) => getBucket(r) === "pending");
  const ready1 = items.filter((r) => getBucket(r) === "ready1");
  const ready2 = items.filter((r) => getBucket(r) === "ready2");
  const done = items.filter((r) => getBucket(r) === "done");

  async function handleSearchEmail() {
    if (!modalRow) return;
    setSearching(true);
    try {
      const res = await fetch("/api/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: null, contactname: modalRow.contactname, companyname: modalRow.companyname }),
      });
      const data = await res.json();
      if (data.email) {
        setEmailInput(data.email);
        toast(`Found: ${data.email}`);
      } else {
        toast("No email found via RocketReach", "error");
      }
    } catch {
      toast("Search failed", "error");
    } finally {
      setSearching(false);
    }
  }

  async function handleSaveEmail() {
    if (!modalRow || !emailInput.trim()) return;
    try {
      const res = await fetch("/api/update-followup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId: modalRow.id, email: emailInput.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`Email saved for ${modalRow.contactname}`);
      setModalRow(null);
      setEmailInput("");
      load();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  const bg = dark ? "bg-gray-950" : "bg-gray-50";
  const cardBg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const cardHover = dark ? "hover:border-gray-600 hover:bg-gray-800" : "hover:border-gray-300 hover:bg-gray-50";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textSecondary = dark ? "text-gray-400" : "text-slate-500";
  const textMuted = dark ? "text-gray-500" : "text-slate-400";
  const modalBg = dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputBg = dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-slate-200 text-slate-900";
  const letterBg = dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200";
  const sectionLabel = dark ? "text-gray-500" : "text-slate-400";

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">

        {/* Header */}
        <div className="relative rounded-2xl mb-6 overflow-hidden" style={{ background: dark ? "linear-gradient(135deg, #111827 0%, #1f2937 100%)" : "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)", boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35)" }}>
          <div className="relative px-4 py-5 sm:px-8 sm:py-8">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <Link href="/" className="flex flex-col items-center justify-center px-3 py-2 sm:px-4 sm:py-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/15 transition-colors">
                  <svg className="w-5 h-5 text-white mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  <div className="text-[9px] text-white/70 uppercase tracking-wider font-semibold">Engine</div>
                </Link>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight uppercase">Follow-ups</h1>
                  <p className="text-slate-400 text-xs mt-0.5">Email follow-ups for mailed letters</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Dark mode toggle */}
                <button
                  onClick={() => setDark(!dark)}
                  className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl border border-white/15 transition-all active:scale-95"
                  title={dark ? "Light mode" : "Dark mode"}
                >
                  {dark ? (
                    <svg className="w-4.5 h-4.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="w-4.5 h-4.5 text-slate-300" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                  )}
                </button>
                <div className="text-center px-2.5 py-2 sm:px-4 sm:py-3 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
                  <div className="text-xl sm:text-2xl font-bold text-white">{ready1.length + ready2.length}</div>
                  <div className="text-[9px] sm:text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">Ready</div>
                </div>
                <div className="text-center px-2.5 py-2 sm:px-4 sm:py-3 bg-amber-500/20 rounded-xl border border-amber-400/30">
                  <div className="text-xl sm:text-2xl font-bold text-white">{pending.length}</div>
                  <div className="text-[9px] sm:text-[10px] text-amber-300 uppercase tracking-wider font-semibold">Pending</div>
                </div>
                <div className="text-center px-2.5 py-2 sm:px-4 sm:py-3 bg-slate-500/20 rounded-xl border border-slate-500/30">
                  <div className="text-xl sm:text-2xl font-bold text-white">{done.length}</div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Done</div>
                </div>
                {needsEmailItems.length > 0 && (
                  <div className="text-center px-2.5 py-2 sm:px-4 sm:py-3 bg-orange-500/20 rounded-xl border border-orange-400/30">
                    <div className="text-xl sm:text-2xl font-bold text-white">{needsEmailItems.length}</div>
                    <div className="text-[9px] sm:text-[10px] text-orange-300 uppercase tracking-wider font-semibold">No Email</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={`text-center py-20 ${textMuted}`}>Loading…</div>
        ) : items.length === 0 && needsEmailItems.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className={`text-lg font-medium ${textSecondary}`}>No follow-ups pending</p>
            <p className={`text-sm mt-1 ${textMuted}`}>Follow-ups appear after letters are marked as sent.</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* READY — 1st Follow-up (7+ days, no email sent yet) */}
            {ready1.length > 0 && (
              <Section label="1ST FOLLOW-UP READY" color="emerald" count={ready1.length} dark={dark} sectionLabel={sectionLabel}>
                <BentoGrid>
                  {ready1.map((row) => (
                    <BentoCard key={row.id} row={row} onClick={() => openModal(row)} dark={dark}
                      cardBg={cardBg} cardHover={cardHover} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
                      badge={<span className="px-2 py-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded-full uppercase">Send</span>}
                    />
                  ))}
                </BentoGrid>
              </Section>
            )}

            {/* READY — 2nd Follow-up (14+ days, 1st email sent, no 2nd) */}
            {ready2.length > 0 && (
              <Section label="2ND FOLLOW-UP READY" color="rose" count={ready2.length} dark={dark} sectionLabel={sectionLabel}>
                <BentoGrid>
                  {ready2.map((row) => (
                    <BentoCard key={row.id} row={row} onClick={() => openModal(row)} dark={dark}
                      cardBg={cardBg} cardHover={cardHover} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
                      badge={<span className="px-2 py-0.5 text-[9px] font-bold text-rose-700 bg-rose-100 rounded-full uppercase">2nd</span>}
                    />
                  ))}
                </BentoGrid>
              </Section>
            )}

            {/* PENDING — Letter sent, waiting for window */}
            {pending.length > 0 && (
              <Section label="PENDING" color="amber" count={pending.length} dark={dark} sectionLabel={sectionLabel}>
                <BentoGrid>
                  {pending.map((row) => {
                    const stage = getStage(row);
                    const days = stage === "followup2"
                      ? Math.max(0, 7 - daysAgo(row.emailed_at!))
                      : Math.max(0, 7 - daysAgo(row.sent_at!));
                    return (
                      <BentoCard key={row.id} row={row} onClick={() => openModal(row)} dark={dark}
                        cardBg={cardBg} cardHover={cardHover} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
                        badge={<span className="px-2 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 rounded-full uppercase">{days}d</span>}
                      />
                    );
                  })}
                </BentoGrid>
              </Section>
            )}

            {/* DONE — All follow-ups sent */}
            {done.length > 0 && (
              <Section label="COMPLETE" color="slate" count={done.length} dark={dark} sectionLabel={sectionLabel}>
                <BentoGrid>
                  {done.map((row) => (
                    <BentoCard key={row.id} row={row} onClick={() => openModal(row)} dark={dark}
                      cardBg={cardBg} cardHover={cardHover} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
                      badge={<span className="px-2 py-0.5 text-[9px] font-bold text-slate-600 bg-slate-200 rounded-full uppercase">Done</span>}
                    />
                  ))}
                </BentoGrid>
              </Section>
            )}

            {/* NEEDS EMAIL — sent letters with no email address */}
            {needsEmailItems.length > 0 && (
              <Section label="NEEDS EMAIL" color="orange" count={needsEmailItems.length} dark={dark} sectionLabel={sectionLabel}>
                <BentoGrid>
                  {needsEmailItems.map((row) => (
                    <BentoCard key={row.id} row={row} onClick={() => { openModal(row); setActiveTab("followup"); setEmailInput(""); }} dark={dark}
                      cardBg={cardBg} cardHover={cardHover} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
                      badge={<span className="px-2 py-0.5 text-[9px] font-bold text-orange-700 bg-orange-100 rounded-full uppercase">Email?</span>}
                    />
                  ))}
                </BentoGrid>
              </Section>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModalRow(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${modalBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b rounded-t-2xl" style={{ background: dark ? "#111827" : "#f8fafc", borderColor: dark ? "#374151" : "#e2e8f0" }}>
              <div className="flex-1 min-w-0">
                <h2 className={`text-lg font-bold truncate ${textPrimary}`}>{modalRow.companyname}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <span className={`text-xs font-medium ${textSecondary}`}>{modalRow.contactname || "Hiring Manager"}</span>
                  {modalRow.contact_title && <span className={`text-xs ${textMuted}`}>{modalRow.contact_title}</span>}
                  {modalRow.contact_email && <span className="text-xs text-sky-500">{modalRow.contact_email}</span>}
                  {modalRow.sent_at && <span className={`text-xs ${textMuted}`}>Mailed {formatDate(modalRow.sent_at)}</span>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StepDot filled label="Letter" />
                  <StepLine filled={!!modalRow.emailed_at} />
                  <StepDot filled={!!modalRow.emailed_at} label="Email 1" />
                  <StepLine filled={!!modalRow.followup2_at} />
                  <StepDot filled={!!modalRow.followup2_at} label="Email 2" />
                </div>
              </div>
              <button onClick={() => setModalRow(null)} className={`ml-4 p-2 rounded-lg transition-colors ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tabs */}
            <div className={`flex border-b ${dark ? "border-gray-700" : "border-slate-100"}`}>
              <button onClick={() => setActiveTab("letter")} className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === "letter" ? `${textPrimary} border-b-2 ${dark ? "border-white" : "border-slate-800"}` : `${textMuted} hover:${textSecondary}`}`}>
                Original Letter
              </button>
              <button onClick={() => setActiveTab("followup")} className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === "followup" ? "text-emerald-500 border-b-2 border-emerald-500" : `${textMuted} hover:${textSecondary}`}`}>
                Follow-up Email
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "letter" && modalRow.body_final && (
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <div className={`rounded-xl border px-4 py-4 sm:px-6 sm:py-5 ${letterBg}`} style={{ maxHeight: "400px", overflowY: "auto" }}>
                  <pre className={`text-sm whitespace-pre-wrap font-sans leading-relaxed ${dark ? "text-gray-300" : "text-slate-700"}`}>{modalRow.body_final}</pre>
                </div>
              </div>
            )}

            {activeTab === "followup" && (
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                {/* No email — show search/add form */}
                {(!modalRow.contact_email || modalRow.contact_email.trim() === "") ? (
                  <div>
                    <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg ${dark ? "bg-orange-900/30 border border-orange-700/50" : "bg-orange-50 border border-orange-200"}`}>
                      <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      <span className={`text-xs font-medium ${dark ? "text-orange-300" : "text-orange-700"}`}>No email on file for {modalRow.contactname}. Add one to enable follow-up emails.</span>
                    </div>
                    <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${textMuted}`}>Email Address</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder={`email@${modalRow.companyname.toLowerCase().replace(/\s+/g, "").slice(0, 12)}.com`}
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 ${inputBg}`}
                      />
                      <button
                        onClick={handleSearchEmail}
                        disabled={searching}
                        className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-all disabled:opacity-50 uppercase tracking-wide whitespace-nowrap"
                      >
                        {searching ? "Searching…" : "Search"}
                      </button>
                    </div>
                    <p className={`text-[10px] mt-1.5 ${textMuted}`}>Type manually or click Search to look up via RocketReach</p>
                    {emailInput.trim() && (
                      <button
                        onClick={handleSaveEmail}
                        className="w-full mt-4 px-6 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-all uppercase tracking-wide shadow-md hover:shadow-lg active:scale-[0.98]"
                      >
                        Save Email & Enable Follow-up
                      </button>
                    )}
                  </div>
                ) : getStage(modalRow) === "done" ? (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">✅</div>
                    <p className={`font-medium ${textSecondary}`}>All follow-ups complete</p>
                    <p className={`text-xs mt-1 ${textMuted}`}>Both follow-up emails have been sent.</p>
                  </div>
                ) : (
                  <>
                    <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${textMuted}`}>Subject</label>
                    <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 ${inputBg}`} />
                    <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 mt-3 ${textMuted}`}>Body</label>
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono leading-relaxed ${inputBg}`} />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={attachResume} onChange={(e) => setAttachResume(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
                        <span className={`text-xs ${textSecondary}`}>Attach resume</span>
                      </label>
                      <button onClick={handleSend} disabled={sending === modalRow.id || getBucket(modalRow) === "pending"} className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all disabled:opacity-40 uppercase tracking-wide shadow-md hover:shadow-lg active:scale-[0.98]">
                        {sending === modalRow.id ? "Sending…" : getBucket(modalRow) === "pending" ? "Waiting…" : `Send Follow-up #${getStage(modalRow) === "followup2" ? "2" : "1"}`}
                      </button>
                    </div>
                    <p className={`text-[10px] mt-2 ${textMuted}`}>Includes HTML signature · Reply-to: akwood1@mines.edu · Sent from Gmail</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function Section({ label, color, count, dark, sectionLabel, children }: { label: string; color: string; count: number; dark: boolean; sectionLabel: string; children: React.ReactNode }) {
  const dotColors: Record<string, string> = { emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-400", slate: "bg-slate-400", orange: "bg-orange-500" };
  const textColors: Record<string, string> = { emerald: "text-emerald-500", rose: "text-rose-500", amber: "text-amber-500", slate: "text-slate-400", orange: "text-orange-500" };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${dotColors[color] || "bg-gray-400"}`} />
        <h2 className={`text-[11px] font-bold uppercase tracking-widest ${textColors[color] || sectionLabel}`}>{label}</h2>
        <span className={`text-[10px] ${sectionLabel}`}>({count})</span>
      </div>
      {children}
    </div>
  );
}

function BentoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{children}</div>;
}

function BentoCard({ row, onClick, badge, dark, cardBg, cardHover, textPrimary, textSecondary, textMuted }: {
  row: FollowupRow; onClick: () => void; badge: React.ReactNode; dark: boolean;
  cardBg: string; cardHover: string; textPrimary: string; textSecondary: string; textMuted: string;
}) {
  const days = daysAgo(row.sent_at!);
  const stage = getStage(row);
  const steps = stage === "done" ? 3 : stage === "followup2" ? 2 : 1;

  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-3 transition-all duration-200 ${cardBg} ${cardHover} active:scale-[0.97]`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <h3 className={`text-sm font-bold leading-tight line-clamp-2 ${textPrimary}`}>{row.companyname}</h3>
        {badge}
      </div>
      <p className={`text-[11px] truncate ${textSecondary}`}>{row.contactname || "—"}</p>
      <p className={`text-[10px] truncate ${textMuted}`}>{row.contact_title || ""}</p>
      <div className="flex items-center gap-1 mt-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= steps ? (dark ? "bg-emerald-500" : "bg-emerald-400") : (dark ? "bg-gray-700" : "bg-gray-200")}`} />
        ))}
      </div>
      <p className={`text-[9px] mt-1.5 ${textMuted}`}>{days}d ago</p>
    </button>
  );
}

function StepDot({ filled, label }: { filled: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`w-3 h-3 rounded-full border-2 transition-colors ${filled ? "bg-emerald-500 border-emerald-500" : "bg-transparent border-gray-400"}`} />
      <span className="text-[8px] text-gray-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function StepLine({ filled }: { filled: boolean }) {
  return <div className={`h-0.5 w-6 sm:w-10 rounded-full mt-[-10px] ${filled ? "bg-emerald-500" : "bg-gray-400/30"}`} />;
}
