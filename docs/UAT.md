# Panduan UAT — Dashboard Penjualan MANDALIKA

Panduan ini untuk **pemilik produk**. Isinya cara menyalakan aplikasi di laptop dengan satu perintah, lalu skenario uji untuk setiap bagian PRD (A1–A7 dan B1–B9). Setiap skenario punya langkah, hasil yang diharapkan, dan kolom untuk mencatat hasil Anda.

Aturan yang diuji berasal dari `docs/PRD.md`, termasuk semua blok **▶ Keputusan**. Jika aplikasi berbeda dari hasil yang diharapkan di sini, itu temuan UAT. Cara melaporkannya ada di bagian akhir.

## Cara memakai panduan ini

- Mulai dari **"Alur utama"** (cerita pengguna Gudang Cibubur dari impor sampai ekspor), lalu kerjakan bagian-bagian berikutnya **sesuai urutan di dokumen ini**. Urutannya mengikuti alur kerja nyata, bukan urutan nomor PRD: akun dan gudang dulu, lalu impor, laporan, kalender, dan terakhir pengiriman gudang.
- Isi kolom **Hasil (OK/Tidak)** dengan `OK` atau `Tidak`. Tulis apa yang Anda lihat di kolom **Catatan**, terutama jika hasilnya `Tidak`. Jika langkah tidak bisa dicoba (misalnya datanya tidak ada), tulis `Tidak bisa diuji` beserta alasannya.
- Teks yang ditulis di antara tanda kutip ("…") adalah teks yang seharusnya tampil persis di layar.
- Tanggal ditulis seperti di aplikasi: `Senin, 19-10-2026`. Jika Anda menguji di minggu lain, pakai tanggal yang setara (misalnya Senin minggu depan).

## Menyalakan aplikasi

### Yang perlu disiapkan sekali

1. Docker Desktop terpasang dan **menyala**.
2. Node.js 22 dan pnpm terpasang. Di folder repo, jalankan `pnpm install` sekali.
3. Folder `data-lokal/` berisi file dari pemilik. File ini tidak ada di repo dan tidak boleh di-commit:
   - workbook penjualan (`data-lokal/DATA TUMPUKAN AKEH YA ALLAh.xlsx`, berisi sheet `APRIL (S)` sampai `SEPTEMBER (S)`);
   - `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx` (file ranking pusat);
   - `data-lokal/ENDING STOK DPM 5 OKT.csv` (contoh file stok dari sistem kasir, dipakai di "Alur utama" Babak 4);
   - `data-lokal/alias-nama-stok.csv` (tabel alias nama kasir → kode produk, 205 baris, diturunkan dari file stok di atas dengan aturan EDP = EXTRAIT, PARFUM = PARFUM INTENSE, awalan DISPLAY/GIFT SET dihapus; `data-lokal/usulan-alias-lengkap.csv` memuat versi lengkapnya beserta cara pencocokan dan 57 nama yang tidak ada di master).
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
5. Membuat admin pertama, 5 gudang (Pusat, Gudang Bali, Gudang Bandung, Gudang Cibubur, Gudang Jabodetabek), dan 25 toko. Dua puluh toko langsung dihubungkan ke gudangnya beserta jadwal aktif awal, sesuai lampiran jadwal dari pemilik (PRD A3 dan A5 ▶ Keputusan 2026-10-12): 16 toko ke Gudang Cibubur, DMB dan LWB ke Gudang Bali, PASKAL dan PVJ ke Gudang Bandung, atas nama admin pertama. Lima toko (**PMS, PMJ, QUEEN, MKS, DPM**) **belum dihubungkan**, karena datanya masih menunggu pemilik (OD-12). Anda menghubungkannya sendiri di skenario A3.
   Lalu mengisi **data master** (PRD A3 ▶ Keputusan 2026-10-12, UAT kedua): 359 produk, 29 keluarga aroma beserta alias dan segmen kodenya, pemetaan produk (347 terpetakan, 12 tanpa aroma), dan 205 alias nama stok. Semua ini berlaku sebagai konfirmasi admin awal; produk baru dari impor berikutnya tetap lewat usulan dan konfirmasi admin.
   Terakhir mengisi **data khusus UAT**: periode sumber Juni–Agustus 2026 untuk Gudang Cibubur, Bali, dan Bandung, serta akun **Operator Cibubur**, **Operator Bali**, dan **Operator Bandung** (lihat "Akun uji"). Kata sandi ketiga akun ini adalah nilai `UAT_SANDI_OPERATOR` di berkas `.env`. Jika variabel itu kosong, akun operator dilewati dengan peringatan.
   Impor penjualan dan ranking pusat **tidak** diisi otomatis: keduanya pekerjaan rutin admin setiap bulan dan diuji di "Alur utama".
6. Menyiapkan aplikasi (beberapa menit), lalu menyalakan aplikasi dan worker. Worker adalah proses yang membaca file impor dan menghitung laporan.

Aplikasi ini memakai port sendiri supaya tidak bentrok dengan proyek lain di laptop yang sama: PostgreSQL di port 55432, MinIO di port 59000 (konsol MinIO di `http://localhost:59001`), dan aplikasi di port 3100.

Jika berhasil, terminal menampilkan kotak "Aplikasi siap: http://localhost:3100" beserta email admin dan email ketiga operator.

- Buka `http://localhost:3100` di browser.
- Masuk dengan email admin yang tampil di terminal. Kata sandinya adalah nilai `ADMIN_AWAL_SANDI` di berkas `.env`.
- Biarkan terminal tetap terbuka selama UAT. Untuk berhenti, tekan **Ctrl+C** di terminal itu.

Data UAT tersimpan di Docker. Jika `pnpm uat` dijalankan lagi, data sebelumnya masih ada; tidak ada yang dibuat dua kali, dan perubahan yang Anda buat di aplikasi tidak ditimpa.

Jika berkas `.env` Anda dibuat sebelum 12-10-2026, tambahkan satu baris `UAT_SANDI_OPERATOR=<kata sandi minimal 8 karakter>` supaya akun operator dibuat.

### Jika ada masalah saat menyalakan

| Pesan di terminal | Yang perlu dilakukan |
|---|---|
| "Docker belum menyala." | Buka Docker Desktop, tunggu sampai statusnya *running*, lalu jalankan `pnpm uat` lagi. |
| "Perintah docker tidak ditemukan." | Pasang Docker Desktop, lalu jalankan `pnpm uat` lagi. |
| "Berkas .env masih memakai port lama…" | Berkas `.env` Anda dibuat sebelum proyek ini memakai port sendiri. Terminal menyebut baris mana yang harus diubah (misalnya `DATABASE_URL` dari port 5432 menjadi 55432). Ubah baris itu di `.env` sesuai pesan (contoh nilai yang benar ada di `.env.example`), lalu jalankan `pnpm uat` lagi. `pnpm uat` tidak mengubah `.env` sendiri. |
| "Port 55432 sudah dipakai program lain…" (atau port 59000, 59001, 3100) | Ada program lain yang memakai port itu: 55432 untuk PostgreSQL, 59000/59001 untuk MinIO, 3100 untuk aplikasi. Biasanya itu salinan aplikasi ini yang masih berjalan di terminal lain. Hentikan program itu, lalu jalankan `pnpm uat` lagi. Jika Anda tidak tahu program mana, laporkan pesannya ke Claude Code. |
| "Salah satu proses berhenti…" | Aplikasi atau worker berhenti. Baca pesan di atasnya, lalu jalankan `pnpm uat` lagi. Jika terulang, laporkan pesannya. |

**Mulai UAT dari awal (menghapus semua data UAT):** hentikan `pnpm uat` dengan Ctrl+C, jalankan `docker compose down -v`, lalu jalankan `pnpm uat` lagi. Perintah `down -v` **menghapus semua data UAT** di laptop ini: impor, pengguna, rencana, dan lainnya.

### Menonaktifkan dan mengaktifkan toko

