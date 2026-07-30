/**
 * HOA / Association extraction from ResiAIMS (Snowflake).
 *
 * Mirrors the "Association" tab in ResiAIMS/ResiMAS: for each association it
 * pulls contacts, leasing information, amenities, access codes and
 * inspections, and maps which properties belong to each association.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  SCHEMA MAPPING — READ THIS BEFORE USE
 * ─────────────────────────────────────────────────────────────────────────
 * The table and column names below are the ResiAIMS-flavored *defaults*. They
 * are almost certainly close but may not match the account exactly. Every one
 * is overridable via environment variables (see `.env.example` and
 * docs/INTEGRATIONS.md) so the real schema can be pointed at WITHOUT a code
 * change. To finalize:
 *   1. Confirm the real object names (e.g. run in Snowflake:
 *        SHOW TABLES LIKE '%ASSOC%' IN DATABASE <db>;
 *        DESCRIBE TABLE <db>.<schema>.<associations_table>;
 *   2. Either edit the defaults in `DEFAULTS` below, or set the matching
 *      RESIAIMS_* env vars.
 *
 * SQL safety: runtime filter *values* (association id, property id) are always
 * passed as bound parameters (`?`). Identifiers (table/column names) cannot be
 * bound, so they come only from this fixed mapping and are validated against a
 * strict identifier pattern before being interpolated — never from user input.
 */

import {
  snowflakeQuery,
  type SnowflakeRow,
  SnowflakeNotConfiguredError,
  SnowflakeDriverUnavailableError,
} from "@/lib/snowflake";

export { SnowflakeNotConfiguredError, SnowflakeDriverUnavailableError };

// ── Schema mapping ────────────────────────────────────────────────────────

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

/**
 * Fully-qualified database + schema the ResiAIMS association objects live in.
 * Falls back to the app's Snowflake defaults, then to a plain guess.
 */
const DB = env("RESIAIMS_DATABASE", env("SNOWFLAKE_DATABASE", "RESIAIMS"));
const SCHEMA = env("RESIAIMS_SCHEMA", env("SNOWFLAKE_SCHEMA", "PUBLIC"));

/** Strict identifier check: letters, digits, underscore, `$`, dot (for db.schema.table). */
const IDENT = /^[A-Za-z_][A-Za-z0-9_$.]*$/;

