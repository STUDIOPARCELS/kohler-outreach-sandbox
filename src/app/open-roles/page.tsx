"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

interface RoleRow {
  companyname: string;
  tier: number;
  city?: string;
  niche?: string;
  roles: number;
  contact_count?: number;
  email_count?: number;
  mines_alumni_count?: number;
  pe_contact_count?: number;
  outreach_score?: number;
  score_label?: string;
  score_reasons?: string[];
  best_role_title?: string | null;
  best_overall_score?: number;
  best_pe_track_score?: number;
  best_source?: string | null;
  best_last_seen_at?: string | null;
  recommended_action?: string;
  fit_summary?: string;
}

interface Stats {
  totalRoles: number;
  companies: number;
  newRoles24h: number;
  updatedExisting24h: number;
  newRoles7d: number;
  newRoles30d: number;
  newZR24h: number;
  newGov24h: number;
  bySource: Record<string, number>;
}

interface Role {
  title: string;
  location: string;
  work_type: string;
  salary: string;
  url: string;
  date_posted: string;
  source?: string;
  first_seen?: string;
  last_seen?: string;
  times_seen?: number;
  fit_score?: number;
  pe_track_score?: number;
  recommended_action?: string;
  explanation_summary?: string;
}

interface RuntimeDiagnostics {
  runtime?: {
    appEnvironment: string;
    appEnvironmentSource: string;
    vercelEnvironment: string | null;
    supabaseHost: string | null;
    supabaseProjectRef: string | null;
    parserVersion: { ziprecruiter: string; careers: string; configured: string | null };
    liveSendEnabled: boolean;
    governmentJobSourcesEnabled: boolean;
    contactEnrichmentEnabled: boolean;
  };
  jobs?: {
    status: string;
    latestJobCount?: number;
    latestOpenRoleCompanyCount?: number;
    latestJobSeenAt?: string | null;
    latestParserVersion?: number | null;
  };
  latestSyncRun?: {
    status: string;
    run?: {
      runStatus: string | null;
      finishedAt: string | null;
      jobsExtracted: number | null;
    };
  };
  gmail?: { status: string; updatedAt?: string | null };
  lastSuccessfulIngestAt?: string | null;
}

const SRC_LABELS: Record<string, string> = {
  ziprecruiter_email: "ZipRecruiter",
  governmentjobs_email: "GovernmentJobs",
  governmentjobs_direct: "GovernmentJobs",
  builtin_colorado: "Built In Colorado",
  "dice.com": "Dice",
  usajobs: "USAJobs",
  "blueorigin.com": "Blue Origin",
  manual_seed: "Manual",
  "ball.com": "Ball",
  greenhouse_careers: "Greenhouse",
  lever_careers: "Lever",
  ashby_careers: "Ashby",
  smartrecruiters_careers: "SmartRecruiters",
  workable_careers: "Workable",
  workday_careers: "Workday",
  oracle_careers: "Oracle Careers",
  icims_careers: "iCIMS",
  jsonld_careers: "Careers Page",
  career_links_careers: "Careers Page",
};

const NICHE_ORDER = [
  "MEP / HVAC / Building Systems",
  "Government / Public Works / Infrastructure",
  "Construction / Civil / Heavy Industry",
  "Water / Environmental / Geotech",
  "Aerospace / Space",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Energy / Renewables / Power",
  "Manufacturing / Automation / Product Design",
  "Metals / Material Science",
  "Automotive / Vehicles",
  "Medical / Biotech",
  "Real Estate / Facilities",
];

const NICHE_COLORS: Record<string, { bg: string; headerBg: string; border: string; accent: string }> = {
  "Government / Public Works / Infrastructure": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-amber-700 via-yellow-800 to-amber-900",
    border: "border-gray-200/40",
    accent: "text-gray-800",
  },
  "ZipRecruiter Intake": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-violet-800 via-purple-900 to-violet-900",
    border: "border-gray-200/40",
    accent: "text-gray-800",
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
  "MEP / HVAC / Facilities": {
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
  "Manufacturing / Consumer Products": {
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
  "Medical / Biotech": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-red-800 to-rose-950",
    border: "border-red-300/60",
    accent: "text-red-900",
  },
  "Metals / Material Science": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-zinc-700 to-slate-800",
    border: "border-zinc-300/60",
    accent: "text-zinc-900",
  },
  "Automotive / Vehicles": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-zinc-800 to-neutral-900",
    border: "border-zinc-300/60",
    accent: "text-zinc-900",
  },
  "Real Estate / Facilities": {
    bg: "from-gray-50 to-slate-50",
    headerBg: "from-gray-700 to-slate-800",
    border: "border-gray-300/60",
    accent: "text-gray-700",
  },
};

