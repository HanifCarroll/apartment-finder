import { describe, expect, it } from "vitest";
import { deriveListingDetails } from "../src/listing/details";

describe("deriveListingDetails", () => {
  it("extracts price, neighborhood, ambientes, and dormitorios from listing text", () => {
    const details = deriveListingDetails({
      listing_url: "https://www.zonaprop.com.ar/propiedades/clasificado/teclapin-alquiler-temporario-departamento-amoblado-tipo-duplex-57458655.html",
      listing_title: "Alquiler Temporario Departamento Amoblado Tipo Dúplex Las Cañitas 2 Dorm.",
      listing_description: "USD 1.000. Expensas $650.000. Departamento de 3 ambientes.",
    });

    expect(details).toEqual({
      listing_price_text: "USD 1.000",
      listing_expenses_text: "$650.000",
      listing_neighborhood: "Las Cañitas",
      listing_total_area_m2: undefined,
      listing_covered_area_m2: undefined,
      listing_ambientes: 3,
      listing_dormitorios: 2,
      listing_bathrooms: undefined,
      listing_age_years: undefined,
    });
  });
});
