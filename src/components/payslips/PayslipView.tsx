import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Clock,
  Gift,
  Info,
  Landmark,
  Minus,
  PiggyBank,
  Sparkles,
  TrendingUp,
  UserX,
  Wallet,
} from "lucide-react";

import { DonutChart, StackedBar } from "@/components/ui/Charts";
import { formatMga, formatMonthLong } from "@/components/ui/format";
import { Avatar } from "@/components/ui/Surface";
import { toneTile, type Tone } from "@/components/ui/tones";
import styles from "./PayslipView.module.css";

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
  periodStart?: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  payItems: PayItem[];
  /** Net variation versus the previous published period, when known. */
  comparison?: { previousLabel: string; delta: number };
};

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  BASE_PAY: { label: "Salaire", icon: Briefcase, tone: "primary" },
  HOURS: { label: "Heures", icon: Clock, tone: "teal" },
  OVERTIME: { label: "Heures sup.", icon: TrendingUp, tone: "teal" },
  BONUS: { label: "Prime", icon: Sparkles, tone: "accent" },
  BENEFIT: { label: "Avantage", icon: Gift, tone: "amber" },
  ABSENCE: { label: "Absence", icon: UserX, tone: "danger" },
  DEDUCTION: { label: "Retenue", icon: Landmark, tone: "danger" },
  INFORMATIONAL_NOTE: { label: "Information", icon: Info, tone: "neutral" },
  OTHER_ELEMENTS: { label: "Autre", icon: PiggyBank, tone: "neutral" },
};

const DEDUCTION_CATEGORIES = new Set(["DEDUCTION", "ABSENCE"]);

