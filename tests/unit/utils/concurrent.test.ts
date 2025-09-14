import { processConcurrently, processConcurrentlySettled } from '../../../src/utils/concurrent';

describe('Concurrent Utils', () => {
  describe('processConcurrently', () => {
    it('should process all items successfully', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      const result = await processConcurrently(items, processor, 2);

      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(processor).toHaveBeenCalledTimes(5);

      // Check that each item was processed with correct index
      expect(processor).toHaveBeenNthCalledWith(1, 1, 0);
      expect(processor).toHaveBeenNthCalledWith(2, 2, 1);
      expect(processor).toHaveBeenNthCalledWith(3, 3, 2);
      expect(processor).toHaveBeenNthCalledWith(4, 4, 3);
      expect(processor).toHaveBeenNthCalledWith(5, 5, 4);
    });

    it('should handle empty array', async () => {
      const items: number[] = [];
      const processor = jest.fn();

      const result = await processConcurrently(items, processor, 2);

      expect(result).toEqual([]);
      expect(processor).not.toHaveBeenCalled();
    });

    it('should respect concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5];
      let activeCount = 0;
      let maxActiveCount = 0;

      const processor = jest.fn().mockImplementation(async (item: number) => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));

        activeCount--;
        return item * 2;
      });

      const result = await processConcurrently(items, processor, 2);

      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(maxActiveCount).toBeLessThanOrEqual(2);
      expect(processor).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrency of 1 (sequential processing)', async () => {
      const items = [1, 2, 3];
      const callOrder: number[] = [];

      const processor = jest.fn().mockImplementation(async (item: number) => {
        callOrder.push(item);
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      });

      const result = await processConcurrently(items, processor, 1);

      expect(result).toEqual([2, 4, 6]);
      expect(callOrder).toEqual([1, 2, 3]); // Should be processed in order
    });

    it('should handle zero concurrency limit gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      // Zero concurrency should default to 1
      const result = await processConcurrently(items, processor, 0);

      expect(result).toEqual([2, 4, 6]);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should handle negative concurrency limit gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      // Negative concurrency should default to 1
      const result = await processConcurrently(items, processor, -5);

      expect(result).toEqual([2, 4, 6]);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should handle processor returning promises', async () => {
      const items = ['a', 'b', 'c'];
      const processor = jest.fn().mockImplementation(async (item: string) => {
        return Promise.resolve(item.toUpperCase());
      });

      const result = await processConcurrently(items, processor, 2);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should pass correct index to processor', async () => {
      const items = ['x', 'y', 'z'];
      const indexesPassed: number[] = [];

      const processor = jest.fn().mockImplementation(async (item: string, index: number) => {
        indexesPassed.push(index);
        return `${item}-${index}`;
      });

      const result = await processConcurrently(items, processor, 3);

      expect(result).toEqual(['x-0', 'y-1', 'z-2']);
      expect(indexesPassed.sort()).toEqual([0, 1, 2]);
    });

    it('should throw error if processor fails', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => {
        if (item === 2) {
          throw new Error(`Error processing ${item}`);
        }
        return item * 2;
      });

      await expect(processConcurrently(items, processor, 2)).rejects.toThrow('Error processing 2');
    });

    it('should handle high concurrency correctly', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i + 1);
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      const result = await processConcurrently(items, processor, 50);

      expect(result).toEqual(items.map(x => x * 2));
      expect(processor).toHaveBeenCalledTimes(100);
    });

    it('should handle workers that finish at different times', async () => {
      const items = [100, 50, 10, 200]; // Different delays
      const processor = jest.fn().mockImplementation(async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, item / 10)); // Variable delay based on item
        return item * 2;
      });

      const result = await processConcurrently(items, processor, 2);

      expect(result).toEqual([200, 100, 20, 400]);
      expect(processor).toHaveBeenCalledTimes(4);
    });
  });

  describe('processConcurrentlySettled', () => {
    it('should process all items successfully', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.results).toEqual([2, 4, 6, 8, 10]);
      expect(result.errors).toEqual([null, null, null, null, null]);
      expect(result.successCount).toBe(5);
      expect(result.errorCount).toBe(0);
      expect(processor).toHaveBeenCalledTimes(5);

      // Check that each item was processed with correct index
      expect(processor).toHaveBeenNthCalledWith(1, 1, 0);
      expect(processor).toHaveBeenNthCalledWith(2, 2, 1);
      expect(processor).toHaveBeenNthCalledWith(3, 3, 2);
      expect(processor).toHaveBeenNthCalledWith(4, 4, 3);
      expect(processor).toHaveBeenNthCalledWith(5, 5, 4);
    });

    it('should handle mixed success and failure', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn().mockImplementation(async (item: number) => {
        if (item === 2 || item === 4) {
          throw new Error(`Error processing ${item}`);
        }
        return item * 2;
      });

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.results).toEqual([2, null, 6, null, 10]);
      expect(result.errors[0]).toBeNull();
      expect(result.errors[1]).toBeInstanceOf(Error);
      expect(result.errors[1]?.message).toBe('Error processing 2');
      expect(result.errors[2]).toBeNull();
      expect(result.errors[3]).toBeInstanceOf(Error);
      expect(result.errors[3]?.message).toBe('Error processing 4');
      expect(result.errors[4]).toBeNull();
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(2);
    });

    it('should handle all failures', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => {
        throw new Error(`Error processing ${item}`);
      });

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.results).toEqual([null, null, null]);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.every(e => e instanceof Error)).toBe(true);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(3);
    });

    it('should handle empty array', async () => {
      const items: number[] = [];
      const processor = jest.fn();

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.results).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(processor).not.toHaveBeenCalled();
    });

    it('should respect concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5];
      let activeCount = 0;
      let maxActiveCount = 0;

      const processor = jest.fn().mockImplementation(async (item: number) => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));

        activeCount--;
        return item * 2;
      });

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.successCount).toBe(5);
      expect(maxActiveCount).toBeLessThanOrEqual(2);
      expect(processor).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrency of 1 (sequential processing)', async () => {
      const items = [1, 2, 3];
      const callOrder: number[] = [];

      const processor = jest.fn().mockImplementation(async (item: number) => {
        callOrder.push(item);
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      });

      const result = await processConcurrentlySettled(items, processor, 1);

      expect(result.results).toEqual([2, 4, 6]);
      expect(callOrder).toEqual([1, 2, 3]); // Should be processed in order
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
    });

    it('should handle async processor that returns promises', async () => {
      const items = ['a', 'b', 'c'];
      const processor = jest.fn().mockImplementation(async (item: string) => {
        return Promise.resolve(item.toUpperCase());
      });

      const result = await processConcurrentlySettled(items, processor, 2);

      expect(result.results).toEqual(['A', 'B', 'C']);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
    });

    it('should pass correct index to processor', async () => {
      const items = ['x', 'y', 'z'];
      const indexesPassed: number[] = [];

      const processor = jest.fn().mockImplementation(async (item: string, index: number) => {
        indexesPassed.push(index);
        return `${item}-${index}`;
      });

      const result = await processConcurrentlySettled(items, processor, 3);

      expect(result.results).toEqual(['x-0', 'y-1', 'z-2']);
      expect(indexesPassed.sort()).toEqual([0, 1, 2]);
    });

    it('should handle zero concurrency limit gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      // Zero concurrency should default to 1
      const result = await processConcurrentlySettled(items, processor, 0);

      expect(result.results).toEqual([2, 4, 6]);
      expect(result.successCount).toBe(3);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should handle negative concurrency limit gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

      // Negative concurrency should default to 1
      const result = await processConcurrentlySettled(items, processor, -5);

      expect(result.results).toEqual([2, 4, 6]);
      expect(result.successCount).toBe(3);
      expect(processor).toHaveBeenCalledTimes(3);
    });
  });
});
