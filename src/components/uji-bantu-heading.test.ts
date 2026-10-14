import { describe, expect, it } from "vitest";

import { lompatanHeading } from "./uji-bantu-heading";

describe("lompatanHeading (DESIGN §11.8)", () => {
  it("h1 → h2 → h3 → h2 tanpa lompatan", () => {
    expect(lompatanHeading("<h1>A</h1><h2 class='x'>B</h2><h3>C</h3><h2>D</h2>")).toEqual([]);
  });

  it("melaporkan h1 → h3 beserta teksnya", () => {
    expect(lompatanHeading('<h1>A</h1><div><h3 data-slot="card-title">Bulan <span>laporan</span></h3></div>')).toEqual([
      'h1 → h3 "Bulan laporan"',
    ]);
  });

  it("heading pertama selain h1 dilaporkan", () => {
    expect(lompatanHeading("<h2>B</h2>")).toEqual(['awal → h2 "B"']);
  });
});
