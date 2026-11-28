import { isDatabaseConfigured, listAnalyses } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
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
