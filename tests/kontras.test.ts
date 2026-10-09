import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Token dibaca dari berkas yang benar-benar dipakai aplikasi (src/app/globals.css),
// bukan disalin ke test, agar perubahan token langsung terjaga oleh test ini.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function bacaToken(): Map<string, string> {
  const root = css.match(/:root\s*\{([^}]*)\}/);
  if (!root) throw new Error("Blok :root tidak ditemukan di globals.css");
  const token = new Map<string, string>();
  for (const [, nama, nilai] of root[1].matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) {
    token.set(nama, nilai.trim());
  }
  return token;
}

const token = bacaToken();

function hex(nama: string): string {
  const nilai = token.get(nama);
  if (!nilai || !/^#[0-9a-fA-F]{6}$/.test(nilai)) {
    throw new Error(`Token --${nama} harus berupa hex 6 digit, didapat: ${nilai}`);
  }
  return nilai;
}

type Rgb = readonly [number, number, number];

function rgb(warna: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(warna.slice(i, i + 2), 16)) as unknown as Rgb;
}

function luminansi(warna: string | Rgb): number {
  const kanal = typeof warna === "string" ? rgb(warna) : warna;
  const [r, g, b] = kanal.map((k) => {
    const v = k / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontras(a: string | Rgb, b: string | Rgb): number {
  const [terang, gelap] = [luminansi(a), luminansi(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}

// Pasangan teks/latar dari tabel docs/DESIGN.md §2.
const pasanganTeks: Array<[teks: string, latar: string]> = [
  ["foreground", "background"],
  ["primary", "background"],
  ["primary-foreground", "primary"],
  ["secondary", "background"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["destructive", "background"],
  ["warning", "background"],
  ["info", "background"],
  ["success", "background"],
  // Teks tombol varian `destructive` (DESIGN §6) di atas latar destructive.
  ["secondary-foreground", "destructive"],
];

// DESIGN §7 (Keputusan 2026-10-09): latar badge = token status opacity 10% di atas latar baris
// (latar halaman, kartu/tabel, atau baris terpilih `accent`); teks badge memakai `foreground`.
const tokenStatus = ["success", "info", "primary", "warning", "destructive", "muted-foreground"] as const;
const latarBaris = ["background", "card", "accent"] as const;
const OPACITY_LATAR_BADGE = 0.1;

// Komposit alfa: warna atas dengan opacity `alfa` di atas warna bawah (kanal 0–255, tanpa pembulatan).
function campur(atas: string, bawah: string, alfa: number): Rgb {
  const [a, b] = [rgb(atas), rgb(bawah)];
  return [0, 1, 2].map((i) => a[i] * alfa + b[i] * (1 - alfa)) as unknown as Rgb;
}

function latarBadge(status: string, latar: string): Rgb {
  return campur(hex(status), hex(latar), OPACITY_LATAR_BADGE);
}

describe("kontras token warna (DESIGN §2)", () => {
  it.each(pasanganTeks)("teks %s di atas %s minimal 4,5 : 1", (teks, latar) => {
    expect(kontras(hex(teks), hex(latar))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(tokenStatus.flatMap((status) => latarBaris.map((latar) => [status, latar] as const)))(
    "badge %s di atas %s: teks foreground minimal 4,5 : 1 (DESIGN §7)",
    (status, latar) => {
      expect(kontras(hex("foreground"), latarBadge(status, latar))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(tokenStatus.flatMap((status) => latarBaris.map((latar) => [status, latar] as const)))(
    "badge %s di atas %s: ikon berwarna status minimal 3 : 1 (komponen non-teks)",
    (status, latar) => {
      expect(kontras(hex(status), latarBadge(status, latar))).toBeGreaterThanOrEqual(3);
    },
  );

  it("bingkai input terhadap background minimal 3 : 1", () => {
    expect(kontras(hex("input"), hex("background"))).toBeGreaterThanOrEqual(3);
  });

  it("nilai token sama dengan tabel DESIGN §2", () => {
    expect(Object.fromEntries(
      [
        "background", "foreground", "card", "primary", "primary-foreground", "secondary",
        "secondary-foreground", "clay", "accent", "accent-foreground", "muted",
        "muted-foreground", "border", "input", "ring", "destructive", "warning", "info", "success",
      ].map((nama) => [nama, hex(nama).toUpperCase()]),
    )).toEqual({
      background: "#FDFCF8",
      foreground: "#2C2C24",
      card: "#FEFEFA",
      primary: "#5D7052",
      "primary-foreground": "#F3F4F1",
      secondary: "#946538",
      "secondary-foreground": "#FFFFFF",
      clay: "#C18C5D",
      accent: "#E6DCCD",
      "accent-foreground": "#4A4A40",
      muted: "#F0EBE5",
      "muted-foreground": "#6B6B60",
      border: "#DED8CF",
      input: "#948C7D",
      ring: "#5D7052",
      destructive: "#A85448",
      warning: "#8A6A1F",
      info: "#4F6475",
      success: "#4A5C40",
    });
  });
});
