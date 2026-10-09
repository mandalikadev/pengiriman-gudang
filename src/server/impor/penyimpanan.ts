import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Storage S3 untuk workbook unggahan (ADR-0001): browser mengunggah langsung lewat presigned URL,
// worker mengambil objeknya. MinIO saat pengembangan lokal dan di CI.

const MASA_BERLAKU_URL_DETIK = 15 * 60;

function wajibEnv(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`${nama} belum diset (lihat .env.example).`);
  return nilai;
}

let klien: S3Client | undefined;

function s3() {
  klien ??= new S3Client({
    endpoint: wajibEnv("S3_ENDPOINT"),
    region: wajibEnv("S3_REGION"),
    forcePathStyle: true,
    credentials: { accessKeyId: wajibEnv("S3_ACCESS_KEY_ID"), secretAccessKey: wajibEnv("S3_SECRET_ACCESS_KEY") },
    // Presigned PUT dari browser tidak membawa checksum yang dihitung SDK.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return klien;
}

const bucket = () => wajibEnv("S3_BUCKET");

function tidakAda(galat: unknown) {
  return galat instanceof S3ServiceException && galat.$metadata.httpStatusCode === 404;
}

/** Membuat bucket jika belum ada. Dipanggil worker saat mulai dan oleh persiapan test. */
export async function pastikanBucket() {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch (galat) {
    if (!tidakAda(galat)) throw galat;
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
  }
}

/** Presigned URL untuk PUT satu objek dari browser. */
export function buatUrlUnggah(kunci: string) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: kunci }), {
    expiresIn: MASA_BERLAKU_URL_DETIK,
  });
}

/** Ukuran objek dalam byte, atau `null` jika objek tidak ada. */
export async function ukuranObjek(kunci: string): Promise<number | null> {
  try {
    const hasil = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: kunci }));
    return hasil.ContentLength ?? 0;
  } catch (galat) {
    if (tidakAda(galat)) return null;
    throw galat;
  }
}

/** Isi objek, atau `null` jika objek tidak ada. */
export async function ambilObjek(kunci: string): Promise<Uint8Array | null> {
  try {
    const hasil = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: kunci }));
    if (!hasil.Body) return new Uint8Array();
    return await hasil.Body.transformToByteArray();
  } catch (galat) {
    if (galat instanceof S3ServiceException && (galat.name === "NoSuchKey" || tidakAda(galat))) return null;
    throw galat;
  }
}