Beberapa skenario (A1.6, A3.6, A6.20) menguji perilaku toko nonaktif. Status toko diubah di layar, sebagai **admin**:

1. Buka **Gudang**. Di tabel "Daftar toko" (bagian "Tambah toko ke gudang"), cari baris tokonya, misalnya `LMK`.
2. Tekan **Nonaktifkan** di kolom "Tindakan", lalu tekan **OK** di kotak konfirmasi. Di bawah tombol tampil "Berhasil disimpan", dan kolom "Status" toko itu menjadi "Nonaktif".
3. Untuk mengaktifkannya lagi, tekan **Aktifkan** di baris yang sama, lalu **OK**. Kolom "Status" kembali "Aktif".

## Akun uji

Akun yang sudah dibuat `pnpm uat` (kata sandi operator = `UAT_SANDI_OPERATOR` di `.env`):

| Nama | Email | Peran | Penugasan | Gunanya |
|---|---|---|---|---|
| Admin | `ADMIN_AWAL_EMAIL` di `.env` | admin | — | Konfigurasi, impor, kalender, ranking, persetujuan |
| Operator Cibubur | `operator.cibubur@example.com` | viewer | Gudang Cibubur, kelima hak tindakan | Alur utama: hitung, unggah stok, finalisasi, ekspor |
| Operator Bali | `operator.bali@example.com` | viewer | Gudang Bali, kelima hak tindakan | Mencoba gudang Bali (DMB, LWB) |
| Operator Bandung | `operator.bandung@example.com` | viewer | Gudang Bandung, kelima hak tindakan | Mencoba gudang Bandung (PASKAL, PVJ) |

Akun berikut Anda buat sendiri di skenario A3 untuk menguji fitur pengguna dan penugasan. Pilih sendiri kata sandinya (minimal 8 karakter) dan catat.

| Nama | Peran | Penugasan | Gunanya |
|---|---|---|---|
| Operator Pusat | viewer | Pusat, semua hak tindakan | Jadwal langsung, stok, hitung, finalisasi, ekspor di Pusat |
| Operator Jabodetabek | viewer | Gudang Jabodetabek, semua hak tindakan | Usulan jadwal yang perlu persetujuan admin |
| Operator Lihat | viewer | Pusat, tanpa hak tindakan | Akses hanya-baca ke Pengiriman Gudang |
| Pengamat | viewer | — | Hanya laporan dan kalender |

Aplikasi hanya punya dua peran, **admin** dan **viewer**. Seseorang menjadi **operator** karena ditugaskan ke gudang di halaman Penugasan, bukan karena perannya. Peran admin tidak memberi hak operator.

Untuk berganti akun, tekan **Keluar** di menu, lalu masuk dengan akun lain. Cara lain: pakai jendela penyamaran (*incognito*) browser untuk akun kedua.

---

## Alur utama: dari file Excel sampai jumlah kirim (Gudang Cibubur)

Bagian ini adalah **cerita pengguna** dari awal sampai akhir, untuk dikerjakan pertama kali supaya Anda hafal alur platformnya. Skenario A1–B9 di bawahnya menguji aturan satu per satu dan boleh dikerjakan setelahnya. Semua langkah di sini sudah dijalankan pada 12-10-2026 dengan file asli Anda dari database kosong; angka yang disebut adalah angka yang keluar saat itu.

Ceritanya: `pnpm uat` sudah menyiapkan data master (produk, keluarga aroma, pemetaan, alias nama stok), jadwal kirim Cibubur/Bali/Bandung dari lampiran Anda, periode sumber, dan akun operator. **Admin** tinggal melakukan pekerjaan rutin bulanan: mengimpor penjualan dan menerbitkan ranking. **Operator Cibubur** lalu memilih tanggal kirim, mengunggah file stok dari kasir, meninjau, menyimpan, dan memfinalisasi. Hasilnya bisa diekspor ke Excel.

Mulai dari database kosong. Jika Anda sudah pernah memakai aplikasi ini, bersihkan dulu:

```
docker compose down -v
```

lalu jalankan `pnpm uat` lagi. Perintah itu menghapus semua data lokal, termasuk file unggahan.

### Babak 1 — Admin: impor penjualan tiga bulan sekaligus

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U1.1 | Masuk sebagai **admin**. Lihat kartu **"Mulai di sini"** di Beranda, lalu sidebar. | Kartu berisi 4 langkah bernomor: 1 Impor penjualan (**Belum**), 2 Terbitkan ranking pusat (**Belum**), 3 Periksa pemetaan produk (**Selesai**, karena sudah diisi `pnpm uat`), 4 Setujui usulan jadwal (**Selesai**). Setiap langkah punya tombol menuju halamannya. Sidebar: Beranda · Pekerjaan rutin · Pengiriman Gudang · Laporan · Data Master · Pengaturan (rincian item di A3.1). Di bawahnya kartu "Perlu tindakan" berisi "Ranking bulan berjalan belum dipublikasikan". | | |
| U1.2 | Buka **Pekerjaan rutin › Impor penjualan**. Pilih `data-lokal/DATA TUMPUKAN AKEH YA ALLAh.xlsx`. Centang **JUNI (S)**, **JULI (S)**, dan **AGUSTUS (S)**. | Bulan impor setiap sheet terisi sendiri: Juni, Juli, Agustus (masih bisa diubah). Sheet `MP …` tampil tetapi tidak bisa dicentang. | | |
| U1.3 | Isi Tahun impor **2026**, tekan "Unggah dan proses". | File diunggah sekali. Di atas "Daftar impor": "Hasil unggahan: 3 sheet berhasil didaftarkan, 0 gagal." Dalam beberapa detik ketiga impor berstatus "Siap ditinjau" (muat ulang halaman bila perlu). | | |
| U1.4 | *(Opsional.)* Tekan "Tinjau" di impor JUNI (S). | Ringkasan per toko berisi 25 toko, cakupan 01-06-2026 s.d. 30-06-2026. "0 error, 25 peringatan." Semua peringatan berbunyi `Kolom tanggal invalid "31/6" … kosong dan dilewati` dan tidak perlu tindakan. JULI dan AGUSTUS: "0 error, 0 peringatan." | | |
| U1.5 | Kembali ke Daftar impor, tekan **"Aktifkan semua yang siap (3)"**. | "Berhasil disimpan — 3 impor diaktifkan." dan "Hasil aktifkan semua: 3 diaktifkan, 0 dilewati, 0 gagal." Ketiga impor berstatus "Aktif"; tombol menjadi "(0)" dan tidak bisa ditekan. | | |
| U1.6 | Buka **Ringkasan**. Centang Juni, Juli, Agustus 2026. Di filter Toko tekan **"Pilih semua"**, lalu "Kosongkan", lalu centang **MKG** saja. Cari produk `PW110P-GOR`, tekan Terapkan. | "Pilih semua" mencentang 25 toko dan "Kosongkan" menghapusnya. Hasilnya satu baris MKG · PW110P-GOR dengan Rata-rata Senin–Kamis **4**, Jumat **3**, Sabtu **4**, Minggu **4**, total penjualan mentah **245**. Klik angka 4 Senin–Kamis: rincian menunjukkan "Σ 10 ÷ 3 bulan ≈ 3,33 → dibulatkan ke atas 4" sampai ke sel Excel (`JUNI (S)!AAQ274`). | | |

