# Panduan UAT — Dashboard Penjualan MANDALIKA

Panduan ini untuk **pemilik produk**. Isinya cara menyalakan aplikasi di laptop dengan satu perintah, lalu skenario uji untuk setiap bagian PRD (A1–A7 dan B1–B9). Setiap skenario punya langkah, hasil yang diharapkan, dan kolom untuk mencatat hasil Anda.

Aturan yang diuji berasal dari `docs/PRD.md`, termasuk semua blok **▶ Keputusan**. Jika aplikasi berbeda dari hasil yang diharapkan di sini, itu temuan UAT. Cara melaporkannya ada di bagian akhir.

## Cara memakai panduan ini

- Kerjakan bagian-bagian **sesuai urutan di dokumen ini**. Urutannya mengikuti alur kerja nyata, bukan urutan nomor PRD: akun dan gudang dulu, lalu impor, laporan, kalender, dan terakhir pengiriman gudang.
- Isi kolom **Hasil (OK/Tidak)** dengan `OK` atau `Tidak`. Tulis apa yang Anda lihat di kolom **Catatan**, terutama jika hasilnya `Tidak`. Jika langkah tidak bisa dicoba (misalnya datanya tidak ada), tulis `Tidak bisa diuji` beserta alasannya.
- Teks yang ditulis di antara tanda kutip ("…") adalah teks yang seharusnya tampil persis di layar.
- Tanggal ditulis seperti di aplikasi: `Senin, 19-10-2026`. Jika Anda menguji di minggu lain, pakai tanggal yang setara (misalnya Senin minggu depan).

## Menyalakan aplikasi

### Yang perlu disiapkan sekali

1. Docker Desktop terpasang dan **menyala**.
2. Node.js 22 dan pnpm terpasang. Di folder repo, jalankan `pnpm install` sekali.
3. Folder `data-lokal/` berisi dua file dari pemilik. File ini tidak ada di repo dan tidak boleh di-commit:
   - workbook penjualan (`data-lokal/DATA TUMPUKAN AKEH YA ALLAh.xlsx`, berisi sheet `APRIL (S)` sampai `SEPTEMBER (S)`);
   - `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx` (file ranking pusat).
4. Internet menyala. Ini hanya dibutuhkan untuk sinkronisasi libur (bagian B2).

### Satu perintah

Di folder repo, jalankan:

```
pnpm uat
```

Perintah ini mengerjakan semuanya:

1. Memeriksa Docker. Jika Docker belum menyala, perintah berhenti dengan pesan "Docker belum menyala."
2. Membuat berkas `.env` dari `.env.example` jika belum ada.
3. Menyalakan PostgreSQL dan MinIO (`docker compose up`).
4. Menyiapkan database (migrasi).
5. Membuat admin pertama, 5 gudang (Pusat, Gudang Bali, Gudang Bandung, Gudang Cibubur, Gudang Jabodetabek), dan 25 toko. Toko **belum dihubungkan** ke gudang, karena datanya masih menunggu pemilik (OD-12). Anda menghubungkannya sendiri di skenario A3.
6. Menyiapkan aplikasi (beberapa menit), lalu menyalakan aplikasi dan worker. Worker adalah proses yang membaca file impor dan menghitung laporan.

Jika berhasil, terminal menampilkan kotak "Aplikasi siap: http://localhost:3000" beserta email admin.

- Buka `http://localhost:3000` di browser.
- Masuk dengan email admin yang tampil di terminal. Kata sandinya adalah nilai `ADMIN_AWAL_SANDI` di berkas `.env`.
- Biarkan terminal tetap terbuka selama UAT. Untuk berhenti, tekan **Ctrl+C** di terminal itu.

Data UAT tersimpan di Docker. Jika `pnpm uat` dijalankan lagi, data sebelumnya masih ada; admin, gudang, dan toko tidak dibuat dua kali.

### Jika ada masalah saat menyalakan

| Pesan di terminal | Yang perlu dilakukan |
|---|---|
| "Docker belum menyala." | Buka Docker Desktop, tunggu sampai statusnya *running*, lalu jalankan `pnpm uat` lagi. |
| "Perintah docker tidak ditemukan." | Pasang Docker Desktop, lalu jalankan `pnpm uat` lagi. |
| "Port 5432 sudah dipakai program lain…" (atau port 9000, 9001, 3000) | Ada program lain yang memakai port itu: 5432 untuk PostgreSQL, 9000/9001 untuk MinIO, 3000 untuk aplikasi. Biasanya itu PostgreSQL atau aplikasi lain yang sedang berjalan. Hentikan program itu, lalu jalankan `pnpm uat` lagi. Jika Anda tidak tahu program mana, laporkan pesannya ke Claude Code. |
| "Salah satu proses berhenti…" | Aplikasi atau worker berhenti. Baca pesan di atasnya, lalu jalankan `pnpm uat` lagi. Jika terulang, laporkan pesannya. |

**Mulai UAT dari awal (menghapus semua data UAT):** hentikan `pnpm uat` dengan Ctrl+C, jalankan `docker compose down -v`, lalu jalankan `pnpm uat` lagi. Perintah `down -v` **menghapus semua data UAT** di laptop ini: impor, pengguna, rencana, dan lainnya.

### Langkah teknis tambahan: menonaktifkan toko

Aplikasi belum punya layar untuk menonaktifkan toko. Beberapa skenario (A1.6, A3.6, A6.20) menguji perilaku toko nonaktif. Untuk skenario itu, jalankan perintah berikut di terminal **kedua**, di folder repo. Contoh ini memakai toko `LMK`:

```
docker compose exec postgres psql -U mandalika -d mandalika -c "update toko set aktif = false where nama = 'LMK'"
```

Untuk mengaktifkannya lagi, ganti `false` dengan `true`. Jika Anda tidak ingin menjalankan perintah ini, tulis `Tidak bisa diuji` di skenario-skenario itu.

## Akun uji

Buat akun-akun ini di skenario A3. Pilih sendiri kata sandinya (minimal 8 karakter) dan catat.

| Nama | Peran | Penugasan | Gunanya |
|---|---|---|---|
| Admin (dari `pnpm uat`) | admin | — | Konfigurasi, impor, kalender, ranking, persetujuan |
| Operator Pusat | viewer | Pusat, semua hak tindakan | Jadwal langsung, stok, hitung, finalisasi, ekspor di Pusat |
| Operator Bandung | viewer | Gudang Bandung, semua hak tindakan | Usulan jadwal yang perlu persetujuan admin |
| Operator Lihat | viewer | Pusat, tanpa hak tindakan | Akses hanya-baca ke Pengiriman Gudang |
| Pengamat | viewer | — | Hanya laporan dan kalender |

Aplikasi hanya punya dua peran, **admin** dan **viewer**. Seseorang menjadi **operator** karena ditugaskan ke gudang di halaman Penugasan, bukan karena perannya. Peran admin tidak memberi hak operator.

