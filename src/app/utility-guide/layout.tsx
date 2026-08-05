import type { Metadata } from "next";
import "../utilities/utilities.css";

export const metadata: Metadata = {
  title: "ResiHome · Utility Tracker",
  description: "Editable communities & providers tracker (HubDB-backed).",
};

// Same Operations look as /utilities (scoped under .ops), Raleway loaded at runtime.
export default function UtilityGuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap"
      />
      <div className="ops">{children}</div>
    </>
  );
}