### Babak 2 — Admin: periksa data master, terbitkan ranking

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U2.1 | Buka **Data Master › Keluarga aroma**. | 29 kartu keluarga berstatus Aktif (28 baris ranking September + KISS FROM A ROSE), masing-masing dengan alias yang sama dengan namanya dan segmen kodenya (GOR, HOL, ONL, …; GIFT SET BOX: `B` dan `W`). Tidak ada yang perlu diketik. | | |
| U2.2 | Buka **Data Master › Pemetaan produk**. | Filter status: Semua (359), Terpetakan (347), Tanpa aroma (12), Belum dipetakan (0). "Daftar usulan" kosong. Riwayat pemetaan mencatat pemetaan awal atas nama admin. | | |
| U2.3 | Buka **Pekerjaan rutin › Ranking pusat**. Pilih `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx`. | Bulan ranking terisi **September** dan tahun **2026** dari nama file (masih bisa diubah). | | |
| U2.4 | Tekan "Unggah dan tinjau", lalu "Publikasikan". | Halaman tinjau: 28 baris, semuanya cocok ke keluarga aroma; tujuh besar RANK 1–7 (GORGEOUS TUBEROSE, HOLY SWEET, ONLY THE BRAVE, NO1, UNSTOPPABLE, CHAMPION, SEDUCTION). Setelah publikasi: "Ranking ini sekarang berlaku untuk semua gudang." Status "Dipublikasikan", "September 2026 versi 1". | | |
| U2.5 | Kembali ke **Beranda**. | Kartu "Mulai di sini" kini menampilkan "Semua langkah beres." | | |

> **Sudah dikonfirmasi pemilik (12-10-2026):** keluarga GIFT SET BOX memakai segmen `B` dan `W`, sehingga `GS15-B`, `GS15-W`, dan dua display dummy `DD-GS15-B`, `DD-GS15-W` masuk keluarga itu. Ini tidak mengubah angka (GIFT SET BOX di luar tujuh besar, buffernya 10% sama dengan produk otomatis lain).

### Babak 3 — Admin: periksa alias nama stok, periode sumber, operator, jadwal

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U3.1 | Buka **Data Master › Alias nama stok**. | Daftar berisi 205 alias, misalnya `GORGEOUS TUBEROSE - 110ML M PARFUM` → `PW110P-GOR`. | | |
| U3.2 | Unggah `data-lokal/alias-nama-stok.csv` lewat "Unggah tabel alias". | "Hasil unggahan: 0 ditambahkan, 205 sudah ada, 0 ditolak." Tidak ada yang berubah. | | |
| U3.3 | Di "Tambah alias", isi `GORGEOUS TUBEROSE - 10ML ATOMIZER` dengan kode `PW110P-GOR`. | Ditolak, karena nama itu adalah nama master produk lain (`A10M-GOR`). Nama master selalu berlaku sebagai alias tanpa perlu ditambahkan. | | |
| U3.4 | Buka **Pengaturan › Gudang** → "Periode sumber penjualan". | Gudang Bali, Gudang Bandung, Gudang Cibubur: "Juni 2026, Juli 2026, Agustus 2026", ditetapkan oleh Admin. Pusat dan Gudang Jabodetabek: "Belum ditetapkan" (dipakai di skenario A4). | | |
| U3.5 | Buka **Pengaturan › Penugasan**. | Operator Cibubur, Operator Bali, dan Operator Bandung tertugas di gudangnya masing-masing dengan kelima hak (Kelola usulan jadwal, Input stok, Hitung kebutuhan, Finalisasi, Ekspor). | | |
| U3.6 | Buka **Pengiriman Gudang** → Gudang Cibubur sebagai admin. | Halaman terbuka hanya-baca. Kartu "Toko terhubung" berisi 16 toko (ALSUT, BOTANI, BSD, BXC, CCM, DELTAMAS, KARAWACI, KOKAS, KUNCIT, LMK, MKG, PMB, SENTUL, SMB, SMS, TSM CBB). Kartu "Jadwal" berisi jadwal dari lampiran Anda, misalnya SMB "2× seminggu · Senin (H), Kamis (H−1)", BXC "Dua mingguan · Rabu (H−1) · jangkar Rabu, 14-10-2026", PMB "Mingguan · Kamis (H−2)". | | |

> **Sudah dikonfirmasi pemilik (12-10-2026):** SMS dikirim **2× seminggu** (Selasa dan Jumat); BXC dan CCM **bergantian** dua mingguan (BXC pekan 12-10-2026, CCM pekan berikutnya); persiapan Bali dan Bandung **H−1**. Toko "Performance" tidak ada di sheet penjualan sehingga tidak masuk. Jika jadwal berubah nanti, ubah lewat usulan jadwal (Babak 5).

### Babak 4 — Operator Cibubur: hitung, unggah stok, finalisasi, ekspor

Tanggal kirim contoh: **Selasa, 13-10-2026**. Menurut jadwal, yang mengirim hari itu adalah **ALSUT, KOKAS, MKG, SMS**. Jika Anda menguji di minggu lain, pakai Selasa terdekat; angka kebutuhan tetap sama selama kategori hari di cakupannya sama.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U4.1 | Keluar, lalu masuk sebagai **Operator Cibubur** (`operator.cibubur@example.com`, kata sandi `UAT_SANDI_OPERATOR` di `.env`). Lihat Beranda, lalu buka **Pengiriman Gudang › Pengiriman Gudang**. | Kartu "Mulai di sini" berjudul "Gudang Cibubur · Tanggal kirim <tanggal kirim terdekat>" dengan 3 langkah: Hitung kebutuhan, Isi stok dan bereskan masalah, Finalisasi (semuanya **Belum**); tombolnya membuka halaman gudang pada tanggal itu. Sidebar operator hanya Beranda, Pekerjaan rutin (Usulkan jadwal toko), Pengiriman Gudang (Pengiriman Gudang, Salin jadwal ke beberapa toko), dan Laporan (Ringkasan, Kalender). Di Pengiriman Gudang hanya "Gudang Cibubur" yang tampil, tanpa label hanya-baca. | | |
| U4.2 | Buka Gudang Cibubur. Di kartu "Draft rencana" → "Hitung kebutuhan", isi Tanggal kirim **13-10-2026**, tekan "Hitung kebutuhan". | "Berhasil disimpan". Muncul "Draft tersimpan: Selasa, 13-10-2026". Ringkasan per toko: ALSUT, KOKAS, MKG, SMS, masing-masing **359 varian** dan **285 baris tertahan** (semua produk otomatis belum punya stok; 74 produk manual tidak tertahan). | | |
| U4.3 | Tekan "Buka" di baris **MKG**. Cari baris `PW110P-GOR`, tekan "Rincian". | Tanggal cakupan Senin, 12-10-2026 – Senin, 19-10-2026 · 8 hari · Persiapan H−1 · Panjang cakupan 7 hari. Rata-rata per kategori 4 / 3 / 4 / 4 (sama dengan U1.5). "Kebutuhan = (5 × 4) + (1 × 3) + (1 × 4) + (1 × 4) = **31**". Buffer "20% · keluarga aroma termasuk tujuh besar ranking pusat September 2026 versi 1". Jumlah kirim "—", karena stok belum diisi. | | |
| U4.4 | Di atas tabel varian MKG ada "Unggah file stok". Pilih `data-lokal/ENDING STOK DPM 5 OKT.csv` (file kasir; untuk uji ini dianggap stok MKG), tekan "Baca file". | Isian stok terisi dari file dan form berstatus "Ada perubahan yang belum disimpan". Ringkasan hasil: "**249 varian terisi dari file**" dan "**57 nama tidak dikenal**" beserta daftarnya (`BACCARAT ELIXIR - …`, `DISPLAY 10ML PRIA/WANITA - …`, `GLASS MAN/WOMAN - …`, `GLITTER/LEATHER - …`, beberapa tester: produk kasir yang tidak ada di master) dan keterangan "Admin memetakan nama ini di Alias nama stok." Belum ada yang tersimpan. | | |
| U4.5 | Periksa isian `PW110P-GOR`. | Terisi **24** (baris `GORGEOUS TUBEROSE - 110ML M PARFUM;PARFUM WANITA;24` di file). | | |
| U4.6 | Tekan "Simpan stok". Buka lagi rincian `PW110P-GOR`. | "Berhasil disimpan". Rincian menampilkan "(31 − 24) × 120% = 8,4 → dibulatkan ke atas 9", Jumlah kirim **9**. `A10M-GOR` terisi 64. Di Ringkasan per toko, MKG kini "**50 baris tertahan**" (dari 285): produk otomatis yang tidak ada di file stok (stok masih "—") dan **4 baris "Stok negatif"** yang memang negatif di file kasir (`DP100E-DAY` −1, `DP100E-ICO` −2, `DP100E-NO1` −1, `DW110P-UNS` −1). Stok negatif tersimpan apa adanya tetapi menahan finalisasi. | | |
| U4.7 | Tekan **"Isi 0 untuk 46 stok yang kosong"**. Lalu perbaiki 4 stok negatif menjadi angka yang benar (misalnya 0). Tekan "Simpan stok". | Tombol mengisi 0 hanya pada 46 produk **otomatis** yang masih kosong (produk manual tidak disentuh) sebagai perubahan belum disimpan, lalu menjadi "Isi 0 untuk 0 stok yang kosong" yang tidak bisa ditekan. Stok negatif tidak ikut diubah tombol itu. Setelah disimpan, baris MKG menjadi "Tidak ada baris tertahan" dan form "Finalisasi rencana MKG" muncul dengan keterangan bahwa finalisasi bukan konfirmasi pengiriman fisik. | | |
| U4.8 | Tekan "Finalisasi rencana" untuk MKG. | Halaman "Rencana final tersimpan": Versi 1, difinalisasi oleh Operator Cibubur, 359 varian tersimpan. Toko lain (ALSUT, KOKAS, SMS) tetap draft dan tidak terpengaruh. | | |
| U4.9 | Buka "Lihat rincian rencana final", lalu "Ekspor (.xlsx)". | Dasar perhitungan lengkap (periode sumber, tiga impor dengan SHA-256, ranking September 2026 versi 1, jadwal MKG, 8 tanggal cakupan dengan kategori efektifnya) dan 359 baris rencana; baris `PW110P-GOR`: kebutuhan 31, stok 24, jumlah kirim 9. File `rencana-final-MKG-2026-10-13-v1.xlsx` terunduh: kepala (gudang, tanggal kirim, toko, waktu finalisasi, periode sumber, tiga impor sumber, ranking), lalu tabel Kode produk, Nama produk, Kebutuhan barang, Stok akhir, Buffer (%), Jumlah kirim, Status; baris `PW110P-GOR` = 31 · 24 · 20 · 9 · Otomatis. | | |
| U4.10 | Buka "Riwayat rencana final". | Rencana MKG 13-10-2026 versi 1 tampil dan bisa dibuka lagi. | | |