function ident(raw: string, kind: string): string {
  if (!IDENT.test(raw)) {
    throw new Error(
      `Invalid ${kind} identifier in ResiAIMS schema mapping: ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

/** Qualify a bare table name as DB.SCHEMA.TABLE (unless it already has dots). */
function table(name: string): string {
  const qualified = name.includes(".") ? name : `${DB}.${SCHEMA}.${name}`;
  return ident(qualified, "table");
}

/**
 * Table names. Override any of these via the RESIAIMS_*_TABLE env vars if the
 * account uses different names (or fully-qualify them, e.g. "MYDB.MYSCHEMA.HOA").
 */
const T = {
  associations: table(env("RESIAIMS_ASSOCIATIONS_TABLE", "ASSOCIATIONS")),
  contacts: table(env("RESIAIMS_CONTACTS_TABLE", "ASSOCIATION_CONTACTS")),
  amenities: table(env("RESIAIMS_AMENITIES_TABLE", "ASSOCIATION_AMENITIES")),
  accessCodes: table(env("RESIAIMS_ACCESS_CODES_TABLE", "ASSOCIATION_ACCESS_CODES")),
  inspections: table(env("RESIAIMS_INSPECTIONS_TABLE", "ASSOCIATION_INSPECTIONS")),
  properties: table(env("RESIAIMS_PROPERTIES_TABLE", "PROPERTIES")),
};

/**
 * Column names, grouped by table. Each value is overridable via a RESIAIMS_*
 * env var. `assocFk` is the column on a child table that references the
 * association's primary key.
 */
const C = {
  assoc: {
    id: env("RESIAIMS_ASSOC_ID_COL", "ASSOCIATION_ID"),
    name: env("RESIAIMS_ASSOC_NAME_COL", "ASSOCIATION_NAME"),
    type: env("RESIAIMS_ASSOC_TYPE_COL", "ASSOCIATION_TYPE"),
    status: env("RESIAIMS_ASSOC_STATUS_COL", "STATUS"),
    managementCompany: env("RESIAIMS_ASSOC_MGMT_COL", "MANAGEMENT_COMPANY"),
    website: env("RESIAIMS_ASSOC_WEBSITE_COL", "WEBSITE"),
    phone: env("RESIAIMS_ASSOC_PHONE_COL", "PHONE"),
    email: env("RESIAIMS_ASSOC_EMAIL_COL", "EMAIL"),
    // Leasing information — commonly columns on the association record.
    leaseApprovalRequired: env("RESIAIMS_ASSOC_LEASE_APPROVAL_COL", "LEASE_APPROVAL_REQUIRED"),
    rentalCapPct: env("RESIAIMS_ASSOC_RENTAL_CAP_COL", "RENTAL_CAP_PCT"),
    leasingRestrictions: env("RESIAIMS_ASSOC_LEASING_NOTES_COL", "LEASING_RESTRICTIONS"),
    minLeaseTermMonths: env("RESIAIMS_ASSOC_MIN_LEASE_COL", "MIN_LEASE_TERM_MONTHS"),
  },
  contacts: {
    assocFk: env("RESIAIMS_CONTACTS_FK_COL", "ASSOCIATION_ID"),
    name: env("RESIAIMS_CONTACTS_NAME_COL", "CONTACT_NAME"),
    role: env("RESIAIMS_CONTACTS_ROLE_COL", "ROLE"),
    phone: env("RESIAIMS_CONTACTS_PHONE_COL", "PHONE"),
    email: env("RESIAIMS_CONTACTS_EMAIL_COL", "EMAIL"),
  },
  amenities: {
    assocFk: env("RESIAIMS_AMENITIES_FK_COL", "ASSOCIATION_ID"),
    name: env("RESIAIMS_AMENITIES_NAME_COL", "AMENITY_NAME"),
    description: env("RESIAIMS_AMENITIES_DESC_COL", "DESCRIPTION"),
  },
  accessCodes: {
    assocFk: env("RESIAIMS_ACCESS_CODES_FK_COL", "ASSOCIATION_ID"),
    label: env("RESIAIMS_ACCESS_CODES_LABEL_COL", "LABEL"),
    code: env("RESIAIMS_ACCESS_CODES_CODE_COL", "CODE"),
    notes: env("RESIAIMS_ACCESS_CODES_NOTES_COL", "NOTES"),
  },
  inspections: {
    assocFk: env("RESIAIMS_INSPECTIONS_FK_COL", "ASSOCIATION_ID"),
    type: env("RESIAIMS_INSPECTIONS_TYPE_COL", "INSPECTION_TYPE"),
    status: env("RESIAIMS_INSPECTIONS_STATUS_COL", "STATUS"),
    scheduledDate: env("RESIAIMS_INSPECTIONS_SCHEDULED_COL", "SCHEDULED_DATE"),
    completedDate: env("RESIAIMS_INSPECTIONS_COMPLETED_COL", "COMPLETED_DATE"),
    result: env("RESIAIMS_INSPECTIONS_RESULT_COL", "RESULT"),
  },
  properties: {
    id: env("RESIAIMS_PROPERTY_ID_COL", "PROPERTY_ID"),
    assocFk: env("RESIAIMS_PROPERTY_ASSOC_FK_COL", "ASSOCIATION_ID"),
    address: env("RESIAIMS_PROPERTY_ADDRESS_COL", "ADDRESS"),
    city: env("RESIAIMS_PROPERTY_CITY_COL", "CITY"),
    state: env("RESIAIMS_PROPERTY_STATE_COL", "STATE"),
    zip: env("RESIAIMS_PROPERTY_ZIP_COL", "ZIP"),
    status: env("RESIAIMS_PROPERTY_STATUS_COL", "STATUS"),
  },
};

/** Validate a column identifier and return it (used when building column lists). */
function col(name: string): string {
  return ident(name, "column");
}

// ── Types ───────────────────────────────────────────────────────────────

export type AssociationContact = {
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
};

export type Amenity = {
  name: string | null;
  description: string | null;
};

export type AccessCode = {
  label: string | null;
  code: string | null;
  notes: string | null;
};

export type Inspection = {
  type: string | null;
  status: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  result: string | null;
};

export type LinkedProperty = {
  id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string | null;
};

export type LeasingInfo = {
  leaseApprovalRequired: boolean | string | null;
  rentalCapPct: number | string | null;
  minLeaseTermMonths: number | string | null;
  restrictions: string | null;
};

export type AssociationSummary = {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  managementCompany: string | null;
  propertyCount: number;
};

export type Association = AssociationSummary & {
  website: string | null;
  phone: string | null;
  email: string | null;
  leasing: LeasingInfo;
  contacts: AssociationContact[];
  amenities: Amenity[];
  accessCodes: AccessCode[];
  inspections: Inspection[];
  properties: LinkedProperty[];
};

// ── Helpers ────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Queries ────────────────────────────────────────────────────────────

/**
 * List all associations with a count of the properties mapped to each.
 * One query: associations LEFT JOIN a per-association property count.
 */
export async function listAssociations(
  limit = 500,
): Promise<AssociationSummary[]> {
  const a = C.assoc;
  const p = C.properties;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);

  const sql = `
    SELECT
      a.${col(a.id)}                AS id,
      a.${col(a.name)}              AS name,
      a.${col(a.type)}              AS type,
      a.${col(a.status)}            AS status,
      a.${col(a.managementCompany)} AS management_company,
      COUNT(p.${col(p.id)})         AS property_count
    FROM ${T.associations} a
    LEFT JOIN ${T.properties} p
      ON p.${col(p.assocFk)} = a.${col(a.id)}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY name
    LIMIT ${safeLimit}
  `;

  const rows = await snowflakeQuery(sql);
  return rows.map(toSummary);
}

function toSummary(r: SnowflakeRow): AssociationSummary {
  return {
    id: String(r.ID ?? r.id ?? ""),
    name: str(r.NAME ?? r.name),
    type: str(r.TYPE ?? r.type),
    status: str(r.STATUS ?? r.status),
    managementCompany: str(r.MANAGEMENT_COMPANY ?? r.management_company),
    propertyCount: num(r.PROPERTY_COUNT ?? r.property_count),
  };
}

/**
 * Full detail for one association: the association record (incl. leasing
 * fields) plus its contacts, amenities, access codes, inspections and the
 * properties mapped to it. Filtered by bound association id.
 *
 * Returns null if no association matches the id.
 */
export async function getAssociation(id: string): Promise<Association | null> {
  const a = C.assoc;

  const headSql = `
    SELECT
      ${col(a.id)}                AS id,
      ${col(a.name)}              AS name,
      ${col(a.type)}              AS type,
      ${col(a.status)}            AS status,
      ${col(a.managementCompany)} AS management_company,
      ${col(a.website)}           AS website,
      ${col(a.phone)}             AS phone,
      ${col(a.email)}             AS email,
      ${col(a.leaseApprovalRequired)} AS lease_approval_required,
      ${col(a.rentalCapPct)}      AS rental_cap_pct,
      ${col(a.minLeaseTermMonths)} AS min_lease_term_months,
      ${col(a.leasingRestrictions)} AS leasing_restrictions
    FROM ${T.associations}
    WHERE ${col(a.id)} = ?
    LIMIT 1
  `;

  const [head] = await snowflakeQuery(headSql, [id]);
  if (!head) return null;

  const [contacts, amenities, accessCodes, inspections, properties] =
    await Promise.all([
      getContacts(id),
      getAmenities(id),
      getAccessCodes(id),
      getInspections(id),
      getPropertiesForAssociation(id),
    ]);

  return {
    id: String(head.ID ?? head.id ?? id),
    name: str(head.NAME ?? head.name),
    type: str(head.TYPE ?? head.type),
    status: str(head.STATUS ?? head.status),
    managementCompany: str(head.MANAGEMENT_COMPANY ?? head.management_company),
    website: str(head.WEBSITE ?? head.website),
    phone: str(head.PHONE ?? head.phone),
    email: str(head.EMAIL ?? head.email),
    leasing: {
      leaseApprovalRequired:
        (head.LEASE_APPROVAL_REQUIRED ??
          head.lease_approval_required ??
          null) as boolean | string | null,
      rentalCapPct: (head.RENTAL_CAP_PCT ?? head.rental_cap_pct ?? null) as
        | number
        | string
        | null,
      minLeaseTermMonths: (head.MIN_LEASE_TERM_MONTHS ??
        head.min_lease_term_months ??
        null) as number | string | null,
      restrictions: str(head.LEASING_RESTRICTIONS ?? head.leasing_restrictions),
    },
    propertyCount: properties.length,
    contacts,
    amenities,
    accessCodes,
    inspections,
    properties,
  };
}

async function getContacts(id: string): Promise<AssociationContact[]> {
  const c = C.contacts;
  const sql = `
    SELECT ${col(c.name)} AS name, ${col(c.role)} AS role,
           ${col(c.phone)} AS phone, ${col(c.email)} AS email
    FROM ${T.contacts}
    WHERE ${col(c.assocFk)} = ?
    ORDER BY role
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    name: str(r.NAME ?? r.name),
    role: str(r.ROLE ?? r.role),
    phone: str(r.PHONE ?? r.phone),
    email: str(r.EMAIL ?? r.email),
  }));
}

