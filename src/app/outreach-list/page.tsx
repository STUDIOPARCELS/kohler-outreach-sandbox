"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface Row {
  companyname: string;
  tier: number;
  city: string;
  contactname?: string;
  contact_title?: string;
  email?: string;
  [key: string]: unknown;
}

export default function OutreachListPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [hasEmail, setHasEmail] = useState(false);

  useEffect(() => {
    fetch("/api/outreach-list")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRows(d);
      })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const filtered = rows.filter((r) => {
    if (search && !r.companyname.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (tierFilter && r.tier !== Number(tierFilter)) return false;
    if (hasEmail && (!r.email || r.email.trim() === "")) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Outreach List</h1>

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
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={hasEmail}
            onChange={(e) => setHasEmail(e.target.checked)}
            className="rounded"
          />
          Has contact email
        </label>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {filtered.length} companies
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4 hidden sm:table-cell">City</th>
                <th className="py-2 pr-4 hidden md:table-cell">Best Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.companyname} className="border-b hover:bg-gray-100">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/company/${encodeURIComponent(r.companyname)}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {r.companyname}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      r.tier === 1 ? "bg-green-100 text-green-800" :
                      r.tier === 2 ? "bg-blue-100 text-blue-800" :
                      r.tier === 3 ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {r.tier}
                    </span>
                  </td>
                  <td className="py-2 pr-4 hidden sm:table-cell text-gray-600">
                    {r.city}
                  </td>
                  <td className="py-2 pr-4 hidden md:table-cell text-gray-600">
                    {r.contactname ? (
                      <>
                        <span className="font-medium">{r.contactname}</span>
                        {r.contact_title && (
                          <span className="text-gray-400"> — {r.contact_title}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-gray-400 text-center py-8">No companies match filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
