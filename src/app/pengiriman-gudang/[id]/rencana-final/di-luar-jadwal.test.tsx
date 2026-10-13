import { and, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { formatWaktu } from "@/app/admin/impor/format";
import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, pengirimanDiLuarJadwal } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { setujuiPengirimanDiLuarJadwal, usulkanPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { finalisasiRencanaToko } from "@/server/gudang/rencana-final";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "@/server/gudang/uji-bantu-cakupan";
import { idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanPengirimanGudang from "../page";
import { GET } from "./[idRencana]/ekspor/route";
import HalamanRencanaFinal from "./[idRencana]/page";
import HalamanRincianRencanaFinal from "./[idRencana]/rincian/page";
import HalamanRiwayatRencanaFinal from "./page";

// T114 (PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas): toko yang dikirim di luar jadwal diberi penanda "Di luar jadwal ·
// Tambahan" beserta alasan dan penyetujunya di draft, rencana final, rinciannya, dan riwayat. Rencana final menyimpan
// keterangan ini di snapshot; ekspor menambah baris keterangan "Jenis pengiriman". Contoh BOTANI: 2× seminggu Senin (H),
// Kamis (H−1); tambahan Selasa 2026-10-20 (H−1) di Gudang Cibubur.

const SENIN = parseTanggalBisnis("2026-10-19");
const SELASA = parseTanggalBisnis("2026-10-20");
const ALASAN = "Stok BOTANI menipis jelang promo";

let cibubur: number;
let idAdmin: string;
let idOperator: string;
let toko: { id: number; nama: string };
let kodeProduk: string;
let idSenin: number;
let idSelasa: number;
let disetujuiPada: Date;

async function finalisasi(tanggalKirim: TanggalBisnis) {
  const dihitung = await hitungDraftRencana({ idGudang: cibubur, tanggalKirim, idPengguna: idOperator });
  if (dihitung.keadaan !== "berhasil") throw new Error(dihitung.pesan);
  const stok = await simpanStokToko({ idGudang: cibubur, tanggalKirim, tokoId: toko.id, stok: [{ kodeProduk, stokAkhir: 1 }] });
  if (stok.keadaan !== "berhasil") throw new Error(stok.pesan);
  const versiDilihat = (await bacaDraftRencana(cibubur, tanggalKirim))?.toko.find((t) => t.id === toko.id)?.versi ?? "";
  const hasil = await finalisasiRencanaToko({ idGudang: cibubur, tanggalKirim, tokoId: toko.id, idPengguna: idOperator, versiDilihat });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idRencana;
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  ({ toko, kodeProduk } = await siapkanTokoSmbUji({ idGudang: cibubur, idAdmin }));
  idSenin = await finalisasi(SENIN);

  const hariIni = parseTanggalBisnis("2026-10-01");
  const usul = await usulkanPengirimanDiLuarJadwal({
    idGudang: cibubur,
    isian: { idToko: toko.id, jenis: "tambahan", tanggalKirim: SELASA, persiapanHari: 1, tanggalRutinDipindah: null, alasan: ALASAN },
    idPengguna: idOperator,
    hariIni,
  });
  if (usul.keadaan !== "berhasil") throw new Error(usul.pesan);
  const [p] = await db
    .select({ id: pengirimanDiLuarJadwal.id })
    .from(pengirimanDiLuarJadwal)
    .where(and(eq(pengirimanDiLuarJadwal.tokoId, toko.id), eq(pengirimanDiLuarJadwal.status, "menunggu")));
  const setuju = await setujuiPengirimanDiLuarJadwal({ id: p.id, idPengguna: idAdmin, hariIni });
  if (setuju.keadaan !== "berhasil") throw new Error(setuju.pesan);
  const [disetujui] = await db
    .select({ pada: pengirimanDiLuarJadwal.diputuskanPada })
    .from(pengirimanDiLuarJadwal)
    .where(eq(pengirimanDiLuarJadwal.id, p.id));
  if (disetujui.pada === null) throw new Error("belum disetujui");
  disetujuiPada = disetujui.pada;
  idSelasa = await finalisasi(SELASA);

  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["ekspor"] });
  kepala.cookie = operator.cookie;
}, 180_000);

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.tokoId, toko.id));
  await bersihkanTokoSmbUji({ idGudang: cibubur, idToko: toko.id });
});

