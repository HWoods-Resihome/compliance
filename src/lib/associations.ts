/**
 * HOA / Association extraction from ResiAIMS (Snowflake).
 *
 * Models the ResiAIMS "Association Details" record and its tabs:
 *   • HOA          — core association fields (this file models these in full,
 *                    matching the ResiAIMS UI: name, status, fax, EIN/TaxID,
 *                    invoice recovery, management company + 3 management POCs,
 *                    physical + local mailing address, and 3 points of contact)
 *   • Leasing Info — see LEASING columns (schema unconfirmed — see note below)
 *   • Amenities    — child rows
 *   • Access Codes — child rows (SENSITIVE)
 *   • Inspections  — child rows
 * plus the mapping of which properties belong to each association.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  SCHEMA MAPPING — READ THIS BEFORE USE
 * ─────────────────────────────────────────────────────────────────────────
 * The HOA-tab field set below is modeled directly on the ResiAIMS
 * "Association Details" screen, so the *shape* is correct. The Snowflake
 * table/column NAMES are best-effort defaults and may differ in the account.
 * Every name is overridable via environment variables (see `.env.example` and
 * docs/INTEGRATIONS.md) so the real schema can be pointed at WITHOUT a code
 * change. To finalize:
 *   1. Confirm the real object names, e.g. in Snowflake:
 *        SHOW TABLES LIKE '%ASSOC%' IN DATABASE <db>;
 *        DESCRIBE TABLE <db>.<schema>.<associations_table>;
 *   2. Either edit the defaults below, or set the matching RESIAIMS_* env vars.
 *
 * The Leasing Info / Amenities / Access Codes / Inspections tab field lists
 * are modeled from their tab names only (those tabs were not yet inspected);
 * confirm/adjust their columns when their layouts are available.
 *
 * SQL safety: runtime filter *values* (association id) are always passed as
 * bound parameters (`?`). Identifiers (table/column names) cannot be bound, so
 * they come only from this fixed mapping and are validated against a strict
 * identifier pattern before being interpolated — never from user input.
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

/** Validate a column identifier. */
function col(name: string): string {
  return ident(name, "column");
}

const T = {
  associations: table(env("RESIAIMS_ASSOCIATIONS_TABLE", "ASSOCIATIONS")),
  amenities: table(env("RESIAIMS_AMENITIES_TABLE", "ASSOCIATION_AMENITIES")),
  accessCodes: table(env("RESIAIMS_ACCESS_CODES_TABLE", "ASSOCIATION_ACCESS_CODES")),
  inspections: table(env("RESIAIMS_INSPECTIONS_TABLE", "ASSOCIATION_INSPECTIONS")),
  properties: table(env("RESIAIMS_PROPERTIES_TABLE", "PROPERTIES")),
};

/**
 * Columns on the ASSOCIATIONS record — the HOA tab. Modeled on the ResiAIMS
 * "Association Details" screen. Points of contact (poc1..3) and management
 * company POCs (mgmtPoc1..3) are fixed slots on the record, mirroring the UI.
 */
