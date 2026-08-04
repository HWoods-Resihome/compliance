/**
 * Utility Guide — typed model of the "RESIHOME- UTILITY GUIDE" Google Sheet,
 * prepared so utilities/compliance operations can be *referenced live against
 * HubSpot*.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHAT THIS IS
 * ─────────────────────────────────────────────────────────────────────────
 * The source Google Sheet is the operational "utility bible": which provider
 * serves each community, who pays each utility (resident vs. Conservice vs.
 * Resihome-billed), how leak adjustments work per provider, which providers
 * require a Letter of Authorization, provider logins, the weekly processing
 * cadence, and standing billing policies.
 *
 * That reference data changes slowly (providers, rules) and is not itself in a
 * warehouse, so it is captured here as a typed, point-in-time **snapshot**
 * (see `src/lib/utilityGuideData.ts`) with the source URL and a documented
 * refresh path. HubSpot holds the *live* side — the Property records and the
 * Utilities / Compliance-Issues ticket pipelines. The value is the **join**:
 * given a property's state / community / owner / address, surface the matching
 * guide entry so a ticket can be worked with the right provider, payer, and
 * process in front of you. See `HUBSPOT_FIELD_MAP` for the field-level bridge.
 *
 * Source: https://docs.google.com/spreadsheets/d/1nRXUX0_FdkZkVnZdvjYJF890gofryQ6U3b5ZMy9lJ70/edit
 *
 * SECURITY: the Sheet stores provider portal passwords. Those are deliberately
 * NOT captured in this repo (mirrors `associations.ts`, which never projects
 * WEBSITE_PASSWORD). Credentials here carry the provider, website, and username
 * plus a `hasPassword` flag — the secret itself stays in the Sheet / a vault.
 */

import {
  COMMUNITIES,
  BUILDER_COMMUNITIES,
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
  UTILITY_TYPES,
  GUIDE_SOURCE_URL,
  GUIDE_SNAPSHOT_DATE,
} from "./utilityGuideData";

// ── Types ──────────────────────────────────────────────────────────────────

export type UtilityType = "ELECTRIC" | "GAS" | "WATER" | "SEWER" | "TRASH";

/** Who is responsible for paying a given utility. */
export type Payer =
  | "Resident"
  | "Conservice"
  | "Resihome Billed"
  | "Owner"
  | "N/A"
  | "Unknown";

/** Provider names for the five utilities at a community (null = none/unknown). */
export type ProviderSet = {
  electric: string | null;
  water: string | null;
  sewer: string | null;
  gas: string | null;
  trash: string | null;
};

/**
 * Who-pays summary for a community. Captured from the Sheet's responsibility
 * columns; sewer typically follows water. The authoritative vacant/occupied
 * rule lives on the owner/fund (`OwnerRule`) — this is the community-level hint.
 */
export type BillingResponsibility = {
  electric: Payer;
  water: Payer;
  gas: Payer;
  trash: Payer;
};

/** One community from the State → Community utility matrix (the core tab). */
export type Community = {
  state: string; // 2-letter
  name: string;
  owner: string | null; // client/fund, when known
  providers: ProviderSet;
  billing: BillingResponsibility;
  cost: string | null;
  notes: string | null;
};

/** A community on a builder-specific roster (DreamFinders / McKinley / Rocklyn). */
export type BuilderCommunity = {
  builder: string;
  entityName: string | null;
  community: string | null;
  state: string | null;
  providers: ProviderSet;
  residentResponsible: string | null;
  ownerResponsible: string | null;
  notes: string | null;
};

/**
 * Utility responsibility rules for an owner/client/fund. This is the
 * authoritative "who handles what" — keyed by the HubSpot property's owner and
 * (crucially) by the **Entity ID prefix** that ResiHome uses to identify the
 * owning fund.
 */
export type OwnerRule = {
  client: string;
  entityPrefixes: string[]; // e.g. ["RP"], ["RB"], ["AH"], ["HO"], ["RH"], ["NS"], ["ROI"]
  vacantUtilities: string | null;
  occupiedUtilities: string | null;
  notes: string | null;
  rules: string[]; // free-text exceptions / standing rules
};

