import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Settle Split Guard",
  description:
    "Review a group settlement before anyone signs. SERV Reasoning recommends SETTLE, WAIT, or REJECT. A deterministic policy can overrule the model.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
