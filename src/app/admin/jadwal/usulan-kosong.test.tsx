import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
// Database test bersama bisa berisi usulan menunggu dari berkas lain; keadaan "tidak ada usulan" dibuat pasti di sini.
vi.mock("@/server/gudang/pengiriman-di-luar-jadwal", async (asli) => ({
  ...(await asli<typeof import("@/server/gudang/pengiriman-di-luar-jadwal")>()),
  daftarUsulanMenungguPersetujuan: async () => [],
}));

import HalamanPersetujuanJadwal from "./page";

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

describe("/admin/jadwal tanpa usulan menunggu (T120)", () => {
  it("keadaan kosong ikon + teks + satu kalimat langkah berikutnya", async () => {
    const html = renderToStaticMarkup(await HalamanPersetujuanJadwal());
    expect(html).toMatch(
      /data-keadaan-kosong[^>]*><span[^>]*><svg[^>]*lucide-inbox[^]*?Tidak ada usulan pengiriman di luar jadwal yang menunggu persetujuan\.<\/p><p[^>]*>Usulan baru dari operator gudang akan muncul di sini untuk disetujui atau ditolak\.<\/p>/,
    );
  });
});
