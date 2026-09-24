/**
 * Homepage trust-section reviews.
 *
 * These are placeholder/demo copy, not real customer submissions, and
 * nothing in the app renders them with any kind of "verified" mark, since
 * there is no mechanism that actually verifies a review against a real
 * purchase. Keep this shape (name + quote only, no invented role or
 * location) when real reviews eventually replace these: swap the values
 * below, not the structure.
 */

export interface Testimonial {
  name: string;
  quote: string;
}

export const testimonials: Testimonial[] = [
  {
    name: "Daniel M.",
    quote:
      "Got the number almost immediately and the verification code came through without any hassle. The whole process was much simpler than I expected.",
  },
  {
    name: "Aisha K.",
    quote:
      "I like that I can search for the service and country before buying. Pricing is clear, and I didn't have to guess what I was paying for.",
  },
  {
    name: "Michael R.",
    quote:
      "Used Xencodes for a verification I needed and everything worked as expected. The dashboard also makes it easy to keep track of previous activations.",
  },
];
