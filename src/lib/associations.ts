/**
 * HOA / Association extraction from ResiAIMS (Snowflake).
 *
 * Targets the real ResiAIMS star schema in Snowflake
 * (default PROD_ANALYTICS.DBT_RESICAP), modeling the ResiAIMS
 * "Association Details" record and its tabs:
 *   • HOA          — DIM_HOA: core association fields, contacts, management
 *                    company, assessment, and the physical address.
 *   • Leasing Info — DIM_HOA leasing columns (approval / fees / pets).
 *   • Amenities    — DIM_HOA amenity + utility + parking flag columns.
 *   • Access Codes — FCT_HOA_ACCESS_CODE_ACCUM child rows (keyed by HOA_KEY).
 *   • Inspections  — FCT_HOA_PROPERTY per-property inspection dates
 *                    (chimney / dryer / HVAC / fire), surfaced on each mapped
 *                    property.
 * plus the mapping of which properties belong to each association
 * (FCT_HOA_PROPERTY → DIM_PROPERTY).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  SCHEMA MAPPING
 * ─────────────────────────────────────────────────────────────────────────
 * Table and column names below are the real ResiAIMS warehouse names,
 * confirmed against PROD_ANALYTICS.DBT_RESICAP. Every name stays overridable
 * via environment variables (see `.env.example` and docs/INTEGRATIONS.md) so
 * the schema can be repointed WITHOUT a code change if the warehouse layout
 * shifts.
 *
 * Grain / joins:
 *   DIM_HOA           — one current row per association (SCD; CURRENT_FLAG='Y').
 *                       HOA_KEY is the surrogate join key; HOA_ID the business id.
 *   FCT_HOA_PROPERTY  — HOA_KEY ⇄ PROPERTY_KEY map (+ per-property inspections).
 *   DIM_PROPERTY      — property dimension (SCD; CURRENT_FLAG='Y').
 *   FCT_HOA_ACCESS_CODE_ACCUM — access-code rows by HOA_KEY.
 *   FCT_HOA_ACCUM     — assessment rollup / association status by HOA_KEY.
 *
 * SQL safety: runtime filter *values* (HOA_KEY) are always passed as bound
 * parameters (`?`). Identifiers (table/column names) cannot be bound, so they
 * come only from this fixed mapping and are validated against a strict
 * identifier pattern before being interpolated — never from user input.
 *
 * Sensitivity: access codes are sensitive, and DIM_HOA also stores HOA website
 * credentials (WEBSITE_USERNAME / WEBSITE_PASSWORD). The password is
 * intentionally never projected by this module. Treat every detail response as
 * sensitive and keep the route auth-guarded.
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

const DB = env("RESIAIMS_DATABASE", env("SNOWFLAKE_DATABASE", "PROD_ANALYTICS"));
const SCHEMA = env("RESIAIMS_SCHEMA", env("SNOWFLAKE_SCHEMA", "DBT_RESICAP"));

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
  hoa: table(env("RESIAIMS_HOA_TABLE", "DIM_HOA")),
  hoaProperty: table(env("RESIAIMS_HOA_PROPERTY_TABLE", "FCT_HOA_PROPERTY")),
  accessCodes: table(
    env("RESIAIMS_ACCESS_CODES_TABLE", "FCT_HOA_ACCESS_CODE_ACCUM"),
  ),
  hoaAccum: table(env("RESIAIMS_HOA_ACCUM_TABLE", "FCT_HOA_ACCUM")),
  property: table(env("RESIAIMS_PROPERTY_TABLE", "DIM_PROPERTY")),
};

/** SCD current-row flag column + value, shared by DIM_HOA and DIM_PROPERTY. */
const CURRENT_FLAG_COL = env("RESIAIMS_CURRENT_FLAG_COL", "CURRENT_FLAG");
const CURRENT_FLAG_VAL = env("RESIAIMS_CURRENT_FLAG_VAL", "Y");