/** Provider portal access. Password intentionally not stored — `hasPassword` only. */
export type ProviderCredential = {
  provider: string;
  website: string | null;
  username: string | null;
  hasPassword: boolean;
  notes: string | null;
};

/** Provider leak-adjustment policy (per state + provider). */
export type LeakAdjustment = {
  state: string;
  provider: string;
  utilityType: string;
  process: string | null;
  frequency: string | null; // how often an adjustment is allowed
  notes: string | null;
};

/** A logged provider fact ("What We Should Know"). */
export type ProviderIntel = {
  city: string | null;
  state: string | null;
  provider: string;
  dateReceived: string | null;
  utility: string | null;
  whatToKnow: string;
};

/** Provider that requires a Letter of Authorization / account identifier. */
export type LoaRequirement = {
  provider: string;
  required: string; // e.g. "Letter of Authorization", "Security Questions"
  responseReceived: string | null;
  requiredAnswer: string | null;
};

export type MiscFee = { service: string; cost: string };

export type CadenceTask = {
  team: "Utilities" | "PM";
  task: string;
  days: string[]; // subset of Mon..Fri
};

export type ResourceLink = { label: string; url: string | null; note: string | null };
export type ConserviceContact = { purpose: string; value: string };
export type Policy = { topic: string; detail: string };

// ── Snapshot re-exports ─────────────────────────────────────────────────────

export {
  COMMUNITIES,
  BUILDER_COMMUNITIES,
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
  UTILITY_TYPES,
  GUIDE_SOURCE_URL,
  GUIDE_SNAPSHOT_DATE,
};

// ── Region rollup ───────────────────────────────────────────────────────────
//
// The Sheet has no "region" column; region is derived from state. It is offered
// as an optional rollup above state (see the recommendation), not as the
// primary drill level.

const REGION_BY_STATE: Record<string, string> = {
  AL: "Southeast",
  FL: "Southeast",
  GA: "Southeast",
  NC: "Southeast",
  SC: "Southeast",
  TN: "Southeast",
  TX: "South Central",
  OK: "South Central",
  IN: "Midwest",
  AZ: "Southwest",
};

export function regionForState(state: string | null | undefined): string {
  if (!state) return "Other";
  return REGION_BY_STATE[state.trim().toUpperCase()] ?? "Other";
}

// ── Accessors ───────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

export type StateGroup = {
  state: string;
  region: string;
  communities: Community[];
};

