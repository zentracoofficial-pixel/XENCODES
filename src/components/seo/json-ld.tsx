/**
 * Renders a JSON-LD block. Search engines read this for rich results; it is
 * never visible to users.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Some values (a service or country name) come from a supplier, so "<"
      // is written as \u003c: nothing in the data can close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
