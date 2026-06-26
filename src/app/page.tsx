import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  Lock,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

const ROLE_CARDS: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "Managers d'agence",
    description: "Imports Excel, rapprochement des salaries et publication par periode.",
    icon: Upload,
  },
  {
    title: "RH centrale",
    description: "Vue multi-agences, audit des actions sensibles et analyses consolidees.",
    icon: Users,
  },
  {
    title: "Salaries",
    description: "Acces personnel aux fiches publiees, sans exposition des donnees des autres.",
    icon: FileText,
  },
];

const WORKFLOW = [
  "Importer le fichier de paie",
  "Verifier les ecarts",
  "Publier les fiches",
  "Consulter et auditer",
];

const TRUST_POINTS = [
  "Auth Supabase par magic-link",
  "Controle des roles par agence",
  "Journal d'audit RH",
  "Exports et analytics paie",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">Salary</span>
              <span className="block text-xs text-muted-foreground">Paie interne</span>
            </span>
          </Link>
          <nav aria-label="Acces rapides" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a className="hover:text-foreground" href="#roles">
              Roles
            </a>
            <a className="hover:text-foreground" href="#process">
              Processus
            </a>
            <a className="hover:text-foreground" href="#security">
              Securite
            </a>
          </nav>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25"
            href="/auth/login"
          >
            Connexion
          </Link>
        </div>
      </header>

      <section className="border-b border-border bg-[linear-gradient(180deg,hsl(var(--surface))_0%,hsl(var(--background))_100%)] px-5 py-10 md:py-14">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_0.92fr]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Plateforme RH securisee
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-foreground md:text-6xl">
              Salary organise les fiches de paie internes, du fichier Excel a la consultation salarie.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Une experience claire pour importer, controler, publier et auditer la paie, avec des roles separes pour les agences, les RH et les salaries.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25"
                href="/auth/login"
              >
                Ouvrir la plateforme
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                href="/manager/imports"
              >
                Acces manager
              </Link>
            </div>
            <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-sm">
              <Metric label="Agences" value="Multi" />
              <Metric label="Flux" value="4 etapes" />
              <Metric label="Acces" value="RLS" />
            </dl>
          </div>

          <DashboardPreview />
        </div>
      </section>

      <section className="px-5 py-12" id="roles">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Espaces de travail</p>
              <h2 className="mt-2 text-2xl font-semibold md:text-3xl">Chaque role voit exactement ce qui le concerne.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              L&apos;interface garde les actions sensibles visibles, tracables et separees selon les permissions metier.
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {ROLE_CARDS.map((card) => (
              <article className="rounded-lg border border-border bg-surface p-5 shadow-sm" key={card.title}>
                <card.icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface px-5 py-12" id="process">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Processus paie</p>
            <h2 className="mt-2 text-2xl font-semibold md:text-3xl">Un parcours court, lisible, controle.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Salary met en avant les validations utiles: fichier, periode, lignes valides, nouveaux salaries et publication.
            </p>
          </div>
          <ol className="grid gap-3 md:grid-cols-4">
            {WORKFLOW.map((step, index) => (
              <li className="rounded-lg border border-border bg-surface-elevated p-4" key={step}>
                <span className="text-xs font-semibold text-primary">0{index + 1}</span>
                <p className="mt-3 text-sm font-semibold leading-5">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 py-12" id="security">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-border bg-foreground p-6 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-3">
              <Lock className="size-6 text-accent" aria-hidden="true" />
              <h2 className="text-2xl font-semibold">Controle d&apos;acces par defaut.</h2>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/75">
              Le produit est concu pour limiter les donnees visibles a chaque role et conserver une trace des operations RH sensibles.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {TRUST_POINTS.map((point) => (
                <div className="flex items-center gap-3 rounded-md bg-primary-foreground/10 px-3 py-3 text-sm" key={point}>
                  <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Insight title="Import" value="Excel" description="Lecture structuree des colonnes de paie." icon={Upload} />
            <Insight title="Analytics" value="MGA" description="Synthese des montants publies." icon={BarChart3} />
            <Insight title="Agences" value="RLS" description="Segmentation par perimetre." icon={Building2} />
            <Insight title="Audit" value="Trace" description="Actions sensibles journalisees." icon={ShieldCheck} />
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function DashboardPreview() {
  const rows = [
    { label: "Lignes valides", value: "248", tone: "bg-success" },
    { label: "A controler", value: "07", tone: "bg-warning" },
    { label: "Nouveaux salaries", value: "03", tone: "bg-accent" },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xl shadow-foreground/5">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Periode active</p>
          <h2 className="mt-1 text-xl font-semibold">Paie de juin 2026</h2>
        </div>
        <span className="rounded-md bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          Pret a valider
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div className="rounded-lg border border-border bg-surface-elevated p-4" key={row.label}>
            <span className={`block h-1.5 w-10 rounded-full ${row.tone}`} />
            <p className="mt-4 text-xs text-muted-foreground">{row.label}</p>
            <p className="mt-1 text-2xl font-semibold">{row.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-border">
        <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr] border-b border-border bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Agence</span>
          <span>Statut</span>
          <span className="text-right">Net publie</span>
        </div>
        {[
          ["Antananarivo", "Valide", "18,4M MGA"],
          ["Toamasina", "Controle", "7,2M MGA"],
          ["Mahajanga", "Nouveau", "5,8M MGA"],
        ].map(([agency, status, amount]) => (
          <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr] items-center border-b border-border px-4 py-3 text-sm last:border-b-0" key={agency}>
            <span className="font-medium">{agency}</span>
            <span className="text-muted-foreground">{status}</span>
            <span className="text-right font-semibold">{amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Insight({
  description,
  icon: Icon,
  title,
  value,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
  value: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <Icon className="size-5 text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm text-muted-foreground">{title}</p>
      <h3 className="mt-1 text-2xl font-semibold">{value}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </article>
  );
}
