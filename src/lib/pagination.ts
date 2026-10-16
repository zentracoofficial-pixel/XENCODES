/** A page number from a query string: a whole number of at least 1, else 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1;
}

export interface PageMath {
  page: number;
  totalPages: number;
  skip: number;
  /** 1-based position of the first and last row on this page, 0 when empty. */
  from: number;
  to: number;
}

/** Where a page sits in a list of `total` rows, with the page kept in range. */
export function pageMath(total: number, requestedPage: number, pageSize: number): PageMath {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const skip = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    skip,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(total, skip + pageSize),
  };
}

/** The page numbers to show: the first, the last, and a few around this one,
 *  with null where numbers are skipped. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  pages.forEach((n, index) => {
    if (index > 0 && n - pages[index - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