Untuk berganti akun, tekan **Keluar** di menu, lalu masuk dengan akun lain. Cara lain: pakai jendela penyamaran (*incognito*) browser untuk akun kedua.

---

## A3. Gudang, pengguna, dan kewenangan

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A3.1 | Masuk sebagai admin. Lihat menu. | Menu berisi Beranda, Ringkasan, Kalender, Pengiriman Gudang, Pengguna, Gudang, Penugasan, Impor, Libur, Keluarga aroma, Pemetaan produk, Ranking, Persetujuan jadwal. Tidak ada tautan pendaftaran akun mandiri di halaman Masuk. | | |
| A3.2 | Buka **Gudang**. | Ada lima gudang: Pusat, Gudang Bali, Gudang Bandung, Gudang Cibubur, Gudang Jabodetabek. Semuanya "Belum ada toko". Daftar toko berisi 25 toko, semuanya "Belum terhubung". | | |
| A3.3 | Di "Tambah toko ke gudang", pilih gudang **Pusat**, centang **PMS** dan **PMJ**, tekan "Tambahkan toko terpilih". | Hasil per toko tampil: "2 dari 2 toko ditambahkan.", masing-masing "Berhasil" dengan keterangan "Ditambahkan ke Pusat." | | |
| A3.4 | Pilih **Gudang Bandung**, centang **PVJ**, **PASKAL**, dan juga **PMS**. Tekan "Tambahkan toko terpilih". | "2 dari 3 toko ditambahkan." PVJ dan PASKAL "Berhasil". PMS "Terkait gudang lain" dengan keterangan bahwa PMS sudah terhubung ke Pusat dan satu toko hanya boleh terhubung ke satu gudang. | | |
| A3.5 | Pilih **Pusat** lagi, centang **PMS**, tekan tombolnya. | PMS "Sudah terhubung", dengan keterangan bahwa tidak ada yang diubah. | | |
| A3.6 | *(Butuh langkah teknis: nonaktifkan LMK.)* Muat ulang halaman, pilih Pusat, centang **LMK**, tekan tombolnya. Setelah itu aktifkan LMK lagi. | LMK berstatus "Nonaktif" di daftar. Hasilnya "Nonaktif" dengan keterangan "Tidak ditambahkan: toko berstatus nonaktif." | | |
| A3.7 | Buka **Pengguna**. Buat empat akun dari tabel "Akun uji", semuanya dengan peran **viewer**. | Setiap akun berhasil dibuat dan tampil di "Daftar pengguna" berstatus "Aktif". Pilihan peran hanya "viewer" dan "admin". | | |
| A3.8 | Coba buat akun dengan email yang sudah dipakai. | Muncul "Email sudah dipakai pengguna lain." Tidak ada akun ganda. | | |
| A3.9 | Di baris akun admin Anda sendiri, tekan "Nonaktifkan". | Ditolak dengan pesan "Akun sendiri tidak bisa dinonaktifkan." | | |
| A3.10 | Ubah peran admin Anda sendiri menjadi viewer, lalu tekan "Simpan peran" (saat Anda satu-satunya admin aktif). | Ditolak dengan pesan "Peran tidak bisa diubah: aplikasi harus punya minimal satu admin aktif." | | |
| A3.11 | Nonaktifkan **Pengamat**. Coba masuk sebagai Pengamat. Lalu, sebagai admin, tekan "Aktifkan kembali". | Saat nonaktif, masuk ditolak dengan "Akun ini dinonaktifkan. Hubungi admin." Setelah diaktifkan kembali, Pengamat bisa masuk. | | |
| A3.12 | Buka **Penugasan**. Tugaskan Operator Pusat ke **Pusat** dengan kelima hak: Kelola usulan jadwal, Input stok, Hitung kebutuhan, Finalisasi, Ekspor. Tugaskan Operator Bandung ke **Gudang Bandung** dengan kelima hak. Tugaskan Operator Lihat ke **Pusat** tanpa mencentang hak apa pun. | Ketiga penugasan tampil di "Daftar penugasan" dengan hak masing-masing. Penugasan tanpa hak tetap tersimpan. | | |
| A3.13 | Tugaskan Operator Pusat ke Pusat sekali lagi. | Ditolak dengan pesan bahwa pengguna ini sudah ditugaskan di gudang tersebut. | | |
| A3.14 | Sebagai admin, buka **Pengiriman Gudang**, lalu buka Pusat. | Admin melihat semua gudang. Halaman Pusat menampilkan "Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini." Tidak ada tombol jadwal, stok, hitung, atau finalisasi. | | |
| A3.15 | Masuk sebagai **Operator Lihat**, lalu buka Pengiriman Gudang. | Hanya gudang Pusat yang tampil, berlabel "Hanya-baca". Halamannya bisa dibuka tanpa tombol tindakan. | | |
| A3.16 | Masuk sebagai **Pengamat**. Lihat menu, lalu ketik alamat `http://localhost:3000/admin/impor` di browser. | Menu hanya Beranda, Ringkasan, Kalender. Tidak ada Pengiriman Gudang dan tidak ada menu admin. Halaman admin tidak bisa dibuka (halaman "404"). | | |
| A3.17 | Masuk sebagai **Operator Pusat**, lalu buka Pengiriman Gudang. | Hanya Pusat yang tampil, tanpa label "Hanya-baca". Menu admin tidak tampil, karena hak operator tidak sama dengan admin. | | |

## A1. Memasukkan data penjualan

