import type { Metadata } from "next";
import "./utilities.css";

export const metadata: Metadata = {
  title: "ResiHome · Utilities & Compliance Ops",
  description: "Action-items dashboard across HubSpot ticket pipelines.",
};

// ResiHome brand typeface (Raleway — matches operations.resihome.com), loaded at
// runtime via a stylesheet link so the build never depends on a font fetch. The
// `.ops` scope falls back to a system sans stack when Raleway isn't reachable.
export default function UtilitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* App Router hoists this to <head>; the pages-router font rule is a false positive here. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap"
      />
      <div className="ops">{children}</div>
    </>
  );
}
