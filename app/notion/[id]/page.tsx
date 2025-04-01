import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { PageObjectResponse, BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import PageActions from './page-actions';
import NotionBlockRenderer from "../../components/NotionBlockRenderer";
import GeminiAnalyzeButton from "../../components/GeminiAnalyzeButton";
import redisClient from '@/lib/redis';

// Define a more flexible interface for page details
interface NotionPageDetails {
  id: string;
  url: string;
  blocks: Array<{
    type: string;
    content: string;
    children?: Array<any>; // Add support for nested children
  }>;
  last_synced_at?: string;
  notion_last_edited_at?: string;
  [key: string]: any; // Allow additional dynamic properties
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

// Cache page data
async function cachePage(pageId: string, pageData: any, expiration: number = 3600): Promise<void> {
  try {
    await redisClient.set(
      getPageCacheKey(pageId), 
      JSON.stringify(pageData), 
      'EX', 
      expiration
    );
    console.log(`Cached page ${pageId} for ${expiration} seconds`);
  } catch (error) {
    console.error('Redis cache setting error:', error);
  }
}

// Fetch Notion Page Details (Helper Function)
async function fetchNotionPage(id: string): Promise<NotionPageDetails | null> {
  const startTime = Date.now();
  
  try {
    // First check Redis cache
    const cachedPage = await getCachedPage(id);
    if (cachedPage) {
      console.log(`🚀 Using CACHED Notion page for ID: ${id}`);
      console.log(`   Cache hit at: ${new Date().toISOString()}`);
      console.log(`   Page Title: ${cachedPage['Pages '] || cachedPage.pageTitle || 'Untitled'}`);
      return cachedPage;
    }
    
    console.log(`🌐 Cache miss - fetching from API for page ID: ${id}`);
    
    // If not in cache, fetch from API
    const apiUrl = `/api/notion/${id}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API returned status: ${response.status}`);
    }
    
    const pageData = await response.json();
    
    // Store in Redis cache
    await cachePage(id, pageData);
    
    const processingTime = Date.now() - startTime;
    console.log(`Page processed in ${processingTime}ms`);
    
    return pageData;
  } catch (error) {
    console.error("Error fetching Notion page:", error);
    
    // Fallback to direct API call if the API route fails
    try {
      console.log("Attempting direct API fallback...");
      // Import the API client only if needed (to avoid server/client mismatch issues)
      const { Client } = await import("@notionhq/client");
      const notion = new Client({
        auth: process.env.NOTION_API_KEY,
      });
      
      // Type assertion to ensure we're working with a full page response
      const pageResponse = await notion.pages.retrieve({
        page_id: id
      }) as PageObjectResponse;

      // Extract properties dynamically
      const properties: Record<string, any> = {};
      Object.entries(pageResponse.properties).forEach(([key, prop]: [string, any]) => {
        properties[key] = extractPropertyValue(prop);
      });

      // Process all blocks starting at the page level
      const blockContents = await processBlocks(id, notion);
      
      const result = {
        id: pageResponse.id,
        url: pageResponse.url,
        ...properties,
        blocks: blockContents,
      };
      
      // Cache the result
      await cachePage(id, result);
      
      const processingTime = Date.now() - startTime;
      console.log(`Fallback page processed in ${processingTime}ms`);
      
      return result;
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      return null;
    }
  }
}

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
function extractRichTextContent(richTexts: any[]): string {
  return richTexts.map((text: any) => text.plain_text || '').join('').trim();
}

// Helper to batch array into chunks
function chunkArray<T>(array: T[], size: number): T[][] {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Optimized function to fetch blocks efficiently
async function processBlocks(rootBlockId: string, notionClient: any): Promise<any[]> {
  const timeId = Date.now();
  const processBlocksLabel = `processBlocks_${timeId}`;
  console.time(processBlocksLabel);
  
  // Step 1: Prepare data structures
  const blocksMap = new Map<string, any>(); // Maps block IDs to their content
  const childrenMap = new Map<string, any[]>(); // Maps parent block IDs to arrays of their children
  const blocksToFetch = [rootBlockId]; // Queue of block IDs to fetch
  
  // Step 2: Breadth-first fetch of all blocks (maximum of 3 levels deep)
  let depth = 0;
  const MAX_DEPTH = 2; // You can adjust this based on your needs
  const BATCH_SIZE = 10; // Increased batch size for better parallelization
  
  while (blocksToFetch.length > 0 && depth <= MAX_DEPTH) {
    console.log(`Processing depth ${depth}, blocks to fetch: ${blocksToFetch.length}`);
    
    // Process in batches to parallelize API calls
    const batches = chunkArray(blocksToFetch, BATCH_SIZE);
    const nextLevelBlocks: string[] = []; // Store the next level's blocks here 
    
    // Process each batch in parallel
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(blockId => notionClient.blocks.children.list({
          block_id: blockId,
          page_size: 100
        }))
      );
      
      // Process results for this batch
      batch.forEach((parentId, index) => {
        const results = batchResults[index].results as BlockObjectResponse[];
        
        // Store each block and collect IDs of blocks with children
        for (const block of results) {
          // Store the block content
          blocksMap.set(block.id, block);
          
          // If block has children and we're not at max depth, add to queue for next depth
          if (block.has_children && depth < MAX_DEPTH) {
            nextLevelBlocks.push(block.id);
          }
        }
        
        // Store parent-children relationship
        childrenMap.set(parentId, results);
      });
      
      // Add a small delay to avoid rate limiting if we have many batches
      if (batches.length > 3) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Update blocks to fetch for next iteration
    blocksToFetch.length = 0;
    blocksToFetch.push(...nextLevelBlocks);
    
    // Increase depth for next iteration
    depth++;
  }
  
  console.log(`Fetched blocks for ${blocksMap.size} blocks across ${depth} levels`);
  
  // Step 3: Process the top-level blocks and build the hierarchy
  const topLevelBlocks = childrenMap.get(rootBlockId) || [];
  
  // Transform blocks into the expected format
  const processedTopLevel = topLevelBlocks.map((block: BlockObjectResponse) => {
    return processBlockWithChildren(block, childrenMap);
  });
  
  console.timeEnd(processBlocksLabel);
  return processedTopLevel;
}

