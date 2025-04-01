// app/api/notion/plain-text/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getInternalUserId } from '@/lib/user-utils';
import { supabase } from '@/lib/supabase';
import redisClient from '@/lib/redis';

// Function to convert blocks to plain text
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
  
  // Debug information about available fields
  console.log('Available page data fields:', Object.keys(pageData));
  
  // Try multiple possible title fields
  const possibleTitleFields = ['pageTitle', 'Pages', 'Pages ', 'Name', 'Title', 'title'];
  let foundTitle = false;
  
  for (const field of possibleTitleFields) {
    if (pageData[field] && typeof pageData[field] === 'string') {
      document += `# ${pageData[field]}\n\n`;
      console.log(`Found title in field: ${field}`);
      foundTitle = true;
      break;
    }
  }
  
  // If no title was found, add a default one
  if (!foundTitle) {
    document += `# Notion Document\n\n`;
    console.log('No title found, using default');
  }
  
  // Try multiple possible description fields
  const possibleDescFields = ['Description', 'description', 'summary', 'Summary', 'overview', 'Overview'];
  let foundDesc = false;
  
  for (const field of possibleDescFields) {
    if (pageData[field] && typeof pageData[field] === 'string') {
      document += `${pageData[field]}\n\n`;
      console.log(`Found description in field: ${field}`);
      foundDesc = true;
      break;
    }
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

    // Fetch the page data (similar to your existing endpoint)
    console.log(`Fetching page ${pageId} for plain text conversion`);
    
    // First check Redis cache
    const cacheKey = `notion_page_detail:${pageId}`;
    const cachedPage = await redisClient.get(cacheKey);
    let pageData;
    
    if (cachedPage) {
      console.log(`Using cached page data for ${pageId}`);
      pageData = JSON.parse(cachedPage);
    } else {
      // Fetch from Supabase if not in cache
      console.log(`Fetching page ${pageId} from Supabase`);
      const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('notion_page_id', pageId)
        .eq('user_id', internalUserId)
        .single();

      if (error) {
        console.error(`Error fetching page ${pageId}:`, error);
        return NextResponse.json(
          { error: 'Failed to fetch page', details: error.message },
          { status: error.code === 'PGRST116' ? 404 : 500 }
        );
      }

      if (!page) {
        return NextResponse.json(
          { error: 'Page not found' },
          { status: 404 }
        );
      }
      
      // Transform the page data to match your expected format
      // Log the raw page data to see what fields are available
      console.log('Raw page data from Supabase:', 
        JSON.stringify({
          id: page.notion_page_id,
          url: page.notion_url,
          title: page.title,
          properties: page.properties || {},
          description: page.description,
          blocks: Array.isArray(page.blocks) ? `${page.blocks.length} blocks` : typeof page.blocks
        }, null, 2)
      );
      
      // Transform the page data to match your expected format
      pageData = {
        id: page.notion_page_id,
        url: page.notion_url,
        // Include all possible title fields
        pageTitle: page.title,
        title: page.title,
        Pages: page.title,
        'Pages ': page.title,
        // Include all possible description fields
        Description: page.description,
        description: page.description,
        summary: page.description,
        // Author information
        author: page.author_name ? [{
          id: page.author_id || '',
          name: page.author_name,
          avatar_url: page.author_avatar_url
        }] : [],
        // Date information
        Date: page.created_date ? new Date(page.created_date).toLocaleDateString() : '',
        created_date: page.created_date,
        // Blocks and other metadata
        blocks: page.blocks || [],
        last_synced_at: page.last_synced_at,
        notion_last_edited_at: page.notion_last_edited_at,
        // If there are any properties field, include those too
        ...(page.properties || {})
      };
    }

    // Convert blocks to plain text
    const plainTextContent = assembleDocument(pageData);
    
    // Return JSON response with both the original page data and plain text
    return NextResponse.json({
      pageId: pageId,
      pageTitle: pageData.pageTitle || 'Untitled',
      plainText: plainTextContent,
      // Include length information to help assess token usage
      stats: {
        characters: plainTextContent.length,
        words: plainTextContent.split(/\s+/).length,
        approximateTokens: Math.ceil(plainTextContent.length / 4) // Rough estimate
      }
    });
  } catch (error) {
    console.error('Error retrieving or processing page:', error);
    return NextResponse.json(
      { error: 'Failed to process page', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}