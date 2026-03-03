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
  company_about?: string;
  niche?: string;
}

/* ── Assemble a letter from template + data ── */
function assembleLetter(
  template: Template,
  companyname: string,
  customParagraph: string,
  contactName?: string,
  contactTitle?: string,
  companyAddress?: string
) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let body = template.body_template
    .replace(/\{\{COMPANY\}\}/g, companyname)
    .replace(/\{\{CUSTOM_PARAGRAPH\}\}/g, customParagraph || "")
    .replace(/\{\{TODAY_DATE\}\}/g, today)
    .replace(/\{\{COMPANY_ADDRESS\}\}/g, companyAddress || "");

  if (contactName) {
    const firstName = contactName.split(" ")[0];
    const titleLine = contactTitle ? `${contactTitle}\n` : "";
    body = body.replace("Hiring Manager\n", `${contactName}\n${titleLine}`);
    body = body.replace("Dear Hiring Manager", `Dear ${firstName}`);
  }

  body = body.replace(/\n{3,}/g, "\n\n");

  const subject = template.subject_template
    .replace(/\{\{COMPANY\}\}/g, companyname);

  return { subject, body };
}

const NICHE_ORDER = [
  "Acoustics / Audio / Musical Instruments",
  "Skiing",
  "Outdoor Recreation & Equipment",
  "Woodworking / Furniture / Cabinetry / Prototyping",
  "Energy / Renewables / Power",
  "MEP / HVAC / Building Systems",
  "Construction / Civil / Heavy Industry",
  "Manufacturing / Automation / Product Design",
  "Water / Environmental / Geotech",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Aerospace / Space",
  "Other",
];

