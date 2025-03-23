// app/api/notion/[id]/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import redisClient from '@/lib/redis';
import { auth } from '@clerk/nextjs/server';
import { syncNotionPageToSupabase } from '@/lib/notion-sync';

// Helper to get internal UUID from Clerk ID
async function getInternalUserId(clerkId: string): Promise<string | null> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (error || !user) {
      console.error('Error finding user:', error);
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error in getInternalUserId:', error);
    return null;
  }
}

// Cache expiration (1 day)
const CACHE_EXPIRATION = 24 * 60 * 60; // seconds

// Generate a cache key for a specific page
function getPageCacheKey(pageId: string): string {
  return `notion_page_detail:${pageId}`;
}

// Retrieve cached page
async function getCachedPage(pageId: string): Promise<any | null> {
  try {
    const cachedData = await redisClient.get(getPageCacheKey(pageId));
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Redis cache retrieval error:', error);
    return null;
  }
}

// Cache a page
async function cachePage(pageId: string, pageData: any, expiration: number = CACHE_EXPIRATION): Promise<void> {
  try {
    await redisClient.set(
      getPageCacheKey(pageId), 
      JSON.stringify(pageData), 
      'EX', 
      expiration
    );
    console.log(`Cached page ${pageId} for ${expiration} seconds`);
  } catch (error) {
    console.error('Redis cache setting error:', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  
  // Get authenticated user from Clerk
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
    const pageId = params.id;
    const syncFromNotion = request.nextUrl.searchParams.get('sync') === 'true';
    const forceRefresh = request.nextUrl.searchParams.get('force_refresh') === 'true';

    if (!pageId) {
      return NextResponse.json(
        { error: 'No page ID provided' },
        { status: 400 }
      );
    }

    // If sync is requested, pull from Notion first
    if (syncFromNotion) {
      console.log(`Syncing page ${pageId} from Notion for user ${internalUserId}`);
      const syncSuccess = await syncNotionPageToSupabase(pageId, internalUserId);
      
      if (!syncSuccess) {
        console.warn(`Sync failed for page ${pageId}`);
      }
      
      // Clear cache after sync regardless of success to ensure we fetch latest data
      await redisClient.del(getPageCacheKey(pageId));
    }
    
    // Check cache if not forcing refresh
    if (!forceRefresh && !syncFromNotion) {
      const cachedPage = await getCachedPage(pageId);
      if (cachedPage) {
        console.log(`Returning CACHED page ${pageId} (${Date.now() - startTime}ms)`);
        return NextResponse.json(cachedPage);
      }
    }

    // Fetch from Supabase
    console.log(`Fetching page ${pageId} from Supabase for user ${internalUserId}`);
    const { data: page, error } = await supabase
      .from('pages')
      .select('*')
      .eq('notion_page_id', pageId)
      .eq('user_id', internalUserId)  // Using internal UUID here
      .single();

    if (error) {
      console.error(`Error fetching page ${pageId}:`, error);
      return NextResponse.json(
        { error: 'Failed to fetch page', details: error.message },
        { status: error.code === 'PGRST116' ? 404 : 500 }
      );
    }

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // Transform the Supabase page to match the expected frontend format
    const pageData = {
      id: page.notion_page_id,
      url: page.notion_url,
      pageTitle: page.title,
      Description: page.description,
      author: page.author_name ? [{
        id: page.author_id || '',
        name: page.author_name,
        avatar_url: page.author_avatar_url
      }] : [],
      Date: page.created_date ? new Date(page.created_date).toLocaleDateString() : '',
      blocks: page.blocks || [],
      // Include sync information
      last_synced_at: page.last_synced_at,
      notion_last_edited_at: page.notion_last_edited_at
    };

    // Cache the page with the default expiration
    await cachePage(pageId, pageData);

    const processingTime = Date.now() - startTime;
    console.log(`Page ${pageId} processed in ${processingTime}ms`);

    return NextResponse.json(pageData);
  } catch (error) {
    console.error('Error retrieving page:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve page', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Get authenticated user from Clerk
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
    const pageId = params.id;

    if (!pageId) {
      return NextResponse.json(
        { error: 'No page ID provided' },
        { status: 400 }
      );
    }

    // Delete from Supabase
    const { error } = await supabase
      .from('pages')
      .delete()
      .eq('notion_page_id', pageId)
      .eq('user_id', internalUserId);  // Using internal UUID here

    if (error) {
      console.error(`Error deleting page ${pageId}:`, error);
      return NextResponse.json(
        { error: 'Failed to delete page', details: error.message },
        { status: 500 }
      );
    }

    // Remove the page from Redis cache
    try {
      await redisClient.del(getPageCacheKey(pageId));
      // Also invalidate the pages list cache
      await redisClient.del(`notion_pages:${internalUserId}`);
    } catch (cacheError) {
      console.error('Error removing page from Redis cache:', cacheError);
    }

    return NextResponse.json(
      { success: true, message: 'Page successfully deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting page:', error);
    return NextResponse.json(
      { error: 'Failed to delete page', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}