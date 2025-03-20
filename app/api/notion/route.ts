// app/api/notion/route.ts
import { Client } from '@notionhq/client';
import { NextRequest, NextResponse } from 'next/server';
import redisClient from '@/lib/redis';
import { 
  BlockObjectResponse, 
  PartialBlockObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints';

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

// Cache expiration (1 hour)
const CACHE_EXPIRATION = 3600; // seconds

// Helper function to extract page title
function extractPageTitle(properties: Record<string, any>): string | null {
  // Try multiple property types that could represent the page title
  const possibleTitleKeys = ['Pages', 'Pages ', 'Name', 'Title'];
  
  for (const key of possibleTitleKeys) {
    const prop = properties[key];
    
    if (!prop) continue;

    // Handle different property types
    switch (prop.type) {
      case 'title':
        return prop.title[0]?.plain_text || null;
      case 'rich_text':
        return prop.rich_text[0]?.plain_text || null;
      case 'select':
        return prop.select?.name || null;
      case 'multi_select':
        return prop.multi_select?.[0]?.name || null;
      default:
        // If it's a direct string or value
        if (typeof prop === 'string') return prop;
    }
  }

  return null;
}

// Helper to safely access rich text content from blocks
function getRichTextContent(richTextArray: RichTextItemResponse[] | undefined): string {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(text => text.plain_text || '').join('');
}

// Helper function to extract text from toggle blocks
async function extractToggleContent(block: BlockObjectResponse): Promise<any> {
  // Type check to ensure we're dealing with a toggle block
  if (block.type !== 'toggle' || !('toggle' in block)) {
    return null;
  }
  
  // Get the toggle header text
  const headerText = getRichTextContent(block.toggle.rich_text);
  
  // Initialize children array
  const children = [];
  
  // Fetch child blocks if they exist
  if (block.has_children) {
    try {
      const childBlocksResponse = await notion.blocks.children.list({
        block_id: block.id,
        page_size: 100
      });
      
      // Process each child block
      for (const childBlock of childBlocksResponse.results as BlockObjectResponse[]) {
        let childContent = await extractBlockContent(childBlock);
        
        if (childContent && (typeof childContent === 'object' ? 
            (childContent.content && childContent.content.trim() !== '') : 
            childContent.trim() !== '')) {
          children.push(childContent);
        }
      }
    } catch (error) {
      console.error(`Error fetching toggle children for block ${block.id}:`, error);
    }
  }
  
  // Return structured toggle data
  return {
    type: 'toggle',
    content: headerText,
    children: children
  };
}

// Helper function to extract content from different block types
async function extractBlockContent(block: BlockObjectResponse | PartialBlockObjectResponse): Promise<any> {
  // Handle partial blocks
  if (!('type' in block)) {
    return null;
  }
  
  switch(block.type) {
    case "paragraph":
      if ('paragraph' in block) {
        const content = getRichTextContent(block.paragraph.rich_text);
        return content ? { type: "paragraph", content } : null;
      }
      break;
    case "heading_1":
      if ('heading_1' in block) {
        const content = getRichTextContent(block.heading_1.rich_text);
        return content ? { type: "heading_1", content } : null;
      }
      break;
    case "heading_2":
      if ('heading_2' in block) {
        const content = getRichTextContent(block.heading_2.rich_text);
        return content ? { type: "heading_2", content } : null;
      }
      break;
    case "heading_3":
      if ('heading_3' in block) {
        const content = getRichTextContent(block.heading_3.rich_text);
        return content ? { type: "heading_3", content } : null;
      }
      break;
    case "bulleted_list_item":
      if ('bulleted_list_item' in block) {
        const content = getRichTextContent(block.bulleted_list_item.rich_text);
        
        // Check for children
        if (block.has_children) {
          const childBlocksResponse = await notion.blocks.children.list({
            block_id: block.id,
            page_size: 100
          });
          
          const childContents = [];
          for (const childBlock of childBlocksResponse.results as BlockObjectResponse[]) {
            const childContent = await extractBlockContent(childBlock);
            if (childContent) childContents.push(childContent);
          }
          
          return {
            type: "bulleted_list_item", 
            content,
            children: childContents.length > 0 ? childContents : undefined
          };
        }
        
        return content ? { type: "bulleted_list_item", content } : null;
      }
      break;
    case "toggle":
      if ('toggle' in block) {
        return await extractToggleContent(block as BlockObjectResponse);
      }
      break;
    default:
      return {
        type: block.type,
        content: 'Unsupported block type: ' + block.type
      };
  }
  
  return null;
}

// Redis caching helpers
async function getCachedNotionPages(): Promise<any[] | null> {
  try {
    const cachedData = await redisClient.get('notion_pages');
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Redis cache retrieval error:', error);
    return null;
  }
}

async function cacheNotionPages(pages: any[]): Promise<void> {
  try {
    await redisClient.set('notion_pages', JSON.stringify(pages), 'EX', CACHE_EXPIRATION);
    console.log(`Cached ${pages.length} Notion pages`);
  } catch (error) {
    console.error('Redis cache setting error:', error);
  }
}

export async function GET(request: NextRequest) {
  // Check if cache should be force updated
  const forceUpdate = request.nextUrl.searchParams.get('force_update') === 'true';

  try {
    // If not forcing update, check Redis first
    if (!forceUpdate) {
      const cachedPages = await getCachedNotionPages();
      if (cachedPages) {
        console.log('Returning cached Notion pages');
        return NextResponse.json(cachedPages);
      }
    }

    // Replace with your actual Notion database ID
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!databaseId) {
      return NextResponse.json(
        { error: 'Notion Database ID is not configured' }, 
        { status: 400 }
      );
    }

    // Fetch database entries
    const response = await notion.databases.query({
      database_id: databaseId,
    });

    // Transform Notion response to metadata-only JSON format
    const transformedResults = response.results.map((page: any) => {
      // Extract properties
      const properties: Record<string, any> = {};

      Object.entries(page.properties).forEach(([key, prop]: [string, any]) => {
        switch(prop.type) {
          case 'title':
            properties[key] = prop.title[0]?.plain_text || null;
            break;
          case 'rich_text':
            properties[key] = prop.rich_text[0]?.plain_text || null;
            break;
          case 'number':
            properties[key] = prop.number;
            break;
          case 'select':
            properties[key] = prop.select?.name || null;
            break;
          case 'multi_select':
            properties[key] = prop.multi_select.map((item: any) => item.name);
            break;
          case 'date':
            properties[key] = prop.date?.start || null;
            break;
          case 'people':
            properties[key] = prop.people.map((person: any) => ({
              id: person.id,
              name: person.name,
              avatar_url: person.avatar_url
            }));
            break;
          default:
            properties[key] = prop[prop.type];
        }
      });

      // Extract page title
      const pageTitle = extractPageTitle(properties);

      return {
        id: page.id,
        url: page.url,
        pageTitle, // Use the extracted page title
        ...properties
      };
    });

    // Always update the cache
    await cacheNotionPages(transformedResults);

    return NextResponse.json(transformedResults);
  } catch (error) {
    console.error('Error fetching Notion database:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion database', details: error }, 
      { status: 500 }
    );
  }
}