/**
 * Utility functions for concurrent processing with concurrency limits
 */

/**
 * Process an array of items concurrently with a maximum concurrency limit
 * @param items - Array of items to process
 * @param processor - Function that processes a single item
 * @param maxConcurrency - Maximum number of concurrent operations
 * @returns Promise that resolves to array of results
 */
export async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  // Ensure maxConcurrency is at least 1
  const effectiveConcurrency = Math.max(1, maxConcurrency);

  // Process items in parallel batches
  const workers = Array.from({ length: Math.min(effectiveConcurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      if (index < items.length) {
        results[index] = await processor(items[index], index);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Process an array of items concurrently with a maximum concurrency limit,
 * collecting both successful results and errors
 * @param items - Array of items to process
 * @param processor - Function that processes a single item
 * @param maxConcurrency - Maximum number of concurrent operations
 * @returns Promise that resolves to object with results and errors
 */
export async function processConcurrentlySettled<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number
): Promise<{
  results: (R | null)[];
  errors: (Error | null)[];
  successCount: number;
  errorCount: number;
}> {
  if (items.length === 0) {
    return { results: [], errors: [], successCount: 0, errorCount: 0 };
  }

  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: (Error | null)[] = new Array(items.length).fill(null);
  let currentIndex = 0;
  let successCount = 0;
  let errorCount = 0;

  // Ensure maxConcurrency is at least 1
  const effectiveConcurrency = Math.max(1, maxConcurrency);

  // Process items in parallel batches
  const workers = Array.from({ length: Math.min(effectiveConcurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      if (index < items.length) {
        try {
          results[index] = await processor(items[index], index);
          successCount++;
        } catch (error) {
          errors[index] = error instanceof Error ? error : new Error(String(error));
          errorCount++;
        }
      }
    }
  });

  await Promise.allSettled(workers);

  return { results, errors, successCount, errorCount };
}
