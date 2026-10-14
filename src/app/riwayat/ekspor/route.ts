import type { ParameterUrl } from "@/components/daftar-berhalaman";
import { parseTanggalBisnis } from "@/domain/kalender";
import { penggunaSaatIni } from "@/server/auth/kewenangan";
import { bacaBarisProdukRencanaFinal } from "@/server/gudang/rencana-final";

import { SEMUA } from "../filter";
import { hasilFilterDiLuarJadwal, hasilFilterRencanaFinal, type TerapanRiwayat } from "../hasil-filter";
import { cakupanEksporRiwayat, gudangTidakIkutDiekspor, ikutDiekspor } from "../muat";

import { buatBerkasRiwayatDiLuarJadwal, buatBerkasRiwayatRencanaFinal, namaBerkasEksporRiwayat, type JenisRiwayat, type KeteranganEkspor } from "./berkas";

// Ekspor halaman Riwayat (T129; PRD A7 ▶ Keputusan 2026-10-14): tab yang dibuka, untuk seluruh hasil filter (filter dan
// kueri yang sama dengan halaman, termasuk cari), satu file satu sheet. Hak diperiksa di server sebelum data dibaca:
// admin semua gudang tanpa penugasan; operator hanya baris gudang tempat ia punya hak `ekspor`; viewer dan operator
// tanpa hak `ekspor` di gudang mana pun ditolak (403).

function tolak(status: number, pesan: string) {
  return Response.json({ pesan }, { status });
}

function keterangan(
  terapan: TerapanRiwayat,
  pilihan: { gudang: { id: number; nama: string }[]; toko: { id: number; nama: string }[] },
  gudangTidakIkut: string[],
  waktuEkspor: Date,
): KeteranganEkspor {
  return {
    gudang: terapan.gudang === SEMUA ? "Semua gudang" : (pilihan.gudang.find((g) => String(g.id) === terapan.gudang)?.nama ?? terapan.gudang),
    toko: terapan.toko === SEMUA ? "Semua toko" : (pilihan.toko.find((t) => String(t.id) === terapan.toko)?.nama ?? terapan.toko),
    dari: terapan.dari === "" ? null : parseTanggalBisnis(terapan.dari),
    sampai: terapan.sampai === "" ? null : parseTanggalBisnis(terapan.sampai),
    cari: terapan.cari,
    gudangTidakIkut,
    waktuEkspor,
  };
}

function berkas(jenis: JenisRiwayat, isi: Buffer, waktuEkspor: Date) {
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaBerkasEksporRiwayat(jenis, waktuEkspor)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** `GET /riwayat/ekspor?tab=…&gudang=…&toko=…&dari=…&sampai=…&cari=…`: parameter sama dengan halaman Riwayat. */
export async function GET(request: Request) {
  const pengguna = await penggunaSaatIni();
  if (pengguna === null) return tolak(401, "Anda belum masuk atau sesi sudah berakhir. Masuk lagi lalu ulangi ekspor.");
  const cakupan = await cakupanEksporRiwayat(pengguna);
  if (cakupan === null) return tolak(403, "Anda tidak punya hak ekspor di gudang mana pun.");

  const parameter: ParameterUrl = Object.fromEntries(new URL(request.url).searchParams);
  const waktuEkspor = new Date();

  if (parameter.tab === "di-luar-jadwal") {
    const filter = await hasilFilterDiLuarJadwal(parameter);
    if (filter === null) return tolak(404, "Belum ada pengiriman di luar jadwal untuk diekspor.");
    const tidakIkut = gudangTidakIkutDiekspor(
      cakupan,
      filter.hasil.map((e) => e.idGudang),
      filter.pilihan.gudang,
    );
    const daftar = filter.hasil.filter((e) => ikutDiekspor(cakupan, e.idGudang));
    return berkas("di-luar-jadwal", buatBerkasRiwayatDiLuarJadwal(daftar, keterangan(filter.terapan, filter.pilihan, tidakIkut, waktuEkspor)), waktuEkspor);
  }

  const filter = await hasilFilterRencanaFinal(parameter);
  if (filter === null) return tolak(404, "Belum ada rencana final untuk diekspor.");
  const tidakIkut = gudangTidakIkutDiekspor(
    cakupan,
    filter.hasil.map((r) => r.gudang.id),
    filter.pilihan.gudang,
  );
  const daftar = filter.hasil.filter((r) => ikutDiekspor(cakupan, r.gudang.id));
  const barisProduk = await bacaBarisProdukRencanaFinal(daftar.map((r) => r.id));
  return berkas(
    "rencana-final",
    buatBerkasRiwayatRencanaFinal(daftar, barisProduk, keterangan(filter.terapan, filter.pilihan, tidakIkut, waktuEkspor)),
    waktuEkspor,
  );
}