Semua langkah di bagian ini memakai akun **admin**.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A1.1 | Buka **Impor**. Di "Unggah workbook penjualan", pilih workbook penjualan dari `data-lokal/`. | Daftar sheet tampil. Sheet `MP …` tampil tetapi tidak bisa dipilih ("di luar cakupan saat ini"). | | |
| A1.2 | Pilih sheet `JUNI (S)`, Tahun impor `2026`, Bulan impor `Juni`, lalu tekan "Unggah dan proses". | Halaman "Tinjau impor JUNI (S)" terbuka. Sambil file dibaca, status tampil "Sedang diproses" dengan keterangan bahwa tab boleh ditutup. Setelah selesai, status menjadi "Siap ditinjau". | | |
| A1.3 | Periksa isi halaman tinjau. | "Identitas impor" menampilkan nama file, sheet, bulan impor, ukuran, dan SHA-256. "Ringkasan per toko" menampilkan cakupan tanggal, jumlah tanggal, sel terisi, dan "Total penjualan mentah" per toko. Di "Masalah" ada peringatan bahwa kolom tanggal invalid `31/6` kosong dan dilewati. Tidak ada error. | | |
| A1.4 | Tekan "Aktifkan". | "Berhasil disimpan — Impor ini sekarang aktif." Status menjadi "Aktif". Bagian "Produk baru" berisi produk yang baru didaftarkan, berstatus keluarga aroma belum dipetakan. | | |
| A1.5 | Buka **Ringkasan** sebelum mengimpor `JULI (S)`. Lihat pilihan bulan. | Ada bulan Juli, karena 29–30 Juni masuk laporan Juli. Jika Juli diterapkan, angkanya bertanda "Parsial", karena tanggal Juli lainnya belum teramati. | | |
| A1.6 | *(Butuh langkah teknis: nonaktifkan LMK sebelum mengunggah.)* Unggah `MEI (S)` (2026, Mei), tinjau, lalu aktifkan. Setelah itu aktifkan LMK lagi. | Di "Masalah" ada peringatan bahwa toko LMK nonaktif tetapi datanya tetap dibaca. Di "Ringkasan per toko", LMK bertanda "Toko nonaktif". Impor tetap bisa diaktifkan. | | |
| A1.7 | Unggah dan aktifkan juga `APRIL (S)` (April), `JULI (S)` (Juli), dan `AGUSTUS (S)` (Agustus), masing-masing dengan tahun 2026. | Setiap impor bisa diaktifkan. Di "Daftar impor", setiap bulan punya satu impor "Aktif". | | |
| A1.8 | Unggah `JUNI (S)` sekali lagi untuk Juni 2026 dan tinjau. | Sebelum diaktifkan, halaman memberi tahu bahwa impor aktif Juni saat ini akan diarsipkan. Setelah "Aktifkan", impor lama berstatus "Diarsipkan" dan yang baru "Aktif". Hanya ada satu impor aktif untuk Juni. | | |
| A1.9 | Unggah `JUNI (S)` dengan Bulan impor **Juli** (salah bulan). | Status "Siap ditinjau" dengan error bahwa tanggal di blok toko bukan bulan impor 2026-07, beserta lokasi selnya. Tombol "Aktifkan" tidak bisa ditekan: "Tidak bisa diaktifkan: ada … error. Perbaiki di Excel, lalu unggah ulang." Impor aktif Juli **tidak** berubah. | | |
| A1.10 | Unggah `SEPTEMBER (S)` (2026, September). | Jika workbook belum diperbaiki (TP-01), ada error "Kolom tanggal invalid "31/9" … berisi data di sel …", dengan lokasi sel dan cara memperbaikinya. Impor tidak bisa diaktifkan. Jika workbook sudah diperbaiki, impor bisa diaktifkan seperti biasa. | | |
| A1.11 | Jika ada impor yang mengubah nama, ukuran, atau kategori produk, periksa bagian "Data produk berubah" di halaman tinjau. | Setiap perubahan tampil sebagai "lama → baru" dan tidak menahan aktivasi. Setelah aktivasi, master produk mengikuti impor terbaru. Jika datanya tidak pernah berubah, tulis `Tidak bisa diuji`. | | |
| A1.12 | *(Opsional, butuh salinan workbook.)* Di **salinan** workbook, ketik angka negatif di satu sel penjualan atau ganti nama satu toko. Unggah salinan itu. | Angka negatif menjadi error "Kuantitas di sel … negatif …; ini salah input." Nama toko yang tidak dikenal menjadi error "Toko "…" tidak ada di daftar toko." Keduanya menunjukkan lokasi sel, dan impor tidak bisa diaktifkan. | | |
| A1.13 | Tunggu sampai status "Hasil hitung laporan" di halaman Impor menjadi "Terbaru". | Status berganti dari "Sedang dihitung" menjadi "Terbaru" tanpa perlu mengunggah ulang. | | |

## A2. Membaca laporan penjualan (Ringkasan)

Gunakan akun mana pun. Ulangi beberapa langkah dengan akun **Pengamat** untuk memastikan viewer juga bisa.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A2.1 | Buka **Ringkasan** sebelum memilih apa pun. | "Belum ada periode yang diterapkan. Pilih bulan lalu tekan Terapkan." Pilihan bulan mengikuti data (April–Agustus 2026, ditambah bulan lain yang muncul dari data). | | |
| A2.2 | Pilih bulan **Juni 2026** saja, Toko **PMS**, Produk **15GL-GOR**, tetapi **jangan** tekan Terapkan dulu. | Tabel belum berubah. Pilihan baru berlaku setelah Terapkan ditekan. | | |
| A2.3 | Tekan **Terapkan**. | "Periode aktif: Juni 2026 (1 bulan)" tampil jelas. Baris PMS · 15GL-GOR menunjukkan Rata-rata Senin–Kamis **1**, Jumat **0**, Sabtu **1**, Minggu **0** (angka dari golden yang sudah dikonfirmasi pemilik, OD-09). | | |
| A2.4 | Klik angka Senin–Kamis di baris itu. | "Rincian Rata-rata Senin–Kamis: 15GL-GOR · PMS" terbuka. Isinya bertahap: rata-rata bulanan beserta jumlah dan pembaginya ("Σ … ÷ … minggu"), nilai per minggu laporan, lalu setiap tanggal dengan sel sumber (misalnya `JUNI (S)!H4`), nama file impor, dan kategori efektif. Sel kosong ditandai "Sel kosong (nol tersirat)". | | |
| A2.5 | Perhatikan kolom "Total penjualan mentah" dan tulisan di bawah setiap rata-rata. | Total penjualan mentah diberi label berbeda dari rata-rata. Setiap rata-rata menampilkan jumlah dan pembaginya ("Σ … ÷ … bulan"). | | |
| A2.6 | Kosongkan filter. Pilih beberapa bulan yang **tidak berurutan**, misalnya April, Juni, dan Agustus, lalu Terapkan. | Periode aktif menyebut ketiga bulan. Rata-rata Ringkasan = jumlah rata-rata bulanan dibagi jumlah bulan yang punya hasil, dibulatkan ke atas. Cek satu angka lewat rinciannya. | | |
| A2.7 | Coba pilih lebih dari 12 bulan (jika datanya cukup) atau tanpa bulan. | Tanpa bulan, Terapkan tidak bisa ditekan. Lebih dari 12 bulan juga ditolak ("Pilih paling banyak 12 bulan."). | | |
| A2.8 | Pakai filter **Kategori produk** (misalnya `15ML GLITTER/LEATHER`), lalu Terapkan. | Hanya produk dengan kategori produk itu yang tampil. Kategori hari (Senin–Kamis, Jumat, Sabtu, Minggu) tetap menjadi kolom tabel. | | |
| A2.9 | Klik "Minggu sama" di satu baris. | "Perbandingan minggu yang sama" tampil per M1, M2, dan seterusnya. Nilainya = jumlah nilai minggu itu dibagi jumlah bulan yang punya nilai, dibulatkan ke atas. | | |
| A2.10 | Terapkan **April 2026** dan cari baris bertanda "Parsial". Senin–Kamis minggu pertama April mencakup 30–31 Maret, yang tidak ada di impor mana pun. | Angka parsial tetap dihitung dari pengamatan yang ada dan diberi tanda "Parsial". Tanggal yang tidak teramati tidak dianggap nol. Rinciannya menyebut "Tanggal tidak teramati: tidak ada impor aktif yang mencakupnya." | | |
| A2.11 | Terapkan filter yang hasilnya lebih dari satu halaman tabel (lebih dari 50 baris), lalu tekan "Ekspor (.xlsx)". | File `.xlsx` terunduh. Isinya **seluruh** baris hasil filter, bukan hanya halaman yang terbuka, dengan periode dan filter tertulis di bagian atas. | | |
| A2.12 | Ulangi A2.3 dan A2.11 sebagai **Pengamat**. | Pengamat bisa melihat semua toko dan bisa mengekspor. | | |

