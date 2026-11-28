import {
  deleteAnalysis,
  getAnalysis,
  isDatabaseConfigured,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

async function guard(context: Context) {
  const { id } = await context.params;

  if (!UUID.test(id)) {
    return {
      response: Response.json({ error: "Invalid id." }, { status: 400 }),
      id: "",
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      response: Response.json(
        { error: "Database is not configured." },
        { status: 503 }
      ),
      id: "",
    };
  }

  return { response: null, id };
}

export async function GET(_request: Request, context: Context) {
  const { response, id } = await guard(context);

  if (response) return response;

  try {
    const row = await getAnalysis(id);

    return row
      ? Response.json(row)
      : Response.json({ error: "Not found." }, { status: 404 });
  } catch (error) {
    console.error("Loading analysis failed:", error);

    return Response.json(
      { error: "Unable to load this analysis." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { response, id } = await guard(context);

  if (response) return response;

  try {
    await deleteAnalysis(id);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Deleting analysis failed:", error);

    return Response.json(
      { error: "Unable to delete this analysis." },
      { status: 500 }
    );
  }
}