/** DIM_HOA columns (the HOA / Leasing / Amenities tabs). */
const H = {
  key: env("RESIAIMS_HOA_KEY_COL", "HOA_KEY"),
  id: env("RESIAIMS_HOA_ID_COL", "HOA_ID"),
  currentFlag: env("RESIAIMS_HOA_CURRENT_FLAG_COL", CURRENT_FLAG_COL),
  name: env("RESIAIMS_HOA_NAME_COL", "HOA_NAME"),
  address: env("RESIAIMS_HOA_ADDRESS_COL", "HOA_ADDRESS"),
  city: env("RESIAIMS_HOA_CITY_COL", "HOA_CITY"),
  state: env("RESIAIMS_HOA_STATE_COL", "HOA_STATE"),
  zip: env("RESIAIMS_HOA_ZIP_COL", "HOA_ZIPCODE"),
  websiteAddress: env("RESIAIMS_HOA_WEBSITE_COL", "WEBSITE_ADDRESS"),
  websiteUsername: env("RESIAIMS_HOA_WEBSITE_USER_COL", "WEBSITE_USERNAME"),
  accessCodesCompleted: env(
    "RESIAIMS_HOA_ACCESS_CODES_COMPLETED_COL",
    "ACCESS_CODES_COMPLETED",
  ),
  // Primary point of contact (POC_1_*)
  pocName: env("RESIAIMS_HOA_POC_NAME_COL", "POC_1_NAME"),
  pocTitle: env("RESIAIMS_HOA_POC_TITLE_COL", "POC_1_TITLE"),
  pocPhone: env("RESIAIMS_HOA_POC_PHONE_COL", "POC_1_PHONE_NUMBER"),
  pocEmail: env("RESIAIMS_HOA_POC_EMAIL_COL", "POC_1_EMAIL"),
  // Secondary contact (CONTACT_*)
  contactName: env("RESIAIMS_HOA_CONTACT_NAME_COL", "CONTACT_NAME"),
  contactPhone: env("RESIAIMS_HOA_CONTACT_PHONE_COL", "CONTACT_PHONE"),
  contactEmail: env("RESIAIMS_HOA_CONTACT_EMAIL_COL", "CONTACT_EMAIL"),
  // Management company
  mgmtCompany: env("RESIAIMS_HOA_MGMT_COMPANY_COL", "MANAGEMENT_COMPANY_NAME"),
  mgmtContactName: env(
    "RESIAIMS_HOA_MGMT_CONTACT_NAME_COL",
    "MANAGEMENT_CONTACT_NAME",
  ),
  mgmtContactPhone: env(
    "RESIAIMS_HOA_MGMT_CONTACT_PHONE_COL",
    "MANAGEMENT_CONTACT_PHONE",
  ),
  mgmtEmail: env("RESIAIMS_HOA_MGMT_EMAIL_COL", "MANAGEMENT_EMAIL"),
  mgmtAddress: env("RESIAIMS_HOA_MGMT_ADDRESS_COL", "MANAGEMENT_COMPANY_ADDRESS"),
  mgmtCity: env("RESIAIMS_HOA_MGMT_CITY_COL", "MANAGEMENT_COMPANY_CITY"),
  mgmtState: env("RESIAIMS_HOA_MGMT_STATE_COL", "MANAGEMENT_COMPANY_STATE"),
  mgmtZip: env("RESIAIMS_HOA_MGMT_ZIP_COL", "MANAGEMENT_COMPANY_ZIP"),
  mgmtPocName: env("RESIAIMS_HOA_MGMT_POC_NAME_COL", "MANAGEMENT_COMPANY_POC_1"),
  mgmtPocTitle: env(
    "RESIAIMS_HOA_MGMT_POC_TITLE_COL",
    "MANAGEMENT_COMPANY_POC_1_TITLE",
  ),
  mgmtPocPhone: env(
    "RESIAIMS_HOA_MGMT_POC_PHONE_COL",
    "MANAGEMENT_COMPANY_POC_1_PHONE",
  ),
  mgmtPocEmail: env(
    "RESIAIMS_HOA_MGMT_POC_EMAIL_COL",
    "MANAGEMENT_COMPANY_POC_1_EMAIL",
  ),
  // Assessment
  assessmentDues: env("RESIAIMS_HOA_ASSESSMENT_DUES_COL", "ASSESSMENT_DUES"),
  assessmentFrequency: env(
    "RESIAIMS_HOA_ASSESSMENT_FREQ_COL",
    "ASSESSMENT_FREQUENCY",
  ),
  specialAssessmentDues: env(
    "RESIAIMS_HOA_SPECIAL_ASSESSMENT_COL",
    "SPECIAL_ASSESSMENT_DUES",
  ),
  fiscalYearStart: env("RESIAIMS_HOA_FISCAL_YEAR_COL", "FISCAL_YEAR_START"),
  paymentWebsite: env("RESIAIMS_HOA_PAYMENT_WEBSITE_COL", "PAYMENT_WEBSITE"),
};

