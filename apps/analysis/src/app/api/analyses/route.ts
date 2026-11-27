import type { NextRequest } from "next/server";
import { checkAccess } from "@/lib/access";
import { isDatabaseConfigured, listAnalyses } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = checkAccess(request);

  if (denied) return denied;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { configured: false, error: "Database is not configured." },
      { status: 503 }
    );
  }

  try {
    return Response.json({ configured: true, items: await listAnalyses() });
  } catch (error) {
    console.error("Listing analyses failed:", error);

    return Response.json(
      { configured: true, error: "Unable to load saved analyses." },
      { status: 500 }
    );
  }
}