## B1. Kalender

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B1.1 | Buka **Kalender**. | Bulan dan tahun berjalan tampil, dengan susunan Senin–Minggu dan penanda "Hari ini". Setiap tanggal menampilkan kategori dasarnya. Di atas setiap baris ada label "Minggu … · <bulan laporan>". | | |
| B1.2 | Pakai navigasi "Bulan sebelumnya", "Bulan berikutnya", "Tahun sebelumnya", "Tahun berikutnya", dan "Bulan ini". | Kalender berpindah ke periode yang dipilih, lalu kembali ke bulan ini. | | |
| B1.3 | Klik satu tanggal. | "Detail tanggal" menampilkan tanggal sebenarnya, nama dan jenis libur (jika ada), cakupan tampilan, kategori dasar, kategori efektif, bulan laporan, dan minggu laporan. | | |
| B1.4 | Masuk sebagai **Pengamat** dan buka Kalender. | Kalender bisa dilihat, tetapi form "Perubahan kategori" tidak ada. | | |

## B2. Sumber API hari libur

Semua langkah di bagian ini memakai akun **admin** dan membutuhkan internet.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B2.1 | Buka **Libur**. Isi Tahun `2026`, tekan "Sinkronisasi". | "Sinkronisasi berhasil — … tanggal libur tahun 2026 disimpan sebagai snapshot menunggu persetujuan." Di "Snapshot libur" ada baris berstatus "Menunggu persetujuan". Kalender **belum** menampilkan libur dari snapshot ini. | | |
| B2.2 | Buka snapshot itu ("Tinjau") dan lihat "Daftar libur". | Setiap tanggal punya nama dan jenis. Keterangan yang memuat "Cuti Bersama" berjenis "Cuti bersama"; yang lain "Libur nasional". | | |
| B2.3 | Matikan internet (atau Wi-Fi), lalu tekan "Sinkronisasi" lagi. Nyalakan internet lagi setelahnya. | "Sinkronisasi gagal — …" dengan alasannya. Kartu "Kegagalan sinkronisasi terakhir" tampil dengan "Snapshot libur yang sudah ada tidak berubah." Tidak ada snapshot baru. | | |

## B3. Peninjauan dan persetujuan hasil sinkronisasi

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B3.1 | Buka snapshot 2026 yang menunggu persetujuan. | Halaman menampilkan tahun, sumber, waktu sinkronisasi, status, daftar libur, dan "Perbedaan terhadap snapshot aktif" (untuk snapshot pertama: "Belum ada snapshot aktif untuk tahun 2026."). | | |
| B3.2 | Tekan "Aktifkan". | "Snapshot ini sekarang menjadi daftar libur aktif." Status "Aktif". Kalender kini menampilkan nama dan jenis libur 2026. Kategori hari **tidak** berubah: tanggal libur di hari Senin tetap "Senin–Kamis". | | |
| B3.3 | Sinkronisasi 2026 sekali lagi, buka snapshot barunya, lalu aktifkan. | Sebelum diaktifkan, halaman menyebut bahwa snapshot aktif saat ini akan diarsipkan, tidak dihapus. Setelahnya, snapshot lama "Diarsipkan" dan masih ada di daftar. | | |
| B3.4 | Buka snapshot yang diarsipkan dan tekan "Aktifkan ulang". Lihat "Riwayat". | Snapshot itu aktif kembali. Riwayat mencatat "Sinkronisasi", "Persetujuan pertama", dan "Aktivasi ulang" sebagai kejadian terpisah, masing-masing dengan waktu dan pelakunya. | | |

## B4. Kategori dasar dan perubahan kategori manual

Semua langkah di bagian ini memakai akun **admin**, di Kalender. Pakai tanggal di masa depan agar laporan yang sudah dicek di A2 tidak berubah, misalnya **Kamis, 22-10-2026**.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B4.1 | Klik satu tanggal libur nasional di hari Senin–Kamis (dari snapshot aktif). | Nama libur tampil, tetapi kategori dasar dan kategori efektif tetap "Senin–Kamis". Libur tidak otomatis menjadi Minggu. | | |
| B4.2 | Klik Kamis, 22-10-2026. Di "Buat perubahan kategori", pilih Cakupan **Seluruh toko**, Kategori baru **Minggu**, lalu Simpan perubahan **tanpa** alasan. | Ditolak dengan pesan "Alasan wajib diisi." | | |
| B4.3 | Ulangi dengan alasan, misalnya "Uji: libur toko". | Perubahan tersimpan. Tanggal itu menampilkan "Efektif: Minggu" dan badge "Manual". Di "Detail tanggal" ada cakupan, alasan, pelaku, revisi 1, dan status "Aktif". | | |
| B4.4 | Di Cakupan toko pilih **PMS**. Buat perubahan khusus PMS pada tanggal yang sama: kategori **Sabtu**, dengan alasan. | Saat melihat PMS, kategori efektif = Sabtu (perubahan khusus toko didahulukan). | | |
| B4.5 | Pindah ke cakupan **PMJ**, lalu ke **Semua toko**. | Untuk PMJ, kategori efektif = Minggu (perubahan seluruh toko). Untuk Semua toko, Minggu. Perubahan PMS tidak mewarnai tampilan toko lain. | | |
| B4.6 | Di cakupan Semua toko, ganti kategori perubahan seluruh toko menjadi **Jumat** ("Kategori baru", "Alasan", "Simpan revisi"). | Tercatat sebagai revisi baru (revisi 2) dan kategori efektif menjadi Jumat. | | |
| B4.7 | Coba buat perubahan baru untuk cakupan yang sudah punya perubahan aktif. | Ditolak: "Sudah ada perubahan aktif untuk cakupan ini pada tanggal tersebut. Ubah atau batalkan perubahan itu." | | |
| B4.8 | Batalkan perubahan seluruh toko tanpa mengisi "Alasan pembatalan". Lalu ulangi dengan alasan. | Tanpa alasan ditolak ("Alasan pembatalan wajib diisi."). Dengan alasan, perubahan dibatalkan dan kategori efektif Semua toko kembali ke kategori dasar "Senin–Kamis". | | |
| B4.9 | Lihat "Detail tanggal" setelah pembatalan. | Ada bagian "Riwayat perubahan dibatalkan" berlabel "Dibatalkan". Isinya cakupan, kategori sebelum → sesudah, revisi, alasan perubahan, pembuat, pembatal, dan alasan pembatalan. Bagian ini terpisah dari kategori efektif. | | |
| B4.10 | Lihat cakupan PMS setelah pembatalan seluruh toko. | Perubahan khusus PMS (Sabtu) tetap berlaku untuk PMS. Batalkan juga perubahan PMS dengan alasan, agar tanggal ini bersih untuk skenario berikutnya. | | |
| B4.11 | Sinkronisasi dan aktifkan snapshot libur lagi (B3). | Perubahan kategori manual tidak tertimpa oleh sinkronisasi libur. | | |