### Babak 5 — Operator mengubah jadwal, admin menyetujui

Alur ini sama dengan skenario A5 dan A7.9; teks yang diharapkan mengikuti skenario itu.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U5.1 | Sebagai Operator Cibubur, buka **Pekerjaan rutin › Usulkan jadwal toko**. Halaman "Usulkan jadwal toko — Gudang Cibubur" langsung terbuka, karena Operator Cibubur hanya berhak di satu gudang (cara lain: tautan "Usulkan jadwal toko" di bawah tabel kartu "Jadwal" di halaman Gudang Cibubur). Pilih **ALSUT**, Pola **2× seminggu**, Selasa (H−1) dan Jumat (H−1), tekan "Kirim usulan". | Usulan "Menunggu persetujuan". Jadwal aktif ALSUT tetap Mingguan Selasa (H−1) sampai disetujui. | | |
| U5.2 | Sebagai **admin**, buka **Pekerjaan rutin › Persetujuan jadwal**, bandingkan "Jadwal aktif" dan "Usulan", tekan "Setujui". | Jadwal ALSUT berganti menjadi 2× seminggu. Draft 13-10-2026 bertanda "Perlu dihitung ulang" dengan "Yang berubah: Jadwal toko"; hanya ALSUT yang tertahan, MKG (sudah final) tidak berubah. | | |
| U5.3 | Sebagai Operator Cibubur, tekan "Hitung ulang" pada draft 13-10-2026. | Draft segar, stok yang sudah diisi tetap ada. | | |

### Babak 6 — Cocokkan dengan workbook "Phase 1_2" (2× seminggu, 1× sebulan)

Bagian ini membuktikan aturan PRD A6 ▶ Revisi 2026-10-12: cakupan berakhir **sehari sebelum pengiriman berikutnya**, sama seperti sheet PHASE 2. Angka di bawah dihasilkan 12-10-2026 dari database kosong dengan file asli Anda. Rata-rata SMB `PW110P-GOR` = Senin–Kamis 5, Jumat 5, Sabtu 8, Minggu 7 (sama dengan sheet "X SMB").

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| U6.1 | Sebagai Operator Cibubur, hitung kebutuhan untuk **Senin, 19-10-2026**. Buka SMB → Rincian `PW110P-GOR`. | Toko yang mengirim: BOTANI, SMB. Rincian SMB: "Senin, 19-10-2026 – Rabu, 21-10-2026 · 3 hari · Persiapan H · Panjang cakupan 3 hari", "Kebutuhan = (3 × 5) = **15**". (Sebelum revisi sistem memakai 7 hari dan kebutuhan 40.) | | |
| U6.2 | Hitung kebutuhan untuk **Kamis, 22-10-2026**. Buka SMB → Rincian `PW110P-GOR`. | Toko yang mengirim: BOTANI, DELTAMAS, PMB, SMB. Rincian SMB: "Rabu, 21-10-2026 – Minggu, 25-10-2026 · 5 hari · Persiapan H−1 · Panjang cakupan 4 hari", "Kebutuhan = (2 × 5) + (1 × 5) + (1 × 8) + (1 × 7) = **30**". Sama dengan PHASE 2 (Senin 15 + Kamis 30). | | |
| U6.3 | Buka **Pekerjaan rutin › Usulkan jadwal toko** ("Usulkan jadwal toko — Gudang Cibubur"). Usulkan jadwal **ALSUT**: Pola **1× sebulan**, hari **Selasa**, persiapan **H−1**, lalu "Kirim usulan". Sebagai admin, setujui di **Pekerjaan rutin › Persetujuan jadwal**. | Pilihan pola berisi Mingguan, 2× seminggu, 3× seminggu, Dua mingguan, **1× sebulan**. Usulan "Menunggu persetujuan", lalu setelah disetujui jadwal ALSUT menjadi "1× sebulan · Selasa (H−1)". Beranda admin langkah 4 kembali **Selesai** setelah disetujui. | | |
| U6.4 | Hitung kebutuhan untuk **Selasa, 03-11-2026** (Selasa pertama November), lalu untuk **Selasa, 10-11-2026**. | 03-11: ALSUT ikut (bersama KOKAS, MKG, SMS); rincian ALSUT `PW110P-GOR`: "Senin, 02-11-2026 – Rabu, 02-12-2026 · 31 hari · Persiapan H−1 · Panjang cakupan 30 hari", kebutuhan **70** (rata-rata ALSUT 2/2/3/3). 10-11: ALSUT **tidak** ikut. | | |
| U6.5 | *(Peringatan kiriman sebelumnya; kerjakan setelah skenario A3 dan A5 karena butuh Operator Pusat dan PMJ di Pusat. Perilaku ini juga dijaga test otomatis T93.)* Sebagai Operator Pusat, buka **Pekerjaan rutin › Usulkan jadwal toko** ("Atur jadwal toko — Pusat") dan atur toko PMJ: **3× seminggu** Senin (H−1), Selasa (H−1), Jumat (H). Hitung kebutuhan untuk **Selasa, 20-10-2026** dan buka PMJ. Kembalikan jadwal PMJ setelahnya. | Di bawah header PMJ tampil peringatan (ikon + teks): "Kiriman Senin, 19-10-2026 belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir." Peringatan tidak menahan finalisasi. Toko dengan jarak cukup (misalnya SMB Kamis) tidak mendapat peringatan. | | |

> Draft yang dihitung **sebelum** perubahan ini tetap memakai angka lama sampai Anda menekan "Hitung kebutuhan" lagi. Rencana final yang sudah dibuat tidak berubah.

