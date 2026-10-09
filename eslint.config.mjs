import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ADR-0008: pembulatan hanya lewat modul angka domain.
const MODUL_ANGKA = "src/domain/angka.ts";
const pesanPembulatan =
  "Pembulatan hanya lewat modul angka domain (src/domain/angka.ts), dengan aritmetika bilangan bulat (ADR-0008).";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "drizzle/**"],
  },
  {
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "ceil", message: pesanPembulatan },
        { object: "Math", property: "floor", message: pesanPembulatan },
        { object: "Math", property: "round", message: pesanPembulatan },
      ],
    },
  },
  {
    files: [MODUL_ANGKA],
    rules: {
      "no-restricted-properties": "off",
    },
  },
];

export default config;
