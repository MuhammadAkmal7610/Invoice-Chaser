import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(providerError)}`);
  }

  const code = searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    if (!supabase) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Supabase is not configured.")}`);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Sign-in did not return an authorization code.")}`);
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}