## B5. Bulan dan nomor minggu laporan

Klik setiap tanggal di Kalender dan baca "Bulan laporan" dan "Minggu laporan" di "Detail tanggal".

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B5.1 | 27, 28, 29, dan 30 April 2026 | April 2026, Minggu 5 | | |
| B5.2 | 1–3 Mei 2026 | Mei 2026, Minggu 1 | | |
| B5.3 | 4–7 Mei 2026 | Mei 2026, Minggu 1 | | |
| B5.4 | 8–10 Mei 2026 | Mei 2026, Minggu 2. Baris kalender 4–10 Mei punya dua label minggu: Senin–Kamis Minggu 1, Jumat–Minggu Minggu 2. | | |
| B5.5 | 29–30 Juni dan 1–2 Juli 2026 | Juli 2026, Minggu 1 | | |
| B5.6 | 29–31 Desember 2025 dan 1 Januari 2026 | Januari 2026, Minggu 1 | | |
| B5.7 | 28–31 Desember 2026 | Desember 2026, Minggu 5 | | |
| B5.8 | 1–3 Januari 2027 | Januari 2027, Minggu 1 | | |

## B6. Perubahan kategori tidak memindahkan tanggal asal

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B6.1 | Sebagai admin, klik **Selasa, 30-06-2026**. Catat bulan dan minggu laporannya. | Juli 2026, Minggu 1 (mengikuti Kamis, 02-07-2026). | | |
| B6.2 | Ubah kategorinya menjadi **Jumat** untuk Seluruh toko, dengan alasan. | Kategori efektif menjadi Jumat, tetapi bulan laporan tetap **Juli 2026** dan minggu laporan tetap **Minggu 1**. | | |
| B6.3 | Di Ringkasan, terapkan Juli 2026 dan buka rincian Jumat suatu produk–toko yang terjual pada 30 Juni. | Tanggal 30-06-2026 tampil di Juli Minggu 1 dengan "Kategori efektif: Jumat (Perubahan kategori)". | | |
| B6.4 | Batalkan perubahan 30 Juni (dengan alasan). | Kategori kembali ke Senin–Kamis. Perubahan tampil di "Riwayat perubahan dibatalkan". Laporan dihitung ulang ("Hasil hitung laporan" kembali "Terbaru"). | | |

## B7. Bulan sumber impor berbeda dengan bulan laporan

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B7.1 | Di Ringkasan, terapkan **Juni 2026** saja. Buka rincian Senin–Kamis 15GL-GOR · PMS. | Tanggal 29 dan 30 Juni **tidak** termasuk laporan Juni. Minggu terakhir Juni Senin–Kamis berakhir 25 Juni. | | |
| B7.2 | Terapkan **Juli 2026**. Buka rincian Senin–Kamis Minggu 1 suatu produk–toko. | Tanggal 29–30 Juni ada di Juli Minggu 1 dengan sel sumber dari `JUNI (S)`, dan 1–2 Juli dari `JULI (S)`. Data 29–30 Juni tidak hilang; tanggal aslinya tetap. | | |
| B7.3 | Bandingkan dengan A1.5 (sebelum `JULI (S)` diimpor). | Sebelum Juli diimpor, Juli Minggu 1 hanya berisi 29–30 Juni dan bertanda "Parsial". Aplikasi tidak membuat tanggal Juli sendiri dan tidak mengimpor sheet lain otomatis. | | |

## B8. Pembacaan dan validasi tanggal

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B8.1 | Buka rincian A2.4 (15GL-GOR · PMS, Juni). Cari tanggal 12 Juni. | Tampil sebagai "Jumat, 12-06-2026" (12 Juni, bukan 6 Desember). Semua tanggal ditampilkan seperti "Jumat, 05-06-2026" dan tidak bergeser sehari. | | |
| B8.2 | Lihat halaman tinjau impor `JUNI (S)`. | Kolom `31/6` yang kosong dilewati dengan **peringatan** beserta lokasinya. Kolom tanggal valid tetap diproses. | | |
| B8.3 | Lihat halaman tinjau impor `SEPTEMBER (S)` (A1.10). | Kolom `31/9` yang berisi penjualan menjadi **error** dengan lokasi sheet dan sel. Impor ditahan dan angkanya tidak dipindahkan ke Oktober. | | |
| B8.4 | *(Opsional, butuh salinan workbook.)* Di salinan workbook, ketik angka `0` di satu sel kolom `31/6` yang kosong, lalu unggah. | Nol yang diketik dihitung sebagai data, jadi kolom itu menjadi error, bukan peringatan. | | |

## A4. Periode sumber gudang

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A4.1 | Masuk sebagai **Operator Pusat**, buka Pengiriman Gudang → Pusat sebelum periode sumber ditetapkan. | Kartu "Periode sumber penjualan" mudah ditemukan dan menampilkan "Periode sumber belum ditetapkan admin". Operator tidak bisa mengubahnya. | | |
| A4.2 | Sebagai Operator Pusat, coba "Hitung kebutuhan" untuk suatu tanggal kirim. | Ditolak dengan "Periode sumber belum ditetapkan admin". Draft tidak dibuat. | | |
| A4.3 | Sebagai admin, buka **Gudang** → "Periode sumber penjualan". Untuk Pusat, pilih **Juni, Juli, Agustus 2026**, lalu "Simpan periode sumber". Untuk Gudang Bandung, pilih Juni–Agustus juga. | Tersimpan. Tabel menampilkan periode tiap gudang beserta siapa dan kapan menetapkannya. | | |
| A4.4 | Sebagai Operator Pusat, muat ulang halaman Pusat. | Kartu menampilkan Juni, Juli, Agustus 2026 (hanya-baca) dan "Ditetapkan oleh … pada …". | | |
| A4.5 | Di Ringkasan, terapkan bulan lain (misalnya April saja). Kembali ke halaman Pusat. | Periode sumber Pusat tetap Juni–Agustus. Filter Ringkasan tidak mengubah dasar perhitungan gudang. | | |
| A4.6 | *(Opsional.)* Jika ada bulan periode sumber yang tidak lagi punya impor aktif, lihat kartunya. | Bulan itu bertanda "… — Tidak ada data aktif", dengan keterangan "Perhitungan memakai bulan yang masih punya data aktif." Jika semua bulan tidak punya data, perhitungan ditolak dengan pesan yang jelas dan draft tidak dibuat. Jika tidak bisa dibuat, tulis `Tidak bisa diuji`. | | |

## A5. Jadwal pengiriman

