// app/api/notion/[id]/route.tsx
import { Client } from '@notionhq/client';
import { NextRequest, NextResponse } from 'next/server';
import redisClient from '@/lib/redis';
import { 
  BlockObjectResponse, 
  PageObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints';

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

// Cache expiration (1 week)
const CACHE_EXPIRATION = 7 * 24 * 60 * 60; // seconds in a week

// Define a type for processed blocks
type ProcessedBlock = {
  type: string;
  content: string;
  children?: ProcessedBlock[];
};

// Helper function to extract property value
function extractPropertyValue(property: any): any {
  switch (property.type) {
    case "title":
      return property.title[0]?.plain_text || null;
    case "rich_text":
      return property.rich_text[0]?.plain_text || null;
    case "people":
      return property.people.map((person: any) => ({
        id: person.id,
        name: person.name,
        avatar_url: person.avatar_url,
      }));
    case "date":
      return property.date?.start || null;
    case "select":
      return property.select?.name || null;
    default:
      return property[property.type];
  }
}

// Extract content from rich text blocks
function extractRichTextContent(richTexts: RichTextItemResponse[]): string {
  return richTexts.map((text: RichTextItemResponse) => text.plain_text || '').join('').trim();
}

// Extract block content based on block type
function extractBlockContent(block: BlockObjectResponse): string {
  switch(block.type) {
    case 'paragraph':
      return extractRichTextContent(block.paragraph.rich_text);
    case 'heading_1':
      return extractRichTextContent(block.heading_1.rich_text);
    case 'heading_2':
      return extractRichTextContent(block.heading_2.rich_text);
    case 'heading_3':
      return extractRichTextContent(block.heading_3.rich_text);
    case 'bulleted_list_item':
      return extractRichTextContent(block.bulleted_list_item.rich_text);
    case 'numbered_list_item':
      return extractRichTextContent(block.numbered_list_item.rich_text);
    case 'toggle':
      return extractRichTextContent(block.toggle.rich_text);
    default:
      return '';
  }
}

// Batch fetch and process blocks
async function processBlocks(
  pageId: string, 
  maxDepth: number = 3
): Promise<ProcessedBlock[]> {
  const initialBlocksResponse = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });

  const processBlocksRecursive = async (
    blocks: BlockObjectResponse[], 
    currentDepth: number
  ): Promise<ProcessedBlock[]> => {
    const processedBlocks: ProcessedBlock[] = [];

    for (const block of blocks) {
      const content = extractBlockContent(block);

      if (content && currentDepth > 0) {
        const processedBlock: ProcessedBlock = { 
          type: block.type, 
          content 
        };

        if (block.has_children && currentDepth > 1) {
          try {
            const childBlocksResponse = await notion.blocks.children.list({
              block_id: block.id,
              page_size: 100
            });

            processedBlock.children = await processBlocksRecursive(
              childBlocksResponse.results as BlockObjectResponse[], 
              currentDepth - 1
            );
          } catch (error) {
            console.error(`Error fetching children for block ${block.id}:`, error);
          }
        }

        processedBlocks.push(processedBlock);
      }
    }

    return processedBlocks;
  };

  return processBlocksRecursive(
    initialBlocksResponse.results as BlockObjectResponse[], 
    maxDepth
  );
}

// Generate a cache key for a specific page
function getPageCacheKey(pageId: string): string {
  return `notion_page_detail:${pageId}`;
}

// Retrieve cached page
async function getCachedPage(pageId: string): Promise<any | null> {
  try {
    const cachedData = await redisClient.get(getPageCacheKey(pageId));
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Redis cache retrieval error:', error);
    return null;
  }
}

// Cache a page
async function cachePage(pageId: string, pageData: any): Promise<void> {
  try {
    await redisClient.set(
      getPageCacheKey(pageId), 
      JSON.stringify(pageData), 
      'EX', 
      CACHE_EXPIRATION
    );
    console.log(`Cached page ${pageId} for 1 week`);
  } catch (error) {
    console.error('Redis cache setting error:', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();

  try {
    const pageId = params.id;

    if (!pageId) {
      return NextResponse.json(
        { error: 'No page ID provided' },
        { status: 400 }
      );
    }

    // First, check Redis cache
    const cachedPage = await getCachedPage(pageId);
    if (cachedPage) {
      console.log(`🚀 Returning CACHED Notion page for ID: ${pageId}`);
      console.log(`   Cached at: ${new Date().toISOString()}`);
      console.log(`   Page Title: ${cachedPage['Pages '] || 'Untitled'}`);
      return NextResponse.json(cachedPage);
    } else {
      console.log(`🌐 Fetching Notion page from API for ID: ${pageId}`);
    }

    // Fetch page from Notion if not in cache
    const pageResponse = await notion.pages.retrieve({
      page_id: pageId
    }) as PageObjectResponse;

    // Extract properties dynamically
    const properties: Record<string, any> = {};
    Object.entries(pageResponse.properties).forEach(([key, prop]) => {
      properties[key] = extractPropertyValue(prop);
    });

    // Process all blocks with batch fetching
    const blockContents = await processBlocks(pageId);

    // Prepare full page data
    const pageData = {
      id: pageResponse.id,
      url: pageResponse.url,
      ...properties,
      blocks: blockContents
    };

    // Cache the page data for 1 week
    await cachePage(pageId, pageData);

    const processingTime = Date.now() - startTime;
    console.log(`Page processed in ${processingTime}ms`);

    return NextResponse.json(pageData);
  } catch (error) {
    console.error('Error fetching Notion page:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion page', details: error },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pageId = params.id;

    if (!pageId) {
      return NextResponse.json(
        { error: 'No page ID provided' },
        { status: 400 }
      );
    }

    // Archive the page in Notion
    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });

    // Remove the page from Redis cache
    try {
      await redisClient.del(getPageCacheKey(pageId));
    } catch (cacheError) {
      console.error('Error removing page from Redis cache:', cacheError);
    }

    return NextResponse.json(
      { success: true, message: 'Page successfully deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting Notion page:', error);
    return NextResponse.json(
      { error: 'Failed to delete Notion page', details: error },
      { status: 500 }
    );
  }
}