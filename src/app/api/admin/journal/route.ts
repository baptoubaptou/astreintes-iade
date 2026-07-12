import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  listJournalAudit,
  parseJournalAuditFilters,
} from "@/server/journal-audit";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const filters = parseJournalAuditFilters(searchParams);
  const result = await listJournalAudit(filters);

  return NextResponse.json(result);
}
