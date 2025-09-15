// src/services/confluenceTools.js
import logger from '../logger.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Confluence API base URL
const CONFLUENCE_API_BASE = `https://${process.env.JIRA_HOST}/wiki/rest/api/content`; // Assumes Confluence is on the same host path under /wiki/rest/api

// Helper to get Confluence Auth Header
const getConfluenceAuthHeader = () => {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Atlassian-Token': 'no-check' // Important for some API calls
  };
};

// Helper function to convert a string to a basic ADF paragraph
const toConfluenceAdfParagraph = (text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: String(text || '') }]
});

// Helper function to convert markdown headings to ADF headings (basic)
const toConfluenceAdfHeading = (text, level) => ({
  type: 'heading',
  attrs: { level: level },
  content: [{ type: 'text', text: text.replace(/^#+\s*/, '') || '' }]
});

// Helper function to convert a string to ADF (handles basic markdown for lists/bold)
const textToAdf = (text) => {
  const adfContent = [];
  const lines = text.split('\n');

  lines.forEach(line => {
    if (line.startsWith('### ')) { // H3
      adfContent.push(toConfluenceAdfHeading(line, 3));
    } else if (line.startsWith('## ')) { // H2
      adfContent.push(toConfluenceAdfHeading(line, 2));
    } else if (line.startsWith('# ')) { // H1
      adfContent.push(toConfluenceAdfHeading(line, 1));
    } else if (line.startsWith('- ')) { // Bullet list
      const listItem = {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [toConfluenceAdfParagraph(line.substring(2))]
        }]
      };
      // Merge with previous bullet list if available
      const lastAdfItem = adfContent[adfContent.length - 1];
      if (lastAdfItem && lastAdfItem.type === 'bulletList') {
        lastAdfItem.content.push(listItem.content[0]);
      } else {
        adfContent.push(listItem);
      }
    }
    // Add more markdown conversions (e.g., bold, italic) as needed
    // For simplicity, we'll convert everything else to a paragraph
    else if (line.trim() !== '') {
      adfContent.push(toConfluenceAdfParagraph(line));
    }
  });

  return {
    type: 'doc',
    version: 1,
    content: adfContent
  };
};

// Helper to create a Mermaid macro ADF
const createMermaidMacroAdf = (mermaidCode) => ({
  type: 'bodiedExtension',
  attrs: {
    extensionType: 'com.atlassian.confluence.extra.jira:jira-macro', // Standard macro type
    extensionKey: 'mermaid-macro', // This is often the key for Mermaid macros
    parameters: {}
  },
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: mermaidCode }]
    }
  ]
});

// Helper to create a PlantUML macro ADF
const createPlantUMLMacroAdf = (plantUMLCode) => ({
  type: 'extension',
  attrs: {
    extensionType: 'com.atlassian.confluence.extra.plantuml:plantuml-macro', // Check your specific PlantUML macro key
    extensionKey: 'plantuml-macro',
    parameters: {
      diagram: plantUMLCode,
      // You might need other parameters based on your PlantUML plugin
      // skin: "default",
      // theme: "materia",
    }
  }
});