Gunakan tanggal kirim contoh **Senin, 19-10-2026**. Jika Anda menguji di minggu lain, pakai Senin terdekat yang akan datang.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A5.1 | Sebagai **Operator Pusat**, buka Pusat → kartu "Jadwal". Di "Atur jadwal toko", pilih **PMS**, Pola **Mingguan**, hari kirim **Senin** dengan persiapan **H−2**, lalu "Simpan jadwal". | Tersimpan langsung sebagai jadwal aktif tanpa persetujuan admin. Tabel menampilkan "Senin (H−2)". | | |
| A5.2 | Coba Pola **2× seminggu** dengan hanya satu hari dipilih. | Ditolak: "Pola 2× seminggu membutuhkan tepat 2 hari kirim, dipilih 1." Hari kirim yang bisa dipilih hanya Senin–Sabtu. | | |
| A5.3 | Atur PMJ dengan Pola **2× seminggu**: Senin (H−1) dan Kamis (H). | Tersimpan. Satu toko hanya punya satu jadwal aktif. | | |
| A5.4 | Di "Salin jadwal ke beberapa toko", buat pengaturan Mingguan, Senin (H), centang PMS dan PMJ, lalu "Terapkan ke toko terpilih". Setelah itu kembalikan jadwal PMS ke Senin (H−2) dan PMJ ke 2× seminggu (A5.1 dan A5.3). | Hasil per toko: "2 dari 2 toko berhasil." Kedua toko langsung mendapat jadwal yang sama, masing-masing sebagai jadwal sendiri. | | |
| A5.5 | Sebagai **Operator Bandung**, buka Gudang Bandung. Di "Usulkan jadwal toko", pilih **PVJ**, Pola **Dua mingguan**, hari kirim **Senin (H)**, Tanggal jangkar **Rabu, 14-10-2026**, lalu "Kirim usulan". | Usulan tersimpan dengan status "Menunggu persetujuan". PVJ masih "Belum ada jadwal". Usulan belum menggantikan jadwal aktif. | | |
| A5.6 | Coba kirim usulan lain untuk PVJ. | Tombol tidak bisa ditekan: "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin." | | |
| A5.7 | Lewat "Salin jadwal ke beberapa toko", kirim usulan Mingguan Senin (H) ke **PASKAL**. | PASKAL mendapat usulan tersendiri yang menunggu persetujuan. | | |
| A5.8 | Sebagai admin, buka **Persetujuan jadwal**. | Kedua usulan tampil dengan perbandingan "Jadwal aktif" dan "Usulan" (Pola, Hari kirim, Tanggal jangkar). Admin hanya bisa "Setujui" atau "Tolak", tidak bisa mengubah isinya. Usulan dari Pusat tidak ada di sini. | | |
| A5.9 | Setujui usulan PVJ. Tolak usulan PASKAL tanpa alasan, lalu dengan alasan. | PVJ kini punya jadwal aktif dua mingguan. Penolakan tanpa alasan ditolak ("Isi alasan penolakan."). Dengan alasan, Operator Bandung melihat "Ditolak" beserta alasan di kolom "Usulan terakhir". PASKAL tetap tanpa jadwal aktif. | | |
| A5.10 | Pola dua mingguan PVJ (jangkar 14-10-2026, Senin): hitung kebutuhan Gudang Bandung untuk Senin, 12-10-2026, Senin, 19-10-2026, dan Senin, 26-10-2026 (setelah A6 siap). | PVJ ikut pada 12-10 dan 26-10, tetapi **tidak** pada 19-10. Pola berlaku ke depan dan ke belakang dari pekan jangkar. | | |
| A5.11 | Sebagai Operator Pusat, ubah jadwal PMS setelah draft dihitung (lihat A7). | Draft terkait ditandai "Perlu dihitung ulang". Stok yang sudah diisi tetap ada. Rencana final tidak berubah. | | |

## A6. Menghitung kebutuhan dan jumlah kirim

