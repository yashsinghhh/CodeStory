import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@deepgram/sdk";
import { auth } from '@clerk/nextjs/server';
import { generateChunkedAudio } from '@/lib/audio-utils';

export async function POST(request: NextRequest) {
  // Authenticate the user
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Parse the request body
    const { text, pageId = 'generic' } = await request.json();

    // Validate input
    if (!text) {
      return NextResponse.json(
        { error: 'No text provided for text-to-speech conversion' },
        { status: 400 }
      );
    }

    // Create a Deepgram client with your API key
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

    // Generate chunked audio
    const audioResult = await generateChunkedAudio(text, pageId, deepgram);

    // Return the public URLs of the audio files
    return NextResponse.json({
      success: true,
      ...audioResult
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