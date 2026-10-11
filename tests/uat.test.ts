import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isiEnvAwal, pesanPortBentrok, portBentrok } from "../scripts/uat/pesan";

// Paket UAT lokal (T99): bagian murni `pnpm uat` dan cakupan skenario docs/UAT.md.

const baca = (berkas: string) => readFileSync(new URL(`../${berkas}`, import.meta.url), "utf8");

describe("isiEnvAwal", () => {
  it("menyalin .env.example dan hanya mengganti BETTER_AUTH_SECRET", () => {
    const contoh = "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=ganti-ini\nADMIN_AWAL_SANDI=rahasia123\n";
    expect(isiEnvAwal(contoh, "acak")).toBe("DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=acak\nADMIN_AWAL_SANDI=rahasia123\n");
  });

  it(".env.example repo memuat semua variabel yang dibutuhkan seed dan aplikasi", () => {
    const hasil = isiEnvAwal(baca(".env.example"), "rahasia-acak");
    for (const nama of ["DATABASE_URL", "BETTER_AUTH_URL", "ADMIN_AWAL_EMAIL", "ADMIN_AWAL_SANDI", "S3_ENDPOINT", "S3_BUCKET"]) {
      expect(hasil).toMatch(new RegExp(`^${nama}=.+$`, "m"));
    }
    expect(hasil).toMatch(/^BETTER_AUTH_SECRET=rahasia-acak$/m);
  });

  it("tanpa BETTER_AUTH_SECRET → error", () => {
    expect(() => isiEnvAwal("DATABASE_URL=x\n", "acak")).toThrow();
  });
});

describe("portBentrok", () => {
  it("membaca port dari pesan Docker 'port is already allocated'", () => {
    const keluaran =
      "Error response from daemon: driver failed programming external connectivity on endpoint x: Bind for 0.0.0.0:5432 failed: port is already allocated";
    expect(portBentrok(keluaran)).toBe(5432);
  });

  it("membaca port dari pesan Docker 'address already in use'", () => {
    const keluaran =
      "Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint y: failed to bind host port for 0.0.0.0:9000:172.18.0.3:9000/tcp: address already in use";
    expect(portBentrok(keluaran)).toBe(9000);
  });

  it("membaca port dari pesan 'listen tcp ... bind: address already in use'", () => {
    expect(portBentrok("Error starting userland proxy: listen tcp4 0.0.0.0:9001: bind: address already in use")).toBe(9001);
  });

  it("kegagalan lain → null", () => {
    expect(portBentrok("Error response from daemon: pull access denied for postgres")).toBeNull();
  });

  it("pesan untuk pemilik menyebut portnya", () => {
    expect(pesanPortBentrok(5432)).toContain("Port 5432 sudah dipakai program lain");
  });
});

describe("docs/UAT.md", () => {
  const uat = baca("docs/UAT.md");
  const judulBagian = uat.split("\n").filter((baris) => baris.startsWith("## "));

  it("setiap bagian A1–A7 dan B1–B9 di PRD punya bagian skenario di UAT.md", () => {
    const bagianPrd = [...baca("docs/PRD.md").matchAll(/^### ((?:A[1-7]|B[1-9])\.)/gm)].map((c) => c[1]);
    expect(bagianPrd).toHaveLength(16);
    for (const bagian of bagianPrd) {
      expect(judulBagian.some((judul) => judul.startsWith(`## ${bagian}`)), `bagian ${bagian}`).toBe(true);
    }
  });

  it("setiap bagian skenario punya langkah, hasil yang diharapkan, dan kolom catatan", () => {
    const potongan = uat.split(/^## /m).filter((p) => /^(?:A[1-7]|B[1-9])\./.test(p));
    expect(potongan).toHaveLength(16);
    for (const isi of potongan) {
      const judul = isi.split("\n")[0];
      expect(isi, judul).toMatch(/\| *No *\| *Langkah *\| *Hasil yang diharapkan *\| *Hasil \(OK\/Tidak\) *\| *Catatan *\|/);
      expect(isi, judul).toMatch(/^\| *[A-B][1-9]\.1 *\|/m);
    }
  });

  it("merujuk berkas data-lokal dan angka 15GL-GOR PMS Juni", () => {
    expect(uat).toContain("data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx");
    expect(uat).toContain("data-lokal/");
    expect(uat).toContain("15GL-GOR");
    expect(uat).toMatch(/Senin–Kamis \*\*1\*\*.*Jumat \*\*0\*\*.*Sabtu \*\*1\*\*.*Minggu \*\*0\*\*/);
  });

  it("punya cara menyalakan dan cara melaporkan temuan", () => {
    expect(uat).toContain("pnpm uat");
    expect(judulBagian.some((judul) => /melaporkan temuan/i.test(judul))).toBe(true);
  });
});
