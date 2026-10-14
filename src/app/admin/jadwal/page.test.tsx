import { renderToStaticMarkup } from "react-dom/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanPersetujuanJadwal from "./page";

let bandung: number;
/** Toko uji yang dihubungkan ke Gudang Bandung di berkas ini. */
const tokoTerhubung: number[] = [];

/** Toko uji baru yang terhubung ke Gudang Bandung; hubungannya dilepas di `afterAll`. */
async function tokoDiBandung() {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: bandung });
  tokoTerhubung.push(t.id);
  return t;
}

beforeAll(async () => {
  bandung = await idGudangUji("Gudang Bandung");
});

afterAll(async () => {
  // Toko uji tidak lagi terhubung, agar toko berjadwal Senin tidak ikut draft gudang ini di berkas test lain (T75).
  if (tokoTerhubung.length > 0) await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, tokoTerhubung));
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async () => renderToStaticMarkup(await HalamanPersetujuanJadwal());
const kartu = (html: string, toko: string) => new RegExp(`<li data-usulan="\\d+">(?:(?!</li>).)*?${toko}.*?</li>`).exec(html)?.[0] ?? "";
const baris = (html: string, id: number) => new RegExp(`<tr[^>]*data-pengiriman="${id}".*?</tr>`).exec(html)?.[0] ?? "";

describe("/admin/jadwal", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer dan operator berhak → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  // T113 — PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas: usulan menunggu beserta jadwal tetap toko sebagai pembanding,
  // ditambah riwayat keputusan (terbaru dulu) dengan "Batalkan" untuk pengiriman berlaku yang belum lewat dan belum final.
  it("admin melihat usulan menunggu dengan jadwal tetap pembanding, Setujui/Tolak, dan riwayat keputusan dengan Batalkan", async () => {
    const t = await tokoDiBandung();
    const operator = await buatPenggunaUji("viewer");
    const admin = await buatPenggunaUji("admin");
    await db.insert(jadwalToko).values({
      tokoId: t.id,
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 0 },
        { hari: "Kamis", persiapanHari: 1 },
      ],
      dibuatOleh: admin.id,
    });
    const isi = { gudangId: bandung, tokoId: t.id, persiapanHari: 1 as const, alasan: "permintaan mendesak", diusulkanOleh: operator.id };
    const [menunggu, berlaku, lewat, ditolak] = await db
      .insert(pengirimanDiLuarJadwal)
      .values([
        { ...isi, jenis: "pindah", tanggalKirim: "2099-01-06", tanggalRutinDipindah: "2099-01-05" },
        { ...isi, jenis: "tambahan", tanggalKirim: "2099-01-13", status: "berlaku", diputuskanOleh: admin.id, diputuskanPada: new Date("2026-10-10T03:00:00Z") },
        { ...isi, jenis: "tambahan", tanggalKirim: "2020-01-07", status: "berlaku", diputuskanOleh: admin.id, diputuskanPada: new Date("2026-10-11T03:00:00Z") },
        { ...isi, jenis: "tambahan", tanggalKirim: "2099-01-20", status: "ditolak", alasanPenolakan: "stok kosong", diputuskanOleh: admin.id, diputuskanPada: new Date("2026-10-12T03:00:00Z") },
      ])
      .returning();
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = await buka();
    const k = kartu(html, t.nama);
    expect(k).toContain("Gudang Bandung");
    expect(k).toContain("Menunggu");
    expect(k).toContain("Pindahan dari Senin, 05-01-2099 · Selasa, 06-01-2099 (H−1)");
    expect(k).toContain("2× seminggu: Senin (H), Kamis (H−1)");
    expect(k).toContain("permintaan mendesak");
    expect(k).toContain(`Diusulkan Uji viewer`);
    expect(k).toContain("Setujui");
    expect(k).toContain("Tolak");
    expect(html).toContain(`data-usulan="${menunggu.id}"`);

    // Riwayat keputusan: yang menunggu tidak ada; terbaru dulu (ditolak 12-10, lalu 11-10, lalu 10-10).
    expect(html).not.toContain(`data-pengiriman="${menunggu.id}"`);
    const urutan = [ditolak.id, lewat.id, berlaku.id].map((id) => html.indexOf(`data-pengiriman="${id}"`));
    expect(urutan.every((posisi) => posisi > 0)).toBe(true);
    expect([...urutan].sort((a, b) => a - b)).toEqual(urutan);
    expect(baris(html, ditolak.id)).toContain("Alasan penolakan: stok kosong");
    expect(baris(html, berlaku.id)).toContain("Batalkan");
    expect(baris(html, lewat.id)).not.toContain("Batalkan");
    expect(baris(html, ditolak.id)).not.toContain("Batalkan");
  });

  it("riwayat keputusan gudang nonaktif tanpa penanda Nonaktif (penanda hanya di halaman Riwayat, T128)", async () => {
    const nonaktif = await buatGudangUji({ aktif: false });
    try {
      const t = await buatTokoUji();
      const operator = await buatPenggunaUji("viewer");
      const admin = await buatPenggunaUji("admin");
      const [ditolak] = await db
        .insert(pengirimanDiLuarJadwal)
        .values({
          gudangId: nonaktif.id,
          tokoId: t.id,
          jenis: "tambahan",
          tanggalKirim: "2099-02-03",
          persiapanHari: 1,
          alasan: "uji T128",
          diusulkanOleh: operator.id,
          status: "ditolak",
          alasanPenolakan: "gudang tutup",
          diputuskanOleh: admin.id,
          diputuskanPada: new Date(),
        })
        .returning();
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

      const b = baris(await buka(), ditolak.id);
      expect(b).toContain(nonaktif.nama);
      expect(b).not.toContain('data-status="gudangNonaktif"');
    } finally {
      await hapusGudangUji(nonaktif.id);
    }
  });
});
