/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-murni",
      severity: "error",
      comment:
        "Modul domain hanya boleh mengimpor dari modul domain (src/domain/AGENTS.md). Tanpa database, Next.js, React, I/O, maupun dependency npm.",
      from: { path: "^src/domain/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: "^src/domain/" },
    },
    {
      name: "tidak-ada-impor-melingkar",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "tidak-bisa-di-resolve",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
