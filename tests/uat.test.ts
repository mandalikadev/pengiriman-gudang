import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseEnv } from "dotenv";
import { describe, expect, it } from "vitest";

import { OPERATOR_UAT } from "@/server/gudang/seed-uat";

import { isiEnvAwal, pesanAplikasiSiap, pesanPortBentrok, pesanPortLama, portBentrok, portLamaDiEnv } from "../scripts/uat/pesan";

// Paket UAT lokal (T99): bagian murni `pnpm uat` dan cakupan skenario docs/UAT.md.

const baca = (berkas: string) => readFileSync(new URL(`../${berkas}`, import.meta.url), "utf8");

describe("isiEnvAwal", () => {
  it("menyalin .env.example dan hanya mengganti BETTER_AUTH_SECRET", () => {
    const contoh = "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=ganti-ini\nADMIN_AWAL_SANDI=rahasia123\n";
    expect(isiEnvAwal(contoh, "acak")).toBe("DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=acak\nADMIN_AWAL_SANDI=rahasia123\n");
  });

  it(".env.example repo memuat semua variabel yang dibutuhkan seed dan aplikasi", () => {
    const hasil = isiEnvAwal(baca(".env.example"), "rahasia-acak");
    for (const nama of [
      "DATABASE_URL",
      "BETTER_AUTH_URL",
      "ADMIN_AWAL_EMAIL",
      "ADMIN_AWAL_SANDI",
      "S3_ENDPOINT",
      "S3_BUCKET",
      "UAT_SANDI_OPERATOR",
    ]) {
      expect(hasil).toMatch(new RegExp(`^${nama}=.+$`, "m"));
    }
    expect(hasil).toMatch(/^BETTER_AUTH_SECRET=rahasia-acak$/m);
  });

  it("tanpa BETTER_AUTH_SECRET → error", () => {
    expect(() => isiEnvAwal("DATABASE_URL=x\n", "acak")).toThrow();
  });
});

describe("pesanAplikasiSiap (T89)", () => {
  it("menyebut alamat aplikasi, email admin, tiga akun operator, dan UAT_SANDI_OPERATOR", () => {
    const pesan = pesanAplikasiSiap({ urlAplikasi: "http://localhost:3100", emailAdmin: "admin@example.com" });
    expect(pesan).toContain("Aplikasi siap: http://localhost:3100");
    expect(pesan).toContain("admin@example.com");
    expect(pesan).toContain("ADMIN_AWAL_SANDI");
    for (const operator of OPERATOR_UAT) expect(pesan).toContain(operator.email);
    expect(pesan).toContain("UAT_SANDI_OPERATOR");
  });

  it("tanpa ADMIN_AWAL_EMAIL → menunjuk ke .env", () => {
    expect(pesanAplikasiSiap({ urlAplikasi: "http://localhost:3100", emailAdmin: undefined })).toContain(
      "(lihat ADMIN_AWAL_EMAIL di .env)",
    );
  });
});

