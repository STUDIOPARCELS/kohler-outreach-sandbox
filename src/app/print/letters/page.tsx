"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Letter {
  companyname: string;
  subject_final: string | null;
  body_final: string | null;
}

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  portfolio_url: string;
}

function PrintLettersContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];
  const [letters, setLetters] = useState<Letter[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [qRes, pRes] = await Promise.all([
        fetch(`/api/queue?ids=${ids.join(",")}`),
        fetch("/api/candidate-profile"),
      ]);
      const qData = await qRes.json();
      const pData = await pRes.json();

      if (Array.isArray(qData)) {
        setLetters(qData.filter((r: Letter) => r.subject_final || r.body_final));
      }
      if (pData && !pData.error) {
        setProfile(pData);
      }
    } catch {
      // Silently handle - print page should still render what it can
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="p-8 text-gray-500">Loading letters...</p>;
  if (letters.length === 0) return <p className="p-8 text-red-500">No letters found for the selected IDs.</p>;

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
      {letters.map((letter, i) => (
        <div
          key={i}
          className="letter-page"
          style={{
            pageBreakAfter: i < letters.length - 1 ? "always" : "auto",
            padding: "1in",
            minHeight: "10in",
            position: "relative",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "12pt",
            lineHeight: "1.6",
          }}
        >
          {/* Subject */}
          {letter.subject_final && (
            <h2 style={{ fontSize: "14pt", fontWeight: "bold", marginBottom: "24pt" }}>
              {letter.subject_final}
            </h2>
          )}

          {/* Body with preserved line breaks */}
          <div style={{ whiteSpace: "pre-wrap" }}>{letter.body_final}</div>

          {/* Footer */}
          <div
            style={{
              position: "absolute",
              bottom: "1in",
              left: "1in",
              right: "1in",
              borderTop: "1px solid #ccc",
              paddingTop: "12pt",
              fontSize: "9pt",
              color: "#555",
            }}
          >
            {profile && (
              <div style={{ marginBottom: "6pt" }}>
                {profile.full_name} &middot; {profile.phone} &middot; {profile.email}
              </div>
            )}
            <div>
              Packet includes: Letter + R&eacute;sum&eacute; + Solo Card
              {profile?.portfolio_url && ` (QR \u2192 ${profile.portfolio_url})`}
            </div>
          </div>
        </div>
      ))}

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
