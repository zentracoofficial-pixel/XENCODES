import type { Country } from "./types";
import { services } from "./services";

const baseCountries: Omit<Country, "serviceCount">[] = [
  {
    slug: "usa",
    name: "United States",
    flag: "🇺🇸",
    dialCode: "+1",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFrom: 0.34,
  },
  {
    slug: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    dialCode: "+44",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFrom: 0.36,
  },
  {
    slug: "canada",
    name: "Canada",
    flag: "🇨🇦",
    dialCode: "+1",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFrom: 0.35,
  },
  {
    slug: "nigeria",
    name: "Nigeria",
    flag: "🇳🇬",
    dialCode: "+234",
    availability: "limited",
    numberTypes: ["activation"],
    priceFrom: 0.28,
  },
  {
    slug: "germany",
    name: "Germany",
    flag: "🇩🇪",
    dialCode: "+49",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFrom: 0.37,
  },
  {
    slug: "indonesia",
    name: "Indonesia",
    flag: "🇮🇩",
    dialCode: "+62",
    availability: "limited",
    numberTypes: ["activation"],
    priceFrom: 0.3,
  },
  {
    slug: "poland",
    name: "Poland",
    flag: "🇵🇱",
    dialCode: "+48",
    availability: "available",
    numberTypes: ["activation", "rental"],
    priceFrom: 0.32,
  },
  {
    slug: "philippines",
    name: "Philippines",
    flag: "🇵🇭",
    dialCode: "+63",
    availability: "limited",
    numberTypes: ["activation"],
    priceFrom: 0.31,
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
