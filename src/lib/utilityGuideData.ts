/**
 * Point-in-time SNAPSHOT of the "RESIHOME- UTILITY GUIDE" Google Sheet.
 *
 * Source:  https://docs.google.com/spreadsheets/d/1nRXUX0_FdkZkVnZdvjYJF890gofryQ6U3b5ZMy9lJ70/edit
 * Captured: 2026-08-04
 *
 * This is reference data that changes slowly (providers, billing rules, provider
 * policies). It is transcribed here from the Sheet's tabs so the compliance app
 * can join it to live HubSpot records. To refresh: re-read the Sheet and update
 * the arrays below (or repoint the loader at a live Sheets pull) — the shape is
 * stable and the dashboard/API read only from these exports.
 *
 * SECURITY: provider portal PASSWORDS from the Sheet are intentionally omitted.
 * Only provider / website / username / a `hasPassword` flag are captured, matching
 * the repo's rule of never committing secrets (see src/lib/associations.ts).
 */

import type {
  Community,
  BuilderCommunity,
  OwnerRule,
  ProviderCredential,
  LeakAdjustment,
  ProviderIntel,
  LoaRequirement,
  MiscFee,
  CadenceTask,
  ResourceLink,
  ConserviceContact,
  Policy,
  UtilityType,
} from "./utilityGuide";

export const GUIDE_SOURCE_URL =
  "https://docs.google.com/spreadsheets/d/1nRXUX0_FdkZkVnZdvjYJF890gofryQ6U3b5ZMy9lJ70/edit";
export const GUIDE_SNAPSHOT_DATE = "2026-08-04";

export const UTILITY_TYPES: readonly UtilityType[] = [
  "ELECTRIC",
  "GAS",
  "WATER",
  "SEWER",
  "TRASH",
];

/**
 * State → Community utility matrix (the core tab). Responsibility columns are
 * captured as Electric / Water / Gas / Trash (sewer follows water); the
 * authoritative vacant-vs-occupied split lives on the owner/fund rule.
 */
