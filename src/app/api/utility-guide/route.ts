import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  COMMUNITIES,
  OWNER_RULES,
  PROVIDER_CREDENTIALS,
  LEAK_ADJUSTMENTS,
  PROVIDER_INTEL,
  LOA_REQUIREMENTS,
  MISC_FEES,
  CADENCE,
  RESOURCES,
  CONSERVICE_CONTACTS,
  POLICIES,
  BUILDER_COMMUNITIES,
  GUIDE_SOURCE_URL,
  GUIDE_SNAPSHOT_DATE,
  stateSummaries,
  communitiesByState,
  providerUsage,
  resolveReference,
  findCommunity,
  communityReference,
  HUBSPOT_FIELD_MAP,
} from "@/lib/utilityGuide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Utility Guide — the "RESIHOME- UTILITY GUIDE" snapshot, queryable for a live
 * bump against HubSpot property / ticket records.
 *
 *   GET /api/utility-guide                        → summary (state rollup + counts + source)
 *   GET /api/utility-guide?view=full             → the full snapshot (all tabs)
 *   GET /api/utility-guide?view=providers        → provider usage index
 *   GET /api/utility-guide?view=fieldmap         → HubSpot property/ticket field mapping
 *   GET /api/utility-guide?community=..&state=.. → reference bundle for one community
 *   GET /api/utility-guide?state=..&owner=..&entityId=..  → resolve reference (the live bump)
 *
 * The guide contains provider portal usernames (never passwords). Keep the
 * route auth-guarded with API_LOOKUP_KEY in production.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const community = searchParams.get("community");
  const state = searchParams.get("state");
  const owner = searchParams.get("owner");
  const entityId = searchParams.get("entityId");

  const source = { url: GUIDE_SOURCE_URL, snapshotDate: GUIDE_SNAPSHOT_DATE };

  // Reference lookup — the join used to bump a live HubSpot record.
  if (community || owner || entityId || (state && view !== "full")) {
    let reference = resolveReference({ community, state, owner, entityId });
    // Fall back to an explicit community match if resolveReference couldn't
    // narrow by state alone.
    if (!reference && community) {
      const c = findCommunity(community, state ?? undefined);
      if (c) reference = communityReference(c);
    }
    if (!reference) {
      return NextResponse.json(
        { error: "not_found", query: { community, state, owner, entityId }, source },
        { status: 404 },
      );
    }
    return NextResponse.json({ source, reference });
  }

  if (view === "full") {
    return NextResponse.json({
      source,
      communities: COMMUNITIES,
      builders: BUILDER_COMMUNITIES,
      ownerRules: OWNER_RULES,
      providerCredentials: PROVIDER_CREDENTIALS,
      leakAdjustments: LEAK_ADJUSTMENTS,
      providerIntel: PROVIDER_INTEL,
      loaRequirements: LOA_REQUIREMENTS,
      miscFees: MISC_FEES,
      cadence: CADENCE,
      resources: RESOURCES,
      conserviceContacts: CONSERVICE_CONTACTS,
      policies: POLICIES,
    });
  }

  if (view === "providers") {
    return NextResponse.json({ source, providers: providerUsage() });
  }

  if (view === "fieldmap") {
    return NextResponse.json({ source, fieldMap: HUBSPOT_FIELD_MAP });
  }

  // Default: summary.
  return NextResponse.json({
    source,
    counts: {
      communities: COMMUNITIES.length,
      builderCommunities: BUILDER_COMMUNITIES.length,
      ownerRules: OWNER_RULES.length,
      providerCredentials: PROVIDER_CREDENTIALS.length,
      leakAdjustments: LEAK_ADJUSTMENTS.length,
      providerIntel: PROVIDER_INTEL.length,
      loaRequirements: LOA_REQUIREMENTS.length,
    },
    states: stateSummaries(),
    byState: communitiesByState(),
  });
}
