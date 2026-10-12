import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
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

import HalamanPengirimanGudang from "./page";
import HalamanRincianRencanaFinal from "./rencana-final/[idRencana]/rincian/page";

// T91: header toko draft, rincian baris, dan rincian rencana final menampilkan panjang cakupan hasil hitung dari jadwal
// (PRD A6 ▶ Revisi 2026-10-12, UAT ketiga). Contoh SMB: kirim Senin → L = 3, p = 0; kirim Kamis → L = 4, p = 1.

const SENIN = "2026-10-19";
const KAMIS = "2026-10-22";

let bandung: number;
let toko: { id: number; nama: string };
let kodeProduk: string;
let idOperator: string;

beforeAll(async () => {
  const idAdmin = (await buatPenggunaUji("admin")).id;
  bandung = await idGudangUji("Gudang Bandung");
  ({ toko, kodeProduk } = await siapkanTokoSmbUji({ idGudang: bandung, idAdmin }));
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: [...daftarHakTindakan] });
  kepala.cookie = operator.cookie;
  idOperator = operator.id;
  for (const tanggal of [SENIN, KAMIS]) {
    const hasil = await hitungDraftRencana({ idGudang: bandung, tanggalKirim: parseTanggalBisnis(tanggal), idPengguna: idOperator });
    if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  }
}, 120_000);

afterAll(async () => {
  await bersihkanTokoSmbUji({ idGudang: bandung, idToko: toko.id });
});

const bukaToko = async (tanggal: string, tambahan: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(bandung) }),
      searchParams: Promise.resolve({ tanggal, toko: String(toko.id), ...tambahan }),
    }),
  );

const bagianRincian = (html: string) =>
  new RegExp(`<section[^>]*data-rincian-baris="${toko.id}\\|${kodeProduk}".*?</section>`).exec(html)?.[0] ?? "";

describe("panjang cakupan hasil hitung di tampilan", () => {
  it("header toko draft: Senin → Panjang cakupan 3 hari; Kamis → Panjang cakupan 4 hari", async () => {
    expect(await bukaToko(SENIN)).toMatch(new RegExp(`data-draft-toko="${toko.id}".*?Persiapan H · Panjang cakupan 3 hari`));
    expect(await bukaToko(KAMIS)).toMatch(new RegExp(`data-draft-toko="${toko.id}".*?Persiapan H−1 · Panjang cakupan 4 hari`));
  });

  it("rincian baris: tanggal cakupan dan panjang cakupan hasil hitung", async () => {
    const senin = bagianRincian(await bukaToko(SENIN, { rincian: `${toko.id}|${kodeProduk}` }));
    expect(senin).toContain("Senin, 19-10-2026 – Rabu, 21-10-2026 · 3 hari · Persiapan H · Panjang cakupan 3 hari");
    const kamis = bagianRincian(await bukaToko(KAMIS, { rincian: `${toko.id}|${kodeProduk}` }));
    expect(kamis).toContain("Rabu, 21-10-2026 – Minggu, 25-10-2026 · 5 hari · Persiapan H−1 · Panjang cakupan 4 hari");
  });

  it("rincian rencana final: panjang cakupan hasil hitung yang tersimpan", async () => {
    const tanggalKirim = parseTanggalBisnis(KAMIS);
    expect(await simpanStokToko({ idGudang: bandung, tanggalKirim, tokoId: toko.id, stok: [{ kodeProduk, stokAkhir: 10 }] })).toEqual({
      keadaan: "berhasil",
    });
    const versiDilihat = (await bacaDraftRencana(bandung, tanggalKirim))?.toko.find((t) => t.id === toko.id)?.versi ?? "";
    const hasil = await finalisasiRencanaToko({ idGudang: bandung, tanggalKirim, tokoId: toko.id, idPengguna: idOperator, versiDilihat });
    if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);

    const html = renderToStaticMarkup(
      await HalamanRincianRencanaFinal({
        params: Promise.resolve({ id: String(bandung), idRencana: String(hasil.idRencana) }),
        searchParams: Promise.resolve({}),
      }),
    );
    const jadwal = new RegExp(`<section[^>]*data-dasar="jadwal".*?</section>`).exec(html)?.[0] ?? "";
    expect(jadwal).toContain("Persiapan H−1 · Panjang cakupan 4 hari");
  });
});
