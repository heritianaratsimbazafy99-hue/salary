import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salary | Plateforme paie interne",
  description: "Imports, validation, publication et consultation securisee des fiches de paie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
