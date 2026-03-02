"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

interface RoleRow {
  companyname: string;
  tier: number;
  city?: string;
  job_count: number;
  [key: string]: unknown;
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

export default function OpenRolesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    fetch("/api/open-roles-list")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRows(d);
      })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const loadRoles = useCallback(async (companyname: string) => {
    if (expanded === companyname) { setExpanded(null); return; }
    setExpanded(companyname);
    setRolesLoading(true);
    try {
      const res = await fetch(`/api/relevant-roles?companyname=${encodeURIComponent(companyname)}`);
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
    if (search && !r.companyname.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (tierFilter && r.tier !== Number(tierFilter)) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Open Roles</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    r.tier === 1 ? "bg-green-100 text-green-800" :
                    r.tier === 2 ? "bg-blue-100 text-blue-800" :
                    r.tier === 3 ? "bg-yellow-100 text-yellow-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {r.tier}
                  </span>
                  <span className="font-medium text-sm">{r.companyname}</span>
                  {r.city && <span className="text-xs text-gray-500 hidden sm:inline">{r.city}</span>}
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {r.job_count} role{r.job_count !== 1 ? "s" : ""}
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
                            {role.location} &middot; {role.work_type}
                            {role.salary && ` &middot; ${role.salary}`}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Posted {role.date_posted}
                            {role.url && (
                              <>
                                {" "}&middot;{" "}
                                <a href={role.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                  View
                                </a>
                              </>
                            )}
                          </p>
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