/** FCT_HOA_ACCUM columns (association status + assessment rollup). */
const ACC = {
  hoaKey: env("RESIAIMS_ACCUM_FK_COL", "HOA_KEY"),
  status: env("RESIAIMS_ACCUM_STATUS_COL", "HOA_STATUS"),
  totalAssessmentAmount: env(
    "RESIAIMS_ACCUM_TOTAL_ASSESSMENT_COL",
    "TOTAL_ASSESSMENT_AMOUNT",
  ),
  periodicity: env("RESIAIMS_ACCUM_PERIODICITY_COL", "PERIODICITY"),
};

/** FCT_HOA_ACCESS_CODE_ACCUM columns (Access Codes tab). */
const AC = {
  hoaKey: env("RESIAIMS_ACCESS_CODES_FK_COL", "HOA_KEY"),
  accessFor: env("RESIAIMS_ACCESS_FOR_COL", "ACCESS_FOR"),
  accessTo: env("RESIAIMS_ACCESS_TO_COL", "ACCESS_TO"),
  available: env("RESIAIMS_ACCESS_AVAILABLE_COL", "ACCESS_AVAILABLE"),
  control: env("RESIAIMS_ACCESS_CONTROL_COL", "ACCESS_CONTROL"),
  controlCost: env("RESIAIMS_ACCESS_CONTROL_COST_COL", "ACCESS_CONTROL_COST"),
  description: env("RESIAIMS_ACCESS_DESCRIPTION_COL", "ACCESS_DESCRIPTION"),
  contactName: env("RESIAIMS_ACCESS_CONTACT_NAME_COL", "ACCESS_CONTACT_NAME"),
  contactEmail: env("RESIAIMS_ACCESS_CONTACT_EMAIL_COL", "ACCESS_CONTACT_EMAIL"),
  formExist: env("RESIAIMS_ACCESS_FORM_EXIST_COL", "ACCESS_FORM_EXIST"),
  notes: env("RESIAIMS_ACCESS_NOTES_COL", "NOTES"),
  position: env("RESIAIMS_ACCESS_POSITION_COL", "POSITION"),
};

/** FCT_HOA_PROPERTY columns (association ⇄ property map + inspections). */
const HP = {
  hoaKey: env("RESIAIMS_HOA_PROPERTY_FK_COL", "HOA_KEY"),
  propertyKey: env("RESIAIMS_HOA_PROPERTY_PROP_KEY_COL", "PROPERTY_KEY"),
  accountNumber: env("RESIAIMS_HOA_PROPERTY_ACCOUNT_COL", "ACCOUNT_NUMBER"),
  status: env("RESIAIMS_HOA_PROPERTY_STATUS_COL", "STATUS"),
  dueAmount: env("RESIAIMS_HOA_PROPERTY_DUE_COL", "DUE_AMOUNT"),
  chimneyInspection: env(
    "RESIAIMS_HOA_PROPERTY_CHIMNEY_COL",
    "CHIMNEY_LAST_INSPECTION_DATE",
  ),
  dryerInspection: env(
    "RESIAIMS_HOA_PROPERTY_DRYER_COL",
    "DRYER_LAST_INSPECTION_DATE",
  ),
  hvacInspection: env(
    "RESIAIMS_HOA_PROPERTY_HVAC_COL",
    "HVAC_LAST_INSPECTION_DATE",
  ),
  fireInspection: env(
    "RESIAIMS_HOA_PROPERTY_FIRE_COL",
    "FIRE_LAST_INSPECTION_DATE",
  ),
};

/** DIM_PROPERTY columns. */
const P = {
  key: env("RESIAIMS_PROPERTY_KEY_COL", "PROPERTY_KEY"),
  currentFlag: env("RESIAIMS_PROPERTY_CURRENT_FLAG_COL", CURRENT_FLAG_COL),
  fullAddress: env("RESIAIMS_PROPERTY_FULL_ADDRESS_COL", "FULL_ADDRESS"),
  address: env("RESIAIMS_PROPERTY_ADDRESS_COL", "ADDRESS"),
  state: env("RESIAIMS_PROPERTY_STATE_COL", "PROPERTY_STATE"),
  zip: env("RESIAIMS_PROPERTY_ZIP_COL", "ZIPCODE"),
  status: env("RESIAIMS_PROPERTY_STATUS_COL", "PROPERTY_STATUS"),
};

/**
 * Flag columns rendered as label/value lists. DIM_HOA stores these as free
 * text (typically Y/N, but sometimes descriptive), so we surface the raw
 * value and let the UI decide. Grouped to mirror the ResiAIMS tabs.
 */
