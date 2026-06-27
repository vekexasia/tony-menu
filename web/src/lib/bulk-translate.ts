import { ApiError } from "./api";

export interface BulkProgress {
  done: number;
  total: number;
  success: number;
  failed: number;
  current: string;
  status?: string;
}

export interface BulkTranslateOptions<T> {
  /** Translate one work item. Resolve with the text, or null/empty to count it as failed. */
  translate: (item: T) => Promise<string | null | undefined>;
  /** Called for each successful translation so the caller can accumulate results. */
  onSuccess: (item: T, translatedText: string) => void;
  /** Human-readable label for the item currently being processed. */
  describe: (item: T) => string;
  /** Progress callback fired at the start of each item and after each completes. */
  onProgress: (progress: BulkProgress) => void;
  /** Label shown while waiting between items. */
  inProgressStatus: string;
  /** Label shown during the 60s auto-pause after a 429. */
  autoPauseStatus: string;
  throttleMs?: number;
  pauseMs?: number;
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Throttled bulk-translation loop shared by EntriesPage and CategoriesPage.
 * Preserves the original semantics exactly:
 * - a failed item (error or empty result) is counted failed and skipped (never retried)
 * - a 429 ApiError counts the item failed, then pauses pauseMs before continuing
 * - the throttle sleep runs between items only, never after the last one
 */
export async function runBulkTranslate<T>(
  workItems: T[],
  opts: BulkTranslateOptions<T>,
): Promise<{ success: number; failed: number }> {
  const throttleMs = opts.throttleMs ?? 2200;
  const pauseMs = opts.pauseMs ?? 60_000;
  const sleep = opts.sleep ?? defaultSleep;

  let done = 0;
  let success = 0;
  let failed = 0;

  for (const item of workItems) {
    const current = opts.describe(item);
    opts.onProgress({ done, total: workItems.length, success, failed, current });

    try {
      const translatedText = await opts.translate(item);
      if (translatedText) {
        opts.onSuccess(item, translatedText);
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      if (err instanceof ApiError && err.status === 429) {
        opts.onProgress({
          done,
          total: workItems.length,
          success,
          failed,
          current,
          status: opts.autoPauseStatus,
        });
        await sleep(pauseMs);
      }
    }

    done++;
    const hasMore = done < workItems.length;
    opts.onProgress({
      done,
      total: workItems.length,
      success,
      failed,
      current,
      status: hasMore ? opts.inProgressStatus : undefined,
    });
    if (hasMore) await sleep(throttleMs);
  }

  return { success, failed };
}
