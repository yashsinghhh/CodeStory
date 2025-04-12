import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from "@deepgram/sdk";
import { supabase } from '@/lib/supabase';
import { getInternalUserId } from '@/lib/user-utils';
import { generateChunkedAudio } from '@/lib/audio-utils';

export async function GET(
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

    // Fetch page details from Supabase
    const { data: page, error } = await supabase
      .from('pages')
      .select('title, gemini_analysis, plain_text')
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

    // Prioritize Gemini analysis, fall back to plain text
    const textToConvert = page.gemini_analysis || page.plain_text;
    
    if (!textToConvert) {
      return NextResponse.json(
        { error: 'No text available for conversion' },
        { status: 400 }
      );
    }

    // Create a Deepgram client with your API key
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

    // Generate chunked audio
    const audioResult = await generateChunkedAudio(textToConvert, pageId, deepgram);

    // Return the public URLs of the audio files
    return NextResponse.json({
      success: true,
      ...audioResult,
      pageTitle: page.title
    });

  } catch (error) {
    console.error('Text-to-Speech conversion error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to convert text to speech', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}