const AMENITY_FLAGS: Array<[keyof typeof AMENITY_COLS, string]> = [
  ["swimmingPool", "Swimming pool"],
  ["tennisCourt", "Tennis court"],
  ["fitnessCenter", "Fitness center"],
  ["golfCourse", "Golf course"],
  ["clubHouse", "Community club house"],
  ["archReview", "Architectural review committee"],
];
const AMENITY_COLS = {
  swimmingPool: env("RESIAIMS_HOA_POOL_COL", "SWIMMING_POOL"),
  tennisCourt: env("RESIAIMS_HOA_TENNIS_COL", "TENNIS_COURT"),
  fitnessCenter: env("RESIAIMS_HOA_FITNESS_COL", "FITNESS_CENTER"),
  golfCourse: env("RESIAIMS_HOA_GOLF_COL", "GOLF_COURSE"),
  clubHouse: env("RESIAIMS_HOA_CLUBHOUSE_COL", "COMMUNITY_CLUB_HOUSE"),
  archReview: env("RESIAIMS_HOA_ARCH_REVIEW_COL", "ARCH_REVIEW_COMMITTEE"),
};

const UTILITY_FLAGS: Array<[keyof typeof UTILITY_COLS, string]> = [
  ["gas", "Gas"],
  ["electricity", "Electricity"],
  ["water", "Water"],
  ["sewer", "Sewer"],
  ["trash", "Trash"],
  ["cableInternet", "Cable / internet"],
  ["pestControl", "Pest control"],
  ["landscaping", "Landscaping"],
  ["snowRemoval", "Snow removal"],
  ["parkingAssigned", "Parking assigned"],
  ["parkingFee", "Parking fee"],
  ["assignedMailbox", "Assigned mailbox"],
  ["mailboxAccess", "Mailbox access"],
];
const UTILITY_COLS = {
  gas: env("RESIAIMS_HOA_GAS_COL", "GAS"),
  electricity: env("RESIAIMS_HOA_ELECTRICITY_COL", "ELECTRICITY"),
  water: env("RESIAIMS_HOA_WATER_COL", "WATER"),
  sewer: env("RESIAIMS_HOA_SEWER_COL", "SEWER"),
  trash: env("RESIAIMS_HOA_TRASH_COL", "TRASH"),
  cableInternet: env("RESIAIMS_HOA_CABLE_COL", "CABEL_INTERNET"),
  pestControl: env("RESIAIMS_HOA_PEST_COL", "PEST_CONTROL"),
  landscaping: env("RESIAIMS_HOA_LANDSCAPING_COL", "LANDSCAPING"),
  snowRemoval: env("RESIAIMS_HOA_SNOW_COL", "SNOW_REMOVAL"),
  parkingAssigned: env("RESIAIMS_HOA_PARKING_ASSIGNED_COL", "PARKING_ASSIGNED"),
  parkingFee: env("RESIAIMS_HOA_PARKING_FEE_COL", "PARKING_FEE"),
  assignedMailbox: env("RESIAIMS_HOA_ASSIGNED_MAILBOX_COL", "ASSIGNED_MAILBOX"),
  mailboxAccess: env("RESIAIMS_HOA_MAILBOX_ACCESS_COL", "MAILBOX_ACCESS"),
};

