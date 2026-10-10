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
| Draft per gudang dan tanggal kirim (toko yang mengirim pada tanggal itu); finalisasi per toko per tanggal kirim (2026-10-09) | PRD A6, A7 |
| Varian draft = semua produk yang barisnya ada di impor aktif periode sumber untuk toko itu, termasuk penjualan nol; produk manual tampil berstatus `manual` (2026-10-09) | PRD A6 |
| Rata-rata untuk kebutuhan = Rata-rata Ringkasan per kategori hari atas bulan periode sumber gudang (2026-10-09) | PRD A6 |
| Belum ada ranking dipublikasikan → perhitungan tidak berjalan, pesan "Ranking pusat belum dipublikasikan" (2026-10-09) | PRD A6 |
| Produk otomatis yang belum dipetakan keluarga aromanya menjadi masalah yang menahan finalisasi (2026-10-09) | PRD A6, ADR-0006 |
| Admin boleh melihat halaman Pengiriman Gudang semua gudang (hanya-baca); periode sumber dan persetujuan jadwal dari halaman admin (2026-10-09) | PRD A3 |
| Usulan jadwal non-Pusat dibuat operator berhak; admin hanya menyetujui/menolak (2026-10-09) | PRD A5 |
| Salin jadwal = satu pengaturan ke beberapa toko, tanpa entitas template; di non-Pusat setiap toko menjadi usulan tersendiri (2026-10-09) | PRD A5 |
| Dua mingguan: hari kirim di pekan Senin–Minggu yang memuat tanggal jangkar, berulang tiap 14 hari (2026-10-09) | PRD A5 |
| Semua pengguna yang masuk boleh melihat Ringkasan, mengekspor laporan, dan melihat Kalender; mengubah kalender hanya admin (2026-10-09) | PRD A2, B1 |
| Filter "kategori" di Ringkasan = kategori produk; kategori hari menjadi kolom (2026-10-09) | PRD A2 |
| Jenis libur diusulkan dari keterangan ("Cuti Bersama" → cuti bersama, selain itu libur nasional), hanya petunjuk untuk admin (2026-10-09) | PRD B2 |
| Ekspor rencana hanya untuk rencana final (termasuk dari riwayat) dan membutuhkan hak tindakan `ekspor` di gudang itu (2026-10-09) | PRD A7 |
| Seed UAT tidak menghubungkan toko ke gudang selama OD-12 terbuka; penguji menghubungkan lewat halaman admin (2026-10-09) | PRD A3; T99 |
| T42: "kategori sebelum" = kategori yang berlaku untuk cakupan itu tepat sebelum perubahan dibuat (2026-10-10) | PRD B4; T42 |
| T42: mengganti kategori = mengedit perubahan menjadi revisi baru; "Batalkan" membatalkan seluruh perubahan pada tanggal + cakupan itu sehingga tanggal kembali ke level berikutnya; riwayat semua revisi tetap tersimpan (2026-10-10) | PRD B4; T42 |
| T42: pembatalan perubahan kategori wajib beralasan; cara penyimpanannya keputusan teknis (2026-10-10) | PRD B4; T42 |
| T53/T45: baris ranking boleh cocok ke keluarga aroma nonaktif, dengan peringatan, tanpa menahan publikasi; di pemetaan produk keluarga nonaktif tidak muncul sebagai pilihan untuk pemetaan baru, pemetaan lama tetap berlaku (2026-10-10) | PRD A6; T53, T45 |
| T53: satu keluarga aroma tidak boleh muncul di lebih dari satu baris ranking; jika terjadi, publikasi ditahan dengan pesan error (2026-10-10) | PRD A6; T53 |
| T54: pola dua mingguan berlaku ke depan dan ke belakang dari tanggal jangkar; jangkar hanya menentukan pekan kirim (2026-10-10) | PRD A5; T54 |
| T40: API libur yang mengembalikan daftar kosong dianggap sinkronisasi gagal; snapshot aktif dipertahankan (2026-10-10) | PRD B2; T40 |
| T51: periode sumber yang memuat bulan tanpa data aktif tetap dihitung dengan bulan yang ada; bulan yang hilang ditandai jelas di kartu Periode sumber (2026-10-10) | PRD A4; T51 |
