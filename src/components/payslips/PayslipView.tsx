import { BadgeCheck } from "lucide-react";

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
    <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-elevated px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Version publiée
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">{employeeName}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <BadgeCheck className="size-3.5" aria-hidden="true" />
          Publiée
        </span>
      </header>

      <dl className="grid gap-px bg-border/60 sm:grid-cols-3">
        <Amount label="Brut" value={grossAmount} />
        <Amount label="Retenues" value={deductionsTotal} tone="neg" />
        <Amount label="Net à payer" value={netAmount} emphasis />
      </dl>

      <section className="px-6 py-5">
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
                <span className="min-w-0 break-words text-right font-medium tabular-nums">
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

function Amount({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  tone?: "neg";
}) {
  return (
    <div className="bg-surface px-6 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={[
          "mt-1 font-display tabular-nums",
          emphasis ? "text-2xl font-bold text-foreground" : "text-lg font-semibold",
          tone === "neg" ? "text-danger" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatMga(value)}
      </dd>
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