/* ── Main Page ── */
export default function HomePage() {
  const toast = useToast();

  // Template
  const [template, setTemplate] = useState<Template | null>(null);

  // Letters map (companyname -> LetterRow)
  const [lettersMap, setLettersMap] = useState<Map<string, LetterRow>>(new Map());

  // Expanded company state
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIdx, setSelectedContactIdx] = useState(0);
  const [companyAddress, setCompanyAddress] = useState("");
  const [currentLetter, setCurrentLetter] = useState<LetterRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandLoading, setExpandLoading] = useState(false);

  // Company browser
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [compSearch, setCompSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [companiesLoading, setCompaniesLoading] = useState(true);

  /* ── Load template + letters + companies ── */
  const loadData = useCallback(async () => {
    try {
      const [tplRes, qRes, compRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/queue"),
        fetch("/api/outreach-list"),
      ]);
      const tplData = await tplRes.json();
      const qData = await qRes.json();
      const compData = await compRes.json();

      if (tplData && !tplData.error) setTemplate(tplData);
      if (!qData.error && Array.isArray(qData)) {
        const map = new Map<string, LetterRow>();
        for (const l of qData) map.set(l.companyname, l);
        setLettersMap(map);
      }
      if (!compData.error) setCompanies(compData);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setCompaniesLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Expand a company: load contacts, address, and letter ── */
  async function expandCompany(companyname: string) {
    if (expandedCompany === companyname) {
      setExpandedCompany(null);
      setEditing(false);
      return;
    }
    setExpandedCompany(companyname);
    setEditing(false);
    setSelectedContactIdx(0);
    setExpandLoading(true);
    setCurrentLetter(lettersMap.get(companyname) || null);

    try {
      const [contRes, compRes] = await Promise.all([
        fetch(`/api/contacts?companyname=${encodeURIComponent(companyname)}`),
        fetch(`/api/company?companyname=${encodeURIComponent(companyname)}`),
      ]);
      const contData = await contRes.json();
      const compData = await compRes.json();
      if (Array.isArray(contData)) setContacts(contData);
      else setContacts([]);
      if (compData && !compData.error) {
        const parts = [
          compData.mailing_address1,
          compData.mailing_address2,
          [compData.mailing_city, compData.mailing_state, compData.mailing_zip].filter(Boolean).join(", "),
        ].filter(Boolean);
        setCompanyAddress(parts.join("\n"));
      } else {
        setCompanyAddress("");
      }
    } catch {
      setContacts([]);
      setCompanyAddress("");
    } finally {
      setExpandLoading(false);
    }
  }

  /* ── Apply selected contact ── */
  async function applyContact(idx: number) {
    setSelectedContactIdx(idx);
    const c = contacts[idx];
    if (!c || !expandedCompany) return;
    const letter = lettersMap.get(expandedCompany);
    if (!letter) return;
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname: expandedCompany,
          contactname: c.contactname,
          contact_title: c.title,
          contact_email: c.email,
          body_final: null,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const updated = {
        ...letter,
        contactname: c.contactname,
        contact_title: c.title,
        contact_email: c.email,
        body_final: undefined,
      };
      setCurrentLetter(updated);
      setLettersMap((prev) => { const m = new Map(prev); m.set(expandedCompany, updated); return m; });
      toast(`Contact set: ${c.contactname}`);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  /* ── Save letter edits ── */
  async function saveLetter() {
    if (!expandedCompany) return;
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname: expandedCompany,
          body_final: editBody,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (currentLetter) {
        const updated = { ...currentLetter, body_final: editBody };
        setCurrentLetter(updated);
        setLettersMap((prev) => { const m = new Map(prev); m.set(expandedCompany, updated); return m; });
      }
      setEditing(false);
      toast("Letter saved");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── Filtered companies ── */
  const filteredCompanies = companies.filter((c) => {
    if (compSearch && !c.companyname.toLowerCase().includes(compSearch.toLowerCase()))
      return false;
    if (tierFilter && c.tier !== Number(tierFilter)) return false;
    return true;
  });

  /* ── Assembled letter for expanded company ── */
  const assembled = expandedCompany && template && currentLetter
    ? currentLetter.body_final
      ? { subject: template.subject_template.replace(/\{\{COMPANY\}\}/g, expandedCompany), body: currentLetter.body_final }
      : assembleLetter(
          template,
          expandedCompany,
          currentLetter.custom_paragraph || "",
          currentLetter.contactname || (contacts.length > 0 ? contacts[selectedContactIdx]?.contactname : undefined),
          currentLetter.contact_title || (contacts.length > 0 ? contacts[selectedContactIdx]?.title : undefined),
          companyAddress
        )
    : null;

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "bg-gray-200 text-gray-700";
      case "ready_to_print": return "bg-yellow-100 text-yellow-800";
      case "printed": return "bg-blue-100 text-blue-800";
      case "sent": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-bold mb-4">Kohler Outreach</h1>

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

        <p className="text-xs text-gray-400 mb-4">
          {filteredCompanies.length} companies
        </p>

        {companiesLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              const grouped = new Map<string, CompanyRow[]>();
              for (const c of filteredCompanies) {
                const n = c.niche || "Other";
                if (!grouped.has(n)) grouped.set(n, []);
                grouped.get(n)!.push(c);
              }
              const sortedNiches = NICHE_ORDER.filter((n) => grouped.has(n));
              Array.from(grouped.keys()).forEach((n) => {
                if (!sortedNiches.includes(n)) sortedNiches.push(n);
              });
              let globalIdx = 0;
              return sortedNiches.map((niche) => {
                const items = grouped.get(niche)!;
                return (
                  <div key={niche} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b">
                      <h3 className="font-semibold text-sm">{niche}</h3>
                      <p className="text-xs text-gray-400">{items.length} companies</p>
                    </div>
                    <div className="divide-y max-h-[500px] overflow-y-auto">
                      {items.map((c) => {
                        globalIdx++;
                        const num = globalIdx;
                        const isExpanded = expandedCompany === c.companyname;
                        const letter = lettersMap.get(c.companyname);
                        return (
                          <div key={c.companyname}>
                            <button
                              onClick={() => expandCompany(c.companyname)}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                                isExpanded ? "bg-blue-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="shrink-0 w-5 text-center text-[10px] font-medium text-gray-300">
                                  {num}
                                </span>
                                <span className="font-medium text-sm truncate">
                                  {c.companyname}
                                </span>
                                <span className="text-[11px] text-gray-400 hidden sm:inline truncate">
                                  {c.city}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {letter && (
                                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusColor(letter.status)}`}>
                                    {letter.status.replace(/_/g, " ")}
                                  </span>
                                )}
                                <svg
                                  className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t bg-gray-50 px-4 pb-4 pt-3">
                                {expandLoading ? (
                                  <p className="text-gray-400 text-xs">Loading...</p>
                                ) : (
                                  <>
                                    {/* Company info */}
                                    {c.company_about && (
                                      <p className="text-xs text-gray-600 mb-3">{c.company_about}</p>
                                    )}

                                    {/* Contact selector */}
                                    {contacts.length > 0 && (
                                      <div className="mb-3">
                                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide block mb-1">
                                          Contact
                                        </label>
                                        <select
                                          value={selectedContactIdx}
                                          onChange={(e) => applyContact(Number(e.target.value))}
                                          className="text-xs border rounded px-2 py-1.5 bg-white w-full max-w-xs"
                                        >
                                          {contacts.map((ct, i) => (
                                            <option key={i} value={i}>
                                              {ct.contactname}{ct.title ? ` — ${ct.title}` : ""}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    {/* Letter preview */}
                                    {assembled && !editing && (
                                      <div className="bg-white border rounded-lg overflow-hidden mt-2">
                                        <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                                          <span className="text-xs font-medium text-gray-500">Letter Preview</span>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => { setEditing(true); setEditBody(assembled.body); }}
                                              className="px-2.5 py-1 text-[11px] font-medium rounded bg-gray-200 hover:bg-gray-300"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => window.print()}
                                              className="px-2.5 py-1 text-[11px] font-medium rounded bg-gray-900 text-white hover:bg-black"
                                            >
                                              Print
                                            </button>
                                          </div>
                                        </div>
                                        <div
                                          style={{
                                            padding: "24px 32px",
                                            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                                            fontSize: "10pt",
                                            lineHeight: "1.6",
                                            whiteSpace: "pre-wrap",
                                            maxHeight: "400px",
                                            overflowY: "auto",
                                          }}
                                        >
                                          {assembled.body}
                                        </div>
                                      </div>
                                    )}

                                    {/* Edit mode */}
                                    {editing && (
                                      <div className="mt-2">
                                        <textarea
                                          value={editBody}
                                          onChange={(e) => setEditBody(e.target.value)}
                                          className="w-full border rounded-lg p-3 text-xs"
                                          style={{
                                            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                                            fontSize: "10pt",
                                            lineHeight: "1.5",
                                            minHeight: "400px",
                                            whiteSpace: "pre-wrap",
                                          }}
                                        />
                                        <div className="flex gap-2 mt-2">
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
                                        </div>
                                      </div>
                                    )}

                                    {/* No letter yet */}
                                    {!assembled && !editing && (
                                      <p className="text-xs text-gray-400 italic mt-2">
                                        No letter draft for this company yet.
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* ── Print-only: full assembled letter ── */}
      {assembled && (
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
    </div>
  );
}