async function getAmenities(id: string): Promise<Amenity[]> {
  const c = C.amenities;
  const sql = `
    SELECT ${col(c.name)} AS name, ${col(c.description)} AS description
    FROM ${T.amenities}
    WHERE ${col(c.assocFk)} = ?
    ORDER BY name
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    name: str(r.NAME ?? r.name),
    description: str(r.DESCRIPTION ?? r.description),
  }));
}

async function getAccessCodes(id: string): Promise<AccessCode[]> {
  const c = C.accessCodes;
  const sql = `
    SELECT ${col(c.label)} AS label, ${col(c.code)} AS code, ${col(c.notes)} AS notes
    FROM ${T.accessCodes}
    WHERE ${col(c.assocFk)} = ?
    ORDER BY label
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    label: str(r.LABEL ?? r.label),
    code: str(r.CODE ?? r.code),
    notes: str(r.NOTES ?? r.notes),
  }));
}

async function getInspections(id: string): Promise<Inspection[]> {
  const c = C.inspections;
  const sql = `
    SELECT ${col(c.type)} AS type, ${col(c.status)} AS status,
           ${col(c.scheduledDate)} AS scheduled_date,
           ${col(c.completedDate)} AS completed_date,
           ${col(c.result)} AS result
    FROM ${T.inspections}
    WHERE ${col(c.assocFk)} = ?
    ORDER BY scheduled_date DESC
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    type: str(r.TYPE ?? r.type),
    status: str(r.STATUS ?? r.status),
    scheduledDate: str(r.SCHEDULED_DATE ?? r.scheduled_date),
    completedDate: str(r.COMPLETED_DATE ?? r.completed_date),
    result: str(r.RESULT ?? r.result),
  }));
}

/** The properties mapped to an association (the "which properties belong here" answer). */
export async function getPropertiesForAssociation(
  id: string,
): Promise<LinkedProperty[]> {
  const p = C.properties;
  const sql = `
    SELECT ${col(p.id)} AS id, ${col(p.address)} AS address,
           ${col(p.city)} AS city, ${col(p.state)} AS state,
           ${col(p.zip)} AS zip, ${col(p.status)} AS status
    FROM ${T.properties}
    WHERE ${col(p.assocFk)} = ?
    ORDER BY address
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    id: str(r.ID ?? r.id),
    address: str(r.ADDRESS ?? r.address),
    city: str(r.CITY ?? r.city),
    state: str(r.STATE ?? r.state),
    zip: str(r.ZIP ?? r.zip),
    status: str(r.STATUS ?? r.status),
  }));
}

/**
 * The full flat property→association mapping across every association — one
 * row per property, suitable for exporting the "which properties go to which
 * association" join in a single pull.
 */
export async function getPropertyAssociationMap(
  limit = 100000,
): Promise<
  Array<{
    propertyId: string | null;
    address: string | null;
    associationId: string | null;
    associationName: string | null;
  }>
> {
  const a = C.assoc;
  const p = C.properties;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000000);
  const sql = `
    SELECT
      p.${col(p.id)}       AS property_id,
      p.${col(p.address)}  AS address,
      a.${col(a.id)}       AS association_id,
      a.${col(a.name)}     AS association_name
    FROM ${T.properties} p
    LEFT JOIN ${T.associations} a
      ON p.${col(p.assocFk)} = a.${col(a.id)}
    ORDER BY association_name, address
    LIMIT ${safeLimit}
  `;
  const rows = await snowflakeQuery(sql);
  return rows.map((r) => ({
    propertyId: str(r.PROPERTY_ID ?? r.property_id),
    address: str(r.ADDRESS ?? r.address),
    associationId: str(r.ASSOCIATION_ID ?? r.association_id),
    associationName: str(r.ASSOCIATION_NAME ?? r.association_name),
  }));
}