const A = {
  id: env("RESIAIMS_ASSOC_ID_COL", "ASSOCIATION_ID"),
  name: env("RESIAIMS_ASSOC_NAME_COL", "ASSOCIATION_NAME"),
  status: env("RESIAIMS_ASSOC_STATUS_COL", "STATUS"),
  fax: env("RESIAIMS_ASSOC_FAX_COL", "FAX"),
  einTaxId: env("RESIAIMS_ASSOC_EIN_COL", "EIN_TAX_ID"),
  invoiceRecovery: env("RESIAIMS_ASSOC_INVOICE_RECOVERY_COL", "INVOICE_RECOVERY"),
  managementCompany: env("RESIAIMS_ASSOC_MGMT_COL", "MANAGEMENT_COMPANY"),
  mgmtPoc1: env("RESIAIMS_ASSOC_MGMT_POC1_COL", "MGMT_COMPANY_POC1"),
  mgmtPoc2: env("RESIAIMS_ASSOC_MGMT_POC2_COL", "MGMT_COMPANY_POC2"),
  mgmtPoc3: env("RESIAIMS_ASSOC_MGMT_POC3_COL", "MGMT_COMPANY_POC3"),
  // Physical address
  physName: env("RESIAIMS_ASSOC_PHYS_NAME_COL", "PHYSICAL_NAME"),
  physAddress: env("RESIAIMS_ASSOC_PHYS_ADDRESS_COL", "PHYSICAL_ADDRESS"),
  physCity: env("RESIAIMS_ASSOC_PHYS_CITY_COL", "PHYSICAL_CITY"),
  physState: env("RESIAIMS_ASSOC_PHYS_STATE_COL", "PHYSICAL_STATE"),
  physZip: env("RESIAIMS_ASSOC_PHYS_ZIP_COL", "PHYSICAL_ZIP"),
  // Local mailing address
  mailName: env("RESIAIMS_ASSOC_MAIL_NAME_COL", "MAILING_NAME"),
  mailAddress: env("RESIAIMS_ASSOC_MAIL_ADDRESS_COL", "MAILING_ADDRESS"),
  mailCity: env("RESIAIMS_ASSOC_MAIL_CITY_COL", "MAILING_CITY"),
  mailState: env("RESIAIMS_ASSOC_MAIL_STATE_COL", "MAILING_STATE"),
  mailZip: env("RESIAIMS_ASSOC_MAIL_ZIP_COL", "MAILING_ZIP"),
  // Point of contact 1
  poc1Name: env("RESIAIMS_ASSOC_POC1_NAME_COL", "POC1_NAME"),
  poc1Title: env("RESIAIMS_ASSOC_POC1_TITLE_COL", "POC1_TITLE"),
  poc1Email: env("RESIAIMS_ASSOC_POC1_EMAIL_COL", "POC1_EMAIL"),
  poc1Phone: env("RESIAIMS_ASSOC_POC1_PHONE_COL", "POC1_PHONE"),
  poc1Ext: env("RESIAIMS_ASSOC_POC1_EXT_COL", "POC1_EXT"),
  // Point of contact 2
  poc2Name: env("RESIAIMS_ASSOC_POC2_NAME_COL", "POC2_NAME"),
  poc2Title: env("RESIAIMS_ASSOC_POC2_TITLE_COL", "POC2_TITLE"),
  poc2Email: env("RESIAIMS_ASSOC_POC2_EMAIL_COL", "POC2_EMAIL"),
  poc2Phone: env("RESIAIMS_ASSOC_POC2_PHONE_COL", "POC2_PHONE"),
  poc2Ext: env("RESIAIMS_ASSOC_POC2_EXT_COL", "POC2_EXT"),
  // Point of contact 3
  poc3Name: env("RESIAIMS_ASSOC_POC3_NAME_COL", "POC3_NAME"),
  poc3Title: env("RESIAIMS_ASSOC_POC3_TITLE_COL", "POC3_TITLE"),
  poc3Email: env("RESIAIMS_ASSOC_POC3_EMAIL_COL", "POC3_EMAIL"),
  poc3Phone: env("RESIAIMS_ASSOC_POC3_PHONE_COL", "POC3_PHONE"),
  poc3Ext: env("RESIAIMS_ASSOC_POC3_EXT_COL", "POC3_EXT"),
};

const AMEN = {
  assocFk: env("RESIAIMS_AMENITIES_FK_COL", "ASSOCIATION_ID"),
  name: env("RESIAIMS_AMENITIES_NAME_COL", "AMENITY_NAME"),
  description: env("RESIAIMS_AMENITIES_DESC_COL", "DESCRIPTION"),
};

const AC = {
  assocFk: env("RESIAIMS_ACCESS_CODES_FK_COL", "ASSOCIATION_ID"),
  label: env("RESIAIMS_ACCESS_CODES_LABEL_COL", "LABEL"),
  code: env("RESIAIMS_ACCESS_CODES_CODE_COL", "CODE"),
  notes: env("RESIAIMS_ACCESS_CODES_NOTES_COL", "NOTES"),
};

const INS = {
  assocFk: env("RESIAIMS_INSPECTIONS_FK_COL", "ASSOCIATION_ID"),
  type: env("RESIAIMS_INSPECTIONS_TYPE_COL", "INSPECTION_TYPE"),
  status: env("RESIAIMS_INSPECTIONS_STATUS_COL", "STATUS"),
  scheduledDate: env("RESIAIMS_INSPECTIONS_SCHEDULED_COL", "SCHEDULED_DATE"),
  completedDate: env("RESIAIMS_INSPECTIONS_COMPLETED_COL", "COMPLETED_DATE"),
  result: env("RESIAIMS_INSPECTIONS_RESULT_COL", "RESULT"),
};

const P = {
  id: env("RESIAIMS_PROPERTY_ID_COL", "PROPERTY_ID"),
  assocFk: env("RESIAIMS_PROPERTY_ASSOC_FK_COL", "ASSOCIATION_ID"),
  address: env("RESIAIMS_PROPERTY_ADDRESS_COL", "ADDRESS"),
  city: env("RESIAIMS_PROPERTY_CITY_COL", "CITY"),
  state: env("RESIAIMS_PROPERTY_STATE_COL", "STATE"),
  zip: env("RESIAIMS_PROPERTY_ZIP_COL", "ZIP"),
  status: env("RESIAIMS_PROPERTY_STATUS_COL", "STATUS"),
};

// ── Types ───────────────────────────────────────────────────────────────

