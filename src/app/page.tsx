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

  // Only collapse excessive blank lines in the body, preserve signature space
  const signIdx = body.indexOf("Sincerely,");
  if (signIdx > 0) {
    const before = body.substring(0, signIdx).replace(/\n{3,}/g, "\n\n");
    body = before + body.substring(signIdx);
  } else {
    body = body.replace(/\n{3,}/g, "\n\n");
  }

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

/* ── Niche color themes ── */
const NICHE_COLORS: Record<string, { bg: string; headerBg: string; border: string; accent: string }> = {
  "Acoustics / Audio / Musical Instruments": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-violet-900 to-purple-950",
    border: "border-violet-300/60",
    accent: "text-violet-900",
  },
  "Skiing": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-sky-800 to-slate-900",
    border: "border-sky-300/60",
    accent: "text-sky-900",
  },
  "Outdoor Recreation & Equipment": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-emerald-900 to-green-950",
    border: "border-emerald-300/60",
    accent: "text-emerald-900",
  },
  "Woodworking / Furniture / Cabinetry / Prototyping": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-amber-800 to-yellow-950",
    border: "border-amber-300/60",
    accent: "text-amber-900",
  },
  "Energy / Renewables / Power": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-orange-800 to-amber-950",
    border: "border-orange-300/60",
    accent: "text-orange-900",
  },
  "MEP / HVAC / Building Systems": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-teal-800 to-teal-950",
    border: "border-teal-300/60",
    accent: "text-teal-900",
  },
  "Construction / Civil / Heavy Industry": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-stone-700 to-stone-900",
    border: "border-stone-300/60",
    accent: "text-stone-800",
  },
  "Manufacturing / Automation / Product Design": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-indigo-900 to-blue-950",
    border: "border-indigo-300/60",
    accent: "text-indigo-900",
  },
  "Water / Environmental / Geotech": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-cyan-800 to-cyan-950",
    border: "border-cyan-300/60",
    accent: "text-cyan-900",
  },
  "Quantum / Deep Tech / Electronics / Robotics": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-rose-900 to-pink-950",
    border: "border-rose-300/60",
    accent: "text-rose-900",
  },
  "Aerospace / Space": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-blue-900 to-indigo-950",
    border: "border-blue-300/60",
    accent: "text-blue-900",
  },
  "Other": {
    bg: "from-gray-50 to-slate-50",
    headerBg: "from-gray-700 to-slate-800",
    border: "border-gray-300/60",
    accent: "text-gray-700",
  },
};

const DEFAULT_COLORS = NICHE_COLORS["Other"];

