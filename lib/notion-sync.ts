// lib/notion-sync.ts
import { Client } from '@notionhq/client';
// Change this line in lib/notion-sync.ts
// import { supabase } from '@/lib/supabase';
import { supabase } from './supabase';
import { 
  BlockObjectResponse, 
  PageObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints';

// Define interface for processed blocks
interface ProcessedBlock {
  id: string;
  type: string;
  content: string;
  children: ProcessedBlock[];
}

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

// Helper function to extract page title
function extractPageTitle(properties: Record<string, any>): string | null {
  const possibleTitleKeys = ['Pages', 'Pages ', 'Name', 'Title'];
  
  for (const key of possibleTitleKeys) {
    const prop = properties[key];
    if (!prop) continue;

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
        if (typeof prop === 'string') return prop;
    }
  }
  return null;
}

// Extract value from Notion property
function extractPropertyValue(property: any): any {
  if (!property) return null;
  
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
  if (!richTexts || !Array.isArray(richTexts)) return '';
  return richTexts.map((text: RichTextItemResponse) => text.plain_text || '').join('');
}

// Process blocks recursively
async function processBlocksRecursively(
  blockId: string, 
  depth: number = 0,
  maxDepth: number = 3
): Promise<ProcessedBlock[]> {
  if (depth >= maxDepth) return [];
  
  try {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100
    });
    
    const blocks = response.results as BlockObjectResponse[];
    const processedBlocks: ProcessedBlock[] = [];
    
    for (const block of blocks) {
      // Skip unsupported blocks
      if (!('type' in block)) continue;
      
      const processedBlock: ProcessedBlock = {
        id: block.id,
        type: block.type,
        content: extractBlockContent(block),
        children: []
      };
      
      if (block.has_children && depth < maxDepth) {
        try {
          processedBlock.children = await processBlocksRecursively(
            block.id, 
            depth + 1,
            maxDepth
          );
        } catch (error) {
          console.error(`Error fetching children for block ${block.id}:`, error);
        }
      }
      
      processedBlocks.push(processedBlock);
    }
    
    return processedBlocks;
  } catch (error) {
    console.error(`Error fetching blocks for ${blockId}:`, error);
    return [];
  }
}

// Extract content based on block type
function extractBlockContent(block: BlockObjectResponse): string {
  switch(block.type) {
    case 'paragraph':
      if ('paragraph' in block) {
        return extractRichTextContent(block.paragraph.rich_text);
      }
      break;
    case 'heading_1':
      if ('heading_1' in block) {
        return extractRichTextContent(block.heading_1.rich_text);
      }
      break;
    case 'heading_2':
      if ('heading_2' in block) {
        return extractRichTextContent(block.heading_2.rich_text);
      }
      break;
    case 'heading_3':
      if ('heading_3' in block) {
        return extractRichTextContent(block.heading_3.rich_text);
      }
      break;
    case 'bulleted_list_item':
      if ('bulleted_list_item' in block) {
        return extractRichTextContent(block.bulleted_list_item.rich_text);
      }
      break;
    case 'numbered_list_item':
      if ('numbered_list_item' in block) {
        return extractRichTextContent(block.numbered_list_item.rich_text);
      }
      break;
    case 'toggle':
      if ('toggle' in block) {
        return extractRichTextContent(block.toggle.rich_text);
      }
      break;
    default:
      return `Unsupported block type: ${block.type}`;
  }
  
  return '';
}

// Sync a single page from Notion to Supabase
export async function syncNotionPageToSupabase(pageId: string, userId: string): Promise<boolean> {
  console.log(`Starting sync for Notion page ${pageId}`);
  
  try {
    // Fetch page from Notion
    const pageResponse = await notion.pages.retrieve({
      page_id: pageId
    }) as PageObjectResponse;
    
    // Extract properties
    const properties: Record<string, any> = {};
    Object.entries(pageResponse.properties).forEach(([key, prop]) => {
      properties[key] = extractPropertyValue(prop);
    });
    
    // Extract essential metadata
    const pageTitle = extractPageTitle(pageResponse.properties);
    const description = properties.Description || null;
    const authorInfo = properties.author && Array.isArray(properties.author) 
      ? properties.author[0] || null 
      : null;
    const createdDate = properties.Date || null;
    
    // Process blocks
    console.log(`Fetching blocks for page ${pageId}`);
    const blocks: ProcessedBlock[] = await processBlocksRecursively(pageId);
    
    // Prepare data for Supabase
    const pageData = {
      notion_page_id: pageId,
      notion_url: pageResponse.url,
      user_id: userId,
      title: pageTitle,
      description,
      author_name: authorInfo?.name || null,
      author_id: authorInfo?.id || null,
      author_avatar_url: authorInfo?.avatar_url || null,
      created_date: createdDate,
      blocks,
      last_synced_at: new Date().toISOString(),
      notion_last_edited_at: pageResponse.last_edited_time,
      updated_at: new Date().toISOString()
    };
    
    // Check if page already exists in Supabase
    const { data: existingPage } = await supabase
      .from('pages')
      .select('id')
      .eq('notion_page_id', pageId)
      .single();
    
    if (existingPage) {
      // Update existing page
      console.log(`Updating existing page ${pageId} in Supabase`);
      const { error } = await supabase
        .from('pages')
        .update(pageData)
        .eq('notion_page_id', pageId);
        
      if (error) throw error;
    } else {
      // Insert new page
      console.log(`Creating new page ${pageId} in Supabase`);
      const { error } = await supabase
        .from('pages')
        .insert(pageData);
        
      if (error) throw error;
    }
    
    console.log(`Successfully synced page ${pageId} to Supabase`);
    return true;
  } catch (error) {
    console.error(`Error syncing page ${pageId}:`, error);
    return false;
  }
}

// Sync all pages from a Notion database to Supabase
export async function syncAllNotionPagesToSupabase(userId: string): Promise<boolean> {
  console.log(`Starting sync of all Notion pages for user ${userId}`);
  
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    
    if (!databaseId) {
      console.error('Notion Database ID is not configured');
      return false;
    }
    
    // Fetch all pages in the database
    const response = await notion.databases.query({
      database_id: databaseId
    });
    
    console.log(`Found ${response.results.length} pages in Notion database`);
    
    // Sync each page
    const syncPromises = response.results.map(page => 
      syncNotionPageToSupabase(page.id, userId)
    );
    
    const results = await Promise.all(syncPromises);
    const successCount = results.filter(Boolean).length;
    
    console.log(`Successfully synced ${successCount} out of ${response.results.length} pages`);
    return successCount > 0;
  } catch (error) {
    console.error('Error syncing all Notion pages:', error);
    return false;
  }
}