export type Address = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type PointOfContact = {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  ext: string | null;
};

export type Amenity = { name: string | null; description: string | null };

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

export type AssociationSummary = {
  id: string;
  name: string | null;
  status: string | null;
  managementCompany: string | null;
  city: string | null;
  state: string | null;
  propertyCount: number;
};

export type Association = {
  id: string;
  name: string | null;
  status: string | null;
  fax: string | null;
  einTaxId: string | null;
  invoiceRecovery: string | null;
  managementCompany: string | null;
  managementPocs: string[];
  physicalAddress: Address;
  mailingAddress: Address;
  pointsOfContact: PointOfContact[];
  amenities: Amenity[];
  accessCodes: AccessCode[];
  inspections: Inspection[];
  properties: LinkedProperty[];
  propertyCount: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Case-insensitive lookup: Snowflake returns UPPERCASE keys; be tolerant. */
function pick(row: SnowflakeRow, key: string): unknown {
  return row[key.toUpperCase()] ?? row[key.toLowerCase()] ?? row[key];
}

// ── Queries ────────────────────────────────────────────────────────────

/**
 * List all associations with a count of the properties mapped to each.
 */
export async function listAssociations(
  limit = 500,
): Promise<AssociationSummary[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);

  const sql = `
    SELECT
      a.${col(A.id)}                AS id,
      a.${col(A.name)}              AS name,
      a.${col(A.status)}            AS status,
      a.${col(A.managementCompany)} AS management_company,
      a.${col(A.physCity)}          AS city,
      a.${col(A.physState)}         AS state,
      COUNT(p.${col(P.id)})         AS property_count
    FROM ${T.associations} a
    LEFT JOIN ${T.properties} p
      ON p.${col(P.assocFk)} = a.${col(A.id)}
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY name
    LIMIT ${safeLimit}
  `;

  const rows = await snowflakeQuery(sql);
  return rows.map((r) => ({
    id: String(pick(r, "id") ?? ""),
    name: str(pick(r, "name")),
    status: str(pick(r, "status")),
    managementCompany: str(pick(r, "management_company")),
    city: str(pick(r, "city")),
    state: str(pick(r, "state")),
    propertyCount: num(pick(r, "property_count")),
  }));
}

/**
 * Full detail for one association: the HOA-tab record plus amenities, access
 * codes, inspections and the properties mapped to it. Filtered by bound id.
 * Returns null if no association matches.
 */
export async function getAssociation(id: string): Promise<Association | null> {
  const headSql = `
    SELECT
      ${col(A.id)} AS id, ${col(A.name)} AS name, ${col(A.status)} AS status,
      ${col(A.fax)} AS fax, ${col(A.einTaxId)} AS ein_tax_id,
      ${col(A.invoiceRecovery)} AS invoice_recovery,
      ${col(A.managementCompany)} AS management_company,
      ${col(A.mgmtPoc1)} AS mgmt_poc1, ${col(A.mgmtPoc2)} AS mgmt_poc2, ${col(A.mgmtPoc3)} AS mgmt_poc3,
      ${col(A.physName)} AS phys_name, ${col(A.physAddress)} AS phys_address,
      ${col(A.physCity)} AS phys_city, ${col(A.physState)} AS phys_state, ${col(A.physZip)} AS phys_zip,
      ${col(A.mailName)} AS mail_name, ${col(A.mailAddress)} AS mail_address,
      ${col(A.mailCity)} AS mail_city, ${col(A.mailState)} AS mail_state, ${col(A.mailZip)} AS mail_zip,
      ${col(A.poc1Name)} AS poc1_name, ${col(A.poc1Title)} AS poc1_title, ${col(A.poc1Email)} AS poc1_email, ${col(A.poc1Phone)} AS poc1_phone, ${col(A.poc1Ext)} AS poc1_ext,
      ${col(A.poc2Name)} AS poc2_name, ${col(A.poc2Title)} AS poc2_title, ${col(A.poc2Email)} AS poc2_email, ${col(A.poc2Phone)} AS poc2_phone, ${col(A.poc2Ext)} AS poc2_ext,
      ${col(A.poc3Name)} AS poc3_name, ${col(A.poc3Title)} AS poc3_title, ${col(A.poc3Email)} AS poc3_email, ${col(A.poc3Phone)} AS poc3_phone, ${col(A.poc3Ext)} AS poc3_ext
    FROM ${T.associations}
    WHERE ${col(A.id)} = ?
    LIMIT 1
  `;

  const [head] = await snowflakeQuery(headSql, [id]);
  if (!head) return null;

  const [amenities, accessCodes, inspections, properties] = await Promise.all([
    getAmenities(id),
    getAccessCodes(id),
    getInspections(id),
    getPropertiesForAssociation(id),
  ]);

  const poc = (n: 1 | 2 | 3): PointOfContact => ({
    name: str(pick(head, `poc${n}_name`)),
    title: str(pick(head, `poc${n}_title`)),
    email: str(pick(head, `poc${n}_email`)),
    phone: str(pick(head, `poc${n}_phone`)),
    ext: str(pick(head, `poc${n}_ext`)),
  });
  const hasPoc = (c: PointOfContact) =>
    c.name || c.title || c.email || c.phone || c.ext;

  const managementPocs = [
    str(pick(head, "mgmt_poc1")),
    str(pick(head, "mgmt_poc2")),
    str(pick(head, "mgmt_poc3")),
  ].filter((v): v is string => !!v);

  return {
    id: String(pick(head, "id") ?? id),
    name: str(pick(head, "name")),
    status: str(pick(head, "status")),
    fax: str(pick(head, "fax")),
    einTaxId: str(pick(head, "ein_tax_id")),
    invoiceRecovery: str(pick(head, "invoice_recovery")),
    managementCompany: str(pick(head, "management_company")),
    managementPocs,
    physicalAddress: {
      name: str(pick(head, "phys_name")),
      address: str(pick(head, "phys_address")),
      city: str(pick(head, "phys_city")),
      state: str(pick(head, "phys_state")),
      zip: str(pick(head, "phys_zip")),
    },
    mailingAddress: {
      name: str(pick(head, "mail_name")),
      address: str(pick(head, "mail_address")),
      city: str(pick(head, "mail_city")),
      state: str(pick(head, "mail_state")),
      zip: str(pick(head, "mail_zip")),
    },
    pointsOfContact: [poc(1), poc(2), poc(3)].filter(hasPoc),
    amenities,
    accessCodes,
    inspections,
    properties,
    propertyCount: properties.length,
  };
}