describe("seed UAT di pnpm uat (T89)", () => {
  it("db:seed-uat menjalankan scripts/seed-uat.ts dan dipanggil pnpm uat setelah db:seed-master", () => {
    const paket = JSON.parse(baca("package.json")) as { scripts: Record<string, string> };
    expect(paket.scripts["db:seed-uat"]).toBe("tsx scripts/seed-uat.ts");
    const uat = baca("scripts/uat.ts");
    expect(uat.indexOf('["db:seed-uat"]')).toBeGreaterThan(uat.indexOf('["db:seed-master"]'));
    expect(uat.indexOf('["db:seed-master"]')).toBeGreaterThan(-1);
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

describe("portLamaDiEnv (T74)", () => {
  const envBaru = {
    DATABASE_URL: "postgres://mandalika:mandalika@localhost:55432/mandalika",
    S3_ENDPOINT: "http://localhost:59000",
    BETTER_AUTH_URL: "http://localhost:3100",
  };

  it("port baru → tidak ada temuan", () => {
    expect(portLamaDiEnv(envBaru)).toEqual([]);
  });

  it("menemukan setiap variabel yang masih memakai port lama 5432, 9000, 9001, atau 3000", () => {
    expect(
      portLamaDiEnv({
        DATABASE_URL: "postgres://mandalika:mandalika@localhost:5432/mandalika",
        S3_ENDPOINT: "http://localhost:9000",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toEqual([
      { variabel: "DATABASE_URL", portLama: 5432, portBaru: 55432 },
      { variabel: "S3_ENDPOINT", portLama: 9000, portBaru: 59000 },
      { variabel: "BETTER_AUTH_URL", portLama: 3000, portBaru: 3100 },
    ]);
    expect(portLamaDiEnv({ ...envBaru, S3_ENDPOINT: "http://localhost:9001" })).toEqual([
      { variabel: "S3_ENDPOINT", portLama: 9001, portBaru: 59000 },
    ]);
  });

  it("DATABASE_URL tanpa port berarti port bawaan PostgreSQL 5432 (lama)", () => {
    expect(portLamaDiEnv({ ...envBaru, DATABASE_URL: "postgres://mandalika:mandalika@localhost/mandalika" })).toEqual([
      { variabel: "DATABASE_URL", portLama: 5432, portBaru: 55432 },
    ]);
  });

  it("pesan menyebut port lama, variabel, dan nilai yang harus ditulis di .env", () => {
    const pesan = pesanPortLama([
      { variabel: "DATABASE_URL", portLama: 5432, portBaru: 55432 },
      { variabel: "BETTER_AUTH_URL", portLama: 3000, portBaru: 3100 },
    ]);
    expect(pesan).toContain(".env");
    expect(pesan).toContain("DATABASE_URL memakai port lama 5432, ganti menjadi 55432");
    expect(pesan).toContain("BETTER_AUTH_URL memakai port lama 3000, ganti menjadi 3100");
    expect(pesan).toContain(".env.example");
    expect(pesan).toContain("tidak mengubah .env");
  });
});

describe("pnpm uat dengan .env berport lama (T74)", () => {
  it("berhenti dengan pesan yang jelas dan tidak mengubah .env", () => {
    const folder = mkdtempSync(join(tmpdir(), "uat-port-lama-"));
    try {
      const envLama = [
        "DATABASE_URL=postgres://mandalika:mandalika@localhost:5432/mandalika",
        "BETTER_AUTH_SECRET=rahasia-acak-minimal-32-karakter-0123456789",
        "BETTER_AUTH_URL=http://localhost:3000",
        "S3_ENDPOINT=http://localhost:9000",
        "",
      ].join("\n");
      writeFileSync(join(folder, ".env"), envLama);
      writeFileSync(join(folder, ".env.example"), baca(".env.example"));
      const lingkungan = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } as const;
      const hasil = spawnSync(
        fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)),
        [fileURLToPath(new URL("../scripts/uat.ts", import.meta.url))],
        { cwd: folder, env: lingkungan, encoding: "utf8", timeout: 60_000 },
      );
      expect(hasil.status).toBe(1);
      expect(hasil.stderr).toContain("DATABASE_URL memakai port lama 5432, ganti menjadi 55432");
      expect(hasil.stderr).toContain("S3_ENDPOINT memakai port lama 9000, ganti menjadi 59000");
      expect(hasil.stderr).toContain("BETTER_AUTH_URL memakai port lama 3000, ganti menjadi 3100");
      expect(readFileSync(join(folder, ".env"), "utf8")).toBe(envLama);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("port lokal khusus proyek (T74)", () => {
  it(".env.example memakai port baru", () => {
    const contoh = parseEnv(baca(".env.example"));
    expect(portLamaDiEnv(contoh)).toEqual([]);
    expect(contoh.DATABASE_URL).toBe("postgres://mandalika:mandalika@localhost:55432/mandalika");
    expect(contoh.S3_ENDPOINT).toBe("http://localhost:59000");
    expect(contoh.BETTER_AUTH_URL).toBe("http://localhost:3100");
  });

  it("docker-compose.yml memetakan port host 55432, 59000, dan 59001 ke port container bawaan", () => {
    const compose = baca("docker-compose.yml");
    expect(compose).toContain('"55432:5432"');
    expect(compose).toContain('"59000:9000"');
    expect(compose).toContain('"59001:9001"');
    expect(compose).not.toMatch(/"(5432|9000|9001):/);
  });

  it("pnpm dev menjalankan aplikasi di port 3100", () => {
    const paket = JSON.parse(baca("package.json")) as { scripts: Record<string, string> };
    expect(paket.scripts.dev).toBe("next dev --port 3100");
  });

  it("docs/UAT.md merujuk port baru dan tidak lagi merujuk port lama", () => {
    const uat = baca("docs/UAT.md");
    expect(uat).toContain("http://localhost:3100");
    for (const port of ["55432", "59000", "59001"]) expect(uat).toContain(port);
    expect(uat).not.toMatch(/localhost:(3000|5432|9000|9001)\b/);
    expect(uat).not.toMatch(/\bPort (3000|5432|9000|9001)\b/);
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
