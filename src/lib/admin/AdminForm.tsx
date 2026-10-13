"use client";
import { startTransition, useActionState, useRef, useSyncExternalStore, type ReactNode } from "react";
const subscribe = () => () => {};
export type AdminFormResult = { error?: string; success?: string };
export function AdminForm({ action, children, className, label, resetOnSuccess = false }: {
  action: (data: FormData) => Promise<AdminFormResult>;
  children: ReactNode; className?: string; label: string; resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [state, submit, pending] = useActionState(async (_: AdminFormResult, data: FormData) => {
    const result = await action(data);
    if (resetOnSuccess && result.success) formRef.current?.reset();
    return result;
  }, {});
  // Dispatch explicitly: React's automatic action reset restores stale select
  // defaults after a reassignment, silently changing the next submitted agency.
  return <form ref={formRef} aria-label={label} className="min-w-0 max-w-full" onSubmit={(event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => submit(data));
  }}>
    <fieldset disabled={!hydrated || pending} className={`min-w-0 grid-cols-1 [&>div]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full ${className ?? ""}`}>{children}</fieldset>
    {pending ? <p role="status" className="mt-3 text-sm text-muted-foreground">Enregistrement…</p> : null}
    {state.error ? <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p> : null}
    {state.success ? <p role="status" className="mt-3 text-sm text-success">{state.success}</p> : null}
  </form>;
}