const DEFAULT_COLORS = NICHE_COLORS["Real Estate / Facilities"];

function srcLabel(s: string) { return SRC_LABELS[s] || s; }

function relTime(iso: string | undefined) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function roleLabel(count: number) {
  return count + " " + (count === 1 ? "job" : "jobs");
}

function actionLabel(action?: string) {
  return (action || "monitor").replace(/_/g, " ");
}

function fitLabel(score?: number | null) {
  const value = score ?? 0;
  if (value >= 45) return "Strong fit";
  if (value >= 35) return "Good fit";
  if (value >= 25) return "Possible fit";
  return "Low fit";
}

function fitTitle(row: Pick<RoleRow, "best_overall_score" | "fit_summary">) {
  return `Kohler fit score ${row.best_overall_score ?? 0}. This is a ranking from visible job evidence, not a school-grade percent. Evidence: ${row.fit_summary || "limited explicit evidence"}`;
}

function roleFitTitle(score?: number | null, summary?: string) {
  return `Kohler fit score ${score ?? 0}. This is a ranking from visible job evidence, not a school-grade percent. Evidence: ${summary || "limited explicit evidence"}`;
}

function pePathLabel(score?: number | null) {
  return (score || 0) > 0 ? `PE path ${score}` : "No PE signal";
}