Bagian ini butuh keluarga aroma, ranking pusat, dan pemetaan produk. Semuanya disiapkan admin.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A6.1 | Sebagai **Operator Pusat**, hitung kebutuhan Pusat untuk Senin, 19-10-2026 sebelum ranking dipublikasikan. | Ditolak dengan "Ranking pusat belum dipublikasikan". Draft tidak dibuat. | | |
| A6.2 | Sebagai admin, buka **Keluarga aroma**. Buat satu keluarga untuk setiap baris `VARIANT` di `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx` (28 baris, termasuk `GIFT SET BOX`). Beri setiap keluarga alias yang sama dengan teks VARIANT-nya, dan segmen kode yang Anda ketahui (misalnya `GOR` untuk Gorgeous Tuberose). | Keluarga tersimpan "Aktif". Satu alias dan satu segmen kode tidak bisa dipakai dua keluarga (muncul pesan "… sudah dipakai keluarga …"). | | |
| A6.3 | Buka **Ranking**. Unggah `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx`. | Bulan ranking terisi otomatis **September 2026** dari nama file (masih bisa diubah). Setelah "Unggah dan tinjau", halaman tinjau menampilkan "Tujuh besar" (RANK 1–7: GORGEOUS TUBEROSE, HOLY SWEET, ONLY THE BRAVE, NO1, UNSTOPPABLE, CHAMPION, SEDUCTION) dan pencocokan setiap baris ke keluarga aroma. | | |
| A6.4 | Jika ada baris "Tidak cocok dengan alias mana pun", tambahkan aliasnya di Keluarga aroma, lalu tekan "Cocokkan ulang". | Publikasi ditahan selama masih ada baris tidak cocok. Setelah dicocokkan ulang, muncul "Semua baris cocok dengan alias keluarga aroma." | | |
| A6.5 | Uji keluarga ganda: beri satu keluarga dua alias untuk dua VARIANT yang berbeda, lalu "Cocokkan ulang". Setelah itu hapus alias yang salah dan cocokkan ulang lagi. | Publikasi ditahan dengan error yang menyebut keluarga itu dan baris-baris RANK-nya ("satu keluarga aroma hanya boleh muncul di satu baris ranking"). | | |
| A6.6 | Uji keluarga nonaktif: ubah satu keluarga di luar tujuh besar (misalnya ROMANTICA EXOTICA) menjadi **Nonaktif**, lalu "Cocokkan ulang". | Baris itu bertanda peringatan "Keluarga aroma nonaktif", tetapi **tidak** menahan publikasi. | | |
| A6.7 | Tekan "Publikasikan". | "Ranking ini sekarang berlaku untuk semua gudang." Halaman Ranking menampilkan "September 2026 versi 1" dan tujuh besarnya. | | |
| A6.8 | Buka **Pemetaan produk**. Pilih usulan di "Daftar usulan", lalu "Konfirmasi usulan terpilih". Petakan produk lain satu per satu ("Konfirmasi"), atau pilih "Tanpa aroma" untuk produk yang memang bukan aroma. | Hasil per produk tampil ("… dari … produk dikonfirmasi."). Usulan baru berlaku setelah dikonfirmasi. Keluarga **nonaktif** (ROMANTICA EXOTICA) tidak muncul sebagai pilihan pemetaan baru. Usulan hanya datang dari segmen keluarga aktif. Jika segmen cocok ke keluarga aktif dan juga ke keluarga nonaktif, keluarga aktif yang diusulkan. Setiap perubahan tercatat di "Riwayat pemetaan". | | |
| A6.9 | Petakan satu produk ke sebuah keluarga, lalu nonaktifkan keluarga itu. Lihat produknya di "Daftar produk". | Pemetaan lama tetap berlaku dan tampil sebagai "<nama> (nonaktif)". Aktifkan kembali keluarga itu setelah dicek. | | |
| A6.10 | Biarkan **satu** produk otomatis milik PMS berstatus "Belum dipetakan". Produk lain dipetakan semua. | (Dipakai di A6.13.) | | |
| A6.11 | Sebagai **Operator Pusat**, hitung kebutuhan Pusat untuk **Senin, 19-10-2026**. | Draft dibuat untuk toko yang menurut jadwal aktifnya mengirim hari itu (PMS dan PMJ). "Ringkasan per toko" menampilkan setiap toko dengan jumlah varian dan baris tertahan. Rincian baris belum tampil sebelum toko dibuka. | | |
| A6.12 | Klik "Buka" di baris PMS. | Tabel varian PMS tampil: semua produk yang ada di impor aktif periode sumber untuk PMS, termasuk yang penjualannya nol. Produk display tester (`-T`) dan kertas tester (`KTP`/`KTL`) berklasifikasi "Manual", tanpa jumlah kirim. Display biasa, ATOMIZER, GIFT SET, dan sejenisnya tetap "Otomatis". Header menampilkan "Persiapan H−2 · Panjang cakupan 7 hari". | | |
| A6.13 | Perhatikan kolom "Masalah" sebelum stok diisi. | Stok kosong = "Stok belum diisi" (belum diketahui, bukan nol). Produk dari A6.10 menampilkan "Belum dipetakan" lalu "Stok belum diisi", dalam urutan itu. Urutan lengkapnya: Kebutuhan tidak tersedia, Belum dipetakan, Stok negatif, Stok belum diisi. Jika masalahnya hanya stok, kebutuhan tetap tampil dan jumlah kirim "—". | | |
| A6.14 | Klik "Rincian" di satu produk otomatis tujuh besar (misalnya varian Gorgeous Tuberose). | "Tanggal cakupan" berisi 9 tanggal, dari Sabtu, 17-10-2026 sampai Minggu, 25-10-2026 (H−2 sampai H+6). Setiap tanggal punya kategori efektif dan rata-ratanya. Rata-rata per kategori berasal dari Rata-rata Ringkasan periode sumber (Juni–Agustus) dan bisa diklik untuk ditelusuri. Kebutuhan = jumlah (hari × rata-rata). Buffer = "20% · keluarga aroma termasuk tujuh besar ranking pusat September 2026 versi 1". | | |
| A6.15 | Isi stok akhir produk itu (misalnya 2), simpan, lalu buka rinciannya lagi. Hitung sendiri: (kebutuhan − stok) × 1,20, dibulatkan ke atas, minimal 0. | Angka "Jumlah kirim" di aplikasi sama dengan hitungan Anda. Contoh PRD: kebutuhan 56, stok 20, tujuh besar → (56 − 20) × 120% = 43,2 → 44. Stok dikurangkan satu kali sebelum buffer. | | |
| A6.16 | Lihat rincian produk otomatis di luar tujuh besar. | Buffer 10% ("produk otomatis di luar tujuh besar"). Produk manual: "Tanpa buffer otomatis." Produk belum dipetakan: buffer belum diketahui. | | |
| A6.17 | Isi stok **negatif** (misalnya −3) untuk satu produk otomatis dan satu produk manual. Simpan. | Produk otomatis mendapat masalah "Stok negatif" yang menahan finalisasi. Produk manual tetap "Manual", tidak tertahan, dan stoknya tetap tersimpan dan ditampilkan. | | |
| A6.18 | Isi stok dengan teks atau angka desimal. | Ditolak: "Isi bilangan bulat, atau kosongkan jika belum diketahui." | | |
| A6.19 | Jika ada produk yang tidak punya rata-rata untuk satu kategori di periode sumber, lihat barisnya. | "Kebutuhan tidak tersedia", dengan daftar "Tanpa rata-rata:" berisi tanggal dan kategori yang tidak punya rata-rata. Jika tidak ada produk seperti itu, tulis `Tidak bisa diuji`. | | |
| A6.20 | *(Butuh langkah teknis: hubungkan LMK ke Pusat dan beri jadwal Senin dulu, lalu nonaktifkan LMK.)* Hitung ulang draft 19-10-2026. Setelah itu aktifkan LMK lagi. | LMK tidak masuk draft. Halaman menampilkan "Toko LMK nonaktif tetapi masih punya jadwal aktif". | | |

## A7. Menyimpan dan memfinalisasi

