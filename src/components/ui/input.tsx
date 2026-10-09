import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §4: form tunggal `rounded-full h-12`; di dalam tabel `rounded-xl h-9`. Dipakai juga oleh SelectTrigger.
export const ukuranKontrol = {
  form: "h-12 rounded-full px-5 text-base",
  tabel: "h-9 rounded-xl px-3 text-sm",
} as const;

export function Input({
  className,
  ukuran = "form",
  type,
  ...props
}: ComponentProps<"input"> & { ukuran?: keyof typeof ukuranKontrol }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 border border-input bg-card text-foreground transition-colors duration-300 ease-out outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        ukuranKontrol[ukuran],
        className,
      )}
      {...props}
    />
  );
}
