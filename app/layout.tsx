import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trove — Intelligence from your conversations",
  description: "Turn messy message threads into structured intelligence."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}