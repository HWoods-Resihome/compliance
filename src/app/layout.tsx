import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResiHome Compliance",
  description:
    "Compliance data lookup across HubSpot and Snowflake, deployed on Vercel.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
