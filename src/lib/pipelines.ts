/**
 * HubSpot ticket-pipeline registry.
 *
 * A faithful, typed capture of every ticket pipeline and stage (with HubSpot
 * internal IDs) provided by the ops team, so the CTA / action-items dashboard
 * can monitor a configurable set of pipelines and resolve stage labels without
 * a live round-trip. Tickets are HubSpot object type `0-5`.
 *
 * `category` groups pipelines into operational domains (for the "group
 * pipelines by …" controls). `monitoredByDefault` marks the compliance /
 * utilities–relevant pipelines that the CTA board watches out of the box; the
 * dashboard can widen or narrow that set at runtime.
 *
 * Stage "openness" (is this an actionable stage, or a terminal/closed one) is
 * derived from the label by `isTerminalStageLabel` rather than hand-flagging
 * ~300 stages — a heuristic that's easy to review and override.
 */

export type HubSpotObjectType = {
  label: string;
  internalName: string;
  objectTypeId: string;
  kind: "Standard" | "Custom";
};

/** The standard CRM objects (tickets carry the pipelines below). */
export const OBJECT_TYPES: HubSpotObjectType[] = [
  { label: "Contacts", internalName: "contacts", objectTypeId: "0-1", kind: "Standard" },
  { label: "Companies", internalName: "companies", objectTypeId: "0-2", kind: "Standard" },
  { label: "Deals", internalName: "deals", objectTypeId: "0-3", kind: "Standard" },
  { label: "Tickets", internalName: "tickets", objectTypeId: "0-5", kind: "Standard" },
];

export const TICKETS_OBJECT_TYPE_ID = "0-5";

export type PipelineCategory =
  | "Utilities"
  | "Compliance"
  | "Leasing & Applications"
  | "Inspections & Maintenance"
  | "Accounting"
  | "Municipality & HOA"
  | "Support & Internal";

export type PipelineStage = {
  label: string;
  id: string;
};

export type Pipeline = {
  label: string;
  id: string;
  category: PipelineCategory;
  monitoredByDefault: boolean;
  stages: PipelineStage[];
};

/**
 * Labels that mark a terminal / non-actionable stage. Used to decide whether a
 * ticket belongs on the CTA (action-items) list. Deliberately conservative:
 * anything not matched is treated as "open / needs action".
 */
const TERMINAL_STAGE_RE =
  /\b(closed|cancel(?:ed|led)?|complete(?:d)?|denied|rejected|resolved|approved\s*-\s*complete|confirmed|final bill received|staying in owner|no utilities to activate|merged with|sent to accounting|check sent|referred|completed\/closed|complete\/closed)\b/i;

export function isTerminalStageLabel(label: string): boolean {
  return TERMINAL_STAGE_RE.test(label);
}

export function isOpenStageLabel(label: string): boolean {
  return !isTerminalStageLabel(label);
}

// ── The registry ────────────────────────────────────────────────────────────

