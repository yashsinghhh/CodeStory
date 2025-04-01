// app/api/gemini/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getInternalUserId } from '@/lib/user-utils';
import { supabase } from '@/lib/supabase';
import { processWithGemini, createDefaultSystemPrompt } from '@/lib/gemini-service';

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
      .select('title, plain_text')
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
    
    // Log the result to terminal
    console.log("\n=== GEMINI ANALYSIS ===");
    console.log(`Page: ${page.title}`);
    console.log("=======================");
    console.log(result);
    console.log("=======================\n");
    
    return NextResponse.json({
      success: true,
      pageTitle: page.title,
      result: result
    });
    
  } catch (error) {
    console.error('Error processing page with Gemini:', error);
    return NextResponse.json(
      { error: 'Failed to process page', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}