export const COMMUNITIES: Community[] = [
  // ── AL ──
  {
    state: "AL",
    name: "Holly Anne",
    owner: "ROI",
    providers: {
      electric: "City of Huntsville",
      water: "Madison County Water",
      sewer: "HICO Utility (Conservice Paid)",
      gas: null,
      trash: "Madison County",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resident" },
    cost: null,
    notes: "HICO requires sewer to stay in the property owner name.",
  },
  {
    state: "AL",
    name: "Angela's Ridge",
    owner: "ROI",
    providers: {
      electric: "Huntsville",
      water: "Huntsville",
      sewer: "Huntsville",
      gas: null,
      trash: "Huntsville",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resident" },
    cost: null,
    notes: null,
  },
  // ── FL ──
  {
    state: "FL",
    name: "Cottages at Wildwood",
    owner: null,
    providers: {
      electric: "Seco Energy",
      water: "Master Bill",
      sewer: "Master Bill",
      gas: null,
      trash: "Master Bill",
    },
    billing: { electric: "Resident", water: "Resihome Billed", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: "Water/Trash are a monthly recurring charge (master-billed).",
  },
  {
    state: "FL",
    name: "Grove Parc THS",
    owner: null,
    providers: {
      electric: "Withlacoochee River Electric",
      water: "Pasco County",
      sewer: "Pasco County",
      gas: null,
      trash: "Waste Aid (County Solid Waste Fee)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: "Monthly bill thru Conservice, plus $8.33 recurring thru taxes.",
  },
  {
    state: "FL",
    name: "North Island Villas",
    owner: null,
    providers: {
      electric: "FPL",
      water: "City of Cocoa",
      sewer: "Brevard County (billed thru City of Cocoa)",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: null,
  },
  {
    state: "FL",
    name: "Oak Park Estates",
    owner: null,
    providers: {
      electric: "Duke Energy",
      water: "Hernando County Utilities",
      sewer: "Hernando County Utilities",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: null,
  },
  {
    state: "FL",
    name: "Wildwood Landing",
    owner: null,
    providers: {
      electric: "Seco Energy",
      water: "City of Wildwood",
      sewer: "City of Wildwood",
      gas: null,
      trash: "City of Wildwood",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  // ── GA ──
  {
    state: "GA",
    name: "Chandler Station",
    owner: null,
    providers: {
      electric: "Georgia Power",
      water: "Gwinnett County Water",
      sewer: "Gwinnett County Water",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: null,
  },
  {
    state: "GA",
    name: "Herrington Heights",
    owner: null,
    providers: {
      electric: "Georgia Power",
      water: "Gwinnett County",
      sewer: "Gwinnett County",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: "$24.14/mo (trash on ledger)",
    notes: "Trash billed monthly on ledger — $24.14.",
  },
  {
    state: "GA",
    name: "Highland Pointe",
    owner: "Rocklyn Homes",
    providers: {
      electric: "Georgia Power",
      water: "Macon Water Authority",
      sewer: "Macon Water Authority",
      gas: null,
      trash: "Ryland Environmental",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resident" },
    cost: null,
    notes: "Rocklyn (RH Macon LLC).",
  },
  {
    state: "GA",
    name: "Jodeco Landing",
    owner: null,
    providers: {
      electric: "GA Power",
      water: "Henry County Water",
      sewer: "Henry County Water",
      gas: null,
      trash: "Trash Away Sanitation",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  {
    state: "GA",
    name: "Jonesboro Crossing",
    owner: "DRC",
    providers: {
      electric: "Georgia Power",
      water: "Clayton County",
      sewer: "Clayton County",
      gas: null,
      trash: "Cycle Works Sanitation",
    },
    billing: { electric: "Conservice", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: "Exception: ALL utilities stay in owner name for Jonesboro Crossing.",
  },
  {
    state: "GA",
    name: "Kilough Pointe",
    owner: null,
    providers: {
      electric: "Sawnee EMC",
      water: "Etowah Water",
      sewer: "Etowah Water",
      gas: null,
      trash: "ARW",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  {
    state: "GA",
    name: "RoseBud",
    owner: null,
    providers: {
      electric: "Walton EMC",
      water: "Gwinnett County",
      sewer: "Gwinnett County",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: "$24.14/mo (trash on ledger)",
    notes: "Trash billed monthly on ledger — $24.14.",
  },
  {
    state: "GA",
    name: "Hamilton",
    owner: "Rocklyn Homes",
    providers: {
      electric: "City of LaGrange",
      water: "City of LaGrange",
      sewer: "City of LaGrange",
      gas: null,
      trash: "City of LaGrange (billed thru Resihome)",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resihome Billed" },
    cost: "$24/mo (trash)",
    notes: "Rocklyn (RH Hamilton Road LLC). ALL bundled minus trash; trash left in owner name (master agreement).",
  },
  {
    state: "GA",
    name: "North Pointe",
    owner: "Rocklyn Homes",
    providers: {
      electric: "Georgia Power",
      water: "City of Calhoun",
      sewer: "City of Calhoun",
      gas: null,
      trash: "City of Resaca",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resident" },
    cost: null,
    notes: "Rocklyn (RH North Pointe LLC). Trash one-time purchase; ~$50 set up.",
  },
  {
    state: "GA",
    name: "Parkway Pointe Crossing",
    owner: "Rocklyn Homes",
    providers: {
      electric: "Jackson EMC",
      water: "City of Winder",
      sewer: "City of Winder",
      gas: "City of Winder",
      trash: "City of Winder",
    },
    billing: { electric: "Resident", water: "Resident", gas: "Resident", trash: "Resident" },
    cost: null,
    notes: "Rocklyn (RR PARKWAY POINTE LLC — use this name for imports).",
  },
  {
    state: "GA",
    name: "Southport",
    owner: "Rocklyn Homes",
    providers: {
      electric: "Georgia Power",
      water: "Brunswick-Glynn County JWSC",
      sewer: "Brunswick-Glynn County JWSC",
      gas: null,
      trash: "Glynn County (on taxes; Republic hauler)",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resihome Billed" },
    cost: "$125/yr (~$10.42/mo)",
    notes: "Rocklyn (RH Southport Parkway LLC). Bin: 912-544-7111; missed pickup Republic 912-267-6400.",
  },
  {
    state: "GA",
    name: "Tranquil Gardens",
    owner: null,
    providers: {
      electric: "Cobb EMC",
      water: "Cherokee County Water and Sewerage Authority GA",
      sewer: "Cherokee County Water and Sewerage Authority GA",
      gas: null,
      trash: "Trash Taxi of Georgia",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: null,
  },
  // ── SC ──
  {
    state: "SC",
    name: "Buxton",
    owner: null,
    providers: {
      electric: "Blue Ridge Co-Op",
      water: "Powderville Water",
      sewer: "Powderville Water",
      gas: null,
      trash: "Northstar Waste Services",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  {
    state: "SC",
    name: "Clairbrook",
    owner: "Hudson Oak",
    providers: {
      electric: "CPW",
      water: "CPW",
      sewer: "CPW",
      gas: null,
      trash: "City of Greer - CPW",
    },
    billing: { electric: "Resident", water: "Resident", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: "Vacant home billing is internal.",
  },
  {
    state: "SC",
    name: "Copperleaf",
    owner: "Hudson Oak",
    providers: {
      electric: "Duke Energy",
      water: "City of Anderson",
      sewer: "City of Anderson",
      gas: "Piedmont Natural Gas",
      trash: "City of Anderson",
    },
    billing: { electric: "Resident", water: "Resident", gas: "Resident", trash: "Resident" },
    cost: null,
    notes: "Vacant home billing is internal.",
  },
  {
    state: "SC",
    name: "George Creek Villages",
    owner: null,
    providers: {
      electric: "Duke Energy",
      water: "Powderville Water",
      sewer: "Powderville Water",
      gas: null,
      trash: "Northstar Waste Services",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  {
    state: "SC",
    name: "Simmons Trace",
    owner: null,
    providers: {
      electric: "Duke Energy",
      water: "Spartanburg Water System",
      sewer: "Spartanburg Water System",
      gas: null,
      trash: "Spartan Waste",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  {
    state: "SC",
    name: "Turner Pointe",
    owner: null,
    providers: {
      electric: "Duke Energy",
      water: "Powderville Water",
      sewer: "Powderville Water",
      gas: null,
      trash: "Northstar Waste Services",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Conservice" },
    cost: null,
    notes: null,
  },
  // ── TN ──
  {
    state: "TN",
    name: "The Orchards",
    owner: null,
    providers: {
      electric: "Nashville Electric",
      water: "Madison Suburban Utility",
      sewer: "Madison Suburban Utility",
      gas: null,
      trash: "County (thru taxes)",
    },
    billing: { electric: "Resident", water: "Conservice", gas: "N/A", trash: "Resihome Billed" },
    cost: null,
    notes: "Trash: resident may take 3 kitchen bags/day to Metro Convenience free until bin arrives.",
  },
];

/**
 * Builder / owner rosters (DreamFinders, McKinley Homes, Rocklyn Homes).
 * Passwords / login secrets from the Sheet are not captured.
 */
export const BUILDER_COMMUNITIES: BuilderCommunity[] = [
  // DreamFinders
  {
    builder: "DreamFinders",
    entityName: "DFH Green River, LLC",
    community: "Sterling at Parker",
    state: null,
    providers: { electric: null, water: null, sewer: null, gas: null, trash: null },
    residentResponsible: null,
    ownerResponsible: null,
    notes: null,
  },
  // McKinley Homes — "The Collection" communities
  {
    builder: "McKinley Homes",
    entityName: "Array Park LLC",
    community: "The Collection at Array",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "City of Atlanta Water",
      sewer: "City of Atlanta Water",
      gas: null,
      trash: "TBD",
    },
    residentResponsible: null,
    ownerResponsible: null,
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "Oak Hill Residence Park LLC",
    community: "The Collection at Oak Hill",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "Bartow County Water Department",
      sewer: "Bartow County Water Department",
      gas: null,
      trash: "TBD",
    },
    residentResponsible: null,
    ownerResponsible: null,
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "Rivertown Park LLC",
    community: "The Collection at Brooke Rivertown",
    state: "GA",
    providers: {
      electric: "Greystone Power",
      water: "City of Atlanta Department of Watershed",
      sewer: "City of Atlanta Department of Watershed",
      gas: null,
      trash: "City of South Fulton (billed thru taxes)",
    },
    residentResponsible: "E/W/S",
    ownerResponsible: "T (billed thru resihome)",
    notes:
      "Trash: residents call 470-552-4311 or submit on cityofsouthfultonga.gov; delivered by Waste Pro (~3 days).",
  },
  {
    builder: "McKinley Homes",
    entityName: "Wiltshire Park LLC",
    community: "The Collection at Wilshire",
    state: "TN",
    providers: {
      electric: "Electric Power Board",
      water: "City of Chattanooga",
      sewer: "Tennessee American Water Company",
      gas: null,
      trash: "TBD",
    },
    residentResponsible: null,
    ownerResponsible: null,
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "Madison Park Residence LLC",
    community: "The Collection at Madison Farms",
    state: "AL",
    providers: {
      electric: "Athens Utilities",
      water: "Limestone County Water and Sewer Authority",
      sewer: "Madison Utilities",
      gas: null,
      trash: "Madison County Garbage",
    },
    residentResponsible: "ALL Utilities",
    ownerResponsible: null,
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "American Legion Investment, LLC",
    community: "The Collection at Pine Log",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "Rockdale County Water",
      sewer: "Rockdale County Water",
      gas: null,
      trash: "B&B Sanitation Services (Resident Bill Back)",
    },
    residentResponsible: "E/W/S",
    ownerResponsible: "T (billed thru resihome)",
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "Clark Farm Residence, LLC",
    community: "The Collection at Clark Farms",
    state: "GA",
    providers: {
      electric: "Jackson EMC",
      water: "City of Gainesville Water",
      sewer: "City of Gainesville Water",
      gas: null,
      trash: "Republic Service (Resident Bill Back)",
    },
    residentResponsible: "E/W/S",
    ownerResponsible: "T (billed thru resihome)",
    notes: null,
  },
  {
    builder: "McKinley Homes",
    entityName: "Kinsley Park LLC",
    community: "The Collection at Kinsley",
    state: "NC",
    providers: {
      electric: "Duke Energy",
      water: "City of Raleigh Water",
      sewer: "City of Raleigh Water",
      gas: "Enbridge Gas",
      trash: "City of Raleigh Water",
    },
    residentResponsible: "ALL Utilities",
    ownerResponsible: null,
    notes: null,
  },
  // Rocklyn Homes
  {
    builder: "Rocklyn Homes",
    entityName: "RH Hamilton Road LLC",
    community: "Hamilton",
    state: "GA",
    providers: {
      electric: "City of LaGrange",
      water: "City of LaGrange",
      sewer: "City of LaGrange",
      gas: null,
      trash: "City of LaGrange (billed thru Resihome)",
    },
    residentResponsible: "ALL (BUNDLED - NOT TRASH)",
    ownerResponsible: "Trash (Internal Activation/Deactivation)",
    notes: "Turned over to Conservice for bill date 12/17/2025. Trash billed thru City $24/mo.",
  },
  {
    builder: "Rocklyn Homes",
    entityName: "RH North Pointe LLC",
    community: "North Pointe",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "City of Calhoun",
      sewer: "City of Calhoun",
      gas: null,
      trash: "City of Resaca",
    },
    residentResponsible: "ALL",
    ownerResponsible: null,
    notes:
      "GA Power turned over to Conservice. City of Calhoun: verify payment status (Rocklyn handled last bill). Trash ~$50 set up only.",
  },
  {
    builder: "Rocklyn Homes",
    entityName: "RR PARKWAY POINTE LLC",
    community: "Parkway Pointe Crossing",
    state: "GA",
    providers: {
      electric: "Jackson EMC",
      water: "City of Winder",
      sewer: "City of Winder",
      gas: "City of Winder",
      trash: "City of Winder",
    },
    residentResponsible: "ALL",
    ownerResponsible: null,
    notes: "Use 'RR PARKWAY POINTE LLC' for imports.",
  },
  {
    builder: "Rocklyn Homes",
    entityName: "RH Southport Parkway LLC",
    community: "Southport",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "Brunswick-Glynn County JWSC",
      sewer: "Brunswick-Glynn County JWSC",
      gas: null,
      trash: "Glynn County (on taxes; Republic hauler)",
    },
    residentResponsible: "E/W/S",
    ownerResponsible: "Trash",
    notes:
      "GA Power → Conservice for bills after 11/12/2025; Brunswick → Conservice as of bill date 12/8/2025. Trash ~$125/yr, $10.42/mo.",
  },
  {
    builder: "Rocklyn Homes",
    entityName: "RH Lehigh Acres LLC",
    community: "Buckingham Village",
    state: "FL",
    providers: { electric: null, water: null, sewer: null, gas: null, trash: null },
    residentResponsible: null,
    ownerResponsible: null,
    notes: null,
  },
  {
    builder: "Rocklyn Homes",
    entityName: "RH Macon LLC",
    community: "Highland Pointe",
    state: "GA",
    providers: {
      electric: "Georgia Power",
      water: "Macon Water Authority",
      sewer: "Macon Water Authority",
      gas: null,
      trash: "Ryland Environmental",
    },
    residentResponsible: "ALL",
    ownerResponsible: null,
    notes: null,
  },
];

/**
 * Owner / client / fund utility-responsibility rules — the authoritative
 * "who handles what", keyed by the Entity ID prefix ResiHome uses.
 */
export const OWNER_RULES: OwnerRule[] = [
  {
    client: "SFR",
    entityPrefixes: ["RP"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident E/G, Conservice W/S/T (unless bundled)",
    notes: "SFR Fund.",
    rules: [
      "Electric/Gas go into the resident's name; all other utilities (W/S/T) stay in the owner's name.",
      "NC — all utilities go in the resident's name.",
      "Bundled utilities: if W/S/T shares a provider with E and/or G, the resident also puts that utility in their name.",
    ],
  },
  {
    client: "DRC",
    entityPrefixes: ["RB"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident E/G, Conservice W/S/T (unless bundled)",
    notes: "DRC Fund. Last digits of the entity ID are the lot number.",
    rules: [
      "Electric/Gas go into the resident's name; W/S/T stay in the owner's name.",
      "NC — all utilities go in the resident's name.",
      "Jonesboro Crossing — ALL utilities stay in owner name.",
    ],
  },
  {
    client: "Appreciation Homes",
    entityPrefixes: ["AH"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident",
    notes: null,
    rules: [
      "Only handle utilities for vacant homes through Conservice.",
      "Residents put utilities in their name at move-in.",
      "Exception: 4 AL homes that sold from RP to Appreciation stay on Resident billing until lease renewal (552 & 544 9th Ave, Pleasant Grove AL 35127; 11695 & 11683 Woodland Lake Rd, McCalla AL 35111).",
    ],
  },
  {
    client: "Hudson Oak",
    entityPrefixes: ["HO"],
    vacantUtilities: "RH in-house (internal)",
    occupiedUtilities: "Resident",
    notes: null,
    rules: [
      "Only handle utilities for vacant homes internally.",
      "Residents put utilities in their name at move-in.",
      "To close a deactivation ticket: have all final bills.",
      "To close an activation ticket: have the new account # and add it to the provider portal.",
    ],
  },
  {
    client: "ROI",
    entityPrefixes: ["ROI"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident E/W/T, Conservice S (Holly Anne); Resident all (Angela's)",
    notes: null,
    rules: [
      "Conservice handles vacant bills.",
      "Residents put all utilities in their name at move-in.",
      "Close a deactivation with a final bill; close an activation with a new account #.",
      "Holly Anne homes keep HICO sewer in owner name.",
    ],
  },
  {
    client: "Rocklyn Homes",
    entityPrefixes: ["RH"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident — ALL (per community; some bundled minus trash)",
    notes: "Per-community: Hamilton = bundled minus trash; North Pointe = trash one-time purchase.",
    rules: [
      "Conservice handles vacant bills.",
      "Conservice billing fee should be $10.99.",
      "Do NOT pass trash charges to Trustee-leased tenants (their leases don't call for it).",
      "Resihome-lease residents (leases after 11/10/2025): pass back trash charges.",
      "Eff 1/6/2026 residents put all utilities in their name.",
    ],
  },
  {
    client: "Newstar",
    entityPrefixes: ["NS"],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident — not trash",
    notes: null,
    rules: [
      "Conservice handles vacant bills.",
      "All Resihome leases: residents put utilities in their name, except trash (billed via the monthly resident benefit package).",
      "Trustee-leased: mixed bag — check the ledger monthly-charge table for a Conservice fee.",
      "DO NOT opt out of trash — master agreement for the whole community.",
    ],
  },
  {
    client: "RB FL Development",
    entityPrefixes: [],
    vacantUtilities: "Conservice",
    occupiedUtilities: "Resident electric, Conservice water",
    notes: "Trash on tax; homes are septic.",
    rules: [],
  },
  {
    client: "Keyvera Homes",
    entityPrefixes: [],
    vacantUtilities: null,
    occupiedUtilities: null,
    notes: null,
    rules: [
      "Activations done through the import process; the ticket will be in the activation pipeline.",
      "Trash is not included in activations.",
    ],
  },
];

/**
 * Provider portal access. Usernames captured; PASSWORDS deliberately omitted
 * (kept in the Sheet / a vault). `hasPassword` records that a secret exists.
 */
export const PROVIDER_CREDENTIALS: ProviderCredential[] = [
  {
    provider: "City of Cocoa FL",
    website: "https://cocoafl.firstbilling.com/Account/Login.aspx",
    username: "WriSingFam / Resibuilt / RHResFL",
    hasPassword: true,
    notes: "Multiple logins on file (via loginmanager.conservice.com).",
  },
  {
    provider: "City of Anderson SC",
    website: "https://bsaonline.com/Account/LogOn?uid=2535",
    username: "ResihomeUtilities",
    hasPassword: true,
    notes: null,
  },
  {
    provider: "GA Power",
    website:
      "https://customerservice2.southerncompany.com/BusinessServices/PropertyManagers/Landing?mnuopco=GPC",
    username: "ResihomeUtilities",
    hasPassword: true,
    notes: "Alt Encore login: EncoreMgmt.",
  },
  {
    provider: "Gas South",
    website: "https://manage.gassouth.com/",
    username: "ResiGa03 / RESICAPGEOR23f / ResiHGA02 / ResiGeorgia3 / ResiGeorgia2",
    hasPassword: true,
    notes: "Multiple logins on file.",
  },
  {
    provider: "Snapping Shoals EMC",
    website: null,
    username: null,
    hasPassword: false,
    notes: "Security questions — answer: MyDog (for ALL).",
  },
  {
    provider: "Georgia Power",
    website:
      "https://customerservice2.southerncompany.com/BusinessServices/PropertyManagers/Landing?mnuopco=GPC",
    username: "ResihomeUtilities",
    hasPassword: true,
    notes: "Accounts: Jonesboro Crossing, Oakwood Village, RH North Pointe LLC, RH Southport Parkway LLC.",
  },
  {
    provider: "City of Harrah",
    website: "https://www.justinter.net/ebill/ebill.asp?c=4295",
    username: "utiltiies@resicap.com",
    hasPassword: true,
    notes: null,
  },
  {
    provider: "Huntsville Utilities",
    website: null,
    username: "reoebill136 / reoebill189 / reoebill262 @conservice.com",
    hasPassword: true,
    notes: "Multiple Conservice REO ebill logins.",
  },
  {
    provider: "Cobb EMC",
    website: null,
    username: "resihome@conservice.com",
    hasPassword: true,
    notes: null,
  },
  {
    provider: "City of Gainesville Water",
    website: null,
    username: "lpinto@encorerental.com",
    hasPassword: true,
    notes: "Encore login.",
  },
  {
    provider: "City of Raleigh Water",
    website: null,
    username: "cwooten@encorerental.com",
    hasPassword: true,
    notes: "Encore login.",
  },
  {
    provider: "Duke Energy",
    website: null,
    username: "Hi@encorerental.com",
    hasPassword: true,
    notes: "Encore login.",
  },
  {
    provider: "Jackson EMC",
    website: null,
    username: "cwooten@encorerental.com",
    hasPassword: true,
    notes: "Encore login.",
  },
  {
    provider: "Enbridge Gas",
    website: null,
    username: "EncoreMgmt",
    hasPassword: true,
    notes: "Encore login.",
  },
];

/** Provider leak-adjustment policies (per state + provider). */
export const LEAK_ADJUSTMENTS: LeakAdjustment[] = [
  {
    state: "GA",
    provider: "Rockdale Water Resources",
    utilityType: "WATER",
    process: null,
    frequency: null,
    notes:
      "Does not offer adjustments for water that has entered the sewer system, such as toilet leaks.",
  },
  {
    state: "GA",
    provider: "Cherokee County Water and Sewer Authority",
    utilityType: "WATER",
    process: null,
    frequency: "1 every 3 years",
    notes: null,
  },
  {
    state: "IN",
    provider: "Citizens Energy Group",
    utilityType: "WATER",
    process: null,
    frequency: null,
    notes:
      "If the leak is plumbed into a drain (toilet/water heater) so it's not visible on the floor, it will not qualify.",
  },
  {
    state: "IN",
    provider: "Indiana American Water",
    utilityType: "WATER",
    process: null,
    frequency: "One per account lifetime",
    notes: "Only one leak adjustment for the entire time you own the account.",
  },
  {
    state: "OK",
    provider: "City of OK Utilities",
    utilityType: "WATER",
    process: null,
    frequency: "1 every 15 months",
    notes: "Does not offer adjustments for water that has entered the sewer system.",
  },
  {
    state: "TN",
    provider: "City of Trussvile",
    utilityType: "TRASH",
    process: null,
    frequency: null,
    notes: "3/13/2025 trash service free — they will start charging soon.",
  },
  {
    state: "TN",
    provider: "City of Lebanon",
    utilityType: "TRASH",
    process: null,
    frequency: null,
    notes: "Trash service is free.",
  },
  {
    state: "GA",
    provider: "Clayton County Water",
    utilityType: "WATER",
    process:
      "Credit request within 90 days of the work-order invoice (denied on day 91). Per Natalie (770-960-5200): safe from disconnect while the adjustment is processing — pay ~the normal bill amount to keep the eventual real bill lower.",
    frequency: "2 partial credits per 12 months per account",
    notes: null,
  },
  {
    state: "GA",
    provider: "City of Stockbridge",
    utilityType: "WATER",
    process:
      "Victoria (770) 389-7901. Adjustments within 3 months; plumber invoice required (Vaberhart@stockbridgega.org). Adjustments are for SEWER only — water through the system cannot be adjusted.",
    frequency: "1 per calendar year (per account)",
    notes: null,
  },
  {
    state: "FL",
    provider: "City of Deltona",
    utilityType: "WATER",
    process:
      "Brianna (386) 575-6800. Leak detected & repaired timely; account open/active with ≥6 months history; submit form within 30 days of the first affected bill; valid for up to two consecutive affected bills.",
    frequency: "1 courtesy leak adjustment / 12 months; 1 general courtesy adjustment / 24 months",
    notes: null,
  },
  {
    state: "TX",
    provider: "City of Dallas",
    utilityType: "WATER",
    process:
      "Caleb (214) 651-1441. Adjustment/credit request within 3 months of the first bill; investigation 45–90 days. Continue paying ~the normal bill during review.",
    frequency: "1 adjustment per 12 months",
    notes: null,
  },
  {
    state: "GA",
    provider: "City of Union City",
    utilityType: "WATER",
    process:
      "Adjustments are submitted to their 3rd-party insurer, Hanover Citizen's Insurance, 800-628-0250.",
    frequency: null,
    notes: null,
  },
  {
    state: "TX",
    provider: "City of Houston",
    utilityType: "WATER",
    process:
      "Universal Adjustment Request Form (houstonwater.org → Other Services → Download Forms). Submit with proof of repair to customer.service@houstontx.gov; 60–90 days to review; usage must decrease after repair. Follow up by phone next day 713-371-1400 and request an INVESTIGATIVE HOLD; call back every 30 days to extend. Pay the normal bill once it returns; do not pay the high bill unless denied.",
    frequency: "3 adjustments",
    notes: null,
  },
  {
    state: "TX",
    provider: "City of Arlington",
    utilityType: "WATER",
    process:
      "https://webapps.arlingtontx.gov/Water/LeakAdjustment/. Residential only; usage ≥2× the average of the same period over the prior 3 years (or 2× the city average); only the past 90 days, two consecutive months.",
    frequency: "No previous adjustment within the past 2 years",
    notes: null,
  },
  {
    state: "GA",
    provider: "Etowah Water",
    utilityType: "WATER",
    process:
      "Bills do NOT reflect the adjustment — request the account printout BEFORE submitting the credit request. Call Patti; she emails the account history to utilities@resicap.com.",
    frequency: null,
    notes: null,
  },
  {
    state: "AL",
    provider: "CAW - Birmingham Waterworks",
    utilityType: "WATER",
    process:
      "Request must include the repair bill; 8–12 weeks to review; advise the provider of the hold and pay current balances during review. Forms: caw-al.gov / jotform 250844813616055.",
    frequency: "2",
    notes: null,
  },
  {
    state: "FL",
    provider: "Pasco County Utilities",
    utilityType: "WATER",
    process:
      "Frances (Pasco County): the bill must go back down for 1–2 billing cycles; ~8–12 weeks to complete. Form: pasco.rja.revize.com/forms/11150.",
    frequency: null,
    notes: null,
  },
  {
    state: "AL",
    provider: "City of Calera",
    utilityType: "WATER",
    process:
      "Whitney. Adjustments take 45 days or more and cannot be processed until consumption returns to normal.",
    frequency: "One leak adjustment every three years per account",
    notes: null,
  },
  {
    state: "GA",
    provider: "Gwinnet County",
    utilityType: "WATER",
    process: "03/30/26 (Tina): billing cannot be paused while investigating the issue.",
    frequency: "Once in a 12-month time frame",
    notes: null,
  },
  {
    state: "FL",
    provider: "City of Northport",
    utilityType: "WATER",
    process: null,
    frequency: "Every 2 years",
    notes:
      "No adjustment in the last 2 years; ≥6 months billing history; usage exceeds 2 tiers above the average; current incidents only (last two months); max two consecutive billing periods.",
  },
  {
    state: "OK",
    provider: "City of Oklahoma City",
    utilityType: "WATER",
    process: null,
    frequency: null,
    notes:
      "Only qualifying adjustments: slab leaks, hidden pipe leaks, underground pipe leaks, and irrigation leaks.",
  },
  {
    state: "FL",
    provider: "Hernando County Utilities Dept",
    utilityType: "WATER",
    process: null,
    frequency: null,
    notes:
      "Does not offer adjustments for water that has entered the sewer system, such as toilet leaks.",
  },
];

/** Logged provider facts ("What We Should Know"). */
export const PROVIDER_INTEL: ProviderIntel[] = [
  {
    city: "Statesville",
    state: "NC",
    provider: "City of Statesville",
    dateReceived: "2025-05-07",
    utility: "WATER",
    whatToKnow:
      "STORMWATER AGREEMENT — if stormwater isn't listed at the top of the lease (or a stormwater form sent), it stays in the owner's name. Conservice currently receives/pays stormwater; we will maintain this.",
  },
  {
    city: "Hendersonville",
    state: "TN",
    provider: "City of Hendersonville",
    dateReceived: "2025-05-13",
    utility: "TRASH",
    whatToKnow: "Amy (615-822-1000): trash is billed thru property taxes; no separate line amount for trash.",
  },
  {
    city: "Stockbridge",
    state: "GA",
    provider: "City of Stockbridge",
    dateReceived: "2025-05-14",
    utility: "TRASH",
    whatToKnow:
      "Decius (678-373-6765) for 30 Allison Court, Stockbridge GA 30281: trash billed thru property taxes; provider is GFL.",
  },
  {
    city: "Covington",
    state: "GA",
    provider: "City of Covington",
    dateReceived: "2025-05-15",
    utility: "WATER",
    whatToKnow:
      "Stormwater (9190 SW Spillers Dr) stays in the owner's name; owner shows as Resicap Georgia owner per the tax assessor.",
  },
  {
    city: "Gwinnett County",
    state: "GA",
    provider: "Gwinnett County Solid Waste",
    dateReceived: "2025-05-28",
    utility: "TRASH",
    whatToKnow:
      "Myra (770.822.7141): resident must call to set up trash so they get service updates; for rentals the resident confirms who owns the property and the container needed.",
  },
  {
    city: "Adairsville",
    state: "GA",
    provider: "City of Adairsville",
    dateReceived: "2025-06-04",
    utility: "TRASH",
    whatToKnow: "Jennifer Willis: residents may call for extra bins. 2 bins ~$22.58 (1 bin $15.58).",
  },
  {
    city: null,
    state: null,
    provider: "GFL",
    dateReceived: "2025-06-25",
    utility: "TRASH",
    whatToKnow: "GFL bills 3 months in advance (e.g., June invoices cover Aug–Oct).",
  },
  {
    city: "Leesburg",
    state: "FL",
    provider: "City of Leesburg FL",
    dateReceived: "2025-07-09",
    utility: "ELECTRIC",
    whatToKnow:
      "Customer must terminate service or be cut for non-payment (ref 1609 Hoofprint Ct, Fruitland Park FL 34731).",
  },
  {
    city: "Madison",
    state: "TN",
    provider: "hubNashville / Trash on Taxes",
    dateReceived: "2025-08-01",
    utility: "TRASH",
    whatToKnow:
      "Trash billed thru property taxes (Roger). Resident may take 3 kitchen bags to Metro Convenience free/day meanwhile (939A Anderson Ln, Madison TN, 8:30–4:30). Best example: The Orchards (TN).",
  },
  {
    city: "Madison",
    state: "TN",
    provider: "Madison Suburban Utility District",
    dateReceived: "2025-08-08",
    utility: "WATER",
    whatToKnow:
      "615-868-3201. New construction: water-only accounts established; info sent to Metro for sewer. Sewer accounts can't be set directly with Metro — the meter/account number must transfer.",
  },
  {
    city: "Madison",
    state: "TN",
    provider: "Metro Water Services",
    dateReceived: "2025-08-08",
    utility: "SEWER",
    whatToKnow: "New construction (see above). Metro Water Services 615-862-4600 (Sherylyn).",
  },
  {
    city: "Temple",
    state: "GA",
    provider: "City of Temple",
    dateReceived: "2025-08-11",
    utility: "WATER",
    whatToKnow: "(770) 562-3369. Confirming billing cycle (e.g., 710 Ali St; bill 05/20–06/18; due 7/23).",
  },
  {
    city: "Miami-Dade County",
    state: "FL",
    provider: "Miami-Dade Water and Sewer Department",
    dateReceived: null,
    utility: "WATER",
    whatToKnow: "Quarterly billing.",
  },
  {
    city: "Anderson",
    state: "SC",
    provider: "Piedmont Natural Gas",
    dateReceived: "2025-08-15",
    utility: "GAS",
    whatToKnow:
      "425 Country Club Lane, Anderson SC 29625: no fee for manually activating gas under landlord agreement.",
  },
  {
    city: "Anderson",
    state: "SC",
    provider: "City of Anderson",
    dateReceived: "2025-08-15",
    utility: "WATER",
    whatToKnow:
      "425 Country Club Lane: no fee for manually activating water under landlord agreement.",
  },
  {
    city: "Greenfield",
    state: "IN",
    provider: "City of Greenfield",
    dateReceived: "2025-08-27",
    utility: "WATER",
    whatToKnow:
      "18 W Michigan St: stormwater stays in the owner/landlord name per Greenfield Code §54.06; may charge the tenant the monthly charge but must bill the owner.",
  },
  {
    city: "New Hope",
    state: "AL",
    provider: "Madison County Sanitation (billed by Huntsville)",
    dateReceived: "2025-09-10",
    utility: "TRASH",
    whatToKnow:
      "ROI Property Group, New Hope AL: residents set up trash via madisoncountyal.gov (Departments → Waste Control & Recycling → Service Request → New Residential Customer Request).",
  },
  {
    city: "Merritt Island",
    state: "FL",
    provider: "FPL",
    dateReceived: "2025-09-12",
    utility: "ELECTRIC",
    whatToKnow:
      "Zineb Elkadir 321-726-4808 (Service Planning PM). Handles COs and inspections for new construction. Call customer service, request a supervisor, and ask for the SPPM for your area.",
  },
  {
    city: "Dallas",
    state: "TX",
    provider: "City of Dallas",
    dateReceived: "2025-09-23",
    utility: "WATER",
    whatToKnow:
      "Caleb (214) 651-1441. Adjustment within 3 months of the first bill; 1 per 12 months; investigation 45–90 days.",
  },
  {
    city: "Hendersonville",
    state: "TN",
    provider: "Public Works",
    dateReceived: "2025-12-10",
    utility: "TRASH",
    whatToKnow: "Kelly 615.822.1016: trash billed thru property taxes; $299 annually.",
  },
  {
    city: "Simpsonville",
    state: "SC",
    provider: "City of Simpsonville Public Works",
    dateReceived: "2025-12-29",
    utility: "TRASH",
    whatToKnow:
      "Holly 864-967-9526: trash billed thru property taxes; amount depends on property value; no breakdown.",
  },
  {
    city: "Greenville County",
    state: "SC",
    provider: "Greater Greenville Sanitation",
    dateReceived: "2026-01-20",
    utility: "TRASH",
    whatToKnow:
      "Trash billed thru property taxes; base $210 + 4% millage on home value (2024: $237.49). (Stacy, info@ggsc.gov).",
  },
  {
    city: "Snellville",
    state: "GA",
    provider: "City of Snellville Public Works",
    dateReceived: "2026-02-19",
    utility: "TRASH",
    whatToKnow:
      "Rebecca 770-985-3527: residential trash billed thru property taxes; $240 annually.",
  },
  {
    city: "Oklahoma City",
    state: "OK",
    provider: "City of Oklahoma City",
    dateReceived: "2026-06-30",
    utility: "TRASH",
    whatToKnow:
      "Aleisha: standard is two trash bins for residential; removing one keeps the same monthly cost.",
  },
  {
    city: "Phoenix",
    state: "AZ",
    provider: "SRP",
    dateReceived: "2026-06-30",
    utility: "WATER",
    whatToKnow:
      "For RESICAP ARIZONA OWNER III LLC: reference number 943009894 identifies us as an authorized agent (WRP Water and Power).",
  },
  {
    city: "Katy",
    state: "TX",
    provider: "Centerpoint Energy",
    dateReceived: "2026-07-23",
    utility: "GAS",
    whatToKnow:
      "20942 Patriot Park Ln, Katy TX 77449: Claudia — can use a smart/electronic access code; account 6404409581-4. Another rep said an adult must be present even with a code.",
  },
];

/** Providers requiring a Letter of Authorization / account identifier. */
export const LOA_REQUIREMENTS: LoaRequirement[] = [
  { provider: "Dekalb County GA", required: "Letter of Authorization", responseReceived: "NO", requiredAnswer: null },
  { provider: "APS", required: "Letter of Authorization", responseReceived: null, requiredAnswer: null },
  { provider: "City of Oklahoma City OK", required: "Letter of Authorization", responseReceived: null, requiredAnswer: null },
  { provider: "SRP", required: "Letter of Authorization", responseReceived: null, requiredAnswer: null },
  { provider: "City of East Point", required: "Letter of Authorization", responseReceived: null, requiredAnswer: null },
  { provider: "TXU Energy 650638", required: "Letter of Authorization", responseReceived: null, requiredAnswer: null },
  { provider: "Snapping Shoals EMC", required: "Security Questions", responseReceived: null, requiredAnswer: "MyDog (for ALL)" },
];

/** Standard recurring fees (ledger / benefit package). */
export const MISC_FEES: MiscFee[] = [
  { service: "Smartlock fee", cost: "$10" },
  { service: "Landscaping", cost: "$35" },
  { service: "Washer/Dryer", cost: "$25" },
  { service: "Conservice fee", cost: "$10.99" },
];

/** Weekly processing cadence (Utilities team + PM). */
export const CADENCE: CadenceTask[] = [
  { team: "Utilities", task: "AIMS onboarding / utility import processing", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "Utilities", task: "Conservice exceptions processing (Fri: sent to PMs)", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "Utilities", task: "Adjustment / credit request processing", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "Utilities", task: "Conservice funding request", days: ["Mon", "Wed"] },
  { team: "Utilities", task: "Conservice tenant portal weekly audit (ResiHome Current Resident Data)", days: ["Mon"] },
  { team: "Utilities", task: "Final bill report processing (arrives Mon/Tue)", days: ["Mon"] },
  { team: "Utilities", task: "Multi-family funding request", days: ["Mon", "Wed", "Thu"] },
  { team: "Utilities", task: "Tenant move-outs", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "Utilities", task: "REO projects by action required", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "PM", task: "HubSpot deactivation tickets (Fri: updates only)", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "PM", task: "Tenant move-ins", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { team: "PM", task: "REO projects by action required", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
];

/** Reference links (Drive folders / sheets / docs). */
export const RESOURCES: ResourceLink[] = [
  {
    label: "Conservice Information sheet",
    url: "https://docs.google.com/spreadsheets/d/1GkGaba16nz6Xa-mOOvP-GSeVj5p60ZUZHZCpZvXKrRo/edit",
    note: "Conservice contact information + call agendas.",
  },
  {
    label: "Property Uploads (ResiAIMS reports)",
    url: "https://drive.google.com/drive/folders/0AC6FoeXidrCEUk9PVA",
    note: "Properties uploaded to ResiAIMS; reports compiled here.",
  },
  {
    label: 'Utilities "Working" folder',
    url: "https://drive.google.com/drive/folders/0APiNNFhmgmrxUk9PVA",
    note: "Activations / property imports; Utilities 101, basics, meter illustrations.",
  },
  {
    label: "Conservice Resident Data (weekly)",
    url: "https://docs.google.com/spreadsheets/d/1mnNa7v5srwikSgbB4dSALemjKdR1eiYlzaYu6_Fb2Yw/edit",
    note: "Weekly resident report — ResiHome Current Resident Data.",
  },
  {
    label: "Utility Terminology",
    url: "https://docs.google.com/document/d/1G_3E-qX_l9p0yKxAIbGco_aQAO3126qeFi4TZjBjaYo/edit",
    note: "Common utility-industry terms.",
  },
  {
    label: "Jonesboro Crossing — Georgia Power account #s",
    url: "https://drive.google.com/drive/folders/1LqDvNKfwa2FJzh4voeDgghoplqWOWTNb",
    note: "Account numbers for Jonesboro Crossing.",
  },
  {
    label: "Resicap Owner folder",
    url: "https://drive.google.com/drive/folders/0ANWppDvh1hzkUk9PVA",
    note: "AL / AZ / FL / GA / IN / NC / SC / TN / TX.",
  },
  {
    label: "Hudson Oaks onboarding sheet",
    url: "https://docs.google.com/spreadsheets/d/1YtrONL9l7z6RHQQBZnR9x6H4MSQPpwZd/edit",
    note: "Onboarding for Clairbrooke / Copperleaf.",
  },
];

/** Conservice contacts + routing emails. */
export const CONSERVICE_CONTACTS: ConserviceContact[] = [
  { purpose: "Phone", value: "844-858-9883" },
  { purpose: "Mailing address", value: "PO Box 4698, Logan, UT 84323" },
  { purpose: "General", value: "resihome@conservice.com" },
  { purpose: "Activate / deactivate service", value: "resihomegqc@conservice.com · activationsacs@conservice.com" },
  { purpose: "Resident billing", value: "resihomebilling@conservice.com" },
  { purpose: "Disconnects (previously on, disconnected)", value: "sfdisconnects@conservice.com" },
  { purpose: "New onboarded properties / imports", value: "sfimports@conservice.com" },
  { purpose: "Bills to process (transitions)", value: "sftransitions@conservice.com" },
  { purpose: "Leak adjustment requests", value: "SFleakadjustments@conservice.com" },
];

/** Standing billing / operating policies (call agendas, tips, misc). */
export const POLICIES: Policy[] = [
  { topic: "Resident billing start", detail: "Resident billing began 1/1/2024." },
  { topic: "Grace period", detail: "Resident grace period is 3 days." },
  { topic: "No Friday deactivations", detail: "Do not request deactivations on Fridays." },
  {
    topic: "Deactivation timing",
    detail:
      "Expected move-out date can be up to 3 weeks out. Winter: 7–10 days; summer: up to 3 weeks. 30 days is the standard deactivation window.",
  },
  { topic: "Renewals fee", detail: "$9.99 for renewals." },
  {
    topic: "Conservice billing cutoff",
    detail:
      "Cutoff is the 25th of each month — bills not paid before then aren't charged to the resident until the next month. Residents aren't billed until the bill in question is paid.",
  },
  {
    topic: "Inadvertent Opt-In",
    detail:
      "When Conservice is told a home is all-electric / HOA / billed on property taxes and won't have a normal invoice (meets an opt-out), Conservice reaches out to Resihome for approval before opting out.",
  },
  {
    topic: "Residents who haven't transferred accounts",
    detail:
      "Respond to Conservice 'proceed with deactivation' — residents have ample time. Only exception: utilities that can't be shut off until a new account is started.",
  },
  {
    topic: "Stormwater",
    detail:
      "In several jurisdictions stormwater stays in the owner's name (e.g., Statesville NC, Covington GA, Greenfield IN).",
  },
  {
    topic: "Activation / deactivation close criteria",
    detail:
      "Close an activation ticket with the new account # (added to the provider portal); close a deactivation ticket with the final bill(s).",
  },
];
