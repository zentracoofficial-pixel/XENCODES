export type AvailabilityLevel = "available" | "limited" | "unavailable";

export type NumberType = "activation" | "rental";

export type ServiceCategory =
  | "Social & Messaging"
  | "Marketplaces & Freelance"
  | "Developer & Cloud"
  | "Finance & Shopping"
  | "Dating";

export interface CountryAvailability {
  countrySlug: string;
  status: AvailabilityLevel;
  /** Whole Naira. Converted to kobo at purchase time. */
  priceNaira: number;
  avgDeliverySeconds: number;
  successRate: number;
}

export interface Service {
  slug: string;
  name: string;
  category: ServiceCategory;
  description: string;
  color: string;
  rentalSupported: boolean;
  priceFromNaira: number;
  availability: CountryAvailability[];
}

export interface Country {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  availability: AvailabilityLevel;
  numberTypes: NumberType[];
  priceFromNaira: number;
  serviceCount: number;
}
