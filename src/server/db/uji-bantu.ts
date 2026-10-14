import { readFileSync } from "node:fs";
import { join } from "node:path";

// Bantuan khusus test migrasi data. Database test sudah dimigrasi dari kosong, jadi test menjalankan lagi pernyataan
// berkas migrasi di atas data "sebelum migrasi" buatannya sendiri.

/** Pernyataan berkas migrasi `drizzle/<namaBerkas>`, dipisah `--> statement-breakpoint`, tanpa baris komentar. */
export function pernyataanMigrasi(namaBerkas: string): string[] {
  return readFileSync(join(import.meta.dirname, "../../../drizzle", namaBerkas), "utf8")
    .split("--> statement-breakpoint")
    .map((bagian) =>
      bagian
        .split("\n")
        .filter((baris) => !baris.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((bagian) => bagian !== "");
}