async function getAmenities(id: string): Promise<Amenity[]> {
  const sql = `
    SELECT ${col(AMEN.name)} AS name, ${col(AMEN.description)} AS description
    FROM ${T.amenities}
    WHERE ${col(AMEN.assocFk)} = ?
    ORDER BY name
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    name: str(pick(r, "name")),
    description: str(pick(r, "description")),
  }));
}

async function getAccessCodes(id: string): Promise<AccessCode[]> {
  const sql = `
    SELECT ${col(AC.label)} AS label, ${col(AC.code)} AS code, ${col(AC.notes)} AS notes
    FROM ${T.accessCodes}
    WHERE ${col(AC.assocFk)} = ?
    ORDER BY label
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    label: str(pick(r, "label")),
    code: str(pick(r, "code")),
    notes: str(pick(r, "notes")),
  }));
}

async function getInspections(id: string): Promise<Inspection[]> {
  const sql = `
    SELECT ${col(INS.type)} AS type, ${col(INS.status)} AS status,
           ${col(INS.scheduledDate)} AS scheduled_date,
           ${col(INS.completedDate)} AS completed_date,
           ${col(INS.result)} AS result
    FROM ${T.inspections}
    WHERE ${col(INS.assocFk)} = ?
    ORDER BY scheduled_date DESC
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    type: str(pick(r, "type")),
    status: str(pick(r, "status")),
    scheduledDate: str(pick(r, "scheduled_date")),
    completedDate: str(pick(r, "completed_date")),
    result: str(pick(r, "result")),
  }));
}

/** The properties mapped to an association (the "which properties belong here" answer). */
export async function getPropertiesForAssociation(
  id: string,
): Promise<LinkedProperty[]> {
  const sql = `
    SELECT ${col(P.id)} AS id, ${col(P.address)} AS address,
           ${col(P.city)} AS city, ${col(P.state)} AS state,
           ${col(P.zip)} AS zip, ${col(P.status)} AS status
    FROM ${T.properties}
    WHERE ${col(P.assocFk)} = ?
    ORDER BY address
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    id: str(pick(r, "id")),
    address: str(pick(r, "address")),
    city: str(pick(r, "city")),
    state: str(pick(r, "state")),
    zip: str(pick(r, "zip")),
    status: str(pick(r, "status")),
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
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000000);
  const sql = `
    SELECT
      p.${col(P.id)}       AS property_id,
      p.${col(P.address)}  AS address,
      a.${col(A.id)}       AS association_id,
      a.${col(A.name)}     AS association_name
    FROM ${T.properties} p
    LEFT JOIN ${T.associations} a
      ON p.${col(P.assocFk)} = a.${col(A.id)}
    ORDER BY association_name, address
    LIMIT ${safeLimit}
  `;
  const rows = await snowflakeQuery(sql);
  return rows.map((r) => ({
    propertyId: str(pick(r, "property_id")),
    address: str(pick(r, "address")),
    associationId: str(pick(r, "association_id")),
    associationName: str(pick(r, "association_name")),
  }));
}
