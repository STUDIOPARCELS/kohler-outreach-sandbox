"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";

interface Template {
  subject_template: string;
  body_template: string;
}

interface FinalLetter {
  companyname: string;
  subject_final: string;
  body_final: string;
}

export default function TemplatePage() {
  const toast = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [previews, setPreviews] = useState<FinalLetter[]>([]);
  const [previewOpen, setPreviewOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [tRes, pRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/queue"),
      ]);
      const tData = await tRes.json();
      const pData = await pRes.json();

      if (tData.error) throw new Error(tData.error);
      setTemplate(tData);
      setSubject(tData.subject_template || "");
      setBody(tData.body_template || "");

      if (Array.isArray(pData)) {
        setPreviews(
          pData
            .filter((r: FinalLetter) => r.subject_final || r.body_final)
            .slice(0, 5)
        );
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_template: subject, body_template: body }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      toast("Template saved");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (!template) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Outreach Template</h1>

      <section className="bg-white rounded-lg border p-4 mb-6">
        <div className="grid gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Subject Template</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Body Template</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Template"}
        </button>
      </section>

      {/* Previews */}
      {previews.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Preview (Rendered Letters)</h2>
          <div className="space-y-2">
            {previews.map((p, i) => (
              <div key={i} className="bg-white rounded-lg border">
                <button
                  onClick={() => setPreviewOpen(previewOpen === i ? null : i)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <span className="font-medium text-sm">{p.companyname}</span>
                  <svg className={`w-4 h-4 transition-transform ${previewOpen === i ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {previewOpen === i && (
                  <div className="px-4 pb-4 border-t">
                    <p className="font-medium text-sm mt-3 mb-2">{p.subject_final}</p>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{p.body_final}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