Setelah Babak 6 selesai, Anda sudah melewati seluruh alur bisnis: data masuk → rata-rata → jadwal → stok → jumlah kirim → final → ekspor. Lanjutkan ke skenario A1–B9 untuk aturan-aturan rincinya.

---

## A3. Gudang, pengguna, dan kewenangan

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A3.1 | Masuk sebagai admin. Lihat menu. | Sidebar berurutan: **Beranda**; **Pekerjaan rutin** (Impor penjualan, Ranking pusat, Persetujuan jadwal); **Pengiriman Gudang** (Pengiriman Gudang); **Laporan** (Ringkasan, Kalender); **Data Master** (Keluarga aroma, Pemetaan produk, Alias nama stok, Libur); **Pengaturan** (Gudang, Pengguna, Penugasan), tanpa subjudul. Item "Usulkan jadwal toko" (di Pekerjaan rutin, setelah Persetujuan jadwal) dan "Salin jadwal ke beberapa toko" (di Pengiriman Gudang, setelah Pengiriman Gudang) hanya tampil bagi pengguna yang punya hak Kelola usulan jadwal di sedikitnya satu gudang; admin dari `pnpm uat` tidak punya penugasan, jadi keduanya tidak tampil. Kelompok bisa dibuka-tutup; kelompok halaman yang sedang dibuka selalu terbuka. Tidak ada tautan pendaftaran akun mandiri. | | |
| A3.2 | Buka **Gudang**. | Ada lima gudang: Pusat, Gudang Bali, Gudang Bandung, Gudang Cibubur, Gudang Jabodetabek. Gudang Cibubur berisi 16 toko (SMB, BOTANI, MKG, KOKAS, SMS, ALSUT, BXC, KARAWACI, CCM, BSD, DELTAMAS, PMB, KUNCIT, TSM CBB, SENTUL, LMK), Gudang Bali berisi DMB dan LWB, Gudang Bandung berisi PASKAL dan PVJ. Pusat dan Gudang Jabodetabek "Belum ada toko". Daftar toko berisi 25 toko; PMS, PMJ, QUEEN, MKS, dan DPM "Belum terhubung", toko lainnya menampilkan nama gudangnya. | | |
| A3.3 | Di "Tambah toko ke gudang", pilih gudang **Pusat**, centang **PMS** dan **PMJ**, tekan "Tambahkan toko terpilih". | Hasil per toko tampil: "2 dari 2 toko ditambahkan.", masing-masing "Berhasil" dengan keterangan "Ditambahkan ke Pusat." | | |
| A3.4 | Pilih **Gudang Jabodetabek**, centang **QUEEN**, **MKS**, dan juga **PMS**. Tekan "Tambahkan toko terpilih". | "2 dari 3 toko ditambahkan." QUEEN dan MKS "Berhasil". PMS "Terkait gudang lain" dengan keterangan bahwa PMS sudah terhubung ke Pusat dan satu toko hanya boleh terhubung ke satu gudang. | | |
| A3.5 | Pilih **Pusat** lagi, centang **PMS**, tekan tombolnya. | PMS "Sudah terhubung", dengan keterangan bahwa tidak ada yang diubah. | | |
| A3.6 | Nonaktifkan **DPM** (lihat "Menonaktifkan dan mengaktifkan toko"). Pilih Pusat, centang **DPM**, tekan "Tambahkan toko terpilih". Setelah itu tekan "Aktifkan" di baris DPM. | DPM berstatus "Nonaktif" di daftar. Hasilnya "Nonaktif" dengan keterangan "Tidak ditambahkan: toko berstatus nonaktif." | | |
| A3.7 | Buka **Pengguna**. Buat empat akun dari tabel kedua di "Akun uji" (Operator Pusat, Operator Jabodetabek, Operator Lihat, Pengamat), semuanya dengan peran **viewer**. | Setiap akun berhasil dibuat dan tampil di "Daftar pengguna" berstatus "Aktif", di samping admin dan tiga operator dari `pnpm uat`. Pilihan peran hanya "viewer" dan "admin". | | |
| A3.8 | Coba buat akun dengan email yang sudah dipakai. | Muncul "Email sudah dipakai pengguna lain." Tidak ada akun ganda. | | |
| A3.9 | Di baris akun admin Anda sendiri, tekan "Nonaktifkan". | Ditolak dengan pesan "Akun sendiri tidak bisa dinonaktifkan." | | |
| A3.10 | Ubah peran admin Anda sendiri menjadi viewer, lalu tekan "Simpan peran" (saat Anda satu-satunya admin aktif). | Ditolak dengan pesan "Peran tidak bisa diubah: aplikasi harus punya minimal satu admin aktif." | | |
| A3.11 | Nonaktifkan **Pengamat**. Coba masuk sebagai Pengamat. Lalu, sebagai admin, tekan "Aktifkan kembali". | Saat nonaktif, masuk ditolak dengan "Akun ini dinonaktifkan. Hubungi admin." Setelah diaktifkan kembali, Pengamat bisa masuk. | | |
| A3.12 | Buka **Penugasan**. Tugaskan Operator Pusat ke **Pusat** dengan kelima hak: Kelola usulan jadwal, Input stok, Hitung kebutuhan, Finalisasi, Ekspor. Tugaskan Operator Jabodetabek ke **Gudang Jabodetabek** dengan kelima hak. Tugaskan Operator Lihat ke **Pusat** tanpa mencentang hak apa pun. | Ketiga penugasan tampil di "Daftar penugasan" dengan hak masing-masing. Penugasan tanpa hak tetap tersimpan. | | |
| A3.13 | Tugaskan Operator Pusat ke Pusat sekali lagi. | Ditolak dengan pesan bahwa pengguna ini sudah ditugaskan di gudang tersebut. | | |
| A3.14 | Sebagai admin, buka **Pengiriman Gudang**, lalu buka Pusat. | Admin melihat semua gudang. Halaman Pusat menampilkan "Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini." Tidak ada tombol jadwal, stok, hitung, atau finalisasi. | | |
| A3.15 | Masuk sebagai **Operator Lihat**, lalu buka Pengiriman Gudang. | Hanya gudang Pusat yang tampil, berlabel "Hanya-baca". Halamannya bisa dibuka tanpa tombol tindakan. | | |
| A3.16 | Masuk sebagai **Pengamat**. Lihat menu, lalu ketik alamat `http://localhost:3100/admin/impor` di browser. | Menu hanya Beranda, Ringkasan, Kalender. Tidak ada Pengiriman Gudang dan tidak ada menu admin. Halaman admin tidak bisa dibuka (halaman "404"). | | |
| A3.17 | Masuk sebagai **Operator Pusat**, lalu buka Pengiriman Gudang. | Hanya Pusat yang tampil, tanpa label "Hanya-baca". Menu admin tidak tampil, karena hak operator tidak sama dengan admin. | | |

## A1. Memasukkan data penjualan

