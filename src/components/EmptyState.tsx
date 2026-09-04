import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  titulo,
  descricao,
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  descricao: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-6" />
      </span>
      <h3 className="font-display text-lg font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
