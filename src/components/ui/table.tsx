import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §4: wadah rounded-2xl yang menggulir sendiri; baris dan sel bersudut lurus; header bg-muted.
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto rounded-2xl border border-border/60 bg-card">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-muted [&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors duration-300 ease-out data-[state=selected]:bg-accent", className)}
      {...props}
    />
  );
}

export function TableHead({ className, angka = false, ...props }: ComponentProps<"th"> & { angka?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle font-semibold whitespace-nowrap text-muted-foreground",
        angka && "text-right",
        className,
      )}
      {...props}
    />
  );
}

/** `angka`: kolom angka rata kanan dengan `tabular-nums` (DESIGN §3, §6). */
export function TableCell({ className, angka = false, ...props }: ComponentProps<"td"> & { angka?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2 align-middle whitespace-nowrap", angka && "text-right tabular-nums", className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />;
}