Semua langkah di bagian ini memakai akun **admin**.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A1.1 | Buka **Impor**. Di "Unggah workbook penjualan", pilih workbook penjualan dari `data-lokal/`. | Daftar sheet tampil. Sheet `MP …` tampil tetapi tidak bisa dipilih ("di luar cakupan saat ini"). | | |
| A1.2 | Centang sheet `JUNI (S)` saja. Bulan impornya terisi otomatis **Juni**. Isi Tahun impor `2026`, lalu tekan "Unggah dan proses". | Di atas "Daftar impor" tampil "Hasil unggahan: 1 sheet berhasil didaftarkan, 0 gagal." Impor JUNI (S) muncul di daftar. Tekan "Tinjau": halaman "Tinjau impor JUNI (S)" terbuka. Sambil file dibaca, status tampil "Sedang diproses" dengan keterangan bahwa tab boleh ditutup. Setelah selesai, status menjadi "Siap ditinjau". | | |
| A1.3 | Periksa isi halaman tinjau. | "Identitas impor" menampilkan nama file, sheet, bulan impor, ukuran, dan SHA-256. "Ringkasan per toko" menampilkan cakupan tanggal, jumlah tanggal, sel terisi, dan "Total penjualan mentah" per toko. Di "Masalah" ada peringatan bahwa kolom tanggal invalid `31/6` kosong dan dilewati. Tidak ada error. | | |
| A1.4 | Tekan "Aktifkan". | "Berhasil disimpan — Impor ini sekarang aktif." Status menjadi "Aktif". Bagian "Produk baru" berisi produk yang baru didaftarkan, berstatus keluarga aroma belum dipetakan. | | |
| A1.5 | Buka **Ringkasan** sebelum mengimpor `JULI (S)`. Lihat pilihan bulan. | Ada bulan Juli, karena 29–30 Juni masuk laporan Juli. Jika Juli diterapkan, angkanya bertanda "Parsial", karena tanggal Juli lainnya belum teramati. | | |
| A1.6 | Sebelum mengunggah, nonaktifkan **LMK** di **Gudang** (lihat "Menonaktifkan dan mengaktifkan toko"). Unggah `MEI (S)` (2026, Mei), tinjau, lalu aktifkan impornya. Setelah itu aktifkan LMK lagi di **Gudang**. | Di "Masalah" ada peringatan bahwa toko LMK nonaktif tetapi datanya tetap dibaca. Di "Ringkasan per toko", LMK bertanda "Toko nonaktif". Impor tetap bisa diaktifkan. | | |
| A1.7 | **Beberapa sheet sekaligus:** pilih workbook lagi, centang `APRIL (S)`, `JULI (S)`, dan `AGUSTUS (S)`, isi Tahun impor 2026, lalu "Unggah dan proses". Setelah ketiganya "Siap ditinjau", tekan "Aktifkan semua yang siap (3)" di Daftar impor. | Bulan impor setiap sheet terisi otomatis (April, Juli, Agustus) dan bisa diubah. "Hasil unggahan: 3 sheet berhasil didaftarkan, 0 gagal." Setelah aktivasi: "Hasil aktifkan semua: 3 diaktifkan, 0 dilewati, 0 gagal." Setiap bulan punya satu impor "Aktif", dan tombol menjadi "Aktifkan semua yang siap (0)" yang tidak bisa ditekan. | | |
| A1.8 | Unggah `JUNI (S)` sekali lagi untuk Juni 2026 dan tinjau. | Sebelum diaktifkan, halaman memberi tahu bahwa impor aktif Juni saat ini akan diarsipkan. Setelah "Aktifkan", impor lama berstatus "Diarsipkan" dan yang baru "Aktif". Hanya ada satu impor aktif untuk Juni. | | |
| A1.9 | Unggah `JUNI (S)` dan ubah Bulan impornya menjadi **Juli** (salah bulan). | Status "Siap ditinjau" dengan error bahwa tanggal di blok toko bukan bulan impor 2026-07, beserta lokasi selnya. Tombol "Aktifkan" tidak bisa ditekan: "Tidak bisa diaktifkan: ada … error. Perbaiki di Excel, lalu unggah ulang." Impor aktif Juli **tidak** berubah. | | |
| A1.10 | Unggah `SEPTEMBER (S)` (2026, September). | Jika workbook belum diperbaiki (TP-01), ada error "Kolom tanggal invalid "31/9" … berisi data di sel …", dengan lokasi sel dan cara memperbaikinya. Impor tidak bisa diaktifkan. Jika workbook sudah diperbaiki, impor bisa diaktifkan seperti biasa. | | |
| A1.11 | Jika ada impor yang mengubah nama, ukuran, atau kategori produk, periksa bagian "Data produk berubah" di halaman tinjau. | Setiap perubahan tampil sebagai "lama → baru" dan tidak menahan aktivasi. Setelah aktivasi, master produk mengikuti impor terbaru. Jika datanya tidak pernah berubah, tulis `Tidak bisa diuji`. | | |
| A1.12 | *(Opsional, butuh salinan workbook.)* Di **salinan** workbook, ketik angka negatif di satu sel penjualan atau ganti nama satu toko. Unggah salinan itu. | Angka negatif menjadi error "Kuantitas di sel … negatif …; ini salah input." Nama toko yang tidak dikenal menjadi error "Toko "…" tidak ada di daftar toko." Keduanya menunjukkan lokasi sel, dan impor tidak bisa diaktifkan. | | |
| A1.13 | Tunggu sampai status "Hasil hitung laporan" di halaman Impor menjadi "Terbaru". | Status berganti dari "Sedang dihitung" menjadi "Terbaru" tanpa perlu mengunggah ulang. | | |
| A1.14 | Centang `JUNI (S)` dan `JULI (S)`, lalu ubah Bulan impor `JULI (S)` menjadi **Juni**. Tekan "Unggah dan proses". | Ditolak sebelum file diunggah, dengan pesan yang menyebut kedua sheet karena bulan impornya sama. Tidak ada impor baru di daftar. | | |
| A1.15 | Unggah `JUNI (S)` dua kali untuk Juni 2026 (dua unggahan terpisah) sampai keduanya "Siap ditinjau", lalu tekan "Aktifkan semua yang siap". Bersihkan dengan mengaktifkan salah satunya dari halaman tinjau. | Kedua impor Juni **dilewati** dengan keterangan "Ada lebih dari satu impor siap untuk bulan ini; aktifkan satu per satu dari halaman tinjau." Impor ber-error (misalnya dari A1.9) juga tampil dilewati beserta jumlah errornya, dan tidak membuat bulan lain ikut dilewati. | | |

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
| A2.13 | Di filter **Toko**, tekan "Pilih semua", lalu "Kosongkan", lalu "Pilih semua" lagi. Lakukan hal yang sama di **Kategori produk**. Tekan Terapkan. | "Pilih semua" mencentang semua toko (25) atau semua kategori; "Kosongkan" menghapus semua centang grup itu. Tabel belum berubah sebelum Terapkan. Setelah Terapkan, hasil memuat semua toko dan kategori. Pilihan bulan tidak ikut berubah. | | |

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
| B2.1 | Buka **Data Master › Libur**. Isi Tahun `2026`, tekan "Sinkronisasi". | "Sinkronisasi berhasil — … tanggal libur tahun 2026 disimpan sebagai snapshot menunggu persetujuan." Di "Snapshot libur" ada baris berstatus "Menunggu persetujuan". Kalender **belum** menampilkan libur dari snapshot ini. | | |
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
| A4.3 | Sebagai admin, buka **Gudang** → "Periode sumber penjualan". Untuk Pusat, pilih **Juni, Juli, Agustus 2026**, lalu "Simpan periode sumber". Untuk Gudang Jabodetabek, pilih Juni–Agustus juga (Gudang Cibubur, Bali, dan Bandung sudah ditetapkan oleh `pnpm uat`). | Tersimpan. Tabel menampilkan periode tiap gudang beserta siapa dan kapan menetapkannya. | | |
| A4.4 | Sebagai Operator Pusat, muat ulang halaman Pusat. | Kartu menampilkan Juni, Juli, Agustus 2026 (hanya-baca) dan "Ditetapkan oleh … pada …". | | |
| A4.5 | Di Ringkasan, terapkan bulan lain (misalnya April saja). Kembali ke halaman Pusat. | Periode sumber Pusat tetap Juni–Agustus. Filter Ringkasan tidak mengubah dasar perhitungan gudang. | | |
| A4.6 | *(Opsional.)* Jika ada bulan periode sumber yang tidak lagi punya impor aktif, lihat kartunya. | Bulan itu bertanda "… — Tidak ada data aktif", dengan keterangan "Perhitungan memakai bulan yang masih punya data aktif." Jika semua bulan tidak punya data, perhitungan ditolak dengan pesan yang jelas dan draft tidak dibuat. Jika tidak bisa dibuat, tulis `Tidak bisa diuji`. | | |

## A5. Jadwal pengiriman

Gunakan tanggal kirim contoh **Senin, 19-10-2026**. Jika Anda menguji di minggu lain, pakai Senin terdekat yang akan datang.

