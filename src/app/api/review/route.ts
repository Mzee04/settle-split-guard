import { buildAudit, reviewDemo } from "@/serv/review";
import { requestServOpinion } from "@/serv/client";
import { parseReviewRequest } from "@/serv/parseRequest";
import { SERV_BASE_URL, SERV_MODEL } from "@/serv/prompt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The body was not JSON." }, { status: 400 });
  }
  const parsed = parseReviewRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const key = process.env.SERV_API_KEY?.trim() ?? "";
  const live = key.length > 0 && !parsed.forceDemo;
  if (!live) {
    return Response.json({ audit: reviewDemo(parsed.input) });
  }

  const requestedAt = new Date().toISOString();
  try {
    const { buildServPacket } = await import("@/serv/packet");
    const { runPolicy } = await import("@/domain/policy");
    const policy = runPolicy(parsed.input);
    const { packet } = buildServPacket(parsed.input, policy.findings);
    const result = await requestServOpinion(packet, key);
    const completedAt = new Date().toISOString();
    const audit = buildAudit(parsed.input, result.opinion, {
      mode: "live",
      model: result.model || SERV_MODEL,
      requestedAt,
      completedAt,
      responseId: result.responseId,
      usage: result.usage,
      shadowAgent: true,
      promptGuard: true,
      baseURL: SERV_BASE_URL,
    });
    return Response.json({ audit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SERV request failed.";
    return Response.json(
      { error: `SERV Reasoning did not return a verdict. ${message} You can run the review again in demo mode.` },
      { status: 502 },
    );
  }
}
