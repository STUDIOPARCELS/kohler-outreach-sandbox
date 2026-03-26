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
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function generateFollowupBody(row: FollowupRow): string {
  const firstName = row.contactname?.split(" ")[0] || "Hiring Manager";
  const company = row.companyname
    .replace(
      /\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?)$/i,
      ""
    )
    .trim();

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

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
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
      toast.error("Failed to load follow-ups");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openEditor(row: FollowupRow) {
    setEditingId(row.id);
    setEditSubject(
      `Following up — Mechanical Engineer, EIT — ${row.companyname}`
    );
    setEditBody(generateFollowupBody(row));
    setAttachResume(true);
  }

  async function handleSend(row: FollowupRow) {
    if (!editingId || editingId !== row.id) return;

    const confirmed = window.confirm(
      `Send follow-up email to ${row.contact_email}?\n\nThis will send immediately.`
    );
    if (!confirmed) return;

    setSending(row.id);
    try {
      const res = await fetch("/api/approve-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterId: row.id,
          to: row.contact_email,
          subject: editSubject,
          body: editBody,
          attachResume,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Follow-up sent to ${row.contact_email}`);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(
        `Failed to send: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div
        className="relative rounded-2xl mb-6"
        style={{
          background:
            "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)",
          boxShadow:
            "0 20px 40px -12px rgba(0,0,0,0.35), 0 8px 20px -8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <div className="relative px-4 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight uppercase">
                Follow-ups
              </h1>
              <p className="text-slate-300 mt-1 text-xs sm:text-sm font-medium uppercase tracking-wide">
                7-day email follow-ups for mailed letters
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center px-4 py-3 bg-white/10 rounded-xl border border-white/15 backdrop-blur-sm">
                <div className="text-2xl font-bold text-white">
                  {ready.length}
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wider">
                  Ready
                </div>
              </div>
              <div className="text-center px-4 py-3 bg-white/10 rounded-xl border border-white/15 backdrop-blur-sm">
                <div className="text-2xl font-bold text-white">
                  {upcoming.length}
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wider">
                  Upcoming
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Back to main */}
      <div className="mb-4">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          ← Back to Outreach Engine
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading…</div>
      ) : ready.length === 0 && upcoming.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-slate-500 text-lg font-medium">
            No follow-ups pending
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Follow-ups appear 7 days after a letter is marked as sent, for
            contacts with an email address.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Ready for follow-up */}
          {ready.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Ready to send ({ready.length})
              </h2>
              <div className="space-y-3">
                {ready.map((row) => (
                  <div
                    key={row.id}
                    className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="px-5 py-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {row.companyname}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {row.contactname || "Hiring Manager"}
                          {row.contact_title ? ` · ${row.contact_title}` : ""}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {row.contact_email} · Letter sent{" "}
                          {daysAgo(row.sent_at!)} days ago
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingId === row.id ? (
                          <>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSend(row)}
                              disabled={sending === row.id}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 uppercase tracking-wide"
                            >
                              {sending === row.id
                                ? "Sending…"
                                : "Approve & Send"}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => openEditor(row)}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors uppercase tracking-wide"
                          >
                            Review & Send
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded editor */}
                    {editingId === row.id && (
                      <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
                        {/* Subject */}
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 mb-4"
                        />

                        {/* Body */}
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Email Body
                        </label>
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={12}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 font-mono leading-relaxed"
                        />

                        {/* Attach resume toggle */}
                        <label className="flex items-center gap-2 mt-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={attachResume}
                            onChange={(e) => setAttachResume(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-xs text-slate-600">
                            Attach resume PDF
                          </span>
                        </label>

                        {/* Preview note */}
                        <p className="text-xs text-slate-400 mt-3">
                          The email will include Kohler&apos;s HTML signature
                          with handwritten image, contact info, and portfolio
                          link. Reply-to is set to akwood1@mines.edu.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming (not yet 7 days) */}
          {upcoming.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-2">
                {upcoming.map((row) => {
                  const days = daysAgo(row.sent_at!);
                  const daysLeft = 7 - days;
                  return (
                    <div
                      key={row.id}
                      className="bg-white border border-slate-100 rounded-xl px-5 py-3 flex items-center justify-between"
                    >
                      <div>
                        <h3 className="font-medium text-slate-700 text-sm">
                          {row.companyname}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {row.contactname || "Hiring Manager"} ·{" "}
                          {row.contact_email}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                          {daysLeft} day{daysLeft !== 1 ? "s" : ""} until
                          follow-up
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
