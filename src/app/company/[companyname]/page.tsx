"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface Company {
  companyname: string;
  tier: number;
  city: string;
  notes: string;
  company_key: string;
  culture_hook: string | null;
  company_about: string | null;
  careers_url: string | null;
  mailing_address1: string | null;
  mailing_address2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
}

interface Contact {
  contactname: string;
  title: string;
  email: string;
  linkedin: string;
  phone: string;
}

interface Draft {
  id: string;
  companyname: string;
  custom_paragraph: string;
  status: string;
  contactname?: string;
  contact_title?: string;
  contact_email?: string;
  subject_final?: string;
  body_final?: string;
}

const STATUS_OPTIONS = ["draft", "human_approved", "ready_to_print", "printed", "sent", "closed"];

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const companyname = decodeURIComponent(params.companyname as string);

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<number>(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable company fields
  const [notes, setNotes] = useState("");
  const [cultureHook, setCultureHook] = useState("");
  const [companyAbout, setCompanyAbout] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [mailCity, setMailCity] = useState("");
  const [mailState, setMailState] = useState("");
  const [mailZip, setMailZip] = useState("");

  // Draft fields
  const [customParagraph, setCustomParagraph] = useState("");
  const [draftStatus, setDraftStatus] = useState("draft");

  const loadData = useCallback(async () => {
    try {
      const [compRes, contRes, draftRes] = await Promise.all([
        fetch(`/api/company?companyname=${encodeURIComponent(companyname)}`),
        fetch(`/api/contacts?companyname=${encodeURIComponent(companyname)}`),
        fetch(`/api/draft?companyname=${encodeURIComponent(companyname)}`),
      ]);
      const compData = await compRes.json();
      const contData = await contRes.json();
      const draftData = await draftRes.json();

      if (compData.error) throw new Error(compData.error);
      setCompany(compData);
      setNotes(compData.notes || "");
      setCultureHook(compData.culture_hook || "");
      setCompanyAbout(compData.company_about || "");
      setCareersUrl(compData.careers_url || "");
      setAddr1(compData.mailing_address1 || "");
      setAddr2(compData.mailing_address2 || "");
      setMailCity(compData.mailing_city || "");
      setMailState(compData.mailing_state || "");
      setMailZip(compData.mailing_zip || "");

      if (Array.isArray(contData)) setContacts(contData);

      if (draftData && draftData.id) {
        setDraft(draftData);
        setCustomParagraph(draftData.custom_paragraph || "");
        setDraftStatus(draftData.status || "draft");
      } else {
        setDraft(null);
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [companyname, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveCompany() {
    setSaving(true);
    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname,
          notes,
          culture_hook: cultureHook,
          company_about: companyAbout,
          careers_url: careersUrl,
          mailing_address1: addr1,
          mailing_address2: addr2,
          mailing_city: mailCity,
          mailing_state: mailState,
          mailing_zip: mailZip,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      toast("Company saved");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function createDraft() {
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyname, custom_paragraph: "", status: "draft" }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setDraft(d);
      setCustomParagraph(d.custom_paragraph || "");
      setDraftStatus(d.status || "draft");
      toast("Draft created");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname,
          custom_paragraph: customParagraph,
          status: draftStatus,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setDraft(d);
      toast("Draft saved");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function applyContact() {
    const c = contacts[selectedContact];
    if (!c) return;
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname,
          contactname: c.contactname,
          contacttitle: c.title,
          contactemail: c.email,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setDraft(d);
      toast(`Applied contact: ${c.contactname}`);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!company) return <p className="text-red-500">Company not found.</p>;

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mb-4 block">
        &larr; Back
      </button>

      <h1 className="text-2xl font-bold mb-1">{company.companyname}</h1>
      <div className="flex gap-2 mb-6 text-sm text-gray-500">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
          company.tier === 1 ? "bg-green-100 text-green-800" :
          company.tier === 2 ? "bg-blue-100 text-blue-800" :
          company.tier === 3 ? "bg-yellow-100 text-yellow-800" :
          "bg-gray-100 text-gray-800"
        }`}>
          Tier {company.tier}
        </span>
        <span>{company.city}</span>
      </div>

      {/* Company Fields */}
      <section className="bg-white rounded-lg border p-4 mb-6">
        <h2 className="font-semibold mb-3">Company Details</h2>
        <div className="grid gap-3">
          <Field label="Notes" value={notes} onChange={setNotes} multiline />
          <Field label="Culture Hook" value={cultureHook} onChange={setCultureHook} multiline />
          <Field label="Company About" value={companyAbout} onChange={setCompanyAbout} multiline />
          <Field label="Careers URL" value={careersUrl} onChange={setCareersUrl} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mailing Address 1" value={addr1} onChange={setAddr1} />
            <Field label="Mailing Address 2" value={addr2} onChange={setAddr2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={mailCity} onChange={setMailCity} />
            <Field label="State" value={mailState} onChange={setMailState} />
            <Field label="ZIP" value={mailZip} onChange={setMailZip} />
          </div>
        </div>
        <button
          onClick={saveCompany}
          disabled={saving}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Company"}
        </button>
      </section>

      {/* Contacts */}
      <section className="bg-white rounded-lg border p-4 mb-6">
        <h2 className="font-semibold mb-3">Contacts</h2>
        {contacts.length === 0 ? (
          <p className="text-gray-400 text-sm">No contacts found for this company.</p>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-sm">
              <p className="font-medium text-blue-800">Best Contact: {contacts[0].contactname}</p>
              <p className="text-blue-700">{contacts[0].title}</p>
              {contacts[0].email && <p className="text-blue-700">{contacts[0].email}</p>}
            </div>
            {contacts.length > 1 && (
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs text-gray-500 mb-1">Select contact</label>
                  <select
                    value={selectedContact}
                    onChange={(e) => setSelectedContact(Number(e.target.value))}
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                  >
                    {contacts.map((c, i) => (
                      <option key={i} value={i}>
                        {c.contactname} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                {draft && (
                  <button
                    onClick={applyContact}
                    disabled={saving}
                    className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap"
                  >
                    Apply Contact to Draft
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Letter Preview */}
      {draft && (draft.subject_final || draft.body_final) && (
        <section className="mb-6">
          <h2 className="font-semibold mb-3">Letter</h2>
          <div
            className="bg-white border rounded-lg shadow-sm"
            style={{
              padding: "48px 56px",
              fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
              fontSize: "13pt",
              lineHeight: "1.7",
              maxWidth: "8.5in",
            }}
          >
            {draft.contact_title && draft.contactname && (
              <div className="mb-6 text-sm" style={{ fontFamily: "inherit" }}>
                <div>{draft.contactname}</div>
                <div>{draft.contact_title}</div>
                <div>{company.companyname}</div>
              </div>
            )}
            {draft.subject_final && (
              <h3 style={{ fontSize: "14pt", fontWeight: "bold", marginBottom: "20px" }}>
                {draft.subject_final}
              </h3>
            )}
            {draft.body_final && (
              <div style={{ whiteSpace: "pre-wrap" }}>{draft.body_final}</div>
            )}
          </div>
        </section>
      )}

      {/* Draft Controls */}
      <section className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold mb-3">Draft Settings</h2>
        {!draft ? (
          <button
            onClick={createDraft}
            disabled={saving}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Create Draft
          </button>
        ) : (
          <div className="grid gap-3">
            {draft.contactname && (
              <p className="text-sm text-gray-600">
                Contact: <strong>{draft.contactname}</strong>
                {draft.contact_title && ` — ${draft.contact_title}`}
                {draft.contact_email && ` (${draft.contact_email})`}
              </p>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Custom Paragraph</label>
              <textarea
                value={customParagraph}
                onChange={(e) => setCustomParagraph(e.target.value)}
                rows={6}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={saveDraft}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 w-fit"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const cls = "w-full border rounded-lg px-3 py-2 text-sm";
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}
