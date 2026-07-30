import Link from "next/link";
import {
  listAssociations,
  getAssociation,
  SnowflakeNotConfiguredError,
  SnowflakeDriverUnavailableError,
  type AssociationSummary,
  type Association,
  type Address,
  type Contact,
  type Field,
} from "@/lib/associations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function describeError(err: unknown): string {
  if (err instanceof SnowflakeNotConfiguredError) {
    return `Snowflake is not configured (${err.missing.join(", ")} missing in this environment).`;
  }
  if (err instanceof SnowflakeDriverUnavailableError) {
    return "Snowflake credentials are set, but the query transport is not wired up in this deployment yet. See docs/INTEGRATIONS.md.";
  }
  return (err as Error).message;
}

function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtAddress(a: Address): string {
  const line2 = [a.city, a.state].filter(Boolean).join(", ");
  const parts = [a.address, [line2, a.zip].filter(Boolean).join(" ")]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : "—";
}

function fmtContact(c: Contact): string {
  const parts = [c.name, c.title, c.email, c.phone]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export default async function AssociationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id) return <AssociationDetail id={id} />;
  return <AssociationList />;
}

async function AssociationList() {
  let associations: AssociationSummary[] | null = null;
  let errorMessage: string | null = null;

  try {
    associations = await listAssociations();
  } catch (err) {
    errorMessage = describeError(err);
  }

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/">← Compliance</Link>
          </p>
          <h1 className="title">Associations (HOA)</h1>
        </div>
        <span className="badge">
          <span className="status ok" /> ResiAIMS · Snowflake
        </span>
      </div>

      <p className="subtitle">
        HOA / association records extracted from ResiAIMS — management company,
        contacts, leasing rules, amenities, access codes, and the properties
        mapped to each association (with per-property inspection dates).
      </p>

      {errorMessage && (
        <div className="card error">
          <h2>Could not load associations</h2>
          <p>{errorMessage}</p>
        </div>
      )}

      {associations && associations.length === 0 && (
        <p className="empty">No associations found.</p>
      )}

      {associations && associations.length > 0 && (
        <section className="panel">
          <div className="table-scroll">
            <table className="ptable">
              <thead>
                <tr>
                  <th>Association</th>
                  <th>Status</th>
                  <th>Management company</th>
                  <th>City</th>
                  <th>State</th>
                  <th className="num">Properties</th>
                </tr>
              </thead>
              <tbody>
                {associations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/associations?id=${encodeURIComponent(a.id)}`}>
                        {a.name || `(association ${a.id})`}
                      </Link>
                    </td>
                    <td>{val(a.status)}</td>
                    <td>{val(a.managementCompany)}</td>
                    <td>{val(a.city)}</td>
                    <td>{val(a.state)}</td>
                    <td className="num">{a.propertyCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

async function AssociationDetail({ id }: { id: string }) {
  let assoc: Association | null = null;
  let errorMessage: string | null = null;

  try {
    assoc = await getAssociation(id);
  } catch (err) {
    errorMessage = describeError(err);
  }

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/associations">← Associations</Link>
          </p>
          <h1 className="title">{assoc?.name || `Association ${id}`}</h1>
        </div>
        {assoc?.status && (
          <span className="badge">
            <span className="status ok" /> {assoc.status}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="card error">
          <h2>Could not load association</h2>
          <p>{errorMessage}</p>
        </div>
      )}

      {!errorMessage && !assoc && (
        <p className="empty">No association found for id {id}.</p>
      )}

      {assoc && (
        <>
          {/* HOA tab */}
          <h2 className="section-title">HOA</h2>
          <section className="panel detail-grid">
            <Cell label="HOA ID" value={val(assoc.hoaId)} />
            <Cell label="Status" value={val(assoc.status)} />
            <Cell label="Address" value={fmtAddress(assoc.address)} pre />
            <Cell
              label="Website"
              value={val(assoc.website.address)}
            />
            <Cell
              label="Website username"
              value={val(assoc.website.username)}
            />
            <Cell
              label="Access codes completed"
              value={val(assoc.accessCodesCompleted)}
            />
            <Cell label="Primary contact" value={fmtContact(assoc.primaryContact)} />
            <Cell
              label="Alternate contact"
              value={fmtContact({
                name: assoc.altContact.name,
                title: null,
                email: assoc.altContact.email,
                phone: assoc.altContact.phone,
              })}
            />
          </section>

          {/* Management company */}
          <h2 className="section-title">Management company</h2>
          <section className="panel detail-grid">
            <Cell label="Company" value={val(assoc.management.company)} />
            <Cell label="Contact" value={val(assoc.management.contactName)} />
            <Cell label="Phone" value={val(assoc.management.contactPhone)} />
            <Cell label="Email" value={val(assoc.management.email)} />
            <Cell
              label="Address"
              value={fmtAddress(assoc.management.address)}
              pre
            />
            <Cell
              label="Management POC"
              value={fmtContact(assoc.management.poc)}
            />
          </section>

          {/* Assessment */}
          <h2 className="section-title">Assessment</h2>
          <section className="panel detail-grid">
            <Cell label="Dues" value={val(assoc.assessment.dues)} />
            <Cell label="Frequency" value={val(assoc.assessment.frequency)} />
            <Cell
              label="Total assessment amount"
              value={val(assoc.assessment.totalAssessmentAmount)}
            />
            <Cell label="Periodicity" value={val(assoc.assessment.periodicity)} />
            <Cell
              label="Special assessment dues"
              value={val(assoc.assessment.specialAssessmentDues)}
            />
            <Cell
              label="Fiscal year start"
              value={val(assoc.assessment.fiscalYearStart)}
            />
            <Cell
              label="Payment website"
              value={val(assoc.assessment.paymentWebsite)}
            />
          </section>

          {/* Leasing info */}
          <h2 className="section-title">Leasing info</h2>
          <FieldTable fields={assoc.leasing} empty="No leasing information" />

          {/* Amenities */}
          <h2 className="section-title">Amenities</h2>
          <FieldTable fields={assoc.amenities} empty="No amenities recorded" />

          {/* Utilities / services */}
          <h2 className="section-title">Utilities &amp; services</h2>
          <FieldTable fields={assoc.utilities} empty="No utilities recorded" />

          {/* Access codes */}
          <h2 className="section-title">Access codes</h2>
          <Table
            head={[
              "Access for",
              "Available",
              "Control",
              "Cost",
              "Description",
              "Contact",
              "Form",
              "Notes",
            ]}
            rows={assoc.accessCodes.map((a) => [
              val(a.accessFor),
              val(a.available),
              val(a.control),
              val(a.controlCost),
              val(a.description),
              val(a.contactName || a.contactEmail),
              val(a.formExist),
              val(a.notes),
            ])}
            empty="No access codes"
          />

          {/* Mapped properties (with inspection dates) */}
          <h2 className="section-title">
            Properties in this association (
            {assoc.properties.length.toLocaleString()})
          </h2>
          <Table
            head={[
              "Property key",
              "Address",
              "State",
              "ZIP",
              "Property status",
              "HOA status",
              "Account #",
              "Chimney insp.",
              "Dryer insp.",
              "HVAC insp.",
              "Fire insp.",
            ]}
            rows={assoc.properties.map((p) => [
              val(p.propertyKey),
              val(p.address),
              val(p.state),
              val(p.zip),
              val(p.propertyStatus),
              val(p.hoaPropertyStatus),
              val(p.accountNumber),
              fmtDate(p.inspections.chimney),
              fmtDate(p.inspections.dryer),
              fmtDate(p.inspections.hvac),
              fmtDate(p.inspections.fire),
            ])}
            empty="No properties mapped to this association"
          />
        </>
      )}
    </main>
  );
}

function Cell({
  label,
  value,
  pre,
}: {
  label: string;
  value: string;
  pre?: boolean;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <span className={pre ? "preline" : undefined}>{value}</span>
    </div>
  );
}

function FieldTable({ fields, empty }: { fields: Field[]; empty: string }) {
  if (fields.length === 0) return <p className="empty">{empty}</p>;
  return (
    <section className="panel detail-grid">
      {fields.map((f) => (
        <Cell key={f.label} label={f.label} value={val(f.value)} />
      ))}
    </section>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
