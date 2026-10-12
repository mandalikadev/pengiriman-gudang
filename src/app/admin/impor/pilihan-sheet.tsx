import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { NAMA_BULAN } from "./format";

/** ADR-0005: sheet `MP …` tampil, tetapi tidak bisa dipilih. */
export function sheetBisaDipilih(nama: string) {
  return !nama.startsWith("MP ");
}

/**
 * Daftar sheet workbook sebagai kotak centang (PRD A1, Keputusan 2026-10-12). `terpilih` memetakan nama sheet yang
 * dicentang ke bulan impornya (`"1"`–`"12"`, atau `""` jika belum dipilih); setiap sheet terpilih punya pemilih bulan.
 */
export function PilihanSheet({
  daftarSheet,
  terpilih,
  onCentang,
  onPilihBulan,
}: {
  daftarSheet: readonly string[];
  terpilih: Readonly<Record<string, string>>;
  onCentang: (nama: string, dicentang: boolean) => void;
  onPilihBulan: (nama: string, bulan: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">Sheet</legend>
      {daftarSheet.length === 0 ? <p className="text-muted-foreground">Workbook ini tidak berisi sheet.</p> : null}
      <ul className="flex flex-col gap-1">
        {daftarSheet.map((nama) => {
          const bisa = sheetBisaDipilih(nama);
          const bulan = terpilih[nama];
          const dicentang = bulan !== undefined;
          return (
            <li
              key={nama}
              className={cn(
                "flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-1 transition-colors duration-300 ease-out",
                bisa && "hover:bg-primary/10",
                dicentang && "bg-accent hover:bg-accent",
              )}
            >
              <label className={cn("flex min-h-11 flex-1 items-center gap-3", bisa ? "cursor-pointer" : "cursor-not-allowed")}>
                <input
                  type="checkbox"
                  value={nama}
                  className="size-5 accent-primary"
                  checked={dicentang}
                  disabled={!bisa}
                  onChange={(e) => onCentang(nama, e.target.checked)}
                />
                <span className={cn("font-semibold", !bisa && "text-muted-foreground")}>{nama}</span>
                {!bisa ? <span className="text-muted-foreground">di luar cakupan saat ini</span> : null}
              </label>
              {dicentang ? (
                <div className="w-full sm:w-48">
                  <Select value={bulan} onValueChange={(nilai) => onPilihBulan(nama, nilai)}>
                    <SelectTrigger aria-label={`Bulan impor ${nama}`}>
                      <SelectValue placeholder="Pilih bulan">{bulan ? NAMA_BULAN[Number(bulan) - 1] : undefined}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {NAMA_BULAN.map((namaBulan, i) => (
                        <SelectItem key={namaBulan} value={String(i + 1)}>
                          {namaBulan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
