// app/api/notion/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { syncAllNotionPagesToSupabase, syncNotionPageToSupabase } from '@/lib/notion-sync';
import redisClient from '@/lib/redis';

export async function POST(request: NextRequest) {
  // Get authenticated user
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  try {
    // Parse the request body
    const body = await request.json().catch(() => ({}));
    const pageId = body.pageId;
    
    console.log(`Sync requested by user ${userId}${pageId ? ` for page ${pageId}` : ' for all pages'}`);
    
    // Track start time for performance measurement
    const startTime = Date.now();
    
    let result;
    
    if (pageId) {
      // Sync a specific page
      result = await syncNotionPageToSupabase(pageId, userId);
      
      // Clear Redis cache for this page
      await redisClient.del(`page:${pageId}`);
    } else {
      // Sync all pages
      result = await syncAllNotionPagesToSupabase(userId);
      
      // Clear Redis cache for pages list
      await redisClient.del('notion_pages');
    }
    
    if (!result) {
      return NextResponse.json(
        { error: 'Sync failed' },
        { status: 500 }
      );
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      message: pageId 
        ? `Successfully synced page ${pageId}` 
        : 'Successfully synced all pages',
      duration: `${duration}ms`
    });
  } catch (error) {
    console.error('Error during sync:', error);
    return NextResponse.json(
      { error: 'Failed to sync', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}