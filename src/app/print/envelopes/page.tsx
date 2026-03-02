"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface EnvelopeData {
  companyname: string;
  contactname?: string;
  mailing_address1?: string;
  mailing_address2?: string;
  mailing_city?: string;
  mailing_state?: string;
  mailing_zip?: string;
  city?: string;
}

function PrintEnvelopesContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];
  const [envelopes, setEnvelopes] = useState<EnvelopeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    try {
      const qRes = await fetch(`/api/queue?ids=${ids.join(",")}`);
      const qData = await qRes.json();

      if (!Array.isArray(qData)) { setLoading(false); return; }

      const enriched: EnvelopeData[] = await Promise.all(
        qData.map(async (row: Record<string, string>) => {
          const cRes = await fetch(`/api/company?companyname=${encodeURIComponent(row.companyname)}`);
          const cData = await cRes.json();
          return {
            companyname: row.companyname,
            contactname: row.contactname || undefined,
            mailing_address1: cData.mailing_address1 || undefined,
            mailing_address2: cData.mailing_address2 || undefined,
            mailing_city: cData.mailing_city || undefined,
            mailing_state: cData.mailing_state || undefined,
            mailing_zip: cData.mailing_zip || undefined,
            city: cData.city || undefined,
          };
        })
      );
      setEnvelopes(enriched);
    } catch {
      // Render what we can
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="p-8 text-gray-500">Loading envelopes...</p>;
  if (envelopes.length === 0) return <p className="p-8 text-red-500">No envelope data found.</p>;

  return (
    <>
      {/* Controls */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b shadow-sm p-4 flex items-center gap-4 z-50">
        <button
          onClick={() => window.print()}
          className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-black"
        >
          Print Envelopes ({envelopes.length})
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showGuide}
            onChange={(e) => setShowGuide(e.target.checked)}
          />
          Show guide box
        </label>
        <button
          onClick={() => window.close()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>

      <div className="no-print h-16" />

      {/* Envelopes */}
      {envelopes.map((env, i) => (
        <div
          key={i}
          className="envelope-page"
          style={{
            pageBreakAfter: i < envelopes.length - 1 ? "always" : "auto",
            width: "9.5in",
            height: "4.125in",
            position: "relative",
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: "12pt",
            border: showGuide ? "1px dashed #ccc" : "none",
            marginBottom: "0.5in",
            boxSizing: "border-box",
          }}
        >
          {showGuide && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: "2px dashed #f87171",
                pointerEvents: "none",
              }}
            >
              <span style={{ position: "absolute", top: 2, left: 4, fontSize: "8pt", color: "#f87171" }}>
                #10 Envelope: 9.5&quot; x 4.125&quot;
              </span>
            </div>
          )}

          {/* Return address - top left */}
          <div
            style={{
              position: "absolute",
              top: "0.375in",
              left: "0.375in",
              fontSize: "10pt",
              lineHeight: "1.5",
            }}
          >
            <div>Kohler Wood</div>
            <div>6575 West Nevada Place</div>
            <div>Lakewood, CO 80226</div>
          </div>

          {/* Recipient - center area */}
          <div
            style={{
              position: "absolute",
              top: "1.5in",
              left: "3.75in",
              fontSize: "12pt",
              lineHeight: "1.6",
            }}
          >
            {env.contactname && <div>{env.contactname}</div>}
            <div>{env.companyname}</div>
            {env.mailing_address1 ? (
              <>
                <div>{env.mailing_address1}</div>
                {env.mailing_address2 && <div>{env.mailing_address2}</div>}
                {(env.mailing_city || env.mailing_state || env.mailing_zip) && (
                  <div>
                    {[env.mailing_city, env.mailing_state].filter(Boolean).join(", ")}
                    {env.mailing_zip ? ` ${env.mailing_zip}` : ""}
                  </div>
                )}
              </>
            ) : (
              env.city && <div>{env.city}</div>
            )}
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          @page { size: 9.5in 4.125in; margin: 0; }
          body { margin: 0; padding: 0; }
          .envelope-page { border: none !important; margin: 0 !important; }
        }
      `}</style>
    </>
  );
}

export default function PrintEnvelopesPage() {
  return (
    <Suspense fallback={<p className="p-8 text-gray-500">Loading...</p>}>
      <PrintEnvelopesContent />
    </Suspense>
  );
}
