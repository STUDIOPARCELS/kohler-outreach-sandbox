import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  try {
    const { imageData } = await req.json();
    if (!imageData) return NextResponse.json({ error: "No image data" }, { status: 400 });

    // Convert base64 to buffer
    const base64 = imageData.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Upload to Supabase storage
    const fileName = "signature.png";
    const { error: uploadError } = await supabaseAdmin.storage
      .from("outreach-assets")
      .upload(fileName, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const url = `https://acwgirrldntjpzrhqmdh.supabase.co/storage/v1/object/public/outreach-assets/${fileName}`;

    // Upsert into candidate_assets
    const { data: existing } = await supabaseAdmin
      .from("candidate_assets")
      .select("id")
      .eq("profile_id", 1)
      .eq("asset_type", "signature")
      .single();

    if (existing) {
      await supabaseAdmin
        .from("candidate_assets")
        .update({ url, title: "Signature" })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("candidate_assets")
        .insert({ profile_id: 1, asset_type: "signature", title: "Signature", url, sort_order: 3 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
