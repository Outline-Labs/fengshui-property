import { getClaimsForExport } from "@/lib/agents";
import { csvCell } from "@/lib/csv";
import { getAgentId } from "@/lib/session";

export async function GET() {
  const agentId = await getAgentId();
  if (!agentId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await getClaimsForExport(agentId);
  const header = [
    "Name",
    "Phone",
    "Email",
    "Property Interest",
    "Timeline",
    "Readings",
    "Best Score",
    "Claimed Date",
    "Source",
  ];
  const lines = [
    header,
    ...rows.map((r) => [
      r.name,
      r.phone,
      r.email,
      r.propertyInterest,
      r.timeline,
      r.readings,
      r.bestScore,
      r.claimedDate,
      "Fengshui AI",
    ]),
  ];
  // BOM so Excel reads UTF-8 (names/Chinese) correctly; CRLF line endings.
  const bom = String.fromCharCode(0xfeff);
  const csv =
    bom + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fengshuiai-leads-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