Lanjutkan dari draft Pusat untuk Senin, 19-10-2026, sebagai **Operator Pusat**, kecuali jika disebut lain.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A7.1 | Ubah satu stok tanpa menyimpan, lalu klik menu lain. | Browser bertanya "Ada perubahan stok yang belum disimpan. Tinggalkan halaman ini?" Status di dekat form menampilkan "Ada perubahan yang belum disimpan". | | |
| A7.2 | Simpan stok. | Status berganti "Sedang menyimpan" lalu "Berhasil disimpan", di dekat form. | | |
| A7.3 | Coba finalisasi PMS selagi masih ada baris tertahan. | "Belum bisa difinalisasi: … baris masih tertahan." Tombol finalisasi tidak bisa dipakai. | | |
| A7.4 | Selesaikan semua masalah PMS: petakan produk A6.10, perbaiki stok negatif, isi semua stok produk otomatis. Hitung ulang jika diminta. | Baris PMS menjadi "Tidak ada baris tertahan". | | |
| A7.5 | Tekan "Finalisasi rencana" untuk PMS. | Halaman "Rencana final tersimpan" terbuka. Isinya menegaskan bahwa finalisasi hanya menyimpan rencana kebutuhan barang, **bukan** konfirmasi pengiriman fisik atau penerimaan barang. Status PMS di draft: "Final · Versi 1". | | |
| A7.6 | Buka "Lihat rincian rencana final". | Tampil "Dasar perhitungan": periode sumber, impor yang dipakai (nama file, sheet, ukuran, SHA-256), "Ranking pusat September 2026 versi 1", jadwal toko, revisi kalender, perubahan kategori yang dipakai, dan tanggal cakupan dengan kategori efektifnya. Baris rencana menampilkan kebutuhan, stok, dan jumlah kirim. | | |
| A7.7 | PMJ belum beres (misalnya stok belum diisi). Pastikan PMS tetap bisa difinalisasi walaupun PMJ belum. | Finalisasi per toko: masalah PMJ tidak menahan PMS. | | |
| A7.8 | Finalisasi ulang PMS: ubah satu stok PMS, simpan, lalu buka finalisasi PMS. Tekan "Finalisasi ulang" tanpa alasan, lalu isi "Alasan finalisasi ulang". | Tanpa alasan ditolak ("Alasan finalisasi ulang wajib diisi."). Dengan alasan, terbentuk versi baru yang ditandai jelas, misalnya "Versi 2 menggantikan versi 1.", beserta alasannya. Versi 1 tetap utuh di riwayat. | | |
| A7.9 | Perlu dihitung ulang per toko: ubah jadwal **PMJ** (misalnya persiapan Senin menjadi H). Kembali ke draft 19-10-2026. | Draft bertanda "Perlu dihitung ulang", dengan "Yang berubah: Jadwal toko". Hanya PMJ yang bertanda dan tertahan ("dasar perhitungan toko ini berubah … Hitung ulang draft lebih dulu."). Toko lain yang tidak terdampak tetap bisa difinalisasi. Stok yang sudah diisi tidak hilang. | | |
| A7.10 | Isi stok beberapa produk PMJ dan simpan. Ubah jadwal PMJ supaya **tidak** mengirim hari Senin (misalnya Mingguan, Selasa), lalu tekan "Hitung ulang". | PMJ dikeluarkan dari draft ("Toko PMJ dikeluarkan dari draft karena tidak lagi mengirim pada tanggal ini menurut jadwal aktif."). Stok PMJ tidak hilang, tetapi tampil sebagai keterangan "Stok … di Toko PMJ (…) tidak dipakai karena toko ini tidak ada lagi di draft." | | |
| A7.11 | Kembalikan jadwal PMJ ke 2× seminggu Senin/Kamis, lalu "Hitung ulang". | PMJ masuk draft lagi, dan stok yang tadi diisi dipakai kembali. | | |
| A7.12 | *(Hanya jika datanya ada.)* Toko yang semua variannya produk manual, atau toko yang tidak punya baris sama sekali di impor periode sumber. | Toko yang hanya berisi produk manual boleh difinalisasi. Toko tanpa varian sama sekali tidak boleh, dan tampil "Tidak ada varian dari periode sumber untuk toko ini". Jika data seperti itu tidak ada di workbook, tulis `Tidak bisa diuji`. | | |
| A7.13 | Buka "Riwayat rencana final". Pakai filter Tanggal kirim dan Toko, lalu Terapkan. | Daftar rencana final per tanggal kirim, toko, dan versi. Versi 2 PMS menampilkan "Versi 2 menggantikan versi 1." dan alasannya. Versi 1 masih bisa dibuka. | | |
| A7.14 | Tekan "Ekspor (.xlsx)" di versi 1 dan versi 2. | File `rencana-final-PMS-2026-10-19-v1.xlsx` dan `…-v2.xlsx` terunduh. Isinya gudang, tanggal kirim, toko, waktu finalisasi, periode sumber, impor sumber, ranking, dan baris produk (kebutuhan, stok, buffer, jumlah kirim). Draft yang belum final tidak punya tombol ekspor. | | |
| A7.15 | Sebagai **Operator Lihat** dan sebagai **admin**, buka riwayat rencana final Pusat. | Keduanya bisa melihat rincian, tetapi tombol "Ekspor (.xlsx)" tidak ada, karena ekspor butuh hak tindakan "Ekspor" di gudang itu. | | |
| A7.16 | Ubah data dasar setelah final (misalnya unggah dan aktifkan lagi `JUNI (S)`, ubah stok, atau publikasikan ranking baru). Buka lagi rincian rencana final PMS. | Rencana final tetap sama persis seperti saat difinalisasi (snapshot). Hanya draft yang ditandai "Perlu dihitung ulang". | | |

## B9. Dampak perubahan kalender terhadap laporan dan pengiriman

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| B9.1 | Sebagai admin, ubah kategori **Rabu, 21-10-2026** (masuk cakupan draft 19-10-2026) menjadi **Minggu**, khusus toko **PMJ**, dengan alasan. Buka draft Pusat 19-10-2026. | Draft bertanda "Perlu dihitung ulang", dengan "Yang berubah: Kategori efektif". Hanya PMJ yang terdampak. PMS tidak terdampak, karena perubahannya khusus PMJ. Stok tetap tersimpan. | | |
| B9.2 | Ubah kategori satu tanggal di **luar** cakupan draft (misalnya Kamis, 05-11-2026) untuk Seluruh toko. | Draft 19-10-2026 **tidak** ditandai karena perubahan itu. | | |
| B9.3 | Hitung ulang draft. Buka rincian satu produk PMJ. | Tanggal 21-10-2026 memakai kategori efektif Minggu ("Perubahan kategori khusus toko ini") dan rata-rata Minggu. Bulan dan minggu laporan tanggal itu tidak berubah. | | |
| B9.4 | Buka rincian rencana final PMS yang dibuat sebelum perubahan. | Rencana final memakai snapshot kalender saat finalisasi dan tidak berubah. | | |
| B9.5 | Lihat tanggal libur nasional yang masuk cakupan draft (jika ada). | Libur tidak menggeser tanggal kirim, tidak menghapus hari dari cakupan, dan tidak membuat kebutuhan hari itu nol. | | |
| B9.6 | Bersihkan: batalkan perubahan kategori B9.1 dan B9.2 dengan alasan. | Perubahan tercatat sebagai "Dibatalkan" di riwayat tanggalnya. | | |

---

## Melaporkan temuan UAT

1. Untuk setiap baris bertanda `Tidak`, catat:
   - nomor skenario (misalnya `A7.9`);
   - akun yang dipakai;
   - langkah yang Anda lakukan;
   - apa yang Anda lihat dan apa yang seharusnya terjadi;
   - tangkapan layar jika ada.
2. Pisahkan **kesalahan** (aplikasi tidak sesuai PRD atau panduan ini) dari **permintaan baru** (aturan yang ingin Anda ubah atau tambah). Permintaan baru perlu ditulis sebagai keputusan pemilik di `docs/PRD.md`.
3. Kirim temuan ke Claude Code di sesi baru pada folder repo. Contoh:

   ```
   Temuan UAT dari docs/UAT.md. Buat satu issue perbaikan per temuan dengan format tiket yang ada
   (Dalam scope, Di luar scope, Kriteria penerimaan, Rujukan, Blocked by) dan label ready-for-agent:
   - A7.9 (Operator Pusat): setelah jadwal PMJ diubah, PMS juga ikut tertahan. Seharusnya hanya PMJ.
   - B5.4: ...
   Permintaan baru (bukan kesalahan), tanyakan saya dulu sebelum membuat tiket:
   - ...
   ```

4. Setelah tiket perbaikan selesai, jalankan `pnpm uat` lagi dan ulangi skenario yang tadinya `Tidak`.
