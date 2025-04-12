// app/api/tts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from "@deepgram/sdk";
import { supabase } from '@/lib/supabase';
import { getInternalUserId } from '@/lib/user-utils';
import path from 'path';
import fs from 'fs';

// Ensure the audio directory exists
const audioDir = path.join(process.cwd(), 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Helper function to convert stream to audio buffer
async function getAudioBuffer(response: ReadableStream): Promise<Buffer> {
  const reader = response.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const dataArray = chunks.reduce(
    (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
    new Uint8Array(0)
  );
  
  return Buffer.from(dataArray.buffer);
}

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

    // Generate unique filename based on pageId and timestamp
    const filename = `page_${pageId}_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);

    // Make a request and configure the request with options
    const response = await deepgram.speak.request(
      { text: textToConvert },
      {
        model: "aura-asteria-en",
        encoding: "linear16",
        container: "wav",
      }
    );

    // Get the audio stream
    const stream = await response.getStream();

    if (!stream) {
      return NextResponse.json(
        { error: 'Failed to generate audio stream' },
        { status: 500 }
      );
    }

    // Convert stream to buffer
    const buffer = await getAudioBuffer(stream);

    // Write the audio buffer to a file
    await fs.promises.writeFile(filepath, buffer);

    // Return the public URL of the audio file
    return NextResponse.json({
      success: true,
      audioUrl: `/audio/${filename}`,
      filename: filename,
      filesize: buffer.length,
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