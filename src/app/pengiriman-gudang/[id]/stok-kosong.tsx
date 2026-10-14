import { CircleDashed } from "lucide-react";

/**
 * Penanda stok kosong (belum diketahui) di baris ringkas draft (DESIGN §7, §11.4): ikon `CircleDashed` tanpa badge
 * bertumpuk. Teks "Belum diketahui" untuk pembaca layar dan saat disorot; status "Stok belum diisi" ada di kolom Masalah.
 */
export function IkonStokKosong() {
  return (
    <span data-stok-kosong title="Belum diketahui" className="inline-flex shrink-0">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5 text-muted-foreground" />
      <span className="sr-only">Belum diketahui</span>
    </span>
  );
}
