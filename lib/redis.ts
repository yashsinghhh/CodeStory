// lib/redis.ts
import { Redis } from 'ioredis';

// Create Redis client with additional options
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => {
    // Retry with exponential backoff
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 5,
  enableReadyCheck: true,
  connectTimeout: 10000,
});

// Add event listeners for monitoring
redisClient.on('error', (err) => {
  console.error('Redis Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

// Cache key prefixes
export const CACHE_KEYS = {
  PAGE_LIST: 'notion_pages', // Will be appended with :userId
  PAGE_DETAIL: 'notion_page_detail', // Will be appended with :pageId
};

// Cache expiration times (in seconds)
export const CACHE_EXPIRATION = {
  PAGE_LIST: 3600, // 1 hour
  PAGE_DETAIL: 86400, // 24 hours
};

// Cache utility functions
export const cacheUtils = {
  /**
   * Get cached data with a typed return
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) as T : null;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Set data in cache with expiration
   */
  async set(key: string, data: any, expiration: number): Promise<void> {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', expiration);
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
    }
  },

  /**
   * Delete a cache entry
   */
  async delete(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
    }
  },

  /**
   * Clear all cache entries with a specific prefix
   */
  async clearByPrefix(prefix: string): Promise<void> {
    try {
      // Use the SCAN command to find keys with the prefix
      let cursor = '0';
      do {
        const result = await redisClient.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100
        );
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await redisClient.del(...keys);
          console.log(`Deleted ${keys.length} keys with prefix ${prefix}`);
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error(`Redis clear by prefix error for ${prefix}:`, error);
    }
  },

  /**
   * Get cache key for page list by user ID
   */
  getPageListKey(userId: string): string {
    return `${CACHE_KEYS.PAGE_LIST}:${userId}`;
  },

  /**
   * Get cache key for page detail by page ID
   */
  getPageDetailKey(pageId: string): string {
    return `${CACHE_KEYS.PAGE_DETAIL}:${pageId}`;
  },

  /**
   * Invalidate all cache for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      // Clear the page list cache
      await this.delete(this.getPageListKey(userId));
      // You could also clear all page detail caches for this user if needed
    } catch (error) {
      console.error(`Failed to invalidate cache for user ${userId}:`, error);
    }
  },

  /**
   * Invalidate cache for a specific page
   */
  async invalidatePageCache(pageId: string, userId?: string): Promise<void> {
    try {
      // Clear the page detail cache
      await this.delete(this.getPageDetailKey(pageId));
      
      // If userId is provided, also clear the page list cache
      if (userId) {
        await this.delete(this.getPageListKey(userId));
      }
    } catch (error) {
      console.error(`Failed to invalidate cache for page ${pageId}:`, error);
    }
  }
};

// Export default client for backward compatibility
export default redisClient;