import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseTanggalBisnis } from "@/domain/kalender";
import type { KeteranganDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import type { RencanaFinal } from "@/server/gudang/rencana-final";

import { PenandaDiLuarJadwal } from "../penanda-di-luar-jadwal";
import { buatBerkasEkspor } from "./[idRencana]/ekspor/berkas";

// T114, keputusan pemilik 2026-10-14: pengiriman di luar jadwal di gudang Pusat langsung berlaku tanpa penyetuju. Ekspor
// menulis "… — langsung berlaku (Pusat)" dan layar menampilkan "Langsung berlaku (Pusat)" (teks yang sama dengan riwayat
// pengiriman di luar jadwal, T113).

const ALASAN = "Permintaan mendadak toko";

const tambahanPusat: KeteranganDiLuarJadwal = {
  id: 1,
  jenis: "tambahan",
  tanggalRutinDipindah: null,
  alasan: ALASAN,
  pengusul: "Operator Pusat",
  diusulkanPada: new Date("2026-10-14T03:00:00Z"),
  penyetuju: null,
  disetujuiPada: null,
};

const rencanaPusat: RencanaFinal = {
  id: 1,
  versi: 1,
  alasanFinalisasiUlang: null,
  gudang: { id: 1, nama: "Pusat" },
  toko: { id: 1, nama: "PMS" },
  tanggalKirim: parseTanggalBisnis("2026-10-20"),
  difinalisasiOleh: "Operator Pusat",
  difinalisasiPada: new Date("2026-10-19T03:00:00Z"),
  sumber: { bulanSumber: ["2026-09"], versiPeriodeSumber: 1, impor: [] },
  ranking: { id: 1, bulanRanking: "2026-09", versi: 1 },
  jadwal: { pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], tanggalJangkar: null, versi: 1, persiapanHari: 1, panjangCakupan: 6 },
  diLuarJadwal: tambahanPusat,
  kalender: { revisi: 1, perubahanKategori: [], cakupan: [] },
  rumusJumlahKirim: "stok-target",
  baris: [],
};

const teks = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("pengiriman di luar jadwal gudang Pusat (tanpa penyetuju)", () => {
  it('ekspor: baris "Jenis pengiriman" = "Di luar jadwal · Tambahan — <alasan> — langsung berlaku (Pusat)"', () => {
    const wb = XLSX.read(new Uint8Array(buatBerkasEkspor(rencanaPusat)), { type: "array" });
    const semua = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets["Rencana final"], { header: 1, defval: null });
    expect(semua.find((b) => b[0] === "Jenis pengiriman")?.[1]).toBe(`Di luar jadwal · Tambahan — ${ALASAN} — langsung berlaku (Pusat)`);
  });

  it('layar: penanda memuat "Di luar jadwal · Tambahan" dan "Langsung berlaku (Pusat)"', () => {
    const html = teks(renderToStaticMarkup(<PenandaDiLuarJadwal keterangan={tambahanPusat} />));
    expect(html).toContain("Di luar jadwal · Tambahan");
    expect(html).toContain(`Alasan: ${ALASAN} · Langsung berlaku (Pusat)`);
  });
});