export function PayslipView({
  employeeName,
  periodLabel,
  periodStart,
  grossAmount,
  deductionsTotal,
  netAmount,
  payItems,
  comparison,
}: Props) {
  const amountItems = payItems.filter((item): item is PayItemBase & { amount: number } => item.amount !== undefined);
  const gains = amountItems.filter((item) => !DEDUCTION_CATEGORIES.has(item.category));
  const deductions = amountItems.filter((item) => DEDUCTION_CATEGORIES.has(item.category));
  const notes = payItems.filter((item): item is PayItemBase & { text: string } => item.amount === undefined);
  const netShare = grossAmount > 0 ? Math.max(0, Math.min(1, netAmount / grossAmount)) : 0;
  const scale = Math.max(1, grossAmount, ...amountItems.map((item) => Math.abs(item.amount)));

  return (
    <article
      aria-label={`Fiche de paie ${periodLabel}`}
      className={`${styles.document} animate-rise overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface shadow-[var(--shadow-md)]`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-elevated px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={employeeName} size="lg" />
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Version publiée
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight [overflow-wrap:anywhere]">{employeeName}</h2>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-xs font-bold text-success">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Publiée
          </span>
          {periodStart ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {formatMonthLong(periodStart)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {/* Net pay hero with net/deductions split */}
        <div className="brand-gradient relative overflow-hidden rounded-3xl px-5 py-5 text-primary-foreground shadow-[var(--shadow-md)] sm:px-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full border-[18px] border-primary-foreground/[0.06]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground/75">
                <Wallet className="size-4 text-accent" aria-hidden="true" />
                Net à payer
              </p>
              <p className="mt-2 font-display text-[2.15rem] font-bold leading-none tabular-nums sm:text-[2.6rem]">
                {formatMga(netAmount)}
              </p>
              {comparison ? <ComparisonChip {...comparison} /> : null}
              <p className="mt-3 text-xs text-primary-foreground/70">Fiche interne · Montants en ariary (MGA)</p>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-primary-foreground/[0.08] p-3 pr-5">
              <DonutChart
                size={92}
                thickness={12}
                label={`Le net représente ${Math.round(netShare * 100)} % du brut, les retenues ${100 - Math.round(netShare * 100)} %.`}
                segments={[
                  { label: "Net", value: netAmount, tone: "accent" },
                  { label: "Retenues", value: deductionsTotal, tone: "amber" },
                ]}
              >
                <span className="font-display text-lg font-bold leading-none">{Math.round(netShare * 100)}%</span>
                <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary-foreground/70">du brut</span>
              </DonutChart>
              <ul className="grid gap-1.5 text-xs" aria-hidden="true">
                <li className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-accent" /> Net perçu
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-amber" /> Retenues
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Gross / deductions — colour-coded supporting figures. */}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatTile label="Brut" value={grossAmount} tone="teal" icon={ArrowUpRight} />
          <StatTile label="Retenues" value={deductionsTotal} tone="danger" icon={ArrowDownRight} />
        </dl>
        <div className="mt-4">
          <StackedBar
            label={`Répartition du brut : net ${formatMga(netAmount)}, retenues ${formatMga(deductionsTotal)}.`}
            segments={[
              { label: "Net", value: netAmount, tone: "teal" },
              { label: "Retenues", value: deductionsTotal, tone: "danger" },
            ]}
          />
        </div>
      </div>

      <section className="border-t border-border px-5 py-5 sm:px-6">
        <h3 className="font-display text-base font-semibold">Éléments de paie</h3>
        {payItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun element de paie publie pour cette periode.
          </p>
        ) : (
          <div className="mt-4 grid gap-5">
            {gains.length > 0 ? <ItemGroup title="Gains" tone="success" items={gains} scale={scale} /> : null}
            {deductions.length > 0 ? (
              <ItemGroup title="Retenues" tone="danger" items={deductions} scale={scale} negative />
            ) : null}
            {notes.length > 0 ? (
              <div>
                <GroupTitle title="Informations" tone="neutral" />
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {notes.map((item) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated px-3.5 py-3 text-sm"
                      key={item.id}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <CategoryIcon category={item.category} />
                        <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
                      </span>
                      <span className="min-w-0 break-words text-right font-semibold">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </article>
  );
}

function ComparisonChip({ previousLabel, delta }: { previousLabel: string; delta: number }) {
  const rounded = Math.round(delta * 1000) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  const sign = rounded > 0 ? "+" : "";
  return (
    <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary-foreground/12 px-2.5 py-1 text-xs font-semibold text-primary-foreground">
      <Icon className="size-3.5 text-accent" aria-hidden="true" />
      {sign}
      {rounded.toLocaleString("fr-FR")} % vs {previousLabel}
    </span>
  );
}

function GroupTitle({ title, tone }: { title: string; tone: Tone }) {
  const dot: Record<string, string> = { success: "bg-success", danger: "bg-danger", neutral: "bg-muted-foreground/60" };
  return (
    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span aria-hidden="true" className={`size-2 rounded-full ${dot[tone] ?? "bg-primary"}`} />
      {title}
    </p>
  );
}

function ItemGroup({
  title,
  tone,
  items,
  scale,
  negative = false,
}: {
  title: string;
  tone: Tone;
  items: Array<PayItemBase & { amount: number }>;
  scale: number;
  negative?: boolean;
}) {
  return (
    <div>
      <GroupTitle title={title} tone={tone} />
      <ul className="mt-2 divide-y divide-border">
        {items.map((item, index) => (
          <li className="grid gap-1.5 py-3 text-sm" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2.5">
                <CategoryIcon category={item.category} />
                <span className="min-w-0 break-words text-foreground">{item.label}</span>
              </span>
              <span
                className={`min-w-0 break-words text-right font-semibold tabular-nums ${negative ? "text-danger" : "text-foreground"}`}
              >
                {negative && item.amount > 0 ? "− " : ""}
                {formatMga(item.amount)}
              </span>
            </div>
            <div aria-hidden="true" className="ml-[2.375rem] h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`chart-bar h-full rounded-full ${negative ? "bg-danger/60" : "bg-gradient-to-r from-primary to-teal"}`}
                style={{ width: `${Math.max(2, (Math.abs(item.amount) / scale) * 100)}%`, animationDelay: `${index * 60}ms` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.OTHER_ELEMENTS!;
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${toneTile[meta.tone]}`}
      title={meta.label}
    >
      <meta.icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "teal" | "danger";
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneTile[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
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