/* ── Main Page ── */
export default function HomePage() {
  const toast = useToast();

  const [template, setTemplate] = useState<Template | null>(null);
  const [lettersMap, setLettersMap] = useState<Map<string, LetterRow>>(new Map());
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIdx, setSelectedContactIdx] = useState(0);
  const [companyAddress, setCompanyAddress] = useState("");
  const [currentLetter, setCurrentLetter] = useState<LetterRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandLoading, setExpandLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [compSearch, setCompSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [collapsedNiches, setCollapsedNiches] = useState<Set<string>>(new Set());

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

  /* ── Toggle niche collapse ── */
  function toggleNiche(niche: string) {
    setCollapsedNiches((prev) => {
      const next = new Set(prev);
      if (next.has(niche)) next.delete(niche);
      else next.add(niche);
      return next;
    });
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

  const statusBadge = (s: string) => {
    switch (s) {
      case "draft": return "bg-white/60 text-gray-600 border border-gray-200";
      case "ready_to_print": return "bg-yellow-400/20 text-yellow-800 border border-yellow-300";
      case "printed": return "bg-blue-400/20 text-blue-800 border border-blue-300";
      case "sent": return "bg-green-400/20 text-green-800 border border-green-300";
      default: return "bg-gray-100 text-gray-500 border border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        {/* ── Hero header ── */}
        <div className="relative mb-8 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)",
            boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35), 0 8px 20px -8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
          />
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Entry-Level BSME / EIT
            </h1>
            <p className="text-slate-300 mt-1.5 text-sm sm:text-base font-medium">
              Denver Metro Outreach
            </p>
            <div className="flex items-center gap-3 mt-4">
              <span className="text-xs text-slate-400 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm">
                {filteredCompanies.length} companies
              </span>
              <span className="text-xs text-slate-400 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm">
                {lettersMap.size} letters drafted
              </span>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search companies..."
              value={compSearch}
              onChange={(e) => setCompSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
          </select>
        </div>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="columns-1 md:columns-2 gap-5 space-y-5">
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
                const colors = NICHE_COLORS[niche] || DEFAULT_COLORS;
                const isCollapsed = collapsedNiches.has(niche);

                return (
                  <div
                    key={niche}
                    className={`break-inside-avoid rounded-2xl border ${colors.border} overflow-hidden transition-all duration-300`}
                    style={{
                      boxShadow: "0 10px 30px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
                      transform: "translateZ(0)",
                    }}
                  >
                    {/* Niche header */}
                    <button
                      onClick={() => toggleNiche(niche)}
                      className="w-full text-left"
                    >
                      <div
                        className={`relative px-5 py-4 bg-gradient-to-r ${colors.headerBg}`}
                        style={{
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.1)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-sm text-white drop-shadow-sm">
                              {niche}
                            </h3>
                            <p className="text-[11px] text-white/60 mt-0.5">
                              {items.length} {items.length === 1 ? "company" : "companies"}
                            </p>
                          </div>
                          <svg
                            className={`w-4 h-4 text-white/70 transition-transform duration-300 ${isCollapsed ? "" : "rotate-180"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {/* Companies list */}
                    {!isCollapsed && (
                      <div className={`bg-gradient-to-b ${colors.bg} divide-y divide-black/[0.04]`}>
                        {items.map((c) => {
                          globalIdx++;
                          const num = globalIdx;
                          const isExpanded = expandedCompany === c.companyname;
                          const letter = lettersMap.get(c.companyname);
                          return (
                            <div key={c.companyname}>
                              <button
                                onClick={() => expandCompany(c.companyname)}
                                className={`w-full text-left px-5 py-3 flex items-center justify-between transition-all duration-200 ${
                                  isExpanded
                                    ? "bg-white/80 shadow-inner"
                                    : "hover:bg-white/50"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-black/[0.06] text-gray-400">
                                    {num}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-sm truncate block text-gray-800">
                                      {c.companyname}
                                    </span>
                                    <span className="text-[11px] truncate block text-gray-400">
                                      {c.city}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {letter && (
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(letter.status)}`}>
                                      {letter.status.replace(/_/g, " ")}
                                    </span>
                                  )}
                                  <svg
                                    className={`w-3.5 h-3.5 transition-transform duration-200 text-gray-300 ${isExpanded ? "rotate-180" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </button>

                              {/* Expanded company detail */}
                              {isExpanded && (
                                <div className="border-t border-black/[0.06] bg-white/90 backdrop-blur-sm px-5 pb-5 pt-4">
                                  {expandLoading ? (
                                    <div className="flex items-center gap-2 py-3">
                                      <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                                      <span className="text-xs text-gray-400">Loading...</span>
                                    </div>
                                  ) : (
                                    <>
                                      {/* Company info */}
                                      {c.company_about && (
                                        <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-100"
                                          style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)" }}
                                        >
                                          <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <p className="text-xs text-gray-600 leading-relaxed">{c.company_about}</p>
                                        </div>
                                      )}

                                      {/* Contact selector */}
                                      {contacts.length > 0 && (
                                        <div className="mb-4">
                                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                                            Contact
                                          </label>
                                          <select
                                            value={selectedContactIdx}
                                            onChange={(e) => applyContact(Number(e.target.value))}
                                            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white w-full max-w-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                                        <div
                                          className="rounded-xl overflow-hidden border border-gray-200 mt-2"
                                          style={{
                                            boxShadow: "0 4px 12px -2px rgba(0,0,0,0.08), 0 2px 6px -2px rgba(0,0,0,0.04)",
                                          }}
                                        >
                                          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-gray-50 to-white">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Letter Preview</span>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => { setEditing(true); setEditBody(assembled.body); }}
                                                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors border border-gray-200"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                onClick={() => window.print()}
                                                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
                                                style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}
                                              >
                                                Print
                                              </button>
                                            </div>
                                          </div>
                                          <div
                                            className="bg-white"
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
                                            className="w-full border border-gray-200 rounded-xl p-4 text-xs shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                            style={{
                                              fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                                              fontSize: "10pt",
                                              lineHeight: "1.5",
                                              minHeight: "400px",
                                              whiteSpace: "pre-wrap",
                                            }}
                                          />
                                          <div className="flex gap-2 mt-3">
                                            <button
                                              onClick={() => setEditing(false)}
                                              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors border border-gray-200"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              onClick={saveLetter}
                                              disabled={saving}
                                              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                              style={{ boxShadow: "0 2px 4px rgba(37,99,235,0.3)" }}
                                            >
                                              {saving ? "Saving..." : "Save"}
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* No letter yet */}
                                      {!assembled && !editing && (
                                        <div className="flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 mt-2">
                                          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                          <p className="text-xs text-gray-400 italic">
                                            No letter draft for this company yet.
                                          </p>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
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