/** Communities grouped by state (the recommended primary drill-down). */
export function communitiesByState(): StateGroup[] {
  const map = new Map<string, Community[]>();
  for (const c of COMMUNITIES) {
    const key = c.state.trim().toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return [...map.entries()]
    .map(([state, communities]) => ({
      state,
      region: regionForState(state),
      communities: [...communities].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

export type StateSummary = {
  state: string;
  region: string;
  communityCount: number;
  providerCount: number;
};

/** One summary row per state: community + distinct-provider counts. */
export function stateSummaries(): StateSummary[] {
  return communitiesByState().map((g) => {
    const providers = new Set<string>();
    for (const c of g.communities) {
      for (const p of Object.values(c.providers)) {
        if (p) providers.add(p.trim().toLowerCase());
      }
    }
    return {
      state: g.state,
      region: g.region,
      communityCount: g.communities.length,
      providerCount: providers.size,
    };
  });
}

/** Find a community by (fuzzy) name, optionally scoped to a state. */
export function findCommunity(
  name: string,
  state?: string,
): Community | null {
  const n = norm(name);
  const s = state ? state.trim().toUpperCase() : null;
  const matches = COMMUNITIES.filter((c) => {
    const nameHit = norm(c.name) === n || norm(c.name).includes(n) || n.includes(norm(c.name));
    const stateHit = !s || c.state.trim().toUpperCase() === s;
    return nameHit && stateHit;
  });
  return matches[0] ?? null;
}

/** All distinct provider names that appear anywhere in the guide, with usage. */
export type ProviderUsage = {
  provider: string;
  utilities: UtilityType[];
  communities: string[];
  states: string[];
  hasCredential: boolean;
  hasLeakPolicy: boolean;
  hasLoa: boolean;
};

export function providerUsage(): ProviderUsage[] {
  const acc = new Map<string, ProviderUsage>();
  const upsert = (name: string): ProviderUsage => {
    const key = name.trim().toLowerCase();
    if (!acc.has(key)) {
      acc.set(key, {
        provider: name.trim(),
        utilities: [],
        communities: [],
        states: [],
        hasCredential: false,
        hasLeakPolicy: false,
        hasLoa: false,
      });
    }
    return acc.get(key)!;
  };
  const addUnique = <T,>(arr: T[], v: T) => {
    if (!arr.includes(v)) arr.push(v);
  };

  for (const c of COMMUNITIES) {
    const entries: Array<[UtilityType, string | null]> = [
      ["ELECTRIC", c.providers.electric],
      ["WATER", c.providers.water],
      ["SEWER", c.providers.sewer],
      ["GAS", c.providers.gas],
      ["TRASH", c.providers.trash],
    ];
    for (const [u, p] of entries) {
      if (!p || /^n\/?a$|^tbd$|^resident paid$/i.test(p.trim())) continue;
      const rec = upsert(p);
      addUnique(rec.utilities, u);
      addUnique(rec.communities, c.name);
      addUnique(rec.states, c.state.trim().toUpperCase());
    }
  }
  for (const cred of PROVIDER_CREDENTIALS) upsert(cred.provider).hasCredential = true;
  for (const la of LEAK_ADJUSTMENTS) upsert(la.provider).hasLeakPolicy = true;
  for (const loa of LOA_REQUIREMENTS) upsert(loa.provider).hasLoa = true;

  return [...acc.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

/**
 * The full reference bundle for one community — everything an agent needs to
 * work a utilities/compliance ticket for a property in that community.
 */
export type CommunityReference = {
  community: Community;
  region: string;
  ownerRule: OwnerRule | null;
  leakAdjustments: LeakAdjustment[];
  loaRequirements: LoaRequirement[];
  credentials: ProviderCredential[];
  intel: ProviderIntel[];
};

function credentialFor(provider: string | null): ProviderCredential | null {
  if (!provider) return null;
  const n = norm(provider);
  return (
    PROVIDER_CREDENTIALS.find(
      (c) => norm(c.provider) === n || norm(c.provider).includes(n) || n.includes(norm(c.provider)),
    ) ?? null
  );
}

/** Resolve the owner/fund rule for a community (by owner name or entity prefix). */
export function ownerRuleFor(
  owner: string | null,
  entityPrefix?: string | null,
): OwnerRule | null {
  if (entityPrefix) {
    const pfx = entityPrefix.trim().toUpperCase();
    const byPrefix = OWNER_RULES.find((r) =>
      r.entityPrefixes.some((p) => p.toUpperCase() === pfx),
    );
    if (byPrefix) return byPrefix;
  }
  if (owner) {
    const n = norm(owner);
    return (
      OWNER_RULES.find(
        (r) => norm(r.client) === n || norm(r.client).includes(n) || n.includes(norm(r.client)),
      ) ?? null
    );
  }
  return null;
}

/** Assemble the reference bundle for a community. */
export function communityReference(community: Community): CommunityReference {
  const providerNames = Object.values(community.providers).filter(
    (p): p is string => !!p && !/^n\/?a$|^tbd$|^resident paid$/i.test(p.trim()),
  );
  const providerMatch = (candidate: string) =>
    providerNames.some(
      (p) => norm(p) === norm(candidate) || norm(p).includes(norm(candidate)) || norm(candidate).includes(norm(p)),
    );

  const credentials = providerNames
    .map((p) => credentialFor(p))
    .filter((c): c is ProviderCredential => c !== null);

  return {
    community,
    region: regionForState(community.state),
    ownerRule: ownerRuleFor(community.owner),
    leakAdjustments: LEAK_ADJUSTMENTS.filter(
      (la) =>
        la.state.trim().toUpperCase() === community.state.trim().toUpperCase() &&
        providerMatch(la.provider),
    ),
    loaRequirements: LOA_REQUIREMENTS.filter((loa) => providerMatch(loa.provider)),
    credentials,
    intel: PROVIDER_INTEL.filter(
      (pi) =>
        (pi.state ?? "").trim().toUpperCase() === community.state.trim().toUpperCase() &&
        providerMatch(pi.provider),
    ),
  };
}

/**
 * Resolve a reference from HubSpot-style inputs (the "live bump"): given any of
 * state / community / owner / entity-id, return the best-matching community
 * reference. Address is accepted but only its state/community are used for the
 * match (the guide is keyed at community grain, not per-address).
 */
export type ReferenceQuery = {
  community?: string | null;
  state?: string | null;
  owner?: string | null;
  entityId?: string | null;
};

export function resolveReference(q: ReferenceQuery): CommunityReference | null {
  let community: Community | null = null;
  if (q.community) community = findCommunity(q.community, q.state ?? undefined);
  if (!community && q.state) {
    const inState = COMMUNITIES.filter(
      (c) => c.state.trim().toUpperCase() === q.state!.trim().toUpperCase(),
    );
    if (inState.length === 1) community = inState[0];
  }
  if (!community) return null;

  const ref = communityReference(community);
  // Entity-id prefix (first 2–3 alpha chars) overrides owner-rule resolution.
  const prefix = q.entityId ? q.entityId.replace(/[^A-Za-z].*$/, "").toUpperCase() : null;
  const ownerRule = ownerRuleFor(q.owner ?? community.owner, prefix);
  return { ...ref, ownerRule };
}

// ── HubSpot field mapping (the deliverable bridge) ──────────────────────────
//
// How the Sheet's reference fields line up with HubSpot's live objects so a
// Property record and a Utilities / Compliance-Issues ticket can carry — or
// look up — the right provider, payer and process. `join: true` marks the keys
// used to bind a live record to a guide entry.

export type HubSpotObject = "property" | "ticket";
export type HubSpotPipeline = "utilities" | "compliance-issues";

export type FieldMapping = {
  object: HubSpotObject;
  pipeline: HubSpotPipeline | null; // ticket-only
  hubspotProperty: string; // suggested internal property name
  label: string;
  guideSource: string; // where the value comes from in this guide
  join: boolean;
  notes: string;
};

export const HUBSPOT_FIELD_MAP: FieldMapping[] = [
  // ---- Property object (the physical home / the join anchor) ----
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "address",
    label: "Property address",
    guideSource: "join key only (guide is community-grain)",
    join: true,
    notes:
      "Atomic identity of the home and the primary key for a live bump. Guide data is attached via the property's community/state/owner, not per-address.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "state",
    label: "State",
    guideSource: "Community.state",
    join: true,
    notes: "Drives leak-adjustment policy, provider intel, and the region rollup.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "community",
    label: "Community",
    guideSource: "Community.name",
    join: true,
    notes:
      "The operational unit. Resolves the five utility providers + community billing hint. Recommended primary browse level.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "owner_entity",
    label: "Owner / fund",
    guideSource: "OwnerRule.client",
    join: true,
    notes: "Determines vacant vs. occupied utility responsibility.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "entity_id",
    label: "Entity ID",
    guideSource: "OwnerRule.entityPrefixes (prefix match)",
    join: true,
    notes:
      "Prefix (RP/RB/AH/HO/ROI/RH/NS/…) is the authoritative key to the owner rule; last digits often encode the lot number.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "electric_provider",
    label: "Electric provider",
    guideSource: "Community.providers.electric",
    join: false,
    notes: "Also water_provider / sewer_provider / gas_provider / trash_provider.",
  },
  {
    object: "property",
    pipeline: null,
    hubspotProperty: "utility_responsibility",
    label: "Utility responsibility (E/G/W/S/T)",
    guideSource: "Community.billing + OwnerRule vacant/occupied",
    join: false,
    notes:
      "Who pays each utility. Owner rule is authoritative for vacant vs. occupied; community billing is the per-community hint.",
  },
  // ---- Ticket: Utilities pipeline ----
  {
    object: "ticket",
    pipeline: "utilities",
    hubspotProperty: "hs_pipeline",
    label: "Utilities pipeline",
    guideSource: "n/a (HubSpot pipeline id 80932995 — Utilities Activation)",
    join: true,
    notes: "Activation / deactivation / import work. Configurable via HUBSPOT_UTILITIES_PIPELINE_ID.",
  },
  {
    object: "ticket",
    pipeline: "utilities",
    hubspotProperty: "associated property (address)",
    label: "Associated property",
    guideSource: "join → Community via property",
    join: true,
    notes: "Associate the ticket to the Property; the community/state/owner then resolve the guide entry.",
  },
  {
    object: "ticket",
    pipeline: "utilities",
    hubspotProperty: "provider",
    label: "Service provider",
    guideSource: "Community.providers.* + ProviderCredential",
    join: false,
    notes: "Prefill from the community's providers; portal login/username from the credential (never the password).",
  },
  {
    object: "ticket",
    pipeline: "utilities",
    hubspotProperty: "utility_type",
    label: "Utility type",
    guideSource: "UTILITY_TYPES (ELECTRIC/GAS/WATER/SEWER/TRASH)",
    join: false,
    notes: "Constrained set; aligns with the leak-adjustment and intel tabs.",
  },
  {
    object: "ticket",
    pipeline: "utilities",
    hubspotProperty: "account_number",
    label: "Provider account #",
    guideSource: "captured on the ticket; close criteria per OwnerRule",
    join: false,
    notes: "Owner rules define close criteria (e.g. new account # to close an activation; final bill to close a deactivation).",
  },
  // ---- Ticket: Compliance-Issues pipeline ----
  {
    object: "ticket",
    pipeline: "compliance-issues",
    hubspotProperty: "hs_pipeline",
    label: "Compliance-Issues pipeline",
    guideSource: "n/a (set HUBSPOT_COMPLIANCE_ISSUES_PIPELINE_ID)",
    join: true,
    notes: "Pipeline id not yet wired — provide it via env to light up live counts.",
  },
  {
    object: "ticket",
    pipeline: "compliance-issues",
    hubspotProperty: "issue_type",
    label: "Issue type",
    guideSource: "LeakAdjustment / LoaRequirement / ProviderIntel / Policy",
    join: false,
    notes:
      "Leak adjustment, LOA required, stormwater-stays-with-owner, inadvertent opt-in, etc. — each maps to a guide reference the agent works from.",
  },
  {
    object: "ticket",
    pipeline: "compliance-issues",
    hubspotProperty: "associated property (address)",
    label: "Associated property",
    guideSource: "join → Community via property",
    join: true,
    notes: "Same join anchor as utilities tickets.",
  },
];

export function fieldMapFor(object: HubSpotObject): FieldMapping[] {
  return HUBSPOT_FIELD_MAP.filter((f) => f.object === object);
}

// ── Live HubSpot enrichment (optional) ──────────────────────────────────────
//
// Pipeline ids for the two ticket pipelines the guide references. Utilities
// defaults to the known Utilities Activation id; compliance-issues is unset
// until provided (the portal id is not known from the Sheet).

export const UTILITIES_PIPELINE_ID =
  process.env.HUBSPOT_UTILITIES_PIPELINE_ID?.trim() || "80932995";

export const COMPLIANCE_ISSUES_PIPELINE_ID =
  process.env.HUBSPOT_COMPLIANCE_ISSUES_PIPELINE_ID?.trim() || null;
