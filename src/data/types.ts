export type AvailabilityLevel = "available" | "limited" | "unavailable";

export type NumberType = "activation" | "rental";

export type ServiceCategory =
  | "Social & Messaging"
  | "Marketplaces & Freelance"
  | "Finance & Crypto"
  | "Developer & Cloud"
  | "Entertainment"
  | "Travel & Delivery"
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
  /** Brand colour, used for the logo glyph and lettermark fallback. */
  color: string;
  /** Override for dark mode where the brand colour is near-black. */
  colorDark?: string;
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
