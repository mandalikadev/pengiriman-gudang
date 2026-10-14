"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SEMUA } from "./filter";

function Pilihan({
  label,
  name,
  terapan,
  opsi,
}: {
  label: string;
  name: string;
  terapan: string;
  opsi: readonly { nilai: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-56 flex-col gap-2 font-semibold">
      <span id={id}>{label}</span>
      <Select name={name} defaultValue={terapan}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>{opsi.find((o) => o.nilai === terapan)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {opsi.map((o) => (
            <SelectItem key={o.nilai} value={o.nilai}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Tanggal({ label, name, terapan }: { label: string; name: string; terapan: string }) {
  const id = useId();
  return (
    <div className="flex min-w-44 flex-col gap-2 font-semibold">
      <label htmlFor={id}>{label}</label>
      <Input id={id} type="date" name={name} defaultValue={terapan} />
    </div>
  );
}

/**
 * Filter riwayat rencana final (T63, T127): gudang, toko, dan rentang tanggal kirim dari–sampai (kosong = tidak dibatasi),
 * ditambah cari nama toko (T119). Seperti Ringkasan, hasil baru berubah setelah Terapkan: Terapkan menulis pilihan ke URL
 * (`?gudang=<id>&toko=<id>&dari=YYYY-MM-DD&sampai=YYYY-MM-DD&cari=`) dan kembali ke halaman 1; halaman menyaring di
 * server.
 */
export function FilterRiwayat({
  action,
  gudang,
  toko,
  terapan,
}: {
  action: string;
  gudang: readonly { id: number; nama: string; aktif: boolean }[];
  toko: readonly { id: number; nama: string }[];
  terapan: { gudang: string; toko: string; dari: string; sampai: string; cari: string };
}) {
  const idCari = useId();
  return (
    <Form action={action} data-filter-rencana-final className="flex flex-wrap items-end gap-4">
      <Pilihan
        label="Gudang"
        name="gudang"
        terapan={terapan.gudang}
        opsi={[
          { nilai: SEMUA, label: "Semua gudang" },
          ...gudang.map((g) => ({ nilai: String(g.id), label: g.aktif ? g.nama : `${g.nama} (nonaktif)` })),
        ]}
      />
      <Pilihan
        label="Toko"
        name="toko"
        terapan={terapan.toko}
        opsi={[{ nilai: SEMUA, label: "Semua toko" }, ...toko.map((t) => ({ nilai: String(t.id), label: t.nama }))]}
      />
      <Tanggal label="Tanggal kirim dari" name="dari" terapan={terapan.dari} />
      <Tanggal label="Tanggal kirim sampai" name="sampai" terapan={terapan.sampai} />
      <div className="flex min-w-56 flex-col gap-2 font-semibold">
        <label htmlFor={idCari}>Cari toko</label>
        <div className="flex items-center gap-2">
          <Search aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          <Input id={idCari} type="search" name="cari" autoComplete="off" placeholder="Nama toko" defaultValue={terapan.cari} />
        </div>
      </div>
      <Button type="submit" className="active:scale-95">
        Terapkan
      </Button>
    </Form>
  );
}
