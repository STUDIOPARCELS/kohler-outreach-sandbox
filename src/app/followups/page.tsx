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
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function generateFollowupBody(row: FollowupRow): string {
  const firstName = row.contactname?.split(" ")[0] || "Hiring Manager";
  const company = row.companyname.replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?)$/i, "").trim();
  return `Hello ${firstName},

I recently sent a letter expressing my interest in joining ${company} as a mechanical engineer. I wanted to follow up and reiterate my enthusiasm for the opportunity.

I am a recent graduate from the Colorado School of Mines with a BSME and EIT certification. My background combines hands-on fabrication, CNC machining, and SolidWorks simulation — I build functional prototypes from concept through production.

My portfolio is at kohler.solokit.app and I have attached my resume below. I would welcome the chance to discuss how I can contribute to your team.

Thank you for your time and consideration.`;
}

export default function FollowupsPage() {
  const toast = useToast();
  const [ready, setReady] = useState<FollowupRow[]>([]);
  const [upcoming, setUpcoming] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [attachResume, setAttachResume] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/followup-candidates");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReady(data.ready || []);
      setUpcoming(data.upcoming || []);
    } catch (err) {
      toast("Failed to load follow-ups", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function expand(row: FollowupRow) {
    if (expandedId === row.id) { setExpandedId(null); return; }
    setExpandedId(row.id);
    setEditSubject(`Following up — Mechanical Engineer, EIT — ${row.companyname}`);
    setEditBody(generateFollowupBody(row));
    setAttachResume(true);
  }

  async function handleSend(row: FollowupRow) {
    if (!window.confirm(`Send follow-up email to ${row.contact_email}?\n\nThis will send immediately.`)) return;
    setSending(row.id);
    try {
      const res = await fetch("/api/approve-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId: row.id, to: row.contact_email, subject: editSubject, body: editBody, attachResume }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`Follow-up sent to ${row.contact_email}`);
      setExpandedId(null);
      load();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSending(null);
    }
  }

  const allItems = [...ready, ...upcoming];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="relative rounded-2xl mb-6 overflow-hidden" style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)", boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35), 0 8px 20px -8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-slate-400 hover:text-white text-xs uppercase tracking-widest transition-colors">← Outreach Engine</Link>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight uppercase mt-1">Follow-ups</h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-0.5">7-day email follow-ups for mailed letters</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center px-4 py-3 bg-rose-500/20 rounded-xl border border-rose-400/30">
                <div className="text-2xl font-bold text-white">{ready.length}</div>
                <div className="text-[10px] text-rose-300 uppercase tracking-wider font-semibold">Ready</div>
              </div>
              <div className="text-center px-4 py-3 bg-amber-500/20 rounded-xl border border-amber-400/30">
                <div className="text-2xl font-bold text-white">{upcoming.length}</div>
                <div className="text-[10px] text-amber-300 uppercase tracking-wider font-semibold">Pending</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading…</div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-slate-500 text-lg font-medium">No follow-ups pending</p>
          <p className="text-slate-400 text-sm mt-1">Follow-ups appear 7 days after a letter is marked as sent.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {ready.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />Ready to send
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {ready.map((row) => <CompanyCard key={row.id} row={row} status="ready" isExpanded={expandedId === row.id} onToggle={() => expand(row)} editSubject={editSubject} editBody={editBody} attachResume={attachResume} sending={sending === row.id} onSubjectChange={setEditSubject} onBodyChange={setEditBody} onAttachChange={setAttachResume} onSend={() => handleSend(row)} />)}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />Upcoming
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {upcoming.map((row) => <CompanyCard key={row.id} row={row} status="upcoming" isExpanded={expandedId === row.id} onToggle={() => expand(row)} editSubject={editSubject} editBody={editBody} attachResume={attachResume} sending={false} onSubjectChange={setEditSubject} onBodyChange={setEditBody} onAttachChange={setAttachResume} onSend={() => {}} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompanyCard({ row, status, isExpanded, onToggle, editSubject, editBody, attachResume, sending, onSubjectChange, onBodyChange, onAttachChange, onSend }: {
  row: FollowupRow; status: "ready" | "upcoming"; isExpanded: boolean; onToggle: () => void;
  editSubject: string; editBody: string; attachResume: boolean; sending: boolean;
  onSubjectChange: (v: string) => void; onBodyChange: (v: string) => void; onAttachChange: (v: boolean) => void; onSend: () => void;
}) {
  const days = daysAgo(row.sent_at!);
  const daysLeft = Math.max(0, 7 - days);
  const isReady = status === "ready";

  return (
    <div className={`bg-white rounded-2xl border ${isReady ? "border-rose-200 shadow-lg shadow-rose-100/50" : "border-amber-100 shadow-md"} hover:shadow-xl transition-all duration-300 overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base truncate">{row.companyname}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-medium text-slate-600">{row.contactname || "Hiring Manager"}</span>
            {row.contact_title && (<><span className="text-slate-300">·</span><span className="text-xs text-slate-400">{row.contact_title}</span></>)}
          </div>
          <p className="text-xs text-slate-400 mt-1">{row.contact_email}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isReady ? (
            <span className="px-2.5 py-1 text-[10px] font-bold text-rose-700 bg-rose-100 rounded-full uppercase tracking-wide">Ready</span>
          ) : (
            <span className="px-2.5 py-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full uppercase tracking-wide">{daysLeft}d left</span>
          )}
          <span className="text-[10px] text-slate-400">Sent {days}d ago</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100">
          {row.body_final && (
            <div className={`px-5 py-4 ${isReady ? "bg-rose-50/50" : "bg-amber-50/50"}`}>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Original Letter</h4>
              <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{row.body_final}</pre>
              </div>
            </div>
          )}

          {isReady && (
            <div className="px-5 py-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Follow-up Email Draft</h4>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 mt-2">Subject</label>
              <input type="text" value={editSubject} onChange={(e) => onSubjectChange(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-200" />
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 mt-3">Body</label>
              <textarea value={editBody} onChange={(e) => onBodyChange(e.target.value)} rows={10} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 font-mono leading-relaxed" />
              <div className="flex items-center justify-between mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attachResume} onChange={(e) => onAttachChange(e.target.checked)} className="rounded border-slate-300 text-rose-600 focus:ring-rose-200" />
                  <span className="text-xs text-slate-500">Attach resume</span>
                </label>
                <button onClick={onSend} disabled={sending} className="px-6 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all disabled:opacity-50 uppercase tracking-wide shadow-md hover:shadow-lg active:scale-[0.98]">
                  {sending ? "Sending…" : "Approve & Send"}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Includes HTML signature · Reply-to: akwood1@mines.edu · Sent from Gmail</p>
            </div>
          )}

          {!isReady && !row.body_final && (
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-slate-400">Follow-up available in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