export const PIPELINES: Pipeline[] = [
  {
    label: "IT Support",
    id: "58190136",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "115257433" },
      { label: "Waiting on user", id: "115257434" },
      { label: "Waiting on Support", id: "115257435" },
      { label: "Pending", id: "159139670" },
      { label: "Pending Approval", id: "121661756" },
      { label: "Closed - Complete", id: "115257436" },
      { label: "Closed - Canceled", id: "115192847" },
    ],
  },
  {
    label: "Compliance Issues",
    id: "81076231",
    category: "Compliance",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "153077089" },
      { label: "Investigating", id: "153077090" },
      { label: "Waiting on PM/APM/Agent", id: "153077091" },
      { label: "Waiting on Resident", id: "1107839417" },
      { label: "Occupancy Confirmation Required", id: "1064300863" },
      { label: "Pending Association/Municipality", id: "203759513" },
      { label: "Submitted to Conservice", id: "153028776" },
      { label: "Staying In Owners Name", id: "1104609871" },
      { label: "Utility-Pending Provider Adjustment", id: "227561095" },
      { label: "Utility-Pending Conservice Owner Credit", id: "1334362025" },
      { label: "Pending Credit", id: "1114790515" },
      { label: "Pending Credit Approval- Management", id: "1359597626" },
      { label: "Pending Eviction - Utilities In Owners' Name", id: "1104570133" },
      { label: "Pending Payment", id: "1166156552" },
      { label: "Pending Hearing", id: "1166119532" },
      { label: "Pending Inspection", id: "1166053511" },
      { label: "Submitted to PM Accounting", id: "1369363080" },
      { label: "Closed", id: "153077092" },
      { label: "Canceled", id: "153028777" },
    ],
  },
  {
    label: "Applications",
    id: "25689193",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "59340440" },
      { label: "Working", id: "59307072" },
      { label: "Closed Other", id: "60617733" },
      { label: "Need More Information", id: "59248185" },
      { label: "Changed Property", id: "82144631" },
      { label: "Application Approved- Needs New Property", id: "101283077" },
      { label: "Conditionally Approved", id: "59308329" },
      { label: "Fully Approved", id: "59308330" },
      { label: "Denied", id: "59308331" },
    ],
  },
  {
    label: "Data Warehouse Requests",
    id: "672633950",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "987339864" },
      { label: "Triaged", id: "987431754" },
      { label: "Waiting on User", id: "987339865" },
      { label: "Waiting on Support", id: "987339866" },
      { label: "User Acceptance Testing (UAT)", id: "987468604" },
      { label: "Ready for Release", id: "987339898" },
      { label: "Closed", id: "987339867" },
    ],
  },
  {
    label: "Enhancement Requests",
    id: "45472425",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New Enhancement", id: "93480344" },
      { label: "Triaged and Pending Prioritization", id: "111821489" },
      { label: "Prioritized", id: "93480345" },
      { label: "Requirement Gathering (including Reporting checks)", id: "93480346" },
      { label: "Building", id: "93480347" },
      { label: "Testing", id: "93468583" },
      { label: "Training & Go-Live", id: "93486637" },
      { label: "Enhancement Completed", id: "93483686" },
      { label: "Enhancement Canceled", id: "96354130" },
    ],
  },
  {
    label: "HAP Inspection Ticket",
    id: "159466017",
    category: "Inspections & Maintenance",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "266262448" },
      { label: "Inspection Scheduled", id: "266262449" },
      { label: "Inspection Fail WO Pending", id: "266262450" },
      { label: "Pending Re-Inspection", id: "266776421" },
      { label: "Inspection Failed", id: "266754160" },
      { label: "Inspection Pass (1st attempt)", id: "266262451" },
      { label: "Inspection Pass (2nd attempt)", id: "266776422" },
      { label: "Inspection Pass (3rd attempt)", id: "266776423" },
      { label: "Inspection Pass (4th attempt)", id: "266776424" },
      { label: "Inspection Pass (5th attempt)", id: "266776425" },
    ],
  },
  {
    label: "HAP Ticket Pipeline",
    id: "83766156",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "156875836" },
      { label: "Tenant Rent Increase Form Pending Signature", id: "156875837" },
      { label: "Renewal/rent Increase submitted to housing", id: "156875838" },
      { label: "Housing Counter Offer Rcvd", id: "156857390" },
      { label: "Renewal/Rent Increase approved by Housing", id: "156857391" },
      { label: "Renewal/Rent Increase declined , Addendum needed", id: "156857392" },
      { label: "Renewal/Rent Increase declined , Addendum Rcvd", id: "1345662759" },
      { label: "Closed", id: "156875839" },
    ],
  },
  {
    label: "Inspections",
    id: "25739582",
    category: "Inspections & Maintenance",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "59187114" },
      { label: "Assigned", id: "59187115" },
      { label: "Scheduled", id: "59187116" },
      { label: "Working", id: "59189378" },
      { label: "Pre-Move In Failed", id: "59413858" },
      { label: "Pre-Move In Pass", id: "59413857" },
      { label: "Complete/Closed", id: "59187117" },
      { label: "Changed Property", id: "82083198" },
    ],
  },
  {
    label: "Internal Transfer",
    id: "38498644",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "82119776" },
      { label: "Waiting on property manager", id: "82119777" },
      { label: "Moving through transfer process", id: "82119778" },
      { label: "Closed", id: "82119779" },
    ],
  },
  {
    label: "Leasing Pipeline",
    id: "24221766",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "57182756" },
      { label: "Assigned", id: "57182757" },
      { label: "Scheduled", id: "59713826" },
      { label: "Working", id: "57182758" },
      { label: "Complete/Closed", id: "59188010" },
      { label: "Changed Property", id: "82054794" },
    ],
  },
  {
    label: "Listing Pipeline",
    id: "717903892",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1047331142" },
      { label: "Working", id: "1047331143" },
      { label: "Waiting on other Team", id: "1047331144" },
      { label: "Complete / Closed", id: "1047331145" },
    ],
  },
  {
    label: "Maintenance Work Orders",
    id: "85507589",
    category: "Inspections & Maintenance",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "159831883" },
      { label: "Unbilled", id: "159834282" },
      { label: "Closed", id: "159831886" },
      { label: "Cancelled", id: "175790848" },
      { label: "Open", id: "175872905" },
      { label: "Work Order Requested", id: "175872906" },
      { label: "WO Accepted", id: "175872907" },
      { label: "Reschedule Needed", id: "175872908" },
      { label: "Rescheduled", id: "175872909" },
      { label: "Estimated", id: "175872910" },
      { label: "Re-estimate", id: "175872911" },
      { label: "WO Pending Completion", id: "175872912" },
      { label: "Change Requested", id: "175872913" },
      { label: "Changed Approved", id: "175872914" },
      { label: "Completed Awaiting Approval", id: "175872915" },
      { label: "Pending Re-work", id: "175872916" },
      { label: "Rejected", id: "175872917" },
      { label: "Estimate Reschedule Requested", id: "175872918" },
      { label: "WO Reschedule Requested", id: "175872919" },
      { label: "Awaiting Owner Approval", id: "175872920" },
      { label: "No Contact", id: "175872921" },
      { label: "Survey Feedback", id: "192628863" },
    ],
  },
  {
    label: "MLS Pipeline",
    id: "145831323",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "Open", id: "247638910" },
      { label: "Completed", id: "247638911" },
      { label: "Closed", id: "247638913" },
    ],
  },
  {
    label: "Pre-Lease Compliance",
    id: "82532219",
    category: "Compliance",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "155176716" },
      { label: "Working - Lease Required", id: "1166131722" },
      { label: "Approved - Complete", id: "155176719" },
      { label: "Not Approved - Pending Activation of Utilities", id: "219848865" },
      { label: "Not Approved - Pending CO", id: "219848866" },
      { label: "Not Approved - Pending Rental Registration", id: "219848867" },
      { label: "Not Approved - Pending Violation Clearance", id: "219848868" },
      { label: "Not Approved - Pending Inspection", id: "219848869" },
      { label: "Not Approved - Pending HOA", id: "1166166851" },
      { label: "Not approved - HOA Application Needed", id: "227626056" },
      { label: "Not Approved - HOA App and Lease Required", id: "999376953" },
      { label: "Not Approved - Closed", id: "157504176" },
      { label: "Canceled", id: "155206457" },
    ],
  },
  {
    label: "Pool Amenity Pipeline",
    id: "678640910",
    category: "Inspections & Maintenance",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "994530920" },
      { label: "Working", id: "994530921" },
      { label: "Yes", id: "994530922" },
      { label: "No", id: "994530923" },
    ],
  },
  {
    label: "Property Change",
    id: "35816340",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: 'HF PAID ONLY: Clear HF Info on Deal Object', id: "93959189" },
      { label: "Move Application to Under Review", id: "77505541" },
      { label: "Change Property in Application in Findigs", id: "77505542" },
      { label: 'Place Verified Income Ratio in the "Group Verified Income to Rent Ratio" field', id: "77505559" },
      { label: "Create New Screening Ticket", id: "77427112" },
      { label: "Complete Holding Fee and MIC Property Change Steps", id: "77008470" },
      { label: "Move Holding Fee Transaction ID to New Deal", id: "77505543" },
      { label: "Holding Fee Transfer Complete", id: "77427115" },
      { label: "Property Change Complete / Closed", id: "93959185" },
    ],
  },
  {
    label: "Screening Tickets",
    id: "82089327",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "154658926" },
      { label: "Working", id: "154782022" },
      { label: "Need More Information", id: "155194547" },
      { label: "Fully Approved", id: "154658927" },
      { label: "Conditionally Approved", id: "154658928" },
      { label: "Denied", id: "154658929" },
      { label: "Canceled", id: "154782023" },
      { label: "Application Approved- Needs New Property", id: "155189774" },
      { label: "Prop Change Closed - Complete", id: "182354432" },
      { label: "Pet Count Too High - Closed - Complete", id: "1130619944" },
      { label: "Merged with Other Applicant", id: "1130632795" },
    ],
  },
  {
    label: "Refund",
    id: "33923232",
    category: "Accounting",
    monitoredByDefault: false,
    stages: [
      { label: "RM Approval", id: "117779828" },
      { label: "Accounting to Process Refund", id: "74860340" },
      { label: "Approved - Closed", id: "74860342" },
      { label: "Denied - Closed", id: "74860341" },
      { label: "Canceled", id: "119903101" },
    ],
  },
  {
    label: "Renewal Tickets Pipeline",
    id: "102763599",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "186760785" },
      { label: "Working", id: "186760786" },
      { label: "Issue", id: "186760787" },
      { label: "Closed", id: "186760788" },
    ],
  },
  {
    label: "Rental Registration Inspection",
    id: "637614172",
    category: "Compliance",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "940990090" },
      { label: "Inspection Fail WO Pending", id: "940990092" },
      { label: "Inspection Scheduled", id: "940990091" },
      { label: "Pending Re-Inspection", id: "940876385" },
      { label: "Inspection Pass (1st attempt) - Complete", id: "940990093" },
      { label: "Inspection Pass (2nd attempt) - Complete", id: "940876386" },
      { label: "Inspection Pass (3rd attempt) - Complete", id: "940876387" },
      { label: "Inspection Pass (4th attempt) - Complete", id: "940876388" },
      { label: "Inspection Pass (5th attempt) - Complete", id: "940876389" },
    ],
  },
  {
    label: "Utilities Activation",
    id: "80932995",
    category: "Utilities",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "153030989" },
      { label: "Client Hold", id: "1410376079" },
      { label: "Working", id: "153030990" },
      { label: "Activation Submitted to Conservice", id: "153030991" },
      { label: "Occupancy Confirmation Required", id: "1086525593" },
      { label: "Pending Internal Activation", id: "1381726609" },
      { label: "Pending Internal Deposit", id: "1365057202" },
      { label: "Pending Provider Response", id: "212363436" },
      { label: "Waiting on ResiHome", id: "153026710" },
      { label: "Activation Confirmed", id: "153030992" },
      { label: "Closed", id: "208784927" },
      { label: "Cancelled", id: "208784928" },
      { label: "No Utilities to Activate", id: "212363437" },
    ],
  },
  {
    label: "Utilities Deactivation",
    id: "74152797",
    category: "Utilities",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "142276761" },
      { label: "Needs Attention", id: "171460627" },
      { label: "Working", id: "142405454" },
      { label: "Deactivation Submitted to Conservice", id: "142261864" },
      { label: "Pending BU Response", id: "182952083" },
      { label: "Occupancy Confirmation Required", id: "1086562097" },
      { label: "Waiting on us", id: "142405455" },
      { label: "Rocklyn Rock & Roll- Working (pending final bill)", id: "1325099320" },
      { label: "Rocklyn Rock & Roll- Pending Resident Bill Back (Final bill rcvd)", id: "1329261376" },
      { label: "(3rd Party, NC, Bundled) Pending Resident Bill Back (Final bill rcvd)- No Portal", id: "1395439530" },
      { label: "(3rd Party, NC, Bundled) Pending Resident Bill Back (Final bill rcvd)-Portal", id: "1395439142" },
      { label: "Deactivation Confirmed by Conservice", id: "142261865" },
      { label: "Final Bill Received", id: "142261866" },
      { label: "Canceled", id: "142405456" },
      { label: "Staying in Owner Name", id: "182953071" },
      { label: "Rocklyn Rock & Rock- Complete", id: "1325099321" },
    ],
  },
  {
    label: "Violations",
    id: "710375823",
    category: "Compliance",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1037871689" },
      { label: "Working", id: "1381714607" },
      { label: "Waiting on Resident", id: "1253076601" },
      { label: "Awaiting on PM", id: "1037871691" },
      { label: "Investigating", id: "1037871690" },
      { label: "Payment Sent", id: "1403587140" },
      { label: "Pending Association/Muni", id: "1037618972" },
      { label: "Pending Hearing", id: "1378707505" },
      { label: "Pending Inspection", id: "1253076602" },
      { label: "Pending Payment", id: "1253073834" },
      { label: "Resolved - Pending Secondary Violations", id: "1401757833" },
      { label: "Closed", id: "1037871692" },
      { label: "Canceled", id: "1037678099" },
    ],
  },
  {
    label: "Archive",
    id: "153941344",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "259678127" },
      { label: "Waiting on contact", id: "259678128" },
      { label: "Waiting on us", id: "259678129" },
      { label: "Closed", id: "259678130" },
    ],
  },
  {
    label: "Geekly Support",
    id: "26071865",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "59855133" },
      { label: "Geekly Waiting on Resicap", id: "59866712" },
      { label: "Geekly Working", id: "60521089" },
      { label: "Resicap Internal Final Review", id: "59810913" },
      { label: "Closed", id: "59855136" },
      { label: "On Hold", id: "1214503826" },
    ],
  },
  {
    label: "HoneyBadger / KMS Queue",
    id: "57968775",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "114803583" },
      { label: "Ready for BU Approval", id: "114803585" },
      { label: "Discovery - Not Started", id: "115306122" },
      { label: "Discovery - Working", id: "115345987" },
      { label: "Reqs Complete - Not Ready for Prioritization", id: "984412996" },
      { label: "Final Req Review & Prioritization Confirmation", id: "115345988" },
      { label: "Prioritized for KMS", id: "114889395" },
      { label: "Scheduled for Sprint (with KMS)", id: "114889396" },
      { label: "UAT Testing", id: "115345989" },
      { label: "Ready for Release", id: "115345990" },
      { label: "Closed - Complete", id: "114803586" },
      { label: "On Hold", id: "114894460" },
      { label: "Closed - Canceled", id: "115345991" },
    ],
  },
  {
    label: "New Leads",
    id: "40510471",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "85512073" },
      { label: "Waiting for Response", id: "85512074" },
      { label: "Follow Up Needed", id: "85512075" },
      { label: "Closed", id: "85512076" },
    ],
  },
  {
    label: "Leasing Support",
    id: "0",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1" },
      { label: "Waiting on Contact / Agent / Business", id: "2" },
      { label: "Waiting on Support Response", id: "3" },
      { label: "Closed", id: "4" },
    ],
  },
  {
    label: "Production Support (KMS)",
    id: "673313350",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "987514546" },
      { label: "Waiting on Contact", id: "987514547" },
      { label: "Waiting on Support", id: "987514548" },
      { label: "Pending", id: "1145643040" },
      { label: "Closed", id: "987514549" },
    ],
  },
  {
    label: "Survey Responses",
    id: "752693357",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1094583480" },
      { label: "Waiting on contact", id: "1094583481" },
      { label: "Waiting on us", id: "1094583552" },
      { label: "Closed", id: "1094583553" },
    ],
  },
  {
    label: "Fence Requests",
    id: "803165717",
    category: "Inspections & Maintenance",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1180930408" },
      { label: "Verifying Eligibility", id: "1181001589" },
      { label: "Pending HBPM Charge", id: "1181001590" },
      { label: "Pending Signed Addenda", id: "1181001591" },
      { label: "Pending Ledger Charges", id: "1181001592" },
      { label: "Awaiting Install", id: "1180915099" },
      { label: "Completed/Closed", id: "1180877986" },
      { label: "Cancel/Closed", id: "1180965491" },
    ],
  },
  {
    label: "PM Accounting",
    id: "836574598",
    category: "Accounting",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1242764369" },
      { label: "In Progress", id: "1242764370" },
      { label: "Pending Lease Addendum", id: "1337401249" },
      { label: "Pending Regional Approval", id: "1346959900" },
      { label: "Pending Utility Team", id: "1337392284" },
      { label: "Regional Approval Rcvd", id: "1356611186" },
      { label: "Waiting on External Response", id: "1314050167" },
      { label: "Waiting on PM", id: "1242764371" },
      { label: "Resolved", id: "1242751069" },
      { label: "Cancelled", id: "1242764372" },
      { label: "Closed- Credit Denied", id: "1356909391" },
    ],
  },
  {
    label: "Giftcard Approvals",
    id: "864359829",
    category: "Accounting",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1292721971" },
      { label: "Reviewing", id: "1292721972" },
      { label: "Approved", id: "1292721973" },
      { label: "Denied", id: "1292721974" },
      { label: "Completed", id: "1292721975" },
    ],
  },
  {
    label: "RE-SCREENING",
    id: "876200076",
    category: "Leasing & Applications",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1313098506" },
      { label: "Waiting On PM", id: "1313178458" },
      { label: "Under Review", id: "1313178459" },
      { label: "Approved", id: "1313738314" },
      { label: "Insufficient Income", id: "1313178460" },
      { label: "Closed / Cancelled", id: "1345946948" },
    ],
  },
  {
    label: "Municipality Verification",
    id: "887428875",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1335049495" },
      { label: "In Process", id: "1335049496" },
      { label: "Closed", id: "1335049497" },
    ],
  },
  {
    label: "Association Verification",
    id: "887434516",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1334736698" },
      { label: "In Process", id: "1334736699" },
      { label: "Closed", id: "1334736701" },
    ],
  },
  {
    label: "Title Orders",
    id: "887428786",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1334968374" },
      { label: "Submitted", id: "1334968375" },
      { label: "Waiting on ResiHome", id: "1334968376" },
      { label: "Completed", id: "1334968377" },
    ],
  },
  {
    label: "Municipality Order",
    id: "887431574",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1334923872" },
      { label: "Submitted", id: "1334923873" },
      { label: "Waiting on ResiHome", id: "1334923874" },
      { label: "Completed", id: "1334923875" },
    ],
  },
  {
    label: "Municipality Registrations",
    id: "887431583",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1334968736" },
      { label: "Pending", id: "1334968737" },
      { label: "Check Sent", id: "1334968738" },
      { label: "Closed", id: "1334968739" },
    ],
  },
  {
    label: "Municipality Annual Assessment",
    id: "887432538",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1334930047" },
      { label: "In Process", id: "1334930048" },
      { label: "Rejected", id: "1334968904" },
      { label: "Sent to Accounting", id: "1334930049" },
      { label: "Closed", id: "1334930050" },
    ],
  },
  {
    label: "HOA Annual Assessment",
    id: "887434548",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1335049869" },
      { label: "In Process", id: "1335049870" },
      { label: "Rejected", id: "1335049871" },
      { label: "Sent to Accounting", id: "1335049872" },
      { label: "Closed", id: "1335049873" },
    ],
  },
  {
    label: "Deed Verification",
    id: "888511051",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1338624005" },
      { label: "Requested - Waiting on Deed", id: "1338624006" },
      { label: "Closed", id: "1338624008" },
    ],
  },
  {
    label: "Utilities Verification - Activations",
    id: "907997109",
    category: "Utilities",
    monitoredByDefault: true,
    stages: [
      { label: "New", id: "1377586819" },
      { label: "Waiting on Resident", id: "1377586820" },
      { label: "Waiting on Us", id: "1377586821" },
      { label: "Closed", id: "1377586822" },
    ],
  },
  {
    label: "Lien Action",
    id: "923304266",
    category: "Municipality & HOA",
    monitoredByDefault: true,
    stages: [
      { label: "Pending", id: "1412071042" },
      { label: "In Review", id: "1412071043" },
      { label: "Pending Abatement", id: "1412071045" },
      { label: "Pending Payment", id: "1412071046" },
      { label: "Referred", id: "1412071047" },
      { label: "Pending Recording", id: "1412071048" },
      { label: "Closed", id: "1412071044" },
    ],
  },
  {
    label: "Call Center",
    id: "894476042",
    category: "Support & Internal",
    monitoredByDefault: false,
    stages: [
      { label: "New", id: "1350005773" },
      { label: "Assigned", id: "1350005774" },
      { label: "In Progress", id: "1350005775" },
      { label: "Awaiting Tenant", id: "1350005776" },
      { label: "Awaiting Vendor", id: "1350005777" },
      { label: "Resolved", id: "1350005778" },
      { label: "Closed", id: "1350005779" },
    ],
  },
];

