"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

/* ── Types ── */
interface LetterRow {
  id: string;
  companyname: string;
  contactname?: string;
  contact_title?: string;
  contact_email?: string;
  custom_paragraph?: string;
  body_final?: string;
  status: string;
}

interface Template {
  subject_template: string;
  body_template: string;
}

interface Contact {
  contactname: string;
  title: string;
  email: string;
}

interface CompanyRow {
  companyname: string;
  tier: number;
  city: string;
  contactname?: string;
  contact_title?: string;
}

interface Role {
  company_name: string;
  title: string;
  location: string;
  work_type: string;
  salary: string;
  url: string;
  date_posted: string;
}

/* ── Assemble a letter from template + data ── */
function assembleLetter(
  template: Template,
  companyname: string,
  customParagraph: string,
  contactName?: string,
  contactTitle?: string
) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let body = template.body_template
    .replace(/\{\{COMPANY\}\}/g, companyname)
    .replace(/\{\{CUSTOM_PARAGRAPH\}\}/g, customParagraph || "")
    .replace(/\{\{TODAY_DATE\}\}/g, today);

  // Replace "Hiring Manager" with actual contact if available
  if (contactName) {
    const firstName = contactName.split(" ")[0];
    const titleLine = contactTitle ? `${contactTitle}\n` : "";
    body = body.replace("Hiring Manager\n", `${contactName}\n${titleLine}`);
    body = body.replace("Dear Hiring Manager", `Dear ${firstName}`);
  }

  const subject = template.subject_template
    .replace(/\{\{COMPANY\}\}/g, companyname);

  return { subject, body };
}

