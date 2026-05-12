"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

interface RoleRow {
  companyname: string;
  tier: number;
  city?: string;
  niche?: string;
  roles: number;
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
}

const SRC_LABELS: Record<string, string> = {
  ziprecruiter_email: "ZipRecruiter",
  governmentjobs_email: "GovernmentJobs",
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

export default function OpenRolesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalRoles: 0, companies: 0, newRoles24h: 0, updatedExisting24h: 0,
    newRoles7d: 0, newRoles30d: 0, newZR24h: 0, newGov24h: 0, bySource: {},
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const fetchData = useCallback((source: string) => {
    setLoading(true);
    const qs = source !== "all" ? "?source=" + encodeURIComponent(source) : "";
    fetch("/api/open-roles-list" + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (d.stats) setStats(d.stats);
        setRows(d.companies || d);
      })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { fetchData(sourceFilter); }, [fetchData, sourceFilter]);

  const loadRoles = useCallback(async (companyname: string) => {
    if (expanded === companyname) {
      setExpanded(null);
      return;
    }
    setExpanded(companyname);
    setRoles([]);
    setRolesLoading(true);
    try {
      const res = await fetch("/api/relevant-roles?companyname=" + encodeURIComponent(companyname));
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRoles(d);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setRolesLoading(false);
    }
  }, [expanded, toast]);

  const filtered = rows.filter((r) => {
    if (search && !r.companyname.toLowerCase().includes(search.toLowerCase())) return false;
    if (tierFilter && r.tier !== Number(tierFilter)) return false;
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

  let globalIdx = 0;

  return (
    <div>
      <div className="mb-5 rounded-2xl overflow-hidden shadow-xl border border-slate-700/20 bg-slate-900">
        <div className="px-5 py-4 sm:px-6 bg-slate-900 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Open Roles</h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">Entry-level BSME / EIT target queue</p>
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mb-5">
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400 outline-none"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="all">All Sources</option>
          <option value="ziprecruiter_email">ZipRecruiter</option>
          <option value="governmentjobs_email">GovernmentJobs</option>
          <option value="dice.com">Dice</option>
          <option value="usajobs">USAJobs</option>
          <option value="greenhouse_careers">Greenhouse</option>
          <option value="lever_careers">Lever</option>
          <option value="ashby_careers">Ashby</option>
          <option value="smartrecruiters_careers">SmartRecruiters</option>
          <option value="workable_careers">Workable</option>
          <option value="workday_careers">Workday</option>
          <option value="icims_careers">iCIMS</option>
          <option value="career_pages">Careers Page</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="">All Tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
          <option value="4">Tier 4</option>
          <option value="5">Tier 5</option>
        </select>
      </div>

      {Object.keys(stats.bySource).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
            <span key={src} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
              {srcLabel(src)} <span className="font-semibold">{count}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {orderedNiches.map((niche) => {
            const items = grouped.get(niche) || [];
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
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
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
                                {roles.map((role, index) => (
                                  <div key={index} className="px-4 py-3 border-b border-blue-100/70 last:border-b-0">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-800">{role.title}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          {role.location || "Denver metro"}
                                          {role.salary ? " - " + role.salary : ""}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
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