// Helper function to process a block and its children
function processBlockWithChildren(block: BlockObjectResponse, childrenMap: Map<string, BlockObjectResponse[]>): any {
  // Extract content based on block type
  let processedBlock: any = {
    type: block.type,
    content: ''
  };
  
  // Extract content based on block type
  switch(block.type) {
    case "paragraph":
      if ('paragraph' in block) {
        processedBlock.content = extractRichTextContent(block.paragraph.rich_text);
      }
      break;
    case "heading_1":
      if ('heading_1' in block) {
        processedBlock.content = extractRichTextContent(block.heading_1.rich_text);
      }
      break;
    case "heading_2":
      if ('heading_2' in block) {
        processedBlock.content = extractRichTextContent(block.heading_2.rich_text);
      }
      break;
    case "heading_3":
      if ('heading_3' in block) {
        processedBlock.content = extractRichTextContent(block.heading_3.rich_text);
      }
      break;
    case "bulleted_list_item":
      if ('bulleted_list_item' in block) {
        processedBlock.content = extractRichTextContent(block.bulleted_list_item.rich_text);
      }
      break;
    case "numbered_list_item":
      if ('numbered_list_item' in block) {
        processedBlock.content = extractRichTextContent(block.numbered_list_item.rich_text);
      }
      break;
    case "toggle":
      if ('toggle' in block) {
        processedBlock.content = extractRichTextContent(block.toggle.rich_text);
      }
      break;
    default:
      processedBlock.content = `Unsupported block type: ${block.type}`;
  }
  
  // Add children if they exist
  if (block.has_children && childrenMap.has(block.id)) {
    const childBlocks = childrenMap.get(block.id) || [];
    processedBlock.children = childBlocks.map((childBlock: BlockObjectResponse) => 
      processBlockWithChildren(childBlock, childrenMap)
    );
  }
  
  return processedBlock;
}

export default async function NotionPageDetail({ 
  params,
  searchParams 
}: { 
  params: { id: string },
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  // Check if sync was requested via URL parameter
  const shouldSync = searchParams?.sync === 'true';
  
  // Validate params
  const pageId = params.id;

  if (!pageId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600 text-xl">No page ID provided</p>
      </div>
    );
  }

  // Fetch page details with Redis caching
  const pageDetails = await fetchNotionPage(pageId);

  if (!pageDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600 text-xl">Failed to load page content</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 selection:bg-blue-200 selection:text-blue-900">
      {/* Navigation and User Section */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link 
            href="/" 
            className="text-blue-600 hover:text-blue-800 transition-colors flex items-center space-x-2 group"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 group-hover:-translate-x-1 transition-transform" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Pages</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-24 max-w-3xl">
        {/* Sync info banner if page was just synced */}
        {shouldSync && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 animate-fade-in-up">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p>This page has been synced from Notion</p>
            </div>
          </div>
        )}
        
        {/* Page Header */}
        <header className="mb-12 animate-fade-in-up">
          {/* Author Info */}
          {pageDetails.author && pageDetails.author.length > 0 && (
            <div className="flex items-center mb-6">
              {pageDetails.author[0].avatar_url && (
                <Image
                  src={pageDetails.author[0].avatar_url}
                  alt={pageDetails.author[0].name}
                  width={56}
                  height={56}
                  className="rounded-full mr-5 border-2 border-blue-100 shadow-md"
                  style={{
                    aspectRatio: "1/1",
                    objectFit: "cover",
                  }}
                />
              )}
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2 leading-tight">
                  {pageDetails.pageTitle || pageDetails["Pages "] || "Untitled Page"}
                </h1>
                <p className="text-gray-600 text-sm">
                  Created by {pageDetails.author?.[0]?.name || "Unknown"}{" "}
                  {pageDetails.Date && `on ${pageDetails.Date}`}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {pageDetails.Description && (
            <p className="text-xl text-gray-700 italic border-l-4 border-blue-500 pl-4 py-2 bg-blue-50/50">
              {pageDetails.Description}
            </p>
          )}
        </header>

        {/* Page Content */}
        <article className="prose max-w-none text-gray-800 space-y-4 animate-fade-in-up delay-200">
          <NotionBlockRenderer blocks={pageDetails.blocks} />
        </article>

        {/* Page Actions with Gemini Button */}
        <div className="mt-12 flex flex-col items-center space-y-6 animate-fade-in-up delay-500">
          <GeminiAnalyzeButton pageId={pageDetails.id} />
          
          <PageActions 
            pageId={pageDetails.id} 
            notionUrl={pageDetails.url}
            lastSyncedAt={pageDetails.last_synced_at}
            notionLastEditedAt={pageDetails.notion_last_edited_at}
          />
        </div>
      </main>
    </div>
  );
}