Form jadwal punya halaman sendiri yang dibuka dari sidebar: **Pekerjaan rutin › Usulkan jadwal toko** (di Pusat berjudul "Atur jadwal toko — Pusat", di gudang lain "Usulkan jadwal toko — <gudang>") dan **Pengiriman Gudang › Salin jadwal ke beberapa toko** ("Salin jadwal ke beberapa toko — <gudang>"). Pengguna yang berhak di lebih dari satu gudang memilih gudang dulu; semua akun uji berhak di satu gudang, jadi langsung masuk ke form gudangnya. Halaman Pengiriman Gudang tetap menampilkan tabel jadwal aktif per toko di kartu "Jadwal", dan bagi pengguna yang berhak ada tautan ke kedua halaman itu di bawah tabelnya. Tabel yang sama juga tampil di bawah form pada kedua halaman jadwal.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A5.1 | Sebagai **Operator Pusat**, buka **Pekerjaan rutin › Usulkan jadwal toko**. Halaman "Atur jadwal toko — Pusat" langsung terbuka (Operator Pusat hanya berhak di Pusat). Pilih **PMS**, Pola **Mingguan**, hari kirim **Senin** dengan persiapan **H−2**, lalu "Simpan jadwal". | Tersimpan langsung sebagai jadwal aktif tanpa persetujuan admin. Tabel menampilkan "Senin (H−2)". | | |
| A5.2 | Coba Pola **2× seminggu** dengan hanya satu hari dipilih. | Ditolak: "Pola 2× seminggu membutuhkan tepat 2 hari kirim, dipilih 1." Hari kirim yang bisa dipilih hanya Senin–Sabtu. | | |
| A5.3 | Atur PMJ dengan Pola **2× seminggu**: Senin (H−1) dan Kamis (H). | Tersimpan. Satu toko hanya punya satu jadwal aktif. | | |
| A5.4 | Buka **Pengiriman Gudang › Salin jadwal ke beberapa toko** ("Salin jadwal ke beberapa toko — Pusat"). Buat pengaturan Mingguan, Senin (H), centang PMS dan PMJ, lalu "Terapkan ke toko terpilih". Setelah itu, di **Pekerjaan rutin › Usulkan jadwal toko**, kembalikan jadwal PMS ke Senin (H−2) dan PMJ ke 2× seminggu (A5.1 dan A5.3). | Hasil per toko: "2 dari 2 toko berhasil." Kedua toko langsung mendapat jadwal yang sama, masing-masing sebagai jadwal sendiri. | | |
| A5.5 | Sebagai **Operator Jabodetabek**, buka **Pekerjaan rutin › Usulkan jadwal toko**. Halaman "Usulkan jadwal toko — Gudang Jabodetabek" langsung terbuka. Pilih **QUEEN**, Pola **Dua mingguan**, hari kirim **Senin (H)**, Tanggal jangkar **Rabu, 14-10-2026**, lalu "Kirim usulan". | Usulan tersimpan dengan status "Menunggu persetujuan". QUEEN masih "Belum ada jadwal". Usulan belum menggantikan jadwal aktif. | | |
| A5.6 | Coba kirim usulan lain untuk QUEEN. | Tombol tidak bisa ditekan: "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin." | | |
| A5.7 | Lewat **Pengiriman Gudang › Salin jadwal ke beberapa toko** ("Salin jadwal ke beberapa toko — Gudang Jabodetabek"), kirim usulan Mingguan Senin (H) ke **MKS**. | MKS mendapat usulan tersendiri yang menunggu persetujuan. | | |
| A5.8 | Sebagai admin, buka **Persetujuan jadwal**. | Kedua usulan tampil dengan perbandingan "Jadwal aktif" dan "Usulan" (Pola, Hari kirim, Tanggal jangkar). Admin hanya bisa "Setujui" atau "Tolak", tidak bisa mengubah isinya. Usulan dari Pusat tidak ada di sini. | | |
| A5.9 | Setujui usulan QUEEN. Tolak usulan MKS tanpa alasan, lalu dengan alasan. | QUEEN kini punya jadwal aktif dua mingguan. Penolakan tanpa alasan ditolak ("Isi alasan penolakan."). Dengan alasan, Operator Jabodetabek melihat "Ditolak" beserta alasan di kolom "Usulan terakhir". MKS tetap tanpa jadwal aktif. | | |
| A5.10 | Pola dua mingguan QUEEN (jangkar 14-10-2026, Senin): setelah A4.3 menetapkan periode sumber Gudang Jabodetabek dan A6 siap, hitung kebutuhan Gudang Jabodetabek untuk Senin, 12-10-2026, Senin, 19-10-2026, dan Senin, 26-10-2026. | QUEEN ikut pada 12-10 dan 26-10, tetapi **tidak** pada 19-10. Pola berlaku ke depan dan ke belakang dari pekan jangkar. | | |
| A5.11 | Sebagai Operator Pusat, ubah jadwal PMS di **Pekerjaan rutin › Usulkan jadwal toko** setelah draft dihitung (lihat A7). | Draft terkait ditandai "Perlu dihitung ulang". Stok yang sudah diisi tetap ada. Rencana final tidak berubah. | | |

## A6. Menghitung kebutuhan dan jumlah kirim

Bagian ini butuh keluarga aroma, ranking pusat, dan pemetaan produk. Semuanya disiapkan admin.

