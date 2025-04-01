// lib/text-conversion.ts

/**
 * Converts Notion blocks to plain text
 */
export function blocksToPlainText(
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