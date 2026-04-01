import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: require IMPORT_SECRET header
  const secret = process.env.IMPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "IMPORT_SECRET not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-import-secret") || "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let jobs: Array<{
    title: string;
    company: string;
    location?: string;
    url?: string;
    salary?: string;
    work_type?: string;
  }>;

  try {
    jobs = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
  }

  // Deduplicate: skip jobs where same title+company already exists
  const existing = await supabaseAdmin
    .from("jobs")
    .select("title, company_name")
    .in("company_name", jobs.map((j) => j.company));

  const existingSet = new Set(
    (existing.data || []).map((e) => `${e.title}|||${e.company_name}`.toLowerCase())
  );

  const newJobs = jobs.filter(
    (j) => !existingSet.has(`${j.title}|||${j.company}`.toLowerCase())
  );

  if (newJobs.length === 0) {
    return NextResponse.json({ success: true, imported: 0, skipped: jobs.length, message: "All jobs already exist" });
  }

  const { error } = await supabaseAdmin
    .from("jobs")
    .insert(
      newJobs.map((j) => ({
        title: j.title,
        company_name: j.company,
        location: j.location || "Denver metro area (80226)",
        url: j.url || null,
        salary: j.salary || null,
        work_type: j.work_type || null,
        source: "ZipRecruiter",
        imported_at: new Date().toISOString(),
        status: "new",
        date_posted: new Date().toISOString().split("T")[0],
      }))
    );

  if (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    imported: newJobs.length,
    skipped: jobs.length - newJobs.length,
  });
}
