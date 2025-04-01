// lib/gemini-service.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Initialize the Google Generative AI with your API key
const googleAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Default model to use
const DEFAULT_MODEL = 'gemini-2.0-flash';

interface GeminiRequestOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  model?: string;
}

/**
 * Process text content with Gemini
 */
export async function processWithGemini(
  content: string,
  systemPrompt: string,
  options: GeminiRequestOptions = {}
): Promise<string> {
  try {
    const modelName = options.model || DEFAULT_MODEL;
    const model = googleAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: options.temperature || 0.7,
        topK: options.topK || 40,
        topP: options.topP || 0.95,
        maxOutputTokens: options.maxOutputTokens || 4096,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    // Generate the prompt with system instructions first, then the content
    const prompt = `${systemPrompt}\n\n${content}`;
    
    // Generate the response
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    return response.text();
  } catch (error) {
    console.error('Error processing with Gemini:', error);
    throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create default system prompt for Notion page processing
 */
export function createDefaultSystemPrompt(options: {
  title?: string;
  objective?: string;
  format?: string;
} = {}): string {
  const { title, objective, format } = options;
  
  return `
You are an expert content processor and knowledge analyzer. Your task is to process the following Notion page content${title ? ` about "${title}"` : ''}.

${objective || 'Analyze this content and extract the key information, main points, and insights.'}

${format || 'Provide a clear summary and highlight the most important takeaways.'}

CONTENT:
`.trim();
}