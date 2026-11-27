import { timingSafeEqual } from "node:crypto";

/*
 * Checks the x-access-code header against ANALYSIS_ACCESS_CODE.
 * Returns a Response to send back when the check fails, or null when it passes.
 */
export function checkAccess(request: Request): Response | null {
  const expected = process.env.ANALYSIS_ACCESS_CODE;

  if (!expected) {
    return Response.json(
      { error: "ANALYSIS_ACCESS_CODE is not configured." },
      { status: 500 }
    );
  }

  const provided = Buffer.from(request.headers.get("x-access-code") ?? "");
  const wanted = Buffer.from(expected);

  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    return Response.json(
      { error: "Access code is missing or incorrect." },
      { status: 401 }
    );
  }

  return null;
}
