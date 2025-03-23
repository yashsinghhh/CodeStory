// app/api/stats/cache/route.ts
import { NextRequest, NextResponse } from 'next/server';
import redisClient from '@/lib/redis';
import { auth } from '@clerk/nextjs/server';
import { getInternalUserId } from '@/lib/user-utils'; // You should move this helper to a shared file

export async function GET(request: NextRequest) {
  // Ensure only authenticated users can access
  const { userId: clerkId } = await auth();
  
  if (!clerkId) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  // Convert Clerk ID to internal UUID
  const internalUserId = await getInternalUserId(clerkId);
  
  if (!internalUserId) {
    return NextResponse.json(
      { error: 'User not found in database' }, 
      { status: 404 }
    );
  }

  try {
    // Get Redis statistics
    const [
      keyCount,
      memory,
      clients,
      uptime,
      hitRate
    ] = await Promise.all([
      // Get total keys in Redis
      redisClient.dbsize(),
      // Get memory usage
      redisClient.info('memory'),
      // Get client info
      redisClient.info('clients'),
      // Get server uptime
      redisClient.info('server'),
      // Calculate hit rate
      calculateHitRate()
    ]);

    // Parse memory info
    const memoryInfo = parseRedisInfo(memory);
    const clientInfo = parseRedisInfo(clients);
    const serverInfo = parseRedisInfo(uptime);

    // Get user-specific cache keys
    const userCacheKeys = await getUserCacheKeys(internalUserId);

    // Gather all statistics
    const stats = {
      overview: {
        totalKeys: keyCount,
        usedMemory: formatBytes(parseInt(memoryInfo['used_memory'] || '0')),
        usedMemoryRss: formatBytes(parseInt(memoryInfo['used_memory_rss'] || '0')),
        connectedClients: parseInt(clientInfo['connected_clients'] || '0'),
        uptime: formatUptime(parseInt(serverInfo['uptime_in_seconds'] || '0')),
        hitRate: hitRate,
      },
      userCache: {
        totalKeys: userCacheKeys.length,
        pageListKeys: userCacheKeys.filter(k => k.includes('notion_pages')).length,
        pageDetailKeys: userCacheKeys.filter(k => k.includes('notion_page_detail')).length,
        keys: userCacheKeys
      }
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching Redis statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cache statistics', details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}

// Helper functions

// Parse Redis INFO command output
function parseRedisInfo(info: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = info.split('\r\n');
  
  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;
    
    const [key, value] = line.split(':');
    if (key && value) {
      result[key] = value;
    }
  }
  
  return result;
}

// Calculate cache hit rate
async function calculateHitRate(): Promise<string> {
  try {
    const info = await redisClient.info('stats');
    const stats = parseRedisInfo(info);
    
    const hits = parseInt(stats['keyspace_hits'] || '0');
    const misses = parseInt(stats['keyspace_misses'] || '0');
    
    if (hits === 0 && misses === 0) return '0%';
    
    const rate = (hits / (hits + misses)) * 100;
    return `${rate.toFixed(2)}%`;
  } catch (error) {
    console.error('Error calculating hit rate:', error);
    return 'N/A';
  }
}

// Get cache keys for specific user
async function getUserCacheKeys(userId: string): Promise<string[]> {
  try {
    const keys: string[] = [];
    let cursor = '0';
    
    // Find user-specific keys
    do {
      const [newCursor, batch] = await redisClient.scan(
        cursor, 
        'MATCH', 
        `*${userId}*`,
        'COUNT',
        100
      );
      
      keys.push(...batch);
      cursor = newCursor;
    } while (cursor !== '0');
    
    // Also get page detail keys
    cursor = '0';
    do {
      const [newCursor, batch] = await redisClient.scan(
        cursor, 
        'MATCH', 
        'notion_page_detail:*',
        'COUNT',
        100
      );
      
      keys.push(...batch);
      cursor = newCursor;
    } while (cursor !== '0');
    
    return [...new Set(keys)]; // Remove duplicates
  } catch (error) {
    console.error('Error getting user cache keys:', error);
    return [];
  }
}

// Format bytes to human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format uptime to days, hours, minutes, seconds
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}