export default function OpenRolesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalRoles: 0, companies: 0, newRoles24h: 0, updatedExisting24h: 0,
    newRoles7d: 0, newRoles30d: 0, newZR24h: 0, newGov24h: 0, bySource: {},
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState("");
  const [minFit, setMinFit] = useState("0");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/open-roles-list")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (d.stats) setStats(d.stats);
        setRows(d.companies || d);
      })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/runtime-diagnostics")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setDiagnostics(d);
      })
      .catch(() => setDiagnostics(null));
  }, []);

  const loadRoles = useCallback(async (companyname: string) => {
    if (expanded === companyname) {
      setExpanded(null);
      return;
    }
    setExpanded(companyname);
    setRoles([]);
    setRolesLoading(true);
    try {
      const params = new URLSearchParams({ companyname });
      const res = await fetch("/api/relevant-roles?" + params.toString());
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRoles(d);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setRolesLoading(false);
    }
  }, [expanded, toast]);

  const nicheOptions = [
    ...NICHE_ORDER.filter((niche) => rows.some((row) => (row.niche || "Other") === niche)),
    ...Array.from(new Set(rows.map((row) => row.niche || "Other")))
      .filter((niche) => !NICHE_ORDER.includes(niche) && niche !== "Other")
      .sort((a, b) => a.localeCompare(b)),
    ...(rows.some((row) => !row.niche) ? ["Other"] : []),
  ];

  const filtered = rows.filter((r) => {
    if (search && !r.companyname.toLowerCase().includes(search.toLowerCase())) return false;
    if (nicheFilter && (r.niche || "Other") !== nicheFilter) return false;
    if ((r.best_overall_score || 0) < Number(minFit || 0)) return false;
    return true;
  });

  const grouped = new Map<string, RoleRow[]>();
  for (const row of filtered) {
    const niche = row.niche || "Other";
    if (!grouped.has(niche)) grouped.set(niche, []);
    grouped.get(niche)!.push(row);
  }

  const orderedNiches = [
    ...NICHE_ORDER.filter((niche) => grouped.has(niche)),
    ...Array.from(grouped.keys()).filter((niche) => !NICHE_ORDER.includes(niche) && niche !== "Other"),
    ...(grouped.has("Other") ? ["Other"] : []),
  ];
  const displayedRoles = [...roles].sort((a, b) =>
    new Date(b.date_posted || 0).getTime() - new Date(a.date_posted || 0).getTime()
  );

  let globalIdx = 0;

  return (
    <div>
      <div className="mb-5 rounded-2xl overflow-hidden shadow-xl border border-slate-700/20 bg-slate-900">
        <div className="px-5 py-4 sm:px-6 bg-slate-900 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Open Roles</h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">Entry-level BSME / EIT target queue</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <span className={`rounded-full px-2 py-1 ${
                  diagnostics?.runtime?.appEnvironment === "sandbox"
                    ? "bg-emerald-400/20 text-emerald-100 border border-emerald-300/20"
                    : "bg-amber-400/20 text-amber-100 border border-amber-300/20"
                }`}>
                  {diagnostics?.runtime?.appEnvironment || "environment unknown"}
                </span>
                <span className="rounded-full px-2 py-1 bg-white/10 text-slate-200 border border-white/10">
                  Parser ZR {diagnostics?.runtime?.parserVersion.ziprecruiter || "?"} / Careers {diagnostics?.runtime?.parserVersion.careers || "?"}
                </span>
                <span className="rounded-full px-2 py-1 bg-white/10 text-slate-200 border border-white/10 normal-case">
                  Supabase {diagnostics?.runtime?.supabaseProjectRef || diagnostics?.runtime?.supabaseHost || "unknown"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
                <p className="text-lg font-bold leading-none">{stats.totalRoles}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 mt-1">Jobs</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
                <p className="text-lg font-bold leading-none">{stats.companies}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 mt-1">Companies</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
                <p className="text-lg font-bold leading-none">{stats.newRoles7d}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 mt-1">7 days</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
                <p className="text-lg font-bold leading-none">{stats.newRoles24h}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 mt-1">24h</p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
              <p className="text-slate-400">Latest sync</p>
              <p className="font-semibold text-white">
                {diagnostics?.latestSyncRun?.run?.runStatus || diagnostics?.latestSyncRun?.status || "unknown"}
                {diagnostics?.latestSyncRun?.run?.finishedAt ? ` · ${relTime(diagnostics.latestSyncRun.run.finishedAt)}` : ""}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
              <p className="text-slate-400">Tracked open jobs</p>
              <p className="font-semibold text-white">
                {diagnostics?.jobs?.latestJobCount ?? stats.totalRoles} jobs · {diagnostics?.jobs?.latestOpenRoleCompanyCount ?? stats.companies} companies
              </p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
              <p className="text-slate-400">Gmail cursor</p>
              <p className="font-semibold text-white">{diagnostics?.gmail?.status?.replace(/_/g, " ") || "unknown"}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
              <p className="text-slate-400">Safety gates</p>
              <p className="font-semibold text-white">
                Live send {diagnostics?.runtime?.liveSendEnabled ? "on" : "off"} · Gov {diagnostics?.runtime?.governmentJobSourcesEnabled ? "on" : "off"} · Contacts {diagnostics?.runtime?.contactEnrichmentEnabled ? "on" : "off"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-5">
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400 outline-none"
        />
        <select
          value={minFit}
          onChange={(e) => {
            setMinFit(e.target.value);
            setExpanded(null);
            setRoles([]);
          }}
          title="Minimum Kohler fit ranking from visible job evidence"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="0">Any Fit</option>
          <option value="25">Possible+</option>
          <option value="35">Good+</option>
          <option value="45">Strong</option>
        </select>
        <select
          value={nicheFilter}
          onChange={(e) => {
            setNicheFilter(e.target.value);
            setExpanded(null);
            setRoles([]);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="">All Niches</option>
          {nicheOptions.map((niche) => (
            <option key={niche} value={niche}>{niche}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {orderedNiches.map((niche) => {
            const items = [...(grouped.get(niche) || [])].sort((a, b) =>
              (b.outreach_score || 0) - (a.outreach_score || 0) || b.roles - a.roles || a.companyname.localeCompare(b.companyname)
            );
            const colors = NICHE_COLORS[niche] || DEFAULT_COLORS;
            const roleCount = items.reduce((sum, item) => sum + item.roles, 0);

            return (
              <div key={niche} className={`rounded-2xl overflow-hidden shadow-xl border ${colors.border} bg-white`}>
                <div className={`px-5 py-4 bg-gradient-to-r ${colors.headerBg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold text-sm text-white drop-shadow-sm truncate">{niche}</h2>
                      <p className="text-xs text-white/70 mt-0.5">
                        {items.length} {items.length === 1 ? "company" : "companies"} - {roleLabel(roleCount)}
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-1 rounded-full bg-white/15 text-white text-[10px] font-bold">
                      {roleCount}
                    </span>
                  </div>
                </div>

                <div className={`bg-gradient-to-b ${colors.bg} divide-y divide-black/[0.04]`}>
                  {items.map((row) => {
                    globalIdx++;
                    const isExpanded = expanded === row.companyname;
                    return (
                      <div key={row.companyname} data-company={row.companyname}>
                        <button
                          onClick={() => loadRoles(row.companyname)}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-all duration-200 ${
                            isExpanded ? "bg-white/80 shadow-inner" : "hover:bg-white/50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="shrink-0 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold bg-black/[0.06] text-gray-400">
                              {globalIdx}
                            </span>
                            <div className="min-w-0">
                              <span className="font-semibold text-xs truncate block text-gray-800">{row.companyname}</span>
                            <span className="text-xs truncate block text-gray-400">{row.city || "Denver metro"}</span>
                              {row.best_role_title && (
                                <span className="text-[10px] truncate block text-gray-500 mt-0.5">
                                  {row.best_role_title}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              title={fitTitle(row)}
                              className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded-full"
                            >
                              {fitLabel(row.best_overall_score)}
                            </span>
                            <span
                              title="PE path score from job wording like EIT, licensed engineer supervision, design calculations, stamped drawings, MEP, civil, water, geotech, or field engineering. This is not a count of PE staff."
                              className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full"
                            >
                              {pePathLabel(row.best_pe_track_score)}
                            </span>
                            <span
                              title="Known Colorado School of Mines alumni found in existing contact notes or LinkedIn fields. Zero means none captured yet."
                              className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 rounded-full"
                            >
                              Mines {row.mines_alumni_count ?? 0}
                            </span>
                            <span
                              title={(row.score_reasons || []).join("; ")}
                              className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full"
                            >
                              {row.outreach_score ?? 0}
                            </span>
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-100 text-violet-700 rounded-full">
                              {roleLabel(row.roles)}
                            </span>
                            <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 bg-white/70">
                            {rolesLoading ? (
                              <div className="rounded-xl border border-blue-100 bg-blue-50/30 px-4 py-5">
                                <div className="animate-pulse space-y-2">
                                  <div className="h-3 bg-blue-100 rounded w-3/4" />
                                  <div className="h-2 bg-blue-50 rounded w-1/2" />
                                </div>
                              </div>
                            ) : roles.length === 0 ? (
                              <div className="rounded-xl border border-gray-100 bg-white px-4 py-5 text-center">
                                <p className="text-xs text-gray-400">No tracked openings found for this company</p>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-blue-100 bg-blue-50/30 overflow-hidden">
                                <div className="px-4 py-2 bg-white/70 border-b border-blue-100/70 text-[10px] text-gray-500 flex flex-wrap gap-2">
                                  <span>{actionLabel(row.recommended_action)}</span>
                                  {row.best_source && <span>{srcLabel(row.best_source)}</span>}
                                  {row.best_last_seen_at && <span>seen {relTime(row.best_last_seen_at)}</span>}
                                  <span>{row.contact_count || 0} contacts · {row.email_count || 0} emails · {row.mines_alumni_count || 0} Mines alumni known</span>
                                </div>
                                {displayedRoles.map((role, index) => (
                                  <div key={index} className="px-4 py-3 border-b border-blue-100/70 last:border-b-0">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-800">{role.title}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          {role.location || "Denver metro"}
                                          {role.salary ? " - " + role.salary : ""}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                          {typeof role.fit_score === "number" && (
                                            <span
                                              title={roleFitTitle(role.fit_score, role.explanation_summary)}
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white"
                                            >
                                              {fitLabel(role.fit_score)}
                                            </span>
                                          )}
                                          {typeof role.pe_track_score === "number" && (
                                            <span
                                              title="PE path score from job wording, not a count of PE staff."
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100"
                                            >
                                              {pePathLabel(role.pe_track_score)}
                                            </span>
                                          )}
                                          {role.source && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-blue-600 border border-blue-100">
                                              {srcLabel(role.source)}
                                            </span>
                                          )}
                                          {role.first_seen && (
                                            <span className="text-[10px] text-gray-400">first {relTime(role.first_seen)}</span>
                                          )}
                                          {role.times_seen && role.times_seen > 1 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">seen {role.times_seen}x</span>
                                          )}
                                          {role.recommended_action && (
                                            <span className="text-[10px] text-gray-500">{actionLabel(role.recommended_action)}</span>
                                          )}
                                        </div>
                                      </div>
                                      {role.url && (
                                        <a
                                          href={role.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                        >
                                          Open
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-gray-400 text-center py-8 col-span-full">No companies match filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
