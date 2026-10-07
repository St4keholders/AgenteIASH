import { NextResponse } from "next/server";

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "local";

  return NextResponse.json({
    ok: true,
    commit,
  });
}
