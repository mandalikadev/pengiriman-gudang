import { formatAngka } from "@/app/admin/impor/format";
import { bagiBulatBawah } from "@/domain/angka";

const formatDuaDesimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/**
 * Perhitungan satu tahap untuk ditampilkan (DESIGN §8), mis. `Σ 2 ÷ 4 minggu = 0,5 → dibulatkan ke atas 1`.
 * `hasil` adalah nilai hasil hitung (dari cache), bukan dihitung di sini. Hasil bagi hanya penjelas: dipotong ke
 * dua desimal dan diberi `≈` bila tidak tepat. Keterangan pembulatan hanya muncul bila pembagian tidak bulat.
 */
export function formatPembagian({
  jumlah,
  pembagi,
  satuan,
  hasil,
}: {
  jumlah: number;
  pembagi: number;
  satuan: string;
  hasil: number;
}) {
  const perseratus = bagiBulatBawah(jumlah * 100, pembagi);
  const tanda = perseratus * pembagi === jumlah * 100 ? "=" : "≈";
  const dasar = `Σ ${formatAngka(jumlah)} ÷ ${formatAngka(pembagi)} ${satuan} ${tanda} ${formatDuaDesimal.format(perseratus / 100)}`;
  return jumlah % pembagi === 0 ? dasar : `${dasar} → dibulatkan ke atas ${formatAngka(hasil)}`;
}
