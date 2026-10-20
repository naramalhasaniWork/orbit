/**
 * Credit pack catalogue: the single source for checkout and the pricing page.
 * Free of server imports so client components can read it.
 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number; // in cents
  popular?: boolean;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "credits-100", name: "100 Credits", credits: 100, price: 999 },
  { id: "credits-500", name: "500 Credits", credits: 500, price: 3999, popular: true },
  { id: "credits-1000", name: "1,000 Credits", credits: 1000, price: 6999 },
  { id: "credits-5000", name: "5,000 Credits", credits: 5000, price: 29999 },
];
