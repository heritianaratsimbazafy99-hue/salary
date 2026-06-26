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
    <article className="space-y-6 rounded border border-border p-6">
      <header>
        <p className="text-sm text-muted-foreground">Version actuellement publiee</p>
        <h2 className="text-xl font-semibold">{employeeName}</h2>
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
      </header>
      <dl className="grid gap-3 md:grid-cols-3">
        <Amount label="Brut" value={grossAmount} />
        <Amount label="Retenues" value={deductionsTotal} />
        <Amount label="Net a payer" value={netAmount} />
      </dl>
      <section>
        <h3 className="text-base font-semibold">Elements</h3>
        {payItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun element de paie publie pour cette periode.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {payItems.map((item) => (
              <li className="flex flex-wrap justify-between gap-2 py-2 text-sm" key={item.id}>
                <span className="min-w-0 break-words">{item.label}</span>
                <span className="min-w-0 break-words text-right">{formatPayItemValue(item)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{formatMga(value)}</dd>
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
