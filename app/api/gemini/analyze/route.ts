// app/api/gemini/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getInternalUserId } from '@/lib/user-utils';
import { supabase } from '@/lib/supabase';
import { processWithGemini, createDefaultSystemPrompt } from '@/lib/gemini-service';
import redisClient from '@/lib/redis';

export async function POST(request: NextRequest) {
  // Get authenticated user
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
    const body = await request.json();
    const { pageId } = body;
    
    if (!pageId) {
      return NextResponse.json(
        { error: 'No page ID provided' },
        { status: 400 }
      );
    }

    // Get the page from Supabase
    const { data: page, error } = await supabase
      .from('pages')
      .select('title, plain_text, gemini_analysis, gemini_analyzed_at')
      .eq('notion_page_id', pageId)
      .eq('user_id', internalUserId)
      .single();
      
    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch page: ${error.message}` },
        { status: 500 }
      );
    }
    
    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }
    
    if (!page.plain_text) {
      return NextResponse.json(
        { error: 'No plain text content available for this page' },
        { status: 400 }
      );
    }
    
    // If we have a stored analysis and the client didn't request a refresh, return it
    const forceRefresh = body.forceRefresh === true;
    if (page.gemini_analysis && !forceRefresh) {
      console.log(`Using cached Gemini analysis for page ${pageId}`);
      return NextResponse.json({
        success: true,
        pageTitle: page.title,
        result: page.gemini_analysis,
        analyzedAt: page.gemini_analyzed_at,
        cached: true
      });
    }
    
    console.log(`Analyzing page "${page.title}" with Gemini...`);
    console.log(`Content length: ${page.plain_text.length} characters`);
    
    // Create the system prompt for a review and rating
    const systemPrompt = createDefaultSystemPrompt({
      title: page.title,
      objective: 'Review this content and provide a detailed assessment of its quality, structure, and clarity.',
      format: `
Please provide:
1. A quality rating on a scale of 1-10
2. A brief summary (2-3 sentences)
3. Strengths of the content (2-3 points)
4. Areas for improvement (2-3 points)
5. Overall recommendation`
    });
    
    // Process with Gemini
    const result = await processWithGemini(page.plain_text, systemPrompt);
    
    // Store the result in Supabase
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('pages')
      .update({
        gemini_analysis: result,
        gemini_analyzed_at: now,
        updated_at: now
      })
      .eq('notion_page_id', pageId)
      .eq('user_id', internalUserId);
      
    if (updateError) {
      console.error(`Error storing Gemini analysis: ${updateError.message}`);
    } else {
      console.log(`Successfully stored Gemini analysis for page ${pageId}`);
      
      // Invalidate any cached version of this page
      try {
        const cacheKey = `notion_page_detail:${pageId}`;
        await redisClient.del(cacheKey);
        console.log(`Invalidated cache for page ${pageId}`);
      } catch (cacheError) {
        console.error('Error clearing page cache:', cacheError);
      }
    }
    
    // Log the result to terminal
    console.log("\n=== GEMINI ANALYSIS ===");
    console.log(`Page: ${page.title}`);
    console.log("=======================");
    console.log(result);
    console.log("=======================\n");
    
    return NextResponse.json({
      success: true,
      pageTitle: page.title,
      result: result,
      analyzedAt: now,
      cached: false
    });
    
  } catch (error) {
    console.error('Error processing page with Gemini:', error);
    return NextResponse.json(
      { error: 'Failed to process page', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}