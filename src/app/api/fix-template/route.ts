import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function POST() {
  const { data } = await supabaseAdmin.from("reachout_template").select("*");
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

  return NextResponse.json({ success: !error, updated: true });
}