| No | Langkah | Hasil yang diharapkan | Hasil (OK/Tidak) | Catatan |
|---|---|---|---|---|
| A6.1 | Sebagai **Operator Pusat**, hitung kebutuhan Pusat untuk Senin, 19-10-2026 sebelum ranking dipublikasikan. | Ditolak dengan "Ranking pusat belum dipublikasikan". Draft tidak dibuat. | | |
| A6.2 | Sebagai admin, buka **Keluarga aroma**. | Sudah ada 29 keluarga dari `pnpm uat`: satu untuk setiap baris `VARIANT` di `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx` (28 baris, termasuk `GIFT SET BOX`) ditambah KISS FROM A ROSE. Setiap keluarga punya alias yang sama dengan namanya dan segmen kode (misalnya `GOR`; GIFT SET BOX: `B` dan `W`). Satu alias dan satu segmen kode tidak bisa dipakai dua keluarga: coba tambahkan alias `HOLY SWEET` ke keluarga GORGEOUS TUBEROSE, harus ditolak. | | |
| A6.3 | Buka **Ranking**. Unggah `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx`. | Bulan ranking terisi otomatis **September 2026** dari nama file (masih bisa diubah). Setelah "Unggah dan tinjau", halaman tinjau menampilkan "Tujuh besar" (RANK 1–7: GORGEOUS TUBEROSE, HOLY SWEET, ONLY THE BRAVE, NO1, UNSTOPPABLE, CHAMPION, SEDUCTION) dan pencocokan setiap baris ke keluarga aroma. | | |
| A6.4 | Jika ada baris "Tidak cocok dengan alias mana pun", tambahkan aliasnya di Keluarga aroma, lalu tekan "Cocokkan ulang". | Publikasi ditahan selama masih ada baris tidak cocok. Setelah dicocokkan ulang, muncul "Semua baris cocok dengan alias keluarga aroma." | | |
| A6.5 | Uji keluarga ganda: beri satu keluarga dua alias untuk dua VARIANT yang berbeda, lalu "Cocokkan ulang". Setelah itu hapus alias yang salah dan cocokkan ulang lagi. | Publikasi ditahan dengan error yang menyebut keluarga itu dan baris-baris RANK-nya ("satu keluarga aroma hanya boleh muncul di satu baris ranking"). | | |
| A6.6 | Uji keluarga nonaktif: ubah satu keluarga di luar tujuh besar (misalnya ROMANTICA EXOTICA) menjadi **Nonaktif**, lalu "Cocokkan ulang". | Baris itu bertanda peringatan "Keluarga aroma nonaktif", tetapi **tidak** menahan publikasi. | | |
| A6.7 | Tekan "Publikasikan". | "Ranking ini sekarang berlaku untuk semua gudang." Halaman Ranking menampilkan "September 2026 versi 1" dan tujuh besarnya. | | |
| A6.8 | Buka **Pemetaan produk**. Lalu, untuk satu produk, pilih "Belum dipetakan" dan tekan "Konfirmasi"; periksa "Daftar usulan"; konfirmasi usulannya. | Awalnya Semua (359), Terpetakan (347), Tanpa aroma (12), Belum dipetakan (0), dan "Riwayat pemetaan" mencatat pemetaan awal atas nama admin. Produk yang dikembalikan ke belum dipetakan muncul di "Daftar usulan" dengan usulan dari segmen kodenya; usulan baru berlaku setelah dikonfirmasi ("1 dari 1 produk dikonfirmasi."). Keluarga **nonaktif** (ROMANTICA EXOTICA dari A6.6) tidak muncul sebagai pilihan pemetaan baru. | | |
| A6.9 | Petakan satu produk ke sebuah keluarga, lalu nonaktifkan keluarga itu. Lihat produknya di "Daftar produk". | Pemetaan lama tetap berlaku dan tampil sebagai "<nama> (nonaktif)". Aktifkan kembali keluarga itu setelah dicek. | | |
| A6.10 | Di **Pemetaan produk**, ubah **satu** produk otomatis milik PMS (misalnya `PW110P-ROM`) menjadi "Belum dipetakan" lalu "Konfirmasi". | (Dipakai di A6.13. Kembalikan pemetaannya di A7.4.) | | |
| A6.11 | Sebagai **Operator Pusat**, hitung kebutuhan Pusat untuk **Senin, 19-10-2026**. | Draft dibuat untuk toko yang menurut jadwal aktifnya mengirim hari itu (PMS dan PMJ). "Ringkasan per toko" menampilkan setiap toko dengan jumlah varian dan baris tertahan. Rincian baris belum tampil sebelum toko dibuka. | | |
| A6.12 | Klik "Buka" di baris PMS. | Tabel varian PMS tampil: semua produk yang ada di impor aktif periode sumber untuk PMS, termasuk yang penjualannya nol. Produk display tester (`-T`) dan kertas tester (`KTP`/`KTL`) berklasifikasi "Manual", tanpa jumlah kirim. Display biasa, ATOMIZER, GIFT SET, dan sejenisnya tetap "Otomatis". Header menampilkan "Persiapan H−2 · Panjang cakupan 7 hari". | | |
| A6.13 | Perhatikan kolom "Masalah" sebelum stok diisi. | Stok kosong = "Stok belum diisi" (belum diketahui, bukan nol). Produk dari A6.10 menampilkan "Belum dipetakan" lalu "Stok belum diisi", dalam urutan itu. Urutan lengkapnya: Kebutuhan tidak tersedia, Belum dipetakan, Stok negatif, Stok belum diisi. Jika masalahnya hanya stok, kebutuhan tetap tampil dan jumlah kirim "—". | | |
| A6.14 | Klik "Rincian" di satu produk otomatis tujuh besar (misalnya varian Gorgeous Tuberose). | "Tanggal cakupan" berisi 9 tanggal, dari Sabtu, 17-10-2026 sampai Minggu, 25-10-2026 (H−2 sampai H+6). Setiap tanggal punya kategori efektif dan rata-ratanya. Rata-rata per kategori berasal dari Rata-rata Ringkasan periode sumber (Juni–Agustus) dan bisa diklik untuk ditelusuri. Kebutuhan = jumlah (hari × rata-rata). Buffer = "20% · keluarga aroma termasuk tujuh besar ranking pusat September 2026 versi 1". | | |
| A6.15 | Isi stok akhir produk itu (misalnya 2), simpan, lalu buka rinciannya lagi. Hitung sendiri: (kebutuhan − stok) × 1,20, dibulatkan ke atas, minimal 0. | Angka "Jumlah kirim" di aplikasi sama dengan hitungan Anda. Contoh PRD: kebutuhan 56, stok 20, tujuh besar → (56 − 20) × 120% = 43,2 → 44. Stok dikurangkan satu kali sebelum buffer. | | |
| A6.16 | Lihat rincian produk otomatis di luar tujuh besar. | Buffer 10% ("produk otomatis di luar tujuh besar"). Produk manual: "Tanpa buffer otomatis." Produk belum dipetakan: buffer belum diketahui. | | |
| A6.17 | Isi stok **negatif** (misalnya −3) untuk satu produk otomatis dan satu produk manual. Simpan. | Produk otomatis mendapat masalah "Stok negatif" yang menahan finalisasi. Produk manual tetap "Manual", tidak tertahan, dan stoknya tetap tersimpan dan ditampilkan. | | |
| A6.18 | Isi stok dengan teks atau angka desimal. | Ditolak: "Isi bilangan bulat, atau kosongkan jika belum diketahui." | | |
| A6.19 | Jika ada produk yang tidak punya rata-rata untuk satu kategori di periode sumber, lihat barisnya. | "Kebutuhan tidak tersedia", dengan daftar "Tanpa rata-rata:" berisi tanggal dan kategori yang tidak punya rata-rata. Jika tidak ada produk seperti itu, tulis `Tidak bisa diuji`. | | |
| A6.20 | Sebagai admin, nonaktifkan **PMJ** di **Gudang** (lihat "Menonaktifkan dan mengaktifkan toko"). Sebagai Operator Pusat, hitung ulang draft 19-10-2026. Setelah itu, sebagai admin, aktifkan PMJ lagi dan hitung ulang sekali lagi. | Saat nonaktif, PMJ tidak masuk draft dan halaman menampilkan "Toko PMJ nonaktif tetapi masih punya jadwal aktif". Setelah diaktifkan dan dihitung ulang, PMJ masuk draft lagi. | | |
| A6.21 | Di toko yang masih punya stok kosong, isi satu produk otomatis dengan −2 dan biarkan beberapa produk manual kosong. Tekan "Isi 0 untuk N stok yang kosong". | Hanya produk **otomatis** yang kosong menjadi 0; stok −2, stok yang sudah terisi, dan produk manual tidak berubah. Status "Ada perubahan yang belum disimpan"; belum ada yang tersimpan sampai "Simpan stok". Tombol menjadi "Isi 0 untuk 0 stok yang kosong" dan tidak bisa ditekan. | | |

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
| A7.9 | Perlu dihitung ulang per toko: di **Pekerjaan rutin › Usulkan jadwal toko** ("Atur jadwal toko — Pusat"), ubah jadwal **PMJ** (misalnya persiapan Senin menjadi H). Kembali ke draft 19-10-2026. | Draft bertanda "Perlu dihitung ulang", dengan "Yang berubah: Jadwal toko". Hanya PMJ yang bertanda dan tertahan ("dasar perhitungan toko ini berubah … Hitung ulang draft lebih dulu."). Toko lain yang tidak terdampak tetap bisa difinalisasi. Stok yang sudah diisi tidak hilang. | | |
| A7.10 | Isi stok beberapa produk PMJ dan simpan. Di **Pekerjaan rutin › Usulkan jadwal toko**, ubah jadwal PMJ supaya **tidak** mengirim hari Senin (misalnya Mingguan, Selasa), lalu tekan "Hitung ulang". | PMJ dikeluarkan dari draft ("Toko PMJ dikeluarkan dari draft karena tidak lagi mengirim pada tanggal ini menurut jadwal aktif."). Stok PMJ tidak hilang, tetapi tampil sebagai keterangan "Stok … di Toko PMJ (…) tidak dipakai karena toko ini tidak ada lagi di draft." | | |
| A7.11 | Di **Pekerjaan rutin › Usulkan jadwal toko**, kembalikan jadwal PMJ ke 2× seminggu Senin/Kamis, lalu "Hitung ulang". | PMJ masuk draft lagi, dan stok yang tadi diisi dipakai kembali. | | |
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
