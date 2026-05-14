"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";
import Link from "next/link";

interface QueueRow {
  id: string;
  companyname: string;
  status: string;
  created_at: string;
  subject_final: string | null;
  body_final: string | null;
  contactname?: string;
}

const STATUS_OPTIONS = ["", "draft", "human_approved", "ready_to_print", "printed", "sent", "closed"];

export default function QueuePage() {
  const toast = useToast();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const url = statusFilter
        ? `/api/queue?status=${encodeURIComponent(statusFilter)}`
        : "/api/queue";
      const res = await fetch(url);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRows(d);
      setSelected(new Set());
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => !search || r.companyname.toLowerCase().includes(search.toLowerCase())
  );

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function batchStatus(status: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast("Select at least one row", "error"); return; }
    try {
      const res = await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      toast(`${ids.length} updated to ${status.replace(/_/g, " ")}`);
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  function openPrint(type: "letters" | "envelopes") {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast("Select at least one row", "error"); return; }
    window.open(`/print/${type}?ids=${ids.join(",")}`, "_blank");
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "bg-gray-100 text-gray-700";
      case "human_approved": return "bg-emerald-100 text-emerald-800";
      case "ready_to_print": return "bg-yellow-100 text-yellow-800";
      case "printed": return "bg-blue-100 text-blue-800";
      case "sent": return "bg-green-100 text-green-800";
      case "closed": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Letters Queue</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-0"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => batchStatus("ready_to_print")} className="bg-yellow-500 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-yellow-600">Mark Ready</button>
        <button onClick={() => batchStatus("printed")} className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-600">Mark Printed</button>
        <button onClick={() => batchStatus("sent")} className="bg-green-500 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-green-600">Mark Sent</button>
        <button onClick={() => openPrint("letters")} className="bg-gray-800 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-900">Print Letters</button>
        <button onClick={() => openPrint("envelopes")} className="bg-gray-800 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-900">Print Envelopes</button>
      </div>

      <p className="text-sm text-gray-500 mb-2">
        {selected.size} of {filtered.length} selected
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-2">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Subject</th>
                <th className="py-2 pr-4 hidden md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/company/${encodeURIComponent(r.companyname)}`} className="text-blue-600 hover:underline font-medium">
                      {r.companyname}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(r.status)}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 hidden sm:table-cell text-gray-600 truncate max-w-xs">
                    {r.subject_final || "—"}
                  </td>
                  <td className="py-2 pr-4 hidden md:table-cell text-gray-500 text-xs">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-gray-400 text-center py-8">No drafts found.</p>
          )}
        </div>
      )}
    </div>
  );
}
