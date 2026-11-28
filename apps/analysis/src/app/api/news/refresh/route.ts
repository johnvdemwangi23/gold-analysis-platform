import { refreshNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const result = await refreshNews();

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