const LEASING_FLAGS: Array<[keyof typeof LEASING_COLS, string]> = [
  ["leasingPermitted", "Leasing permitted"],
  ["tenantApproval", "Tenant approval required"],
  ["tenantApplication", "Tenant application required"],
  ["leaseLicense", "Lease license required"],
  ["leaseApproval", "Lease approval required"],
  ["appFeeRequired", "Association app fee required"],
  ["appFee", "Association app fee"],
  ["backgroundCheck", "Background check required"],
  ["backgroundCheckResp", "Background check responsibility"],
  ["moveInFeeRequired", "Move-in fee required"],
  ["moveInFeeAmount", "Move-in fee amount"],
  ["petAllowed", "Pets allowed"],
  ["petRestrictions", "Pet restrictions"],
];
const LEASING_COLS = {
  leasingPermitted: env("RESIAIMS_HOA_LEASING_PERMITTED_COL", "LEASING_PERMITTED"),
  tenantApproval: env(
    "RESIAIMS_HOA_TENANT_APPROVAL_COL",
    "TENANT_APPROVAL_REQUIRED",
  ),
  tenantApplication: env(
    "RESIAIMS_HOA_TENANT_APPLICATION_COL",
    "TENANT_APPLICATION_REQUIRED",
  ),
  leaseLicense: env("RESIAIMS_HOA_LEASE_LICENSE_COL", "LEASE_LICENSE_REQUIRED"),
  leaseApproval: env("RESIAIMS_HOA_LEASE_APPROVAL_COL", "LEASE_APPROVAL_REQUIRED"),
  appFeeRequired: env(
    "RESIAIMS_HOA_APP_FEE_REQUIRED_COL",
    "ASSOCIATION_APP_FEE_REQUIRED",
  ),
  appFee: env("RESIAIMS_HOA_APP_FEE_COL", "ASSOCIATION_APP_FEE"),
  backgroundCheck: env(
    "RESIAIMS_HOA_BACKGROUND_CHECK_COL",
    "BACKGROUND_CHECK_REQUIRED",
  ),
  backgroundCheckResp: env(
    "RESIAIMS_HOA_BACKGROUND_CHECK_RESP_COL",
    "BACKGROUND_CHECK_RESPONSIBILITY",
  ),
  moveInFeeRequired: env(
    "RESIAIMS_HOA_MOVE_IN_FEE_REQUIRED_COL",
    "ASSOCIATION_MOVE_IN_FEE_REQUIRED",
  ),
  moveInFeeAmount: env(
    "RESIAIMS_HOA_MOVE_IN_FEE_AMOUNT_COL",
    "ASSOCIATION_MOVE_IN_FEE_AMOUNT",
  ),
  petAllowed: env("RESIAIMS_HOA_PET_ALLOWED_COL", "PET_ALLOWED"),
  petRestrictions: env("RESIAIMS_HOA_PET_RESTRICTIONS_COL", "PET_RESTRICTIONS"),
};

// ── Types ───────────────────────────────────────────────────────────────

export type Address = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type Contact = {
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
};

export type Field = { label: string; value: string | null };

export type Management = {
  company: string | null;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  address: Address;
  poc: Contact;
};

export type Assessment = {
  dues: string | null;
  frequency: string | null;
  specialAssessmentDues: string | null;
  fiscalYearStart: string | null;
  paymentWebsite: string | null;
  totalAssessmentAmount: string | null;
  periodicity: string | null;
};

export type AccessCode = {
  accessFor: string | null;
  accessTo: string | null;
  available: string | null;
  control: string | null;
  controlCost: string | null;
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  formExist: string | null;
  notes: string | null;
};

export type PropertyInspections = {
  chimney: string | null;
  dryer: string | null;
  hvac: string | null;
  fire: string | null;
};

export type LinkedProperty = {
  propertyKey: string | null;
  address: string | null;
  state: string | null;
  zip: string | null;
  propertyStatus: string | null;
  hoaPropertyStatus: string | null;
  accountNumber: string | null;
  dueAmount: string | null;
  inspections: PropertyInspections;
};

export type AssociationSummary = {
  id: string;
  hoaId: string | null;
  name: string | null;
  status: string | null;
  managementCompany: string | null;
  city: string | null;
  state: string | null;
  propertyCount: number;
};

