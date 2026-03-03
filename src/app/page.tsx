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
  printed_at?: string;
  sent_at?: string;
  created_at?: string;
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
    headerBg: "",
    border: "border-rose-400/40",
    accent: "text-rose-950",
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
  const [fullyExpandedNiches, setFullyExpandedNiches] = useState<Set<string>>(new Set());

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

  /* ── Print and auto-log as sent ── */
  async function printAndLog() {
    if (!expandedCompany || !currentLetter) { window.print(); return; }
    try {
      await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [currentLetter.id], status: "sent" }),
      });
      const now = new Date().toISOString();
      const updated = { ...currentLetter, status: "sent", sent_at: now, printed_at: now };
      setCurrentLetter(updated);
      setLettersMap((prev) => { const m = new Map(prev); m.set(expandedCompany, updated); return m; });
      toast("Marked as sent");
    } catch {
      // still print even if logging fails
    }
    window.print();
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
        {/* ── ENTRY LEVEL header bento box ── */}
        <div className="relative rounded-2xl overflow-hidden mb-0"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)",
            boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35), 0 8px 20px -8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
          />
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight uppercase">
              ENTRY LEVEL BSME / EIT
            </h1>
            <p className="text-slate-300 mt-1.5 text-sm sm:text-base font-medium uppercase tracking-wide">
              OUTREACH MISSION CONTROL
            </p>
            <div className="flex items-center gap-3 mt-4">
              <span className="text-xs text-slate-400 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm">
                {filteredCompanies.length} companies
              </span>
              <span className="text-xs text-slate-400 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm">
                {lettersMap.size} letters drafted
              </span>
              <span className="text-xs text-slate-400 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm">
                {Array.from(lettersMap.values()).filter(l => l.status === "sent" || l.status === "printed").length} sent
              </span>
            </div>
          </div>
        </div>

        {/* ── Gray divider line ── */}
        <div className="border-b border-gray-300 my-5" />

        {/* ── March 2026 Mailing Calendar ── */}
        {(() => {
          const allLetters = Array.from(lettersMap.values());
          const sentOrPrinted = allLetters.filter(l => l.sent_at || l.printed_at || l.status === "sent" || l.status === "printed");

          // Group sent letters by day-of-month for March 2026
          const sentByDay = new Map<number, { companyname: string; contactname?: string }[]>();
          for (const l of sentOrPrinted) {
            const dateStr = l.sent_at || l.printed_at || "";
            if (!dateStr) continue;
            const d = new Date(dateStr);
            if (d.getFullYear() === 2026 && d.getMonth() === 2) {
              const day = d.getDate();
              if (!sentByDay.has(day)) sentByDay.set(day, []);
              sentByDay.get(day)!.push({ companyname: l.companyname, contactname: l.contactname });
            }
          }

          // March 2026 starts on Sunday (day 0), 31 days
          const daysInMonth = 31;
          const startDow = 0; // Sunday
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const cells: (number | null)[] = [];
          for (let i = 0; i < startDow; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          const today = new Date();
          const todayDay = today.getFullYear() === 2026 && today.getMonth() === 2 ? today.getDate() : -1;

          return (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden"
              style={{ boxShadow: "0 4px 12px -4px rgba(0,0,0,0.08)" }}
            >
              <div className="px-5 py-3 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-700">March 2026</h2>
                <span className="text-[11px] text-gray-400">{sentOrPrinted.length} letters sent</span>
              </div>
              <div className="p-4">
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {dayNames.map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, i) => {
                    if (day === null) return <div key={i} />;
                    const entries = sentByDay.get(day);
                    const count = entries ? entries.length : 0;
                    const isToday = day === todayDay;
                    return (
                      <div
                        key={i}
                        className={`relative rounded-lg text-center py-2 text-xs transition-all group cursor-default ${
                          count > 0
                            ? "bg-green-100 text-green-900 font-bold ring-1 ring-green-300"
                            : isToday
                            ? "bg-blue-50 text-blue-800 font-semibold ring-1 ring-blue-300"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {day}
                        {count > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-green-600 text-white text-[9px] font-bold px-1">
                            {count}
                          </span>
                        )}
                        {/* Tooltip on hover */}
                        {count > 0 && (
                          <div className="hidden group-hover:block absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-gray-900 text-white rounded-lg p-2 text-[10px] text-left shadow-xl">
                            <div className="font-bold mb-1">March {day} — {count} sent</div>
                            {entries!.slice(0, 5).map((e, j) => (
                              <div key={j} className="truncate text-gray-300">
                                {e.companyname}{e.contactname ? ` → ${e.contactname}` : ""}
                              </div>
                            ))}
                            {count > 5 && <div className="text-gray-500 mt-0.5">+{count - 5} more</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {sentOrPrinted.length === 0 && (
                  <div className="text-center text-sm text-gray-400 py-3 mt-2">
                    No letters sent yet. Print a letter to start tracking.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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
        </div>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          (() => {
            const grouped = new Map<string, CompanyRow[]>();
            for (const c of filteredCompanies) {
              const n = c.niche || "Other";
              if (!grouped.has(n)) grouped.set(n, []);
              grouped.get(n)!.push(c);
            }

            // Build ordered list of niches: follow NICHE_ORDER, then any extras
            const orderedNiches: string[] = [];
            for (const n of NICHE_ORDER) {
              if (grouped.has(n) && grouped.get(n)!.length > 0) {
                orderedNiches.push(n);
              }
            }
            // Add any niches not in NICHE_ORDER (e.g. new categories)
            Array.from(grouped.keys()).forEach((n) => {
              if (!orderedNiches.includes(n) && n !== "Other") {
                orderedNiches.push(n);
              }
            });
            // "Other" always last
            if (grouped.has("Other") && grouped.get("Other")!.length > 0) {
              if (!orderedNiches.includes("Other")) orderedNiches.push("Other");
            }

            let globalIdx = 0;

            function renderBentoBox(niche: string, items: CompanyRow[]) {
              const colors = NICHE_COLORS[niche] || DEFAULT_COLORS;
              const isCollapsed = collapsedNiches.has(niche);

              return (
                <div
                  key={niche}
                  className={`rounded-2xl border ${colors.border} overflow-hidden transition-all duration-300 min-w-0`}
                  style={{
                    boxShadow: "0 10px 30px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                >
                  {/* Niche header */}
                  <button
                    onClick={() => toggleNiche(niche)}
                    className="w-full text-left"
                  >
                    <div
                      className={`relative px-5 py-4 ${colors.headerBg ? `bg-gradient-to-r ${colors.headerBg}` : ""}`}
                      style={{
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.1)",
                        ...(!colors.headerBg ? { background: "linear-gradient(135deg, #5b2333 0%, #3d1522 50%, #2a0e18 100%)" } : {}),
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
                  {!isCollapsed && (() => {
                    const PREVIEW_COUNT = 3;
                    const isFullyExpanded = fullyExpandedNiches.has(niche);
                    const visibleItems = isFullyExpanded ? items : items.slice(0, PREVIEW_COUNT);
                    const hiddenCount = items.length - PREVIEW_COUNT;

                    return (
                    <div className={`bg-gradient-to-b ${colors.bg} divide-y divide-black/[0.04]`}>
                      {visibleItems.map((c) => {
                        globalIdx++;
                        const num = globalIdx;
                        const isExpanded = expandedCompany === c.companyname;
                        const letter = lettersMap.get(c.companyname);
                        return (
                          <div key={c.companyname}>
                            <button
                              onClick={() => expandCompany(c.companyname)}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all duration-200 ${
                                isExpanded
                                  ? "bg-white/80 shadow-inner"
                                  : "hover:bg-white/50"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="shrink-0 w-5 h-5 text-[9px] rounded-full flex items-center justify-center font-bold bg-black/[0.06] text-gray-400">
                                  {num}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-semibold text-xs truncate block text-gray-800">
                                    {c.companyname}
                                  </span>
                                  <span className="text-[10px] truncate block text-gray-400">
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
                                              onClick={() => printAndLog()}
                                              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors"
                                              style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}
                                            >
                                              Print & Send
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
                                      <div className="mt-2 rounded-xl overflow-hidden border border-blue-200" style={{ boxShadow: "0 4px 12px -2px rgba(37,99,235,0.15)" }}>
                                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-blue-50 to-white">
                                          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Editing Letter</span>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => setEditing(false)}
                                              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors border border-gray-200"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              onClick={saveLetter}
                                              disabled={saving}
                                              className="px-4 py-1.5 text-[11px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                              style={{ boxShadow: "0 2px 4px rgba(37,99,235,0.3)" }}
                                            >
                                              {saving ? "Saving..." : "Save Letter"}
                                            </button>
                                          </div>
                                        </div>
                                        <textarea
                                          value={editBody}
                                          onChange={(e) => setEditBody(e.target.value)}
                                          className="w-full border-0 p-4 text-xs focus:ring-0 focus:outline-none"
                                          style={{
                                            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                                            fontSize: "10pt",
                                            lineHeight: "1.5",
                                            minHeight: "400px",
                                            whiteSpace: "pre-wrap",
                                          }}
                                        />
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
                      {/* Show more / Show less button */}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => setFullyExpandedNiches((prev) => {
                            const next = new Set(prev);
                            if (next.has(niche)) next.delete(niche);
                            else next.add(niche);
                            return next;
                          })}
                          className="w-full px-4 py-2 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-colors flex items-center justify-center gap-1"
                        >
                          {isFullyExpanded ? (
                            <>Show less</>
                          ) : (
                            <>Show all {items.length} companies ({hiddenCount} more)</>
                          )}
                        </button>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {orderedNiches.map((niche) => {
                  const items = grouped.get(niche);
                  if (!items || items.length === 0) return null;
                  return renderBentoBox(niche, items);
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* ── Print-only: full assembled letter ── */}
      {assembled && (
        <div
          className="hidden print:block"
          style={{
            padding: "0.75in 0.65in",
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
