import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nabla — a research-lab whiteboard for math",
  description:
    "Three-pane workspace for math derivations: chat + live equation board + scratchpad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
