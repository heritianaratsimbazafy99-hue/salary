import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Salary | Vos fiches de paie, en clair et en sécurité",
  description:
    "Salary donne aux salariés un accès simple et sécurisé à leurs fiches de paie : connexion par lien magique, historique complet, confidentialité garantie.",
};

// Flag the document as JS-enabled before paint so reveal animations only hide
// content when JavaScript can bring it back. No-JS users see everything.
const JS_FLAG = "document.documentElement.classList.add('js');";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
