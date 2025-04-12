// app/api/tts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@deepgram/sdk";
import { auth } from '@clerk/nextjs/server';
import fs from 'fs';
import path from 'path';

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
    const { text, pageId } = await request.json();

    // Validate input
    if (!text) {
      return NextResponse.json(
        { error: 'No text provided for text-to-speech conversion' },
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
      { text },
      {
        model: "aura-asteria-en", // You can change this to different voices as needed
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
      filename: filename
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