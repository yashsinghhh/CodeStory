import fs from 'fs';
import path from 'path';
import { createClient } from "@deepgram/sdk";

// Ensure the audio directory exists
const audioDir = path.join(process.cwd(), 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Helper function to convert stream to audio buffer
export async function getAudioBuffer(response: ReadableStream): Promise<Buffer> {
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

// Split text into chunks, respecting sentence boundaries
export function splitTextIntoChunks(
  text: string, 
  maxChunkLength: number = 1900
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  // Split text into sentences
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // If adding this sentence would exceed max length, start a new chunk
    if (currentChunk.length + sentence.length > maxChunkLength) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    
    // Add sentence to current chunk
    currentChunk += (currentChunk ? ' ' : '') + sentence;
  }

  // Add any remaining text
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Generate audio for multiple text chunks
export async function generateChunkedAudio(
  text: string, 
  pageId: string,
  deepgramClient?: any
): Promise<{
  audioUrls: string[],
  chunksCount: number,
  originalTextLength: number
}> {
  // Use provided client or create a new one
  const deepgram = deepgramClient || createClient(process.env.DEEPGRAM_API_KEY || '');
  
  // Split text into chunks
  const textChunks = splitTextIntoChunks(text);
  
  // Generate audio for each chunk
  const audioGenerationPromises = textChunks.map(async (chunk, index) => {
    // Generate unique filename for each chunk
    const filename = `page_${pageId}_chunk_${index}_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);

    try {
      // Generate audio for this chunk
      const response = await deepgram.speak.request(
        { text: chunk },
        {
          model: "aura-asteria-en",
          encoding: "linear16",
          container: "wav",
        }
      );

      // Get the audio stream
      const stream = await response.getStream();

      if (!stream) {
        throw new Error(`Failed to generate audio stream for chunk ${index}`);
      }

      // Convert stream to buffer
      const buffer = await getAudioBuffer(stream);

      // Write the audio buffer to a file
      await fs.promises.writeFile(filepath, buffer);

      // Return the public URL of the audio file
      return `/audio/${filename}`;
    } catch (error) {
      console.error(`Error generating audio for chunk ${index}:`, error);
      throw error;
    }
  });

  // Wait for all chunks to be generated
  const audioUrls = await Promise.all(audioGenerationPromises);

  return {
    audioUrls,
    chunksCount: audioUrls.length,
    originalTextLength: text.length
  };
}