export type Association = {
  id: string;
  hoaId: string | null;
  name: string | null;
  status: string | null;
  address: Address;
  website: { address: string | null; username: string | null };
  accessCodesCompleted: string | null;
  primaryContact: Contact;
  altContact: { name: string | null; phone: string | null; email: string | null };
  management: Management;
  assessment: Assessment;
  leasing: Field[];
  amenities: Field[];
  utilities: Field[];
  accessCodes: AccessCode[];
  properties: LinkedProperty[];
  propertyCount: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Normalize a cell to a trimmed string, or null when empty/blank. */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Case-insensitive lookup: Snowflake returns UPPERCASE keys; be tolerant. */
function pick(row: SnowflakeRow, key: string): unknown {
  return row[key.toUpperCase()] ?? row[key.toLowerCase()] ?? row[key];
}

/** Build a label/value list from a flag-column group, keeping only set values. */
function flagFields(
  row: SnowflakeRow,
  cols: Record<string, string>,
  spec: Array<[string, string]>,
): Field[] {
  const out: Field[] = [];
  for (const [key, label] of spec) {
    const value = str(pick(row, cols[key]));
    if (value !== null) out.push({ label, value });
  }
  return out;
}

// ── Queries ────────────────────────────────────────────────────────────

/**
 * List all current associations with a count of the properties mapped to each.
 */
export async function listAssociations(
  limit = 500,
): Promise<AssociationSummary[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 10000);

  const sql = `
    SELECT
      h.${col(H.key)}          AS id,
      h.${col(H.id)}           AS hoa_id,
      h.${col(H.name)}         AS name,
      acc.${col(ACC.status)}   AS status,
      h.${col(H.mgmtCompany)}  AS management_company,
      h.${col(H.city)}         AS city,
      h.${col(H.state)}        AS state,
      COUNT(DISTINCT m.${col(HP.propertyKey)}) AS property_count
    FROM ${T.hoa} h
    LEFT JOIN ${T.hoaProperty} m ON m.${col(HP.hoaKey)} = h.${col(H.key)}
    LEFT JOIN ${T.hoaAccum} acc  ON acc.${col(ACC.hoaKey)} = h.${col(H.key)}
    WHERE h.${col(H.currentFlag)} = ?
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    ORDER BY name
    LIMIT ${safeLimit}
  `;

  const rows = await snowflakeQuery(sql, [CURRENT_FLAG_VAL]);
  return rows.map((r) => ({
    id: String(pick(r, "id") ?? ""),
    hoaId: str(pick(r, "hoa_id")),
    name: str(pick(r, "name")),
    status: str(pick(r, "status")),
    managementCompany: str(pick(r, "management_company")),
    city: str(pick(r, "city")),
    state: str(pick(r, "state")),
    propertyCount: num(pick(r, "property_count")),
  }));
}

/**
 * Full detail for one association (by HOA_KEY): the HOA-tab record plus
 * leasing, amenities, access codes and the properties mapped to it (with
 * per-property inspection dates). Filtered by bound key. Returns null if none.
 */
