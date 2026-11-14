import { SERV_MODEL } from "@/serv/prompt";

export const runtime = "nodejs";

export function GET() {
  const key = process.env.SERV_API_KEY?.trim() ?? "";
  const servConfigured = key.length > 0 && !/^paste|^your[-_]?key|^sk-your/i.test(key);
  return Response.json({
    ok: true,
    servConfigured,
    model: SERV_MODEL,
    demo: !servConfigured,
  });
}
