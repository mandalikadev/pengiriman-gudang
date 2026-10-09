import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, emailUnik, kepalaPenggunaUji, masukUji, sandiUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { buatPengguna, nonaktifkanPengguna, ubahPeran } from "./aksi";

async function cariPengguna(email: string) {
  const [baris] = await db.select().from(user).where(eq(user.email, email));
  return baris;
}

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("viewer yang memanggil aksi admin langsung (tanpa UI) ditolak", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
  });

  it("buatPengguna ditolak dan tidak ada pengguna yang dibuat", async () => {
    const email = emailUnik("oleh-viewer");
    await expect(buatPengguna({ nama: "X", email, sandi: sandiUji, peran: "admin" })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await cariPengguna(email)).toBeUndefined();
  });

  it("ubahPeran ditolak dan peran tidak berubah", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await cariPengguna(target.email)).role).toBe("viewer");
  });

  it("nonaktifkanPengguna ditolak dan pengguna tetap aktif", async () => {
    const target = await buatPenggunaUji("admin");
    await expect(nonaktifkanPengguna({ idPengguna: target.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await cariPengguna(target.email)).banned).toBe(false);
  });
});

describe("pengguna yang belum masuk diarahkan ke halaman masuk", () => {
  it("buatPengguna tanpa sesi", async () => {
    const email = emailUnik("tanpa-sesi");
    await expect(buatPengguna({ nama: "X", email, sandi: sandiUji, peran: "viewer" })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
    expect(await cariPengguna(email)).toBeUndefined();
  });
});

describe("admin", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("membuat pengguna dengan peran pilihan; pengguna baru bisa masuk", async () => {
    const email = emailUnik("baru");
    await expect(buatPengguna({ nama: "Budi", email, sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "berhasil",
    });
    expect(await cariPengguna(email)).toMatchObject({ name: "Budi", role: "viewer", banned: false });
    await expect(masukUji(email)).resolves.toContain("session_token");
  });

  it("isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    const email = emailUnik("pendek");
    await expect(buatPengguna({ nama: "Budi", email, sandi: "1234567", peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Kata sandi minimal 8 karakter.",
    });
    await expect(buatPengguna({ nama: "Budi", email, sandi: sandiUji, peran: "operator" })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    await expect(buatPengguna({ nama: "", email, sandi: sandiUji, peran: "viewer" })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    await expect(buatPengguna({ nama: "Budi", email: "bukan-email", sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Email tidak valid.",
    });
    expect(await cariPengguna(email)).toBeUndefined();
  });

  it("email yang sudah dipakai → gagal", async () => {
    const ada = await buatPenggunaUji("viewer");
    await expect(buatPengguna({ nama: "Lagi", email: ada.email, sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Email sudah dipakai pengguna lain.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    kepala.muatUlangGagal = true;
    const email = emailUnik("muat-ulang");
    await expect(buatPengguna({ nama: "Citra", email, sandi: sandiUji, peran: "admin" })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect((await cariPengguna(email)).role).toBe("admin");
  });

  it("mengubah peran", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await cariPengguna(target.email)).role).toBe("admin");
    await expect(ubahPeran({ idPengguna: target.id, peran: "operator" })).resolves.toMatchObject({ keadaan: "gagal" });
    expect((await cariPengguna(target.email)).role).toBe("admin");
  });

  it("menonaktifkan pengguna: sesi berjalannya dicabut dan ia tidak bisa masuk lagi", async () => {
    const target = await kepalaPenggunaUji("viewer");
    await expect(nonaktifkanPengguna({ idPengguna: target.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await cariPengguna(target.email)).banned).toBe(true);
    await expect(masukUji(target.email)).rejects.toThrow();

    kepala.cookie = target.cookie;
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });
});
