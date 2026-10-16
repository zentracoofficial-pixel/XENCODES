import { SITE_URL } from "@/lib/site";

/**
 * IndexNow: tells Bing (and through it Copilot, DuckDuckGo and the other
 * engines that share the protocol: Yandex, Naver, Seznam) that URLs exist
 * or changed, instead of waiting to be crawled. Google does not support it,
 * so Search Console and the sitemap remain how Google finds pages.
 *
 * The key is not a secret. The protocol works by proving the host owns the
 * key: the same value must be served at /{key}.txt (public/5d029d274571946c757a9a5ec24160c1.txt).
 * A search engine fetches that file to check the submission is genuine.
 */
export const INDEXNOW_KEY = "5d029d274571946c757a9a5ec24160c1";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol's limit for one request. */
export const INDEXNOW_BATCH = 10_000;

export interface IndexNowResult {
  submitted: number;
  /** HTTP status of each request (200 and 202 both mean accepted). */
  statuses: number[];
}

/**
 * Submit URLs in batches. Never throws: a failed submission must not break
 * the job that called it. The whole call is capped by `budgetMs`.
 */
export async function submitToIndexNow(urls: string[], budgetMs = 8000): Promise<IndexNowResult> {
  const host = new URL(SITE_URL).host;
  const result: IndexNowResult = { submitted: 0, statuses: [] };
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;
    const batch = urls.slice(i, i + INDEXNOW_BATCH);
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList: batch }),
        signal: AbortSignal.timeout(remaining),
      });
      result.statuses.push(response.status);
      if (response.status === 200 || response.status === 202) result.submitted += batch.length;
    } catch (error) {
      console.error("[indexnow] submission failed:", error);
      break;
    }
  }
  return result;
}
