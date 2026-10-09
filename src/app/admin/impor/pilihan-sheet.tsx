import { cn } from "@/lib/utils";

/** ADR-0005: sheet `MP …` tampil, tetapi tidak bisa dipilih. */
export function sheetBisaDipilih(nama: string) {
  return !nama.startsWith("MP ");
}

/** Daftar sheet workbook sebagai pilihan radio. */
export function PilihanSheet({
  daftarSheet,
  terpilih,
  onPilih,
}: {
  daftarSheet: readonly string[];
  terpilih: string;
  onPilih: (nama: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">Sheet</legend>
      {daftarSheet.length === 0 ? <p className="text-muted-foreground">Workbook ini tidak berisi sheet.</p> : null}
      <ul className="flex flex-col gap-1">
        {daftarSheet.map((nama) => {
          const bisa = sheetBisaDipilih(nama);
          return (
            <li key={nama}>
              <label
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 transition-colors duration-300 ease-out",
                  bisa ? "cursor-pointer hover:bg-primary/10" : "cursor-not-allowed",
                  terpilih === nama && "bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="sheet"
                  value={nama}
                  className="size-5 accent-primary"
                  checked={terpilih === nama}
                  disabled={!bisa}
                  onChange={() => onPilih(nama)}
                />
                <span className={cn("font-semibold", !bisa && "text-muted-foreground")}>{nama}</span>
                {!bisa ? <span className="text-muted-foreground">di luar cakupan saat ini</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