// ── Accessors ────────────────────────────────────────────────────────────────

const BY_ID = new Map(PIPELINES.map((p) => [p.id, p]));

export function getPipeline(id: string): Pipeline | undefined {
  return BY_ID.get(id);
}

export function getStage(
  pipelineId: string,
  stageId: string,
): PipelineStage | undefined {
  return getPipeline(pipelineId)?.stages.find((s) => s.id === stageId);
}

export function monitoredPipelineIds(): string[] {
  return PIPELINES.filter((p) => p.monitoredByDefault).map((p) => p.id);
}

export const PIPELINE_CATEGORIES: PipelineCategory[] = [
  "Utilities",
  "Compliance",
  "Municipality & HOA",
  "Leasing & Applications",
  "Inspections & Maintenance",
  "Accounting",
  "Support & Internal",
];

export function pipelinesByCategory(): Array<{
  category: PipelineCategory;
  pipelines: Pipeline[];
}> {
  return PIPELINE_CATEGORIES.map((category) => ({
    category,
    pipelines: PIPELINES.filter((p) => p.category === category),
  })).filter((g) => g.pipelines.length > 0);
}

/** Open (actionable) stage ids for a pipeline, per the terminal-label heuristic. */
export function openStageIds(pipelineId: string): string[] {
  return (getPipeline(pipelineId)?.stages ?? [])
    .filter((s) => isOpenStageLabel(s.label))
    .map((s) => s.id);
}

export const PIPELINE_COUNT = PIPELINES.length;
export const STAGE_COUNT = PIPELINES.reduce((n, p) => n + p.stages.length, 0);
