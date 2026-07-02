import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { data, error: readError } = await supabaseAdmin.from("reachout_template").select("*");
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "No template" });

  const tpl = data[0];
  let body = tpl.body_template;
  body = body.replace("Dear Hiring Manager", "Hello Hiring Manager");
  body = body.replace(
    "my resume and card — which links to my work and study",
    "my resume and a link to my work and study at kohler.solokit.app"
  );

  const { error } = await supabaseAdmin
    .from("reachout_template")
    .update({ body_template: body })
    .eq("id", tpl.id);

  if (error) {
    return NextResponse.json({ error: error.message, updated: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, updated: true });
}
