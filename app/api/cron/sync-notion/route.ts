// app/api/cron/sync-notion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncAllNotionPagesToSupabase } from '@/lib/notion-sync';

// This route is protected with a secret key
export async function GET(request: NextRequest) {
  // Simple API key check - you'd want to use a stronger auth mechanism in production
  const apiKey = request.nextUrl.searchParams.get('key');
  
  if (apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    console.log('Starting scheduled Notion sync');
    
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id');
      
    if (error) throw error;
    
    if (!users || users.length === 0) {
      return NextResponse.json({
        message: 'No users found to sync for',
        success: true
      });
    }
    
    console.log(`Found ${users.length} users to sync for`);
    
    // Sync for each user
    let successCount = 0;
    for (const user of users) {
      const success = await syncAllNotionPagesToSupabase(user.id);
      if (success) successCount++;
    }
    
    return NextResponse.json({
      success: true,
      message: `Synced Notion pages for ${successCount} out of ${users.length} users`
    });
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}