export async function getAssociation(id: string): Promise<Association | null> {
  const headSql = `
    SELECT
      h.${col(H.key)} AS id, h.${col(H.id)} AS hoa_id, h.${col(H.name)} AS name,
      h.${col(H.address)} AS address, h.${col(H.city)} AS city,
      h.${col(H.state)} AS state, h.${col(H.zip)} AS zip,
      h.${col(H.websiteAddress)} AS website_address,
      h.${col(H.websiteUsername)} AS website_username,
      h.${col(H.accessCodesCompleted)} AS access_codes_completed,
      h.${col(H.pocName)} AS poc_name, h.${col(H.pocTitle)} AS poc_title,
      h.${col(H.pocPhone)} AS poc_phone, h.${col(H.pocEmail)} AS poc_email,
      h.${col(H.contactName)} AS contact_name, h.${col(H.contactPhone)} AS contact_phone,
      h.${col(H.contactEmail)} AS contact_email,
      h.${col(H.mgmtCompany)} AS mgmt_company, h.${col(H.mgmtContactName)} AS mgmt_contact_name,
      h.${col(H.mgmtContactPhone)} AS mgmt_contact_phone, h.${col(H.mgmtEmail)} AS mgmt_email,
      h.${col(H.mgmtAddress)} AS mgmt_address, h.${col(H.mgmtCity)} AS mgmt_city,
      h.${col(H.mgmtState)} AS mgmt_state, h.${col(H.mgmtZip)} AS mgmt_zip,
      h.${col(H.mgmtPocName)} AS mgmt_poc_name, h.${col(H.mgmtPocTitle)} AS mgmt_poc_title,
      h.${col(H.mgmtPocPhone)} AS mgmt_poc_phone, h.${col(H.mgmtPocEmail)} AS mgmt_poc_email,
      h.${col(H.assessmentDues)} AS assessment_dues,
      h.${col(H.assessmentFrequency)} AS assessment_frequency,
      h.${col(H.specialAssessmentDues)} AS special_assessment_dues,
      h.${col(H.fiscalYearStart)} AS fiscal_year_start,
      h.${col(H.paymentWebsite)} AS payment_website,
      acc.${col(ACC.status)} AS status,
      acc.${col(ACC.totalAssessmentAmount)} AS total_assessment_amount,
      acc.${col(ACC.periodicity)} AS periodicity,
      ${amenityCols("h")},
      ${utilityCols("h")},
      ${leasingCols("h")}
    FROM ${T.hoa} h
    LEFT JOIN ${T.hoaAccum} acc ON acc.${col(ACC.hoaKey)} = h.${col(H.key)}
    WHERE h.${col(H.key)} = ? AND h.${col(H.currentFlag)} = ?
    LIMIT 1
  `;

  const [head] = await snowflakeQuery(headSql, [id, CURRENT_FLAG_VAL]);
  if (!head) return null;

  const [accessCodes, properties] = await Promise.all([
    getAccessCodes(id),
    getPropertiesForAssociation(id),
  ]);

  return {
    id: String(pick(head, "id") ?? id),
    hoaId: str(pick(head, "hoa_id")),
    name: str(pick(head, "name")),
    status: str(pick(head, "status")),
    address: {
      address: str(pick(head, "address")),
      city: str(pick(head, "city")),
      state: str(pick(head, "state")),
      zip: str(pick(head, "zip")),
    },
    website: {
      address: str(pick(head, "website_address")),
      username: str(pick(head, "website_username")),
    },
    accessCodesCompleted: str(pick(head, "access_codes_completed")),
    primaryContact: {
      name: str(pick(head, "poc_name")),
      title: str(pick(head, "poc_title")),
      phone: str(pick(head, "poc_phone")),
      email: str(pick(head, "poc_email")),
    },
    altContact: {
      name: str(pick(head, "contact_name")),
      phone: str(pick(head, "contact_phone")),
      email: str(pick(head, "contact_email")),
    },
    management: {
      company: str(pick(head, "mgmt_company")),
      contactName: str(pick(head, "mgmt_contact_name")),
      contactPhone: str(pick(head, "mgmt_contact_phone")),
      email: str(pick(head, "mgmt_email")),
      address: {
        address: str(pick(head, "mgmt_address")),
        city: str(pick(head, "mgmt_city")),
        state: str(pick(head, "mgmt_state")),
        zip: str(pick(head, "mgmt_zip")),
      },
      poc: {
        name: str(pick(head, "mgmt_poc_name")),
        title: str(pick(head, "mgmt_poc_title")),
        phone: str(pick(head, "mgmt_poc_phone")),
        email: str(pick(head, "mgmt_poc_email")),
      },
    },
    assessment: {
      dues: str(pick(head, "assessment_dues")),
      frequency: str(pick(head, "assessment_frequency")),
      specialAssessmentDues: str(pick(head, "special_assessment_dues")),
      fiscalYearStart: str(pick(head, "fiscal_year_start")),
      paymentWebsite: str(pick(head, "payment_website")),
      totalAssessmentAmount: str(pick(head, "total_assessment_amount")),
      periodicity: str(pick(head, "periodicity")),
    },
    leasing: flagFields(head, LEASING_COLS, LEASING_FLAGS),
    amenities: flagFields(head, AMENITY_COLS, AMENITY_FLAGS),
    utilities: flagFields(head, UTILITY_COLS, UTILITY_FLAGS),
    accessCodes,
    properties,
    propertyCount: properties.length,
  };
}

/** SELECT fragment for the amenity flag columns, aliased to their raw names. */
function amenityCols(alias: string): string {
  return AMENITY_FLAGS.map(
    ([key]) => `${alias}.${col(AMENITY_COLS[key])} AS ${col(AMENITY_COLS[key])}`,
  ).join(", ");
}
function utilityCols(alias: string): string {
  return UTILITY_FLAGS.map(
    ([key]) => `${alias}.${col(UTILITY_COLS[key])} AS ${col(UTILITY_COLS[key])}`,
  ).join(", ");
}
function leasingCols(alias: string): string {
  return LEASING_FLAGS.map(
    ([key]) => `${alias}.${col(LEASING_COLS[key])} AS ${col(LEASING_COLS[key])}`,
  ).join(", ");
}

async function getAccessCodes(id: string): Promise<AccessCode[]> {
  const sql = `
    SELECT
      ${col(AC.accessFor)} AS access_for, ${col(AC.accessTo)} AS access_to,
      ${col(AC.available)} AS available, ${col(AC.control)} AS control,
      ${col(AC.controlCost)} AS control_cost, ${col(AC.description)} AS description,
      ${col(AC.contactName)} AS contact_name, ${col(AC.contactEmail)} AS contact_email,
      ${col(AC.formExist)} AS form_exist, ${col(AC.notes)} AS notes
    FROM ${T.accessCodes}
    WHERE ${col(AC.hoaKey)} = ?
    ORDER BY ${col(AC.position)}
  `;
  const rows = await snowflakeQuery(sql, [id]);
  return rows.map((r) => ({
    accessFor: str(pick(r, "access_for")),
    accessTo: str(pick(r, "access_to")),
    available: str(pick(r, "available")),
    control: str(pick(r, "control")),
    controlCost: str(pick(r, "control_cost")),
    description: str(pick(r, "description")),
    contactName: str(pick(r, "contact_name")),
    contactEmail: str(pick(r, "contact_email")),
    formExist: str(pick(r, "form_exist")),
    notes: str(pick(r, "notes")),
  }));
}

