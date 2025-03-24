// app/api/notion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import redisClient from '@/lib/redis';
import { auth } from '@clerk/nextjs/server';
import { syncAllNotionPagesToSupabase } from '@/lib/notion-sync';

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

// Cache expiration (1 hour)
const CACHE_EXPIRATION = 3600; // seconds

// Redis caching helpers
async function getCachedNotionPages(userId: string): Promise<any[] | null> {
  try {
    const cachedData = await redisClient.get(`notion_pages:${userId}`);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Redis cache retrieval error:', error);
    return null;
  }
}

async function cacheNotionPages(userId: string, pages: any[]): Promise<void> {
  try {
    await redisClient.set(`notion_pages:${userId}`, JSON.stringify(pages), 'EX', CACHE_EXPIRATION);
    console.log(`Cached ${pages.length} Notion pages for user ${userId}`);
  } catch (error) {
    console.error('Redis cache setting error:', error);
  }
}

export async function GET(request: NextRequest) {
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

  // Check if cache should be force updated
  const forceUpdate = request.nextUrl.searchParams.get('force_update') === 'true';
  const syncFromNotion = request.nextUrl.searchParams.get('sync') === 'true';

  try {
    // If sync is requested, pull from Notion to Supabase first
    if (syncFromNotion) {
      console.log(`Syncing Notion pages for user ${internalUserId}`);
      const syncSuccess = await syncAllNotionPagesToSupabase(internalUserId);
      if (!syncSuccess) {
        console.warn(`Sync failed or partially succeeded for user ${internalUserId}`);
      }
      
      // Clear cache to ensure fresh data
      await redisClient.del(`notion_pages:${internalUserId}`);
      console.log(`Cleared cache for user ${internalUserId} after sync`);
    }
    // If not forcing update, check Redis first
    else if (!forceUpdate) {
      const cachedPages = await getCachedNotionPages(internalUserId);
      if (cachedPages) {
        console.log(`Returning ${cachedPages.length} cached Notion pages for user ${internalUserId}`);
        return NextResponse.json(cachedPages);
      }
    }

    // Fetch from Supabase
    console.log(`Fetching pages from Supabase for user ${internalUserId}`);
    const { data: pages, error } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', internalUserId)  // Using internal UUID here
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pages from Supabase:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pages', details: error.message }, 
        { status: 500 }
      );
    }

    // Transform data to match the expected format for the frontend
    const transformedResults = pages.map(page => ({
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
      totalUsers: 0, // Legacy field, kept for compatibility
      // Include sync information
      last_synced_at: page.last_synced_at,
      notion_last_edited_at: page.notion_last_edited_at
    }));

    // Cache the transformed results
    await cacheNotionPages(internalUserId, transformedResults);

    return NextResponse.json(transformedResults);
  } catch (error) {
    console.error('Error retrieving Notion pages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve pages', details: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}