const penanda = "Di luar jadwal · Tambahan";
const keterangan = () => `Alasan: ${ALASAN} · Disetujui Uji admin, ${formatWaktu(disetujuiPada)}`;
const teks = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function bacaEkspor(idRencana: number) {
  const respons = await GET(new Request(`http://localhost/pengiriman-gudang/${cibubur}/rencana-final/${idRencana}/ekspor`), {
    params: Promise.resolve({ id: String(cibubur), idRencana: String(idRencana) }),
  });
  expect(respons.status).toBe(200);
  const wb = XLSX.read(new Uint8Array(await respons.arrayBuffer()), { type: "array" });
  const semua = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets["Rencana final"], { header: 1, defval: null });
  return semua.find((b) => b[0] === "Jenis pengiriman")?.[1];
}

describe("penanda pengiriman di luar jadwal", () => {
  it("draft: ringkasan per toko dan toko yang dibuka menampilkan penanda Tambahan beserta alasan dan penyetuju", async () => {
    const html = renderToStaticMarkup(
      await HalamanPengirimanGudang({
        params: Promise.resolve({ id: String(cibubur) }),
        searchParams: Promise.resolve({ tanggal: SELASA, toko: String(toko.id) }),
      }),
    );
    const ringkasan = new RegExp(`<tr[^>]*data-ringkasan-toko="${toko.id}".*?</tr>`).exec(html)?.[0] ?? "";
    expect(ringkasan).toContain('data-di-luar-jadwal="tambahan"');
    expect(teks(ringkasan)).toContain(penanda);
    expect(teks(ringkasan)).toContain(keterangan());
    const dibuka = new RegExp(`<section[^>]*data-draft-toko="${toko.id}".*?</section>`).exec(html)?.[0] ?? "";
    expect(teks(dibuka)).toContain(penanda);
    expect(teks(dibuka)).toContain(keterangan());
  });

  it("rencana final, rincian, dan riwayat menampilkan penanda dari snapshot; rencana final rutin menampilkan Rutin", async () => {
    const final = teks(
      renderToStaticMarkup(await HalamanRencanaFinal({ params: Promise.resolve({ id: String(cibubur), idRencana: String(idSelasa) }) })),
    );
    expect(final).toContain(`Jenis pengiriman ${penanda} ${keterangan()}`);

    const rincian = (idRencana: number) =>
      HalamanRincianRencanaFinal({
        params: Promise.resolve({ id: String(cibubur), idRencana: String(idRencana) }),
        searchParams: Promise.resolve({}),
      });
    expect(teks(renderToStaticMarkup(await rincian(idSelasa)))).toContain(`Jenis pengiriman ${penanda} ${keterangan()}`);
    expect(teks(renderToStaticMarkup(await rincian(idSenin)))).toContain("Jenis pengiriman Rutin");

    const riwayat = renderToStaticMarkup(
      await HalamanRiwayatRencanaFinal({ params: Promise.resolve({ id: String(cibubur) }), searchParams: Promise.resolve({}) }),
    );
    const baris = (id: number) => teks(new RegExp(`<tr[^>]*>(?:(?!</tr>).)*rencana-final/${id}/rincian.*?</tr>`).exec(riwayat)?.[0] ?? "");
    expect(baris(idSelasa)).toContain(`${penanda} ${keterangan()}`);
    expect(baris(idSenin)).toContain(toko.nama);
    expect(baris(idSenin)).not.toContain("Di luar jadwal");
  });

  it('ekspor .xlsx memuat baris "Jenis pengiriman": di luar jadwal beserta alasan dan penyetuju, atau "Rutin"', async () => {
    expect(await bacaEkspor(idSelasa)).toBe(`${penanda} — ${ALASAN} — disetujui Uji admin, ${formatWaktu(disetujuiPada)}`);
    expect(await bacaEkspor(idSenin)).toBe("Rutin");
  });
});