/** The properties mapped to an association (the "which properties belong here" answer). */
export async function getPropertiesForAssociation(
  id: string,
): Promise<LinkedProperty[]> {
  const sql = `
    SELECT
      m.${col(HP.propertyKey)} AS property_key,
      p.${col(P.fullAddress)}  AS full_address,
      p.${col(P.state)}        AS state,
      p.${col(P.zip)}          AS zip,
      p.${col(P.status)}       AS property_status,
      m.${col(HP.status)}      AS hoa_property_status,
      m.${col(HP.accountNumber)} AS account_number,
      m.${col(HP.dueAmount)}   AS due_amount,
      m.${col(HP.chimneyInspection)} AS chimney_inspection,
      m.${col(HP.dryerInspection)}   AS dryer_inspection,
      m.${col(HP.hvacInspection)}    AS hvac_inspection,
      m.${col(HP.fireInspection)}    AS fire_inspection
    FROM ${T.hoaProperty} m
    LEFT JOIN ${T.property} p
      ON p.${col(P.key)} = m.${col(HP.propertyKey)} AND p.${col(P.currentFlag)} = ?
    WHERE m.${col(HP.hoaKey)} = ?
    ORDER BY full_address
  `;
  const rows = await snowflakeQuery(sql, [CURRENT_FLAG_VAL, id]);
  return rows.map((r) => ({
    propertyKey: str(pick(r, "property_key")),
    address: str(pick(r, "full_address")),
    state: str(pick(r, "state")),
    zip: str(pick(r, "zip")),
    propertyStatus: str(pick(r, "property_status")),
    hoaPropertyStatus: str(pick(r, "hoa_property_status")),
    accountNumber: str(pick(r, "account_number")),
    dueAmount: str(pick(r, "due_amount")),
    inspections: {
      chimney: str(pick(r, "chimney_inspection")),
      dryer: str(pick(r, "dryer_inspection")),
      hvac: str(pick(r, "hvac_inspection")),
      fire: str(pick(r, "fire_inspection")),
    },
  }));
}

/**
 * The full flat property→association mapping across every association — one
 * row per mapped property, suitable for exporting the "which properties go to
 * which association" join in a single pull.
 */
export async function getPropertyAssociationMap(
  limit = 100000,
): Promise<
  Array<{
    propertyKey: string | null;
    address: string | null;
    state: string | null;
    zip: string | null;
    associationKey: string | null;
    associationId: string | null;
    associationName: string | null;
    accountNumber: string | null;
    hoaPropertyStatus: string | null;
  }>
> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000000);
  const sql = `
    SELECT
      m.${col(HP.propertyKey)} AS property_key,
      p.${col(P.fullAddress)}  AS address,
      p.${col(P.state)}        AS state,
      p.${col(P.zip)}          AS zip,
      h.${col(H.key)}          AS association_key,
      h.${col(H.id)}           AS association_id,
      h.${col(H.name)}         AS association_name,
      m.${col(HP.accountNumber)} AS account_number,
      m.${col(HP.status)}      AS hoa_property_status
    FROM ${T.hoaProperty} m
    LEFT JOIN ${T.hoa} h
      ON h.${col(H.key)} = m.${col(HP.hoaKey)} AND h.${col(H.currentFlag)} = ?
    LEFT JOIN ${T.property} p
      ON p.${col(P.key)} = m.${col(HP.propertyKey)} AND p.${col(P.currentFlag)} = ?
    ORDER BY association_name, address
    LIMIT ${safeLimit}
  `;
  const rows = await snowflakeQuery(sql, [CURRENT_FLAG_VAL, CURRENT_FLAG_VAL]);
  return rows.map((r) => ({
    propertyKey: str(pick(r, "property_key")),
    address: str(pick(r, "address")),
    state: str(pick(r, "state")),
    zip: str(pick(r, "zip")),
    associationKey: str(pick(r, "association_key")),
    associationId: str(pick(r, "association_id")),
    associationName: str(pick(r, "association_name")),
    accountNumber: str(pick(r, "account_number")),
    hoaPropertyStatus: str(pick(r, "hoa_property_status")),
  }));
}
