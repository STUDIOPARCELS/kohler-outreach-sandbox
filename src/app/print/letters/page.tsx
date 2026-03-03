"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface LetterRow {
  companyname: string;
  contactname?: string;
  contact_title?: string;
  custom_paragraph?: string;
  body_final?: string;
}

interface Template {
  subject_template: string;
  body_template: string;
}

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  portfolio_url: string;
}

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
    .replace(/\{\{TODAY_DATE\}\}/g, today)
    .replace(/\{\{COMPANY_ADDRESS\}\}/g, companyAddress || "");

  if (contactName) {
    const firstName = contactName.split(" ")[0];
    const titleLine = contactTitle ? `${contactTitle}\n` : "";
    body = body.replace("Hiring Manager\n", `${contactName}\n${titleLine}`);
    body = body.replace("Dear Hiring Manager", `Dear ${firstName}`);
  }

  // Standardize wording
  body = body.replace(/this passion/g, "my passion");
  body = body.replace(
    "Should you be considering an entry-level BSME/EIT, I would love the opportunity to interview.",
    "If you are open to an entry-level BSME/EIT with my skill set, I would love the opportunity to interview with your team."
  );

  // Remove duplicate paragraphs
  const paras = body.split(/\n\n+/);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of paras) {
    const key = p.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      deduped.push(p);
    }
  }
  body = deduped.join("\n\n");

  body = body.replace(/\n{3,}/g, "\n\n");

  return body;
}

function PrintLettersContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [qRes, tplRes, pRes] = await Promise.all([
        fetch(`/api/queue?ids=${ids.join(",")}`),
        fetch("/api/template"),
        fetch("/api/candidate-profile"),
      ]);
      const qData = await qRes.json();
      const tplData = await tplRes.json();
      const pData = await pRes.json();

      if (Array.isArray(qData)) setLetters(qData);
      if (tplData && !tplData.error) setTemplate(tplData);
      if (pData && !pData.error) setProfile(pData);
    } catch {
      // Silently handle - print page should still render what it can
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="p-8 text-gray-500">Loading letters...</p>;
  if (letters.length === 0 || !template) return <p className="p-8 text-red-500">No letters found for the selected IDs.</p>;

  return (
    <>
      {/* Print controls */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b shadow-sm p-4 flex items-center gap-4 z-50">
        <button
          onClick={() => window.print()}
          className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-black"
        >
          Print Letters ({letters.length})
        </button>
        <button
          onClick={() => window.close()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>

      <div className="no-print h-16" />

      {/* Letters */}
      {letters.map((letter, i) => {
        const rawBody = letter.body_final
          ? letter.body_final
          : assembleLetter(
              template,
              letter.companyname,
              letter.custom_paragraph || "",
              letter.contactname,
              letter.contact_title
            );
        // Deduplicate paragraphs in case body_final has dupes
        const paras2 = rawBody.split(/\n\n+/);
        const seen2 = new Set<string>();
        const deduped2: string[] = [];
        for (const p of paras2) {
          const key = p.trim().toLowerCase().replace(/\s+/g, " ");
          if (!key || !seen2.has(key)) {
            if (key) seen2.add(key);
            deduped2.push(p);
          }
        }
        const body = deduped2.join("\n\n");

        return (
          <div
            key={i}
            className="letter-page"
            style={{
              pageBreakAfter: i < letters.length - 1 ? "always" : "auto",
              padding: "0.75in 1in",
              minHeight: "9.5in",
              maxHeight: "10in",
              position: "relative",
              fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
              fontSize: "11pt",
              lineHeight: "1.5",
              overflow: "hidden",
            }}
          >
            {/* Body with preserved line breaks */}
            <div style={{ whiteSpace: "pre-wrap" }}>{body}</div>
          </div>
        );
      })}

      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          body { margin: 0; padding: 0; }
        }
      `}</style>
    </>
  );
}

export default function PrintLettersPage() {
  return (
    <Suspense fallback={<p className="p-8 text-gray-500">Loading...</p>}>
      <PrintLettersContent />
    </Suspense>
  );
}
