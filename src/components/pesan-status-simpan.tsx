import { CircleCheck, CircleX, LoaderCircle, PencilLine, RefreshCcw, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// CODING_STANDARDS "Penyimpanan dan status": empat keadaan + keadaan kelima. Ikon dan token dari DESIGN §7.
// Token menentukan warna ikon; teks memakai foreground (DESIGN §7).
const daftarKeadaan = {
  belumDisimpan: { label: "Ada perubahan yang belum disimpan", warna: "text-muted-foreground", ikon: PencilLine },
  menyimpan: { label: "Sedang menyimpan", warna: "text-info", ikon: LoaderCircle },
  berhasil: { label: "Berhasil disimpan", warna: "text-success", ikon: CircleCheck },
  gagal: { label: "Gagal", warna: "text-destructive", ikon: CircleX },
  tersimpanGagalMuatUlang: {
    label: "Perubahan tersimpan. Muat ulang halaman untuk melihatnya.",
    warna: "text-warning",
    ikon: RefreshCcw,
  },
} as const satisfies Record<string, { label: string; warna: string; ikon: LucideIcon }>;

export type KeadaanSimpan = keyof typeof daftarKeadaan;

export const semuaKeadaanSimpan = Object.keys(daftarKeadaan) as KeadaanSimpan[];

/**
 * Pesan status simpan yang diletakkan dekat bagian yang dikerjakan.
 * `pesan` adalah keterangan tambahan (misalnya alasan gagal) yang tampil setelah label.
 */
export function PesanStatusSimpan({
  keadaan,
  pesan,
  className,
  ...props
}: Omit<ComponentProps<"p">, "children"> & { keadaan: KeadaanSimpan; pesan?: string }) {
  const { label, warna, ikon: Ikon } = daftarKeadaan[keadaan];
  return (
    <p
      role={keadaan === "gagal" ? "alert" : "status"}
      data-keadaan={keadaan}
      className={cn("flex items-start gap-2 text-sm font-semibold text-foreground", className)}
      {...props}
    >
      <Ikon
        aria-hidden
        strokeWidth={2}
        className={cn("size-5 shrink-0", warna, Ikon === LoaderCircle && "motion-safe:animate-spin")}
      />
      <span>
        {label}
        {pesan ? <span className="font-normal"> — {pesan}</span> : null}
      </span>
    </p>
  );
}
