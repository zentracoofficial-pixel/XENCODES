import type { Country } from "./types";
import { services } from "./services";

const baseCountries: Omit<Country, "serviceCount">[] = [
  {
    slug: "nigeria",
    name: "Nigeria",
    flag: "🇳🇬",
    dialCode: "+234",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 80,
  },
  {
    slug: "usa",
    name: "United States",
    flag: "🇺🇸",
    dialCode: "+1",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 110,
  },
  {
    slug: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    dialCode: "+44",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 120,
  },
  {
    slug: "canada",
    name: "Canada",
    flag: "🇨🇦",
    dialCode: "+1",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 115,
  },
  {
    slug: "germany",
    name: "Germany",
    flag: "🇩🇪",
    dialCode: "+49",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 130,
  },
  {
    slug: "indonesia",
    name: "Indonesia",
    flag: "🇮🇩",
    dialCode: "+62",
    availability: "limited",
    numberTypes: ["activation"],
    priceFromNaira: 90,
  },
  {
    slug: "poland",
    name: "Poland",
    flag: "🇵🇱",
    dialCode: "+48",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFromNaira: 100,
  },
  {
    slug: "philippines",
    name: "Philippines",
    flag: "🇵🇭",
    dialCode: "+63",
    availability: "limited",
    numberTypes: ["activation"],
    priceFromNaira: 95,
  },
];

export const countries: Country[] = baseCountries.map((country) => ({
  ...country,
  serviceCount: services.filter((service) =>
    service.availability.some(
      (a) => a.countrySlug === country.slug && a.status !== "unavailable",
    ),
  ).length,
}));

export function getCountryBySlug(slug: string) {
  return countries.find((country) => country.slug === slug);
}
