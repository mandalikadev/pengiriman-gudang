# Keputusan Terbuka

Daftar hal yang **belum diputuskan pemilik**. Agen tidak mengimplementasikan perilaku yang bergantung pada butir terbuka. Jika tiket menyentuh butir terbuka, agen berhenti, mengomentari issue, dan memberi label `needs-info`. Hanya pemilik yang mengubah berkas ini. Setelah diputuskan, butir dipindah ke bagian "Selesai" beserta rujukan ADR atau PRD-nya.

## Terbuka

| ID | Pertanyaan | Menahan | Usulan sementara (berlaku hanya jika ditulis di tiket) |
|---|---|---|---|
| OD-04 | Penyedia hosting. Syarat: worker yang hidup lama, PostgreSQL region Singapura, storage S3. | Deploy (bukan M1) | — |
| OD-12 | Toko mana terhubung ke gudang mana (sisa OD-02). Menyusul dari pemilik sebagai data. | Data awal hubungan toko–gudang (tidak menahan kode T21) | — (data, bukan kode) |

## Tindakan pemilik (bukan keputusan)

| ID | Tindakan |
|---|---|
| TP-01 | Perbaiki workbook: `SEPTEMBER (S)` memiliki 750 sel bermasalah pada kolom `31/9`: 749 sel berisi penjualan (contoh: PMS `AJ11`, SENTUL `AAP4`) ditambah 1 nol yang diketik di `ACZ305` (nol yang diketik dihitung sebagai data, ADR-0005). Impor September tertahan sampai diperbaiki. |

## Ditunda (di luar scope tahap ini)

- Sheet `MP … (S)` (PUSAT, DEPOK, KARAWACI, KEMANG): makna dan hubungannya dengan toko/gudang.

## Selesai

| Keputusan | Rujukan |
|---|---|
| Periode sumber gudang ditetapkan admin, satu per gudang | ADR-0003 |
| Penomoran minggu, libur, tanggal invalid | PRD Bagian B, ADR-0004, ADR-0005 |
| Klasifikasi manual: display tester `-T` dan kertas tester `KTP`/`KTL` | ADR-0007 |
| Keluarga aroma dan rework | ADR-0006 |
| Fokus sheet `(S)`; sheet MP ditunda | ADR-0005 |
| "ASOY" adalah salah ketik | PRD B2 |
| OD-01: kuantitas negatif di sel penjualan adalah salah input; harus diperbaiki di Excel sebelum impor (2026-10-09) | PRD A1; T10 |
| OD-02 (bagian nama): lima gudang = Pusat, Gudang Bali, Gudang Bandung, Gudang Cibubur, Gudang Jabodetabek (2026-10-09). Pemetaan toko ke gudang → OD-12 | PRD A3; T21 |
| OD-03: satu toko tidak boleh terhubung ke lebih dari satu gudang (2026-10-09) | ADR-0009, PRD A3; T21 |
| OD-08: definisi penanda kelengkapan sesuai usulan (2026-10-09) | PRD A2; T04 |
| OD-09: angka harapan `laporan-15GL-GOR-PMS-juni.json` (Senin–Kamis 1, Jumat 0, Sabtu 1, Minggu 0) benar (2026-10-09) | PRD A2; T04 |
| OD-10: hanya admin yang boleh mengunggah dan mengaktifkan impor (2026-10-09) | PRD A3; T11 |
| T05: produk manual selalu berstatus `manual` berapa pun stoknya; stok kosong/negatif produk manual tidak menahan finalisasi; stok yang diisi tetap disimpan dan ditampilkan (2026-10-09) | PRD A6; T05 |
| T05: mesin mengembalikan semua masalah sebagai daftar; urutan tampilan `kebutuhan-tidak-tersedia`, `stok-negatif`, `stok-belum-diisi`; semuanya harus beres sebelum finalisasi (2026-10-09) | PRD A6; T05 |
| T05: jika masalah hanya soal stok, kebutuhan dan rinciannya tetap tampil dan jumlah kirim tampil "—"; jika kebutuhan tidak tersedia, tampilkan tanggal/kategori yang tidak punya rata-rata (2026-10-09) | PRD A6; T05 |
| T07: "Belum disimpan" = `muted-foreground` + `PencilLine` + "Ada perubahan yang belum disimpan"; badge: latar 10% warna status, ikon warna status, teks `foreground` (2026-10-09) | DESIGN §7; T07 |
| T04: Rata-rata Ringkasan ditandai parsial jika ada rata-rata bulanan pembentuknya yang parsial (2026-10-09) | PRD A2; T04 |
| T06: produk berkode `-T` yang juga berkategori `KTP`/`KTL` beralasan `display-tester` (aturan kode didahulukan) (2026-10-09) | ADR-0007; T06 |
| T10: nama toko dicocokkan dengan master setelah normalisasi (trim, spasi ganda jadi satu, huruf besar); tanpa pencocokan mirip/fuzzy (2026-10-09) | PRD A1; T10 |
| T20: admin tidak boleh menonaktifkan akunnya sendiri (2026-10-09) | PRD A3; T20 |
| T20: admin boleh mengubah perannya sendiri, kecuali jika ia satu-satunya admin aktif; aplikasi harus selalu punya minimal satu admin aktif (2026-10-09) | PRD A3; T20 |
| T20: "aktifkan kembali pengguna" dan tombol "Keluar" (logout) dibuat sebagai tiket terpisah (2026-10-09) | PRD A3; T20 |
| Teks sekunder di atas latar `accent` (mis. baris terpilih) memakai `accent-foreground`, bukan `muted-foreground` (2026-10-09) | DESIGN §2, §8 |
| `agentRules: false` di `next.config.ts` supaya `next dev` tidak mengubah AGENTS.md (2026-10-09) | `next.config.ts` |
| TP-02: `@GANTI-PEMILIK` di `.github/CODEOWNERS` diganti `@mandalikadev` (2026-10-09) | `.github/CODEOWNERS` |
| Impor: toko nonaktif tetap diterima, dengan peringatan di halaman tinjau (2026-10-09) | PRD A1 |
| Master produk mengikuti impor yang terakhir diaktifkan (nama, ukuran, kategori; klasifikasi dihitung ulang); perubahan tampil sebagai peringatan "data produk berubah" di halaman tinjau; kode tetap identitas; rencana final tidak terpengaruh (snapshot) (2026-10-09) | PRD A1, ADR-0006 |
| Penugasan operator tanpa hak tindakan memberi akses lihat (hanya-baca) ke halaman Pengiriman Gudang gudangnya (2026-10-09) | PRD A3 |
| OD-05: struktur file ranking pusat — sheet `RANKING SALES`, kolom `RANK`, `VARIANT`, `QTY SALES`; bulan dipilih admin; tujuh besar = RANK 1–7; setiap baris satu kelompok ranking (termasuk `GIFT SET BOX`); ranking terakhir yang dipublikasikan berlaku untuk semua gudang (2026-10-09) | PRD A6; `tests/golden/ranking-september-2026.json` |
| OD-06: operator Pusat dengan hak kelola-usulan-jadwal boleh langsung membuat, mengubah, dan menonaktifkan jadwal Pusat tanpa persetujuan admin; empat gudang lain tetap butuh persetujuan admin (2026-10-09) | PRD A5 |
| OD-07: viewer melihat laporan semua toko (2026-10-09) | PRD A3 |
| OD-11: target performa di PRD C1 disetujui (2026-10-09) | PRD C1 |
