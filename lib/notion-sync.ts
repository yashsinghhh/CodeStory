// lib/notion-sync.ts
import { Client } from '@notionhq/client';
import { supabase } from './supabase';
import { cacheUtils } from './redis';
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

// Function to convert blocks to plain text (moved from API route)
function blocksToPlainText(
  blocks: Array<any>, 
  indentLevel: number = 0, 
  numberingStack: number[] = []
): string {
  if (!blocks || blocks.length === 0) return '';
  
  let plainText = '';
  let listCounter = 1;
  let inNumberedList = false;
  let inBulletedList = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const nextBlock = i < blocks.length - 1 ? blocks[i + 1] : null;
    
    // Skip blocks with no content
    if (!block || (!block.content && !block.children)) continue;
    
    // Skip blocks with "Unsupported block type" content
    if (block.content && block.content.startsWith("Unsupported block type:")) {
      if (block.type === 'image') {
        plainText += `[Image: A visual representation related to ${block.alt || 'the topic'}]\n\n`;
      } else if (block.type === 'table') {
        plainText += `[Table: Information organized in tabular format]\n\n`;
      }
      continue;
    }
    
    // Clean up undefined references
    let content = block.content || '';
    content = content.replace(/undefined\.\s*/g, '- ');
    
    // Get indentation based on level
    const indent = '  '.repeat(indentLevel);
    
    // Handle different block types to convert to plain text
    switch (block.type) {
      case 'paragraph':
        if (content.trim()) {
          plainText += `${indent}${content}\n\n`;
        }
        break;
        
      case 'heading_1':
        plainText += `${indent}# ${content}\n\n`;
        break;
        
      case 'heading_2':
        plainText += `${indent}## ${content}\n\n`;
        break;
        
      case 'heading_3':
        plainText += `${indent}### ${content}\n\n`;
        break;
        
      case 'bulleted_list_item':
        // Start a new line if transitioning between list types
        if (!inBulletedList && indentLevel === 0) {
          plainText += '\n';
        }
        
        plainText += `${indent}- ${content}\n`;
        inBulletedList = true;
        inNumberedList = false;
        
        // Process children with increased indentation
        if (block.children && block.children.length > 0) {
          plainText += blocksToPlainText(block.children, indentLevel + 1);
        }
        
        // Add spacing after list if this is the last list item and the next block is not a list
        if (nextBlock && nextBlock.type !== 'bulleted_list_item' && indentLevel === 0) {
          plainText += '\n';
          inBulletedList = false;
        }
        break;
        
      case 'numbered_list_item':
        // Start a new line if transitioning between list types
        if (!inNumberedList && indentLevel === 0) {
          plainText += '\n';
          listCounter = 1;
        }
        
        // Update numbering stack for current level
        if (numberingStack.length <= indentLevel) {
          numberingStack.push(1);
        } else {
          numberingStack[indentLevel] = inNumberedList ? numberingStack[indentLevel] + 1 : 1;
        }
        
        plainText += `${indent}${numberingStack[indentLevel]}. ${content}\n`;
        inNumberedList = true;
        inBulletedList = false;
        
        // Process children with increased indentation
        if (block.children && block.children.length > 0) {
          plainText += blocksToPlainText(block.children, indentLevel + 1, [...numberingStack]);
        }
        
        // Add spacing after list if this is the last list item and the next block is not a list
        if (nextBlock && nextBlock.type !== 'numbered_list_item' && indentLevel === 0) {
          plainText += '\n';
          inNumberedList = false;
        }
        break;
        
      case 'toggle':
        plainText += `${indent}▶ ${content}\n`;
        
        // Process toggle children with increased indentation
        if (block.children && block.children.length > 0) {
          plainText += blocksToPlainText(block.children, indentLevel + 1);
        }
        
        plainText += '\n';
        break;
        
      case 'table':
        plainText += `${indent}[Table: Information organized in tabular format]\n\n`;
        break;
        
      case 'image':
        plainText += `${indent}[Image: A visual representation related to ${block.alt || 'the topic'}]\n\n`;
        break;
        
      default:
        // For unknown block types, just add the content if it exists
        if (content && content.trim()) {
          plainText += `${indent}${content}\n\n`;
        }
    }
  }
  
  return plainText;
}

// Function to assemble a complete document from page metadata and content
function assembleDocument(pageData: any): string {
  if (!pageData) return 'No page data available.';
  
  let document = '';
  
  // Add title
  if (pageData.pageTitle) {
    document += `# ${pageData.pageTitle}\n\n`;
  } else {
    document += `# Notion Document\n\n`;
  }
  
  // Add description
  if (pageData.Description) {
    document += `${pageData.Description}\n\n`;
  }
  
  // Add metadata
  const metadata = [];
  if (pageData.author && pageData.author.length > 0) {
    metadata.push(`Author: ${pageData.author[0].name}`);
  }
  if (pageData.Date) {
    metadata.push(`Date: ${pageData.Date}`);
  }
  
  if (metadata.length > 0) {
    document += `${metadata.join(' | ')}\n\n`;
    document += `---\n\n`;
  }
  
  // Convert blocks to plain text
  if (pageData.blocks && pageData.blocks.length > 0) {
    document += blocksToPlainText(pageData.blocks);
  } else {
    document += 'No content blocks available.';
  }
  
  return document;
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
    
    // Generate plain text version
    const plainTextData = {
      pageTitle,
      Description: description,
      author: authorInfo ? [authorInfo] : [],
      Date: createdDate,
      blocks
    };
    
    const plainText = assembleDocument(plainTextData);
    
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
      plain_text: plainText, // Store the plain text version
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
    
    let success = false;
    
    if (existingPage) {
      // Update existing page
      console.log(`Updating existing page ${pageId} in Supabase`);
      const { error } = await supabase
        .from('pages')
        .update(pageData)
        .eq('notion_page_id', pageId);
        
      if (error) throw error;
      success = true;
    } else {
      // Insert new page
      console.log(`Creating new page ${pageId} in Supabase`);
      const { error } = await supabase
        .from('pages')
        .insert(pageData);
        
      if (error) throw error;
      success = true;
    }
    
    if (success) {
      // Invalidate relevant caches
      await cacheUtils.invalidatePageCache(pageId, userId);
      console.log(`Successfully synced page ${pageId} to Supabase and invalidated cache`);
    }
    
    return success;
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
    
    // Invalidate user's page list cache after bulk sync
    await cacheUtils.invalidateUserCache(userId);
    
    console.log(`Successfully synced ${successCount} out of ${response.results.length} pages and invalidated caches`);
    return successCount > 0;
  } catch (error) {
    console.error('Error syncing all Notion pages:', error);
    return false;
  }
}