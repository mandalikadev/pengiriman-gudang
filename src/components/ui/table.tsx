import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §4: wadah rounded-2xl yang menggulir sendiri; baris dan sel bersudut lurus; header bg-muted.
// DESIGN §4 ▶ Revisi / §11.1: tabel di dalam kartu tanpa bingkai kedua; tabel panjang (> ±15 baris) dalam wadah
// bertinggi terbatas dengan header menempel; kolom identitas menempel di kiri bila tabel lebih lebar dari wadahnya.
// Kelas ditulis utuh (bukan dirakit) agar terbaca Tailwind.
const kelasPanjang = {
  wadah: "max-h-[max(20rem,calc(100dvh-10rem))] overflow-auto",
  tabel:
    "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-muted [&_thead_th]:shadow-[inset_0_-1px_0_var(--color-border)]",
};

const kelasKolomMenempel = {
  1: "[&_tr>:nth-child(1):not([colspan])]:sticky [&_tr>:nth-child(1):not([colspan])]:left-0 [&_tr>td:nth-child(1):not([colspan])]:z-10 [&_tr>td:nth-child(1):not([colspan])]:bg-card [&_tr[data-state=selected]>td:nth-child(1):not([colspan])]:bg-accent [&_tr>th:nth-child(1)]:z-30 [&_tr>th:nth-child(1)]:bg-muted",
  // Kolom kedua menempel tepat di kanan kolom pertama, jadi kolom pertama berlebar tetap (teks panjang turun baris).
  2: "[&_tr>:nth-child(1):not([colspan])]:w-40 [&_tr>:nth-child(1):not([colspan])]:min-w-40 [&_tr>:nth-child(1):not([colspan])]:max-w-40 [&_tr>:nth-child(1):not([colspan])]:whitespace-normal [&_tr>:nth-child(1):not([colspan])]:wrap-anywhere [&_tr>:nth-child(2):not([colspan])]:sticky [&_tr>:nth-child(2):not([colspan])]:left-40 [&_tr>:nth-child(2):not([colspan])]:min-w-48 [&_tr>td:nth-child(2):not([colspan])]:whitespace-normal [&_tr>td:nth-child(2):not([colspan])]:z-10 [&_tr>td:nth-child(2):not([colspan])]:bg-card [&_tr[data-state=selected]>td:nth-child(2):not([colspan])]:bg-accent [&_tr>th:nth-child(2)]:z-30 [&_tr>th:nth-child(2)]:bg-muted",
} as const;

type OpsiTabel = {
  /** Tabel yang bisa berisi lebih dari ±15 baris: wadah bertinggi terbatas, header menempel (DESIGN §11.1). */
  panjang?: boolean;
  /** Jumlah kolom identitas di kiri yang menempel saat tabel digulir horizontal (DESIGN §11.1). */
  kolomMenempel?: 0 | 1 | 2;
};

export function Table({ className, panjang = false, kolomMenempel = 0, ...props }: ComponentProps<"table"> & OpsiTabel) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full rounded-2xl border border-border/60 bg-card in-[[data-slot=card]]:border-0",
        panjang ? kelasPanjang.wadah : "overflow-x-auto",
      )}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm",
          panjang && kelasPanjang.tabel,
          kolomMenempel >= 1 && kelasKolomMenempel[1],
          kolomMenempel === 2 && kelasKolomMenempel[2],
          className,
        )}
        {...props}
      />
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
