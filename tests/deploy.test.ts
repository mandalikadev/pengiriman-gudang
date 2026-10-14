import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pagar statis untuk berkas deploy produksi (T130). Uji asap sungguhan (compose menyala, Caddy, unggahan, worker)
// dijalankan lokal dengan Docker; caranya dicatat di PR T130.

const akar = process.cwd();
const baca = (path: string) => readFileSync(join(akar, path), "utf8");

const compose = baca("deploy/compose.prod.yml");
const komposeProxy = baca("deploy/proxy/compose.yml");
const situs = baca("deploy/drp.caddy");
const envContoh = baca("deploy/.env.produksi.example");
const workflow = baca(".github/workflows/deploy.yml");
const migrasi = baca("deploy/migrasi.sh");
const bootstrap = baca("deploy/bootstrap-vps.sh");
const deploySh = baca("deploy/deploy.sh");
const backupLuar = baca("deploy/backup-luar.sh");

// Blok satu layanan di compose.prod.yml (dari `  <nama>:` sampai layanan atau blok tingkat atas berikutnya).
const blokLayanan = (nama: string) => compose.match(new RegExp(`^ {2}${nama}:\\n(?: {4}.*\\n|\\s*#.*\\n|\\n)*`, "m"))?.[0] ?? "";

const tanpaKomentar = (isi: string) =>
  isi
    .split("\n")
    .filter((baris) => !/^\s*#/.test(baris))
    .join("\n");

describe("deploy/compose.prod.yml", () => {
  it("tidak memublikasikan port ke host", () => {
    expect(tanpaKomentar(compose)).not.toMatch(/^\s*(ports|expose)\s*:/m);
  });

  it("nama compose project drp, image dan alias network berawalan drp", () => {
    expect(compose).toMatch(/^name: drp$/m);
    for (const [, image] of compose.matchAll(/^\s*image:\s*(\S+)/gm)) {
      if (image.startsWith("postgres:") || image.startsWith("pgsty/minio:") || image.startsWith("rclone/rclone:")) continue;
      expect(image).toMatch(/^drp-/);
    }
    const alias = [...compose.matchAll(/aliases:\n\s*- (\S+)/g)].map(([, nama]) => nama);
    expect(alias).toEqual(["drp-minio", "drp-app"]);
    expect(compose).not.toMatch(/container_name:/);
  });

  it("network proxy eksternal; app dan worker menunggu migrasi selesai sukses", () => {
    expect(compose).toMatch(/^ {2}proxy:\n {4}external: true$/m);
    expect(compose.match(/condition: service_completed_successfully/g)).toHaveLength(2);
  });

  it("memakai image MinIO yang sama dengan docker-compose.yml pengembangan", () => {
    const imageDev = baca("docker-compose.yml").match(/image:\s*(pgsty\/minio:\S+)/)?.[1];
    expect(imageDev).toBeDefined();
    expect(compose).toContain(`image: ${imageDev}`);
  });
});

describe("layanan backup-luar (T131)", () => {
  const blok = blokLayanan("backup-luar");

  it("image resmi rclone/rclone dengan versi dipatok", () => {
    expect(blok).toMatch(/^ {4}image: rclone\/rclone:\d+\.\d+\.\d+$/m);
  });

  it("membaca dump dan kunci service account hanya-baca, kunci dari /opt/drp/rahasia di luar repo", () => {
    expect(blok).toContain("- /opt/drp/backup:/backup:ro");
    expect(blok).toContain("- /opt/drp/rahasia:/rahasia:ro");
    expect(blok).toContain("RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_FILE: /rahasia/google-backup.json");
    expect(blok).toContain("RCLONE_CONFIG_GDRIVE_TEAM_DRIVE: ${BACKUP_GDRIVE_DRIVE_ID:-}");
    expect(blok).toContain("RCLONE_CONFIG_GDRIVE_ROOT_FOLDER_ID: ${BACKUP_GDRIVE_FOLDER_ID:-}");
  });

  it("membaca MinIO lewat network internal, hanya network default", () => {
    expect(blok).toContain("RCLONE_CONFIG_MINIO_ENDPOINT: http://minio:9000");
    expect(blok).toMatch(/networks:\n {6}- default\n/);
    expect(blok).not.toMatch(/proxy/);
  });

  it("deploy.sh dan bootstrap membuat folder rahasia milik user deploy (chmod 700)", () => {
    for (const isi of [deploySh, bootstrap]) {
      expect(isi).toContain(`[[ -d "$DIR_DRP/rahasia" ]] || install -d -m 700 "$DIR_DRP/rahasia"`);
    }
  });
});

describe("deploy/backup-luar.sh", () => {
  const perintah = tanpaKomentar(backupLuar);

  it("tanpa BACKUP_GDRIVE_* hanya mencatat belum dikonfigurasi dan tidak menyalin apa pun", () => {
    expect(perintah).toMatch(
      /if \[ -z "\$\{BACKUP_GDRIVE_DRIVE_ID:-\}" \] && \[ -z "\$\{BACKUP_GDRIVE_FOLDER_ID:-\}" \]; then\n\s*log "Backup luar belum dikonfigurasi[^\n]*\n\s*exec sleep infinity\n/,
    );
    expect(perintah.indexOf("exec sleep infinity")).toBeLessThan(perintah.indexOf("rclone "));
  });

  it("menyalin dump terbaru, sync bucket ke workbook, menghapus hanya dump lebih tua dari 30 hari", () => {
    expect(perintah).toContain('rclone copy "$terbaru" gdrive:drp/database/');
    expect(perintah).toContain('rclone sync "minio:${S3_BUCKET:?}" gdrive:drp/workbook/');
    const hapus = perintah.split("\n").filter((baris) => /rclone (delete|purge|rmdirs|deletefile)|--min-age|--max-age/.test(baris));
    expect(hapus).toEqual([expect.stringContaining("rclone delete gdrive:drp/database/ --min-age 30d --include 'drp-*.sql.gz'")]);
  });

  it("gagal → kode keluar non-nol", () => {
    expect(perintah).toMatch(/if \[ "\$gagal" -ne 0 \]; then\n[^\n]*\n\s*exit 1\n/);
  });
});

describe("langkah migrasi", () => {
  it("seed master hanya saat tabel gudang kosong, seed UAT tidak pernah", () => {
    expect(migrasi).toMatch(/select count\(\*\)::int as jumlah from gudang/);
    expect(migrasi).toMatch(/if \[ "\$JUMLAH_GUDANG" -eq 0 \]; then\n[^\n]*\n\s*"\$BIN\/tsx" scripts\/seed-master\.ts/);
    expect(tanpaKomentar(migrasi)).not.toMatch(/seed-uat/);
  });
});

describe("proxy bersama", () => {
  it("hanya proxy yang memegang port 80/443", () => {
    expect(komposeProxy).toMatch(/- "80:80"/);
    expect(komposeProxy).toMatch(/- "443:443"/);
  });

  it("Caddyfile utama hanya memuat berkas situs", () => {
    expect(tanpaKomentar(baca("deploy/proxy/Caddyfile")).trim()).toBe("import /etc/caddy/sites/*.caddy");
  });

  it("situs drp meneruskan path bucket S3_BUCKET ke MinIO dan sisanya ke app", () => {
    const bucket = envContoh.match(/^S3_BUCKET=(\S+)$/m)?.[1];
    expect(bucket).toBe("mandalika");
    expect(situs).toMatch(/^drp\.mandalika\.web\.id \{$/m);
    expect(situs).toContain(`@storage path /${bucket} /${bucket}/*`);
    expect(situs).toMatch(/reverse_proxy drp-minio:9000/);
    expect(situs).toMatch(/reverse_proxy drp-app:3000/);
  });
});

describe("deploy/.env.produksi.example", () => {
  it("tanpa nilai rahasia", () => {
    for (const nama of ["POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "ADMIN_AWAL_SANDI"]) {
      expect(envContoh).toMatch(new RegExp(`^${nama}=$`, "m"));
    }
    expect(envContoh).toMatch(/^BETTER_AUTH_URL=https:\/\/drp\.mandalika\.web\.id$/m);
    expect(envContoh).toMatch(/^S3_ENDPOINT=https:\/\/drp\.mandalika\.web\.id$/m);
  });

  it("BACKUP_GDRIVE_* tersedia dan kosong", () => {
    expect(envContoh).toMatch(/^BACKUP_GDRIVE_DRIVE_ID=$/m);
    expect(envContoh).toMatch(/^BACKUP_GDRIVE_FOLDER_ID=$/m);
  });
});

describe("rahasia", () => {
  it("tidak ada kunci service account Google atau private key di repo", () => {
    const berkas = execFileSync("git", ["ls-files"], { cwd: akar, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(berkas.filter((nama) => /google-backup\.json$/.test(nama))).toEqual([]);
    // git grep keluar 1 jika tidak ada yang cocok.
    const cari = spawnSync("git", ["grep", "-lE", "-e", '"type": *"service_account"', "-e", "BEGIN (RSA )?PRIVATE KEY"], {
      cwd: akar,
      encoding: "utf8",
    });
    expect(cari.stdout).toBe("");
    expect(cari.status).toBe(1);
  });
});

describe("bootstrap-vps.sh", () => {
  it("tidak menimpa .env yang sudah ada dan tidak menyentuh firewall, user, atau paket", () => {
    expect(bootstrap).toMatch(/if \[\[ -f "\$BERKAS_ENV" \]\]; then\n\s*echo "\$BERKAS_ENV sudah ada; tidak ditimpa\."/);
    expect(tanpaKomentar(bootstrap)).not.toMatch(/\b(ufw|iptables|useradd|usermod|apt|apt-get|systemctl)\b/);
  });
});

describe(".github/workflows/deploy.yml", () => {
  it("hanya setelah CI hijau untuk push ke main, atau manual dari main", () => {
    expect(workflow).toMatch(/workflow_run:\n\s*workflows: \[CI\]\n\s*types: \[completed\]\n\s*branches: \[main\]/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.event == 'push'/);
    expect(workflow).toMatch(/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
    expect(workflow).not.toMatch(/^\s*pull_request/m);
  });

  it("satu deploy sekaligus tanpa membatalkan yang berjalan", () => {
    expect(workflow).toMatch(/concurrency:\n\s*group: deploy-produksi\n\s*cancel-in-progress: false/);
  });

  it("tanpa action pihak ketiga", () => {
    expect(workflow).not.toMatch(/^\s*(-\s*)?uses:/m);
  });
});
