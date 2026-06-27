import { ArrowDownRight, BadgeCheck, Wallet } from "lucide-react";

type PayItemBase = {
  id: string;
  label: string;
  category: string;
};

type PayItem = PayItemBase &
  ({ amount: number; text?: never } | { amount?: never; text: string });

type Props = {
  employeeName: string;
  periodLabel: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  payItems: PayItem[];
};

export function PayslipView({
  employeeName,
  periodLabel,
  grossAmount,
  deductionsTotal,
  netAmount,
  payItems,
}: Props) {
  return (
    <article className="animate-rise overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-md)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-elevated px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Version publiée
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">{employeeName}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-xs font-bold text-success">
          <BadgeCheck className="size-3.5" aria-hidden="true" />
          Publiée
        </span>
      </header>

      <div className="px-6 py-6">
        {/* Net pay — the signature gradient panel, echoing the marketing hero. */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-strong px-6 py-5 text-primary-foreground shadow-[var(--shadow-md)]">
          <div aria-hidden="true" className="brand-mesh-dark pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
                Net à payer
              </p>
              <p className="mt-1.5 font-display text-3xl font-bold tabular-nums sm:text-4xl">
                {formatMga(netAmount)}
              </p>
            </div>
            <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/15 text-primary-foreground sm:flex">
              <Wallet className="size-6" aria-hidden="true" />
            </span>
          </div>
        </div>

        {/* Gross / deductions — colour-coded supporting figures. */}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatTile label="Brut" value={grossAmount} tone="teal" />
          <StatTile label="Retenues" value={deductionsTotal} tone="danger" />
        </dl>
      </div>

      <section className="border-t border-border px-6 py-5">
        <h3 className="font-display text-sm font-semibold">Éléments de paie</h3>
        {payItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun element de paie publie pour cette periode.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {payItems.map((item) => (
              <li className="flex flex-wrap justify-between gap-2 py-2.5 text-sm" key={item.id}>
                <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
                <span className="min-w-0 break-words text-right font-semibold tabular-nums">
                  {formatPayItemValue(item)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "teal" | "danger";
}) {
  const toneTile = tone === "teal" ? "bg-teal/12 text-teal" : "bg-danger/12 text-danger";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneTile}`}>
        {tone === "danger" ? (
          <ArrowDownRight className="size-4" aria-hidden="true" />
        ) : (
          <Wallet className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd
          className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
            tone === "danger" ? "text-danger" : "text-foreground"
          }`}
        >
          {tone === "danger" && value > 0 ? "− " : ""}
          {formatMga(value)}
        </dd>
      </div>
    </div>
  );
}

function formatPayItemValue(item: PayItem) {
  return item.amount !== undefined ? formatMga(item.amount) : item.text;
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", {
    style: "currency",
    currency: "MGA",
    maximumFractionDigits: 0,
  }).format(value);
}
