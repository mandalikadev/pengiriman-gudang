import { Info } from "lucide-react";

import { TombolEkspor } from "@/app/ringkasan/tombol-ekspor";
import { urlDaftar, type ParameterUrl } from "@/components/daftar-berhalaman";

import { gudangTidakIkutDiekspor, type CakupanEksporRiwayat } from "./muat";

const daftarNama = new Intl.ListFormat("id", { type: "conjunction" });

/**
 * Ekspor halaman Riwayat (T129; PRD A7 ▶ Keputusan 2026-10-14): tombol ekspor tab yang dibuka untuk seluruh hasil filter
 * (`parameter` = filter yang diterapkan, tanpa halaman). Tanpa `cakupan` (viewer, operator tanpa hak `ekspor`) tidak ada
 * tombol. Bila hasil filter memuat gudang tempat pengguna tidak punya hak `ekspor`, pemberitahuan menyebut gudang itu
 * sebelum ekspor (ikon + teks, DESIGN §7). Hak diperiksa lagi di route ekspor.
 */
export function EksporRiwayat({
  cakupan,
  parameter,
  idGudangHasil,
  pilihanGudang,
}: {
  cakupan: CakupanEksporRiwayat | null;
  parameter: ParameterUrl;
  idGudangHasil: Iterable<number>;
  pilihanGudang: readonly { id: number; nama: string }[];
}) {
  if (cakupan === null) return null;
  const tidakIkut = gudangTidakIkutDiekspor(cakupan, idGudangHasil, pilihanGudang);
  return (
    <div className="flex flex-col gap-2">
      {tidakIkut.length === 0 ? null : (
        <p className="flex items-start gap-2" data-gudang-tidak-ikut-ekspor>
          <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
          {`${daftarNama.format(tidakIkut)} tidak ikut diekspor karena Anda tidak punya hak ekspor di sana.`}
        </p>
      )}
      <TombolEkspor url={urlDaftar("/riwayat/ekspor", parameter, {})} keterangan="seluruh hasil filter riwayat" />
    </div>
  );
}
