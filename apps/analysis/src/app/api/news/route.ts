import { isDatabaseConfigured, lastNewsRun, listNews } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { configured: false, error: "The database is not configured.", items: [], lastRun: null },
      { status: 503 }
    );
  }

  try {
    const [items, lastRun] = await Promise.all([listNews(), lastNewsRun()]);

    return Response.json({ configured: true, items, lastRun });
  } catch (error) {
    console.error("Loading news failed:", error);

    return Response.json(
      {
        configured: true,
        error: "Could not load news. Run the news SQL (migration 0003) in Supabase.",
        items: [],
        lastRun: null,
      },
      { status: 500 }
    );
  }
}