/* ── Main Page ── */
export default function HomePage() {
  const toast = useToast();

  // Template
  const [template, setTemplate] = useState<Template | null>(null);

  // Letter cards (from reachout_company_inserts)
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [selected, setSelected] = useState<LetterRow | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Company browser
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [compSearch, setCompSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Loading states
  const [lettersLoading, setLettersLoading] = useState(true);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  /* ── Load template + letters ── */
  const loadLetters = useCallback(async () => {
    try {
      const [tplRes, qRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/queue"),
      ]);
      const tplData = await tplRes.json();
      const qData = await qRes.json();

      if (tplData && !tplData.error) setTemplate(tplData);
      if (qData.error) throw new Error(qData.error);
      setLetters(qData);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLettersLoading(false);
    }
  }, [toast]);

  /* ── Load companies ── */
  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach-list");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setCompanies(d);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setCompaniesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLetters();
    loadCompanies();
  }, [loadLetters, loadCompanies]);

  /* ── Select a letter card ── */
  async function selectLetter(letter: LetterRow) {
    setSelected(letter);
    setEditing(false);
    // Load contacts for this company
    try {
      const res = await fetch(
        `/api/contacts?companyname=${encodeURIComponent(letter.companyname)}`
      );
      const d = await res.json();
      if (Array.isArray(d)) setContacts(d);
      else setContacts([]);
    } catch {
      setContacts([]);
    }
  }

  /* ── Save full letter edits ── */
  async function saveLetter() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname: selected.companyname,
          body_final: editBody,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setSelected({ ...selected, body_final: editBody });
      setEditing(false);
      toast("Letter saved");
      loadLetters();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── Print single letter ── */
  function printLetter() {
    window.print();
  }

  /* ── Load roles for a company ── */
  async function toggleRoles(companyname: string) {
    if (expandedCompany === companyname) {
      setExpandedCompany(null);
      return;
    }
    setExpandedCompany(companyname);
    setRolesLoading(true);
    try {
      const res = await fetch(
        `/api/relevant-roles?companyname=${encodeURIComponent(companyname)}`
      );
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRoles(d);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setRolesLoading(false);
    }
  }

  /* ── Filtered companies ── */
  const filteredCompanies = companies.filter((c) => {
    if (compSearch && !c.companyname.toLowerCase().includes(compSearch.toLowerCase()))
      return false;
    if (tierFilter && c.tier !== Number(tierFilter)) return false;
    return true;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "bg-gray-200 text-gray-700";
      case "ready_to_print": return "bg-yellow-100 text-yellow-800";
      case "printed": return "bg-blue-100 text-blue-800";
      case "sent": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  /* ── Assembled letter for selected card ── */
  const assembled = selected && template
    ? selected.body_final
      ? { subject: template.subject_template.replace(/\{\{COMPANY\}\}/g, selected.companyname), body: selected.body_final }
      : assembleLetter(
          template,
          selected.companyname,
          selected.custom_paragraph || "",
          selected.contactname || (contacts.length > 0 ? contacts[0].contactname : undefined),
          selected.contact_title || (contacts.length > 0 ? contacts[0].title : undefined)
        )
    : null;

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════════
          SECTION 1: MY LETTERS
         ════════════════════════════════════════════ */}
      <section className="no-print">
        <h2 className="text-xl font-bold mb-4">My Letters</h2>

        {lettersLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : letters.length === 0 ? (
          <p className="text-gray-400 text-sm">No letters yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ── Left: Letter cards grid ── */}
            <div className="lg:col-span-1 space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => selectLetter(l)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected?.id === l.id
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{l.companyname}</p>
                      {l.contactname && (
                        <p className="text-xs text-gray-500 truncate">
                          {l.contactname}
                          {l.contact_title && ` — ${l.contact_title}`}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor(l.status)}`}
                    >
                      {l.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* ── Right: Letter preview ── */}
            <div className="lg:col-span-2">
              {!selected ? (
                <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
                  Click a company to view the letter
                </div>
              ) : (
                <div className="bg-white border rounded-lg overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                    <div>
                      <h3 className="font-semibold">{selected.companyname}</h3>
                      {selected.contactname && (
                        <p className="text-xs text-gray-500">
                          To: {selected.contactname}
                          {selected.contact_title && ` — ${selected.contact_title}`}
                        </p>
                      )}
                      {!selected.contactname && contacts.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Contact: {contacts[0].contactname} — {contacts[0].title}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!editing ? (
                        <>
                          <button
                            onClick={() => {
                              setEditing(true);
                              setEditBody(assembled?.body || "");
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-gray-200 hover:bg-gray-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={printLetter}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-gray-900 text-white hover:bg-black"
                          >
                            Print
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditing(false)}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-gray-200 hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveLetter}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Letter content */}
                  {editing ? (
                    <div className="p-4">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full border rounded-lg p-4"
                        style={{
                          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                          fontSize: "11pt",
                          lineHeight: "1.6",
                          minHeight: "600px",
                          whiteSpace: "pre-wrap",
                        }}
                      />
                    </div>
                  ) : assembled ? (
                    <div
                      style={{
                        padding: "40px 48px",
                        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                        fontSize: "12pt",
                        lineHeight: "1.7",
                        minHeight: "400px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {assembled.body}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-gray-400 italic">
                      Template not loaded.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Print-only: full assembled letter ── */}
      {selected && assembled && (
        <div
          className="hidden print:block"
          style={{
            padding: "0.75in 1in",
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontSize: "11pt",
            lineHeight: "1.5",
            whiteSpace: "pre-wrap",
            maxHeight: "9.5in",
            overflow: "hidden",
          }}
        >
          {assembled.body}
        </div>
      )}
      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          body { margin: 0; padding: 0; }
        }
      `}</style>

      {/* ════════════════════════════════════════════
          SECTION 2: COMPANIES & JOBS
         ════════════════════════════════════════════ */}
      <section className="no-print">
        <h2 className="text-xl font-bold mb-4">Companies</h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search companies..."
            value={compSearch}
            onChange={(e) => setCompSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-0"
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
          </select>
        </div>

        <p className="text-xs text-gray-400 mb-3">
          {filteredCompanies.length} companies
        </p>

        {companiesLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <div className="space-y-1">
            {filteredCompanies.slice(0, 50).map((c) => (
              <div key={c.companyname} className="bg-white rounded-lg border">
                <button
                  onClick={() => toggleRoles(c.companyname)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        c.tier === 1
                          ? "bg-green-100 text-green-800"
                          : c.tier === 2
                          ? "bg-blue-100 text-blue-800"
                          : c.tier === 3
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {c.tier}
                    </span>
                    <span className="font-medium text-sm truncate">
                      {c.companyname}
                    </span>
                    <span className="text-xs text-gray-400 hidden sm:inline">
                      {c.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.contactname && (
                      <span className="text-xs text-gray-500 hidden md:inline">
                        {c.contactname}
                        {c.contact_title && ` — ${c.contact_title}`}
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        expandedCompany === c.companyname ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {expandedCompany === c.companyname && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {rolesLoading ? (
                      <p className="text-gray-400 text-xs">Loading roles...</p>
                    ) : roles.length === 0 ? (
                      <p className="text-gray-400 text-xs">
                        No open roles found.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {roles.map((role, i) => (
                          <div key={i} className="py-2">
                            <p className="font-medium text-sm">{role.title}</p>
                            <p className="text-xs text-gray-500">
                              {role.location} &middot; {role.work_type}
                              {role.salary && ` · ${role.salary}`}
                            </p>
                            {role.url && (
                              <a
                                href={role.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline"
                              >
                                View posting
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filteredCompanies.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-3">
                Showing first 50 of {filteredCompanies.length} — use search to
                narrow down
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
