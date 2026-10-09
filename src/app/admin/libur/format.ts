import type { JenisLibur } from "@/domain/libur";

const labelJenis: Record<JenisLibur, string> = {
  "libur nasional": "Libur nasional",
  "cuti bersama": "Cuti bersama",
};

/** Label jenis libur untuk layar (admin Libur dan Kalender). */
export function labelJenisLibur(jenis: JenisLibur) {
  return labelJenis[jenis];
}