export const confluenceTools = {
  createPage: {
    name: 'createConfluencePage',
    description: 'Create a new Confluence page with a given title, space key, and content (ADF).',
    parameters: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'The key of the Confluence space (e.g., "SP").' },
        title: { type: 'string', description: 'The title of the new Confluence page.' },
        content: { type: 'string', description: 'The content of the page, can include Markdown text or raw diagram code (Mermaid, PlantUML).' },
        parentPageId: { type: 'string', optional: true, description: 'Optional ID of a parent page to organize the new page.' },
        diagramType: { type: 'string', enum: ['mermaid', 'plantuml', 'none'], default: 'none', description: 'Type of diagram in the content, if any. "mermaid", "plantuml", or "none".' },
      },
      required: ['spaceKey', 'title', 'content'],
    },
    execute: async ({ spaceKey, title, content, parentPageId, diagramType }) => {
      logger.info({ spaceKey, title, parentPageId, diagramType, contentSummary: content.substring(0, 100) }, 'createConfluencePage called');
      try {
        let adfContentBlocks = [];

        // Convert the main text content to ADF
        adfContentBlocks.push(...textToAdf(content).content); // Get content array from textToAdf

        // If a diagram type is specified, add it as a macro
        if (diagramType === 'mermaid' && content.includes('graph')) { // Simple check for Mermaid code
          adfContentBlocks.push(createMermaidMacroAdf(content));
          // Assuming content is ONLY the diagram code for simplicity here,
          // if it's mixed, you'd need to parse it out.
        } else if (diagramType === 'plantuml' && content.includes('@startuml')) { // Simple check for PlantUML code
          adfContentBlocks.push(createPlantUMLMacroAdf(content));
        }


        const pageData = {
          type: 'page',
          title: title,
          space: { key: spaceKey },
          body: {
            atlas_doc_format: { // This is the key for ADF content
              value: JSON.stringify({
                type: 'doc',
                version: 1,
                content: adfContentBlocks
              }),
              representation: 'atlas_doc_format'
            }
          }
        };

        if (parentPageId) {
          pageData.ancestors = [{ id: parentPageId }];
        }

        const response = await axios.post(
          CONFLUENCE_API_BASE,
          pageData,
          { headers: getConfluenceAuthHeader() }
        );

        logger.info({ spaceKey, title, pageId: response.data.id, pageUrl: response.data._links.webui }, 'Confluence page created successfully');
        return { success: true, pageId: response.data.id, pageUrl: response.data._links.webui };
      } catch (error) {
        logger.error({ spaceKey, title, errorMessage: error.message, errorCode: error.response?.status, errorData: error.response?.data }, 'Failed to create Confluence page');
        return { error: `Failed to create Confluence page: ${error.response?.data?.message || error.message}` };
      }
    }
  },

  updatePage: {
    name: 'updateConfluencePage',
    description: 'Update an existing Confluence page with new content (ADF).',
    parameters: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Confluence page to update.' },
        title: { type: 'string', optional: true, description: 'Optional new title for the page.' },
        content: { type: 'string', description: 'The new content of the page, can include Markdown text or raw diagram code (Mermaid, PlantUML).' },
        diagramType: { type: 'string', enum: ['mermaid', 'plantuml', 'none'], default: 'none', description: 'Type of diagram in the content, if any. "mermaid", "plantuml", or "none".' },
      },
      required: ['pageId', 'content'],
    },
    execute: async ({ pageId, title, content, diagramType }) => {
      logger.info({ pageId, title, diagramType, contentSummary: content.substring(0, 100) }, 'updateConfluencePage called');
      try {
        // First, get the current page version
        const getResponse = await axios.get(
          `${CONFLUENCE_API_BASE}/${pageId}?expand=version`,
          { headers: getConfluenceAuthHeader() }
        );
        const currentVersion = getResponse.data.version.number;

        let adfContentBlocks = [];
        adfContentBlocks.push(...textToAdf(content).content);

        // If a diagram type is specified, add it as a macro
        if (diagramType === 'mermaid' && content.includes('graph')) {
          adfContentBlocks.push(createMermaidMacroAdf(content));
        } else if (diagramType === 'plantuml' && content.includes('@startuml')) {
          adfContentBlocks.push(createPlantUMLMacroAdf(content));
        }

        const pageData = {
          version: { number: currentVersion + 1 },
          title: title || getResponse.data.title, // Use new title or old one
          body: {
            atlas_doc_format: {
              value: JSON.stringify({
                type: 'doc',
                version: 1,
                content: adfContentBlocks
              }),
              representation: 'atlas_doc_format'
            }
          }
        };

        const response = await axios.put(
          `${CONFLUENCE_API_BASE}/${pageId}`,
          pageData,
          { headers: getConfluenceAuthHeader() }
        );

        logger.info({ pageId, pageUrl: response.data._links.webui }, 'Confluence page updated successfully');
        return { success: true, pageId: response.data.id, pageUrl: response.data._links.webui };
      } catch (error) {
        logger.error({ pageId, errorMessage: error.message, errorCode: error.response?.status, errorData: error.response?.data }, 'Failed to update Confluence page');
        return { error: `Failed to update Confluence page: ${error.response?.data?.message || error.message}` };
      }
    }
  }
};
