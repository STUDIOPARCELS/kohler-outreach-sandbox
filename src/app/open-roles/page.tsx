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
};

function srcLabel(s: string) { return SRC_LABELS[s] || s; }

function tierClass(tier: number) {
  if (tier === 1) return "bg-green-100 text-green-800";
  if (tier === 2) return "bg-blue-100 text-blue-800";
  if (tier === 3) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-800";
}

function relTime(iso: string | undefined) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  return d + "d ago";
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
    if (expanded === companyname) { setExpanded(null); return; }
    setExpanded(companyname);
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Open Roles</h1>

      {/* Header copy */}
      {!loading && (
        <div className="mb-5">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{stats.totalRoles}</span> active relevant roles across{" "}
            <span className="font-semibold">{filtered.length}</span> companies
          </p>
          <p className="text-sm text-gray-500">
            {stats.newRoles24h} new in 24h{" · "}{stats.updatedExisting24h} refreshed in 24h{" · "}Source: {sourceFilter === "all" ? "All" : srcLabel(sourceFilter)}
          </p>
          <p className="text-xs text-gray-400 mt-1 italic">
            These are deduped active tracked openings accumulated over time, not jobs posted today.
          </p>
          {Object.keys(stats.bySource).length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {"Source mix: " + Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).map(([s, c]) => srcLabel(s) + " " + c).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-3xl font-bold text-gray-900">{stats.totalRoles}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Relevant Roles</p>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-3xl font-bold text-gray-700">{stats.companies}</p>
          <p className="text-xs text-gray-500 mt-0.5">Companies</p>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-3xl font-bold text-blue-600">{stats.newRoles24h}</p>
          <p className="text-xs text-gray-500 mt-0.5">New in 24h</p>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-3xl font-bold text-amber-600">{stats.updatedExisting24h}</p>
          <p className="text-xs text-gray-500 mt-0.5">Updated in 24h</p>
        </div>
      </div>

      {/* Source pills */}
      {Object.keys(stats.bySource).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).map(([src, cnt]) => (
            <span key={src} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
              {srcLabel(src)} <span className="font-semibold">{cnt}</span>
            </span>
          ))}
        </div>
      )}

      {/* Time context */}
      <div className="flex gap-4 text-xs text-gray-400 mb-4">
        <span>7d: <span className="text-gray-600 font-medium">{stats.newRoles7d} new</span></span>
        <span>30d: <span className="text-gray-600 font-medium">{stats.newRoles30d} new</span></span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-0"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All Sources</option>
          <option value="ziprecruiter_email">ZipRecruiter</option>
          <option value="governmentjobs_email">GovernmentJobs</option>
          <option value="dice.com">Dice</option>
          <option value="usajobs">USAJobs</option>
        </select>
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
          <option value="5">Tier 5</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-3">{filtered.length} companies with open roles</p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.companyname} className="bg-white rounded-lg border">
              <button
                onClick={() => loadRoles(r.companyname)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + tierClass(r.tier)}>
                    {r.tier}
                  </span>
                  <span className="font-medium text-sm">{r.companyname}</span>
                  {r.niche && <span className="text-xs text-gray-400 hidden sm:inline">{r.niche}</span>}
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {r.roles} {r.roles !== 1 ? "roles" : "role"}
                </span>
              </button>
              {expanded === r.companyname && (
                <div className="border-t px-4 pb-4">
                  {rolesLoading ? (
                    <p className="text-gray-400 text-sm py-3">Loading roles...</p>
                  ) : roles.length === 0 ? (
                    <p className="text-gray-400 text-sm py-3">No relevant roles found.</p>
                  ) : (
                    <div className="divide-y">
                      {roles.map((role, i) => (
                        <div key={i} className="py-3">
                          <p className="font-medium text-sm">{role.title}</p>
                          <p className="text-xs text-gray-500">
                            {role.location}
                            {role.salary ? " · " + role.salary : ""}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {role.source && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                {srcLabel(role.source)}
                              </span>
                            )}
                            {role.first_seen && (
                              <span className="text-[10px] text-gray-400">
                                {"first " + relTime(role.first_seen)}
                              </span>
                            )}
                            {role.times_seen && role.times_seen > 1 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                                {"seen " + role.times_seen + "x"}
                              </span>
                            )}
                            {role.url && (
                              <a href={role.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-blue-500 hover:underline">
                                View
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
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-400 text-center py-8">No companies match filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
