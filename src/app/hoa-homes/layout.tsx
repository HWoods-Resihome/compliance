import type { Metadata } from "next";
import "../utilities/utilities.css";

export const metadata: Metadata = {
  title: "ResiHome · HOA Homes",
  description: "Active HOA-mapped homes and their FY26 assessment status.",
};

// Same Operations look as /utilities and /utility-guide (scoped under .ops), Raleway at runtime.
export default function HoaHomesLayout({ children }: { children: React.ReactNode }) {
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
