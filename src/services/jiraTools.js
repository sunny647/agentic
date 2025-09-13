import logger from '../logger.js';
import JiraClient from 'jira-client';
import axios from 'axios'; // For fetching images
import { extractPlainTextFromAdf } from '../utils/adf-parser.js';


const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_HOST, // e.g. 'your-domain.atlassian.net'
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '3',
  strictSSL: true
});

// Helper function to convert a string to a basic ADF paragraph
const toAdfParagraph = (text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: text || '' }]
});

// Helper function to convert an array of strings to an ADF bullet list
const toAdfBulletList = (items) => ({
  type: 'bulletList',
  content: items.map(item => ({
    type: 'listItem',
    content: [toAdfParagraph(item)]
  }))
});

/**
 * Recursively extracts media references (URLs or Jira attachment filenames from ADF) from a Jira ADF document.
 * This function is robust to various nesting levels and handles both
 * external image URLs and internal Jira attachment filenames.
 * @param {object} adfNode The current ADF JSON node to process.
 * @returns {Array<{adfId?: string, adfType?: string, collection?: string, url?: string, filename?: string}>} An array of media references.
 */
const extractMediaReferencesFromAdf = (adfNode) => { // Renamed function for clarity
  const mediaReferences = [];

  if (!adfNode || typeof adfNode !== 'object') {
    return mediaReferences;
  }

  // Check if the current node itself is a 'media' node
  if (adfNode.type === 'media' && adfNode.attrs) {
    const { id, type, collection, url, alt } = adfNode.attrs;

    if (type === 'file') {
      // This is an internal Jira attachment. We need its 'alt' (filename) for matching.
      // The 'id' here is a UUID for media API, not the attachment ID.
      mediaReferences.push({ adfId: id, adfType: type, collection: collection, filename: alt });
      logger.debug({ adfMediaId: id, adfMediaFilename: alt }, 'Found Jira attachment reference in ADF (by filename)');
    } else if (url) {
      // This is an external media embed, return its direct URL
      mediaReferences.push({ url, adfType: type, filename: alt });
      logger.debug({ adfMediaUrl: url }, 'Found external media URL in ADF');
    }
  }

  // If the current node has a 'content' array, recursively process each child
  if (Array.isArray(adfNode.content)) {
    for (const childNode of adfNode.content) {
      mediaReferences.push(...extractMediaReferencesFromAdf(childNode));
    }
  }

  return mediaReferences;
};


/**
 * Fetches an image from a URL and returns its Base64 representation as a data URI.
 * Handles Jira authentication for attachment URLs.
 * @param {string} url The URL of the image.
 * @param {string} [issueKey] The Jira issue key (for logging context).
 * @returns {Promise<string|null>} Base64 data URI string of the image (e.g., "data:image/png;base64,..."), or null if failed.
 */
export const fetchImageAsBase64 = async (url, issueKey) => { // issueId renamed to issueKey for consistency
  try {
    console.log('Fetching image from URL in fetchImageAsBase64:', url); // Keep this console.log for direct feedback
    const headers = {};
    if (url.includes(process.env.JIRA_HOST) && url.includes('/rest/api/3/attachment/')) {
      const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer', // Get as binary data
      headers: headers,
      timeout: 10000, // 10 seconds timeout
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream'; // Default if not provided
    const base64 = Buffer.from(response.data).toString('base64');
    console.log('Base64 Length:', base64.length);
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.log('Error fetching image:', error);
    logger.error({ url, issueKey, errorMessage: error.message, errorCode: error.response?.status, errorData: error.response?.data?.toString() }, 'Failed to fetch image and convert to Base64');
    return null;
  }
};

export const jiraTools = {
  // Existing createSubTasks tool
  createSubTasks: {
    name: 'createSubTasks',
    description: 'Create multiple Jira sub-tasks under a parent story',
    parameters: {
      type: 'object',
      properties: {
        parentIssueId: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['summary', 'description']
          }
        }
      },
      required: ['parentIssueId', 'tasks']
    },
    execute: async ({ parentIssueId, tasks }) => {
      logger.info({ parentIssueId, tasks }, 'createSubTasks called');
      const results = [];
      let parent, projectKey;
      try {
        parent = await jira.findIssue(parentIssueId);
        logger.info({ parent }, 'Fetched parent issue for createSubTasks');
        projectKey = parent.fields.project.key;
      } catch (err) {
        // Log full error details for debugging
        logger.error({
          parentIssueId,
          errorMessage: err && err.message ? err.message : null,
          errorStack: err && err.stack ? err.stack : null,
          errorResponse: err && err.response ? err.response : null,
          errorRaw: err
        }, 'Failed to fetch parent issue in createSubTasks');
        return { error: `Failed to fetch parent issue: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}` };
      }
      for (const { summary, description } of tasks) {
        logger.info({ summary, description }, 'Creating Jira sub-task');
        try {
              // Convert description to Atlassian Document Format (ADF)
              const adfDescription = {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: description || 'Automated sub-task description' }
                    ]
                  }
                ]
              };
              // Fetch all issue types for the project to get the sub-task type ID
              const subTask = await jira.addNewIssue({
                fields: {
                  project: { key: projectKey },
                  parent: { key: parentIssueId },
                  summary,
                  description: adfDescription,
                  issuetype: { id: '10002' }
                }
              });
          logger.info({ summary, key: subTask.key }, 'Sub-task created');
          results.push({ summary, key: subTask.key });
        } catch (err) {
          logger.error({ summary, error: err.message }, 'Failed to create Jira sub-task');
          results.push({ summary, error: err.message });
        }
      }
      logger.info({ results }, 'createSubTasks finished');
      return results;
    }
  },

  // Existing createSubTask tool (NOTE: Updated with ADF conversion and dynamic issuetype)
  createSubTask: {
    name: 'createSubTask',
    description: 'Create a Jira sub-task under a parent story',
    parameters: {
      type: 'object',
      properties: {
        parentIssueId: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' }
      },
      required: ['parentIssueId', 'summary', 'description']
    },
    execute: async ({ parentIssueId, summary, description }) => {
      logger.info({ parentIssueId, summary, description }, 'createSubTask called');
      let parent, projectKey;
      try {
        parent = await jira.findIssue(parentIssueId);
        logger.info({ parent }, 'Fetched parent issue for createSubTask');
        projectKey = parent.fields.project.key;
      } catch (err) {
        logger.error({ parentIssueId, error: err.message }, 'Failed to fetch parent issue in createSubTask');
        return { error: 'Failed to fetch parent issue: ' + err.message };
      }
      try {
        // Convert description to Atlassian Document Format (ADF)
              const adfDescription = {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: description || 'Automated sub-task description' }
                    ]
                  }
                ]
              };
              
        const subTask = await jira.addNewIssue({
          fields: {
              // Fetch all issue types for the project to get the sub-task type ID
              project: { key: projectKey },
              parent: { key: parentIssueId },
              summary,
              description: adfDescription,
              issuetype: { id: '10002' }
          }
        });
        logger.info({ summary, key: subTask.key }, 'Sub-task created');
        return `Sub-task created: ${subTask.key}`;
      } catch (err) {
        logger.error({ summary, error: err.message }, 'Failed to create Jira sub-task');
        return { error: err.message };
      }
    }
  },

  // NEW TOOL: Generic update for issue fields by ID
  updateIssueFields: {
    name: 'updateIssueFields',
    description: 'Update arbitrary fields of a Jira issue by their IDs or names.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        fields: {
          type: 'object',
          description: 'An object where keys are Jira field IDs (e.g., "customfield_10001") or names, and values are the new field values.',
        }
      },
      required: ['issueId', 'fields']
    },
    execute: async ({ issueId, fields }) => {
      logger.info({ issueId, fields }, 'updateIssueFields called');
      try {
        // You might need to preprocess fields here if any require ADF conversion
        // For custom fields like "text" or "select", simple strings/arrays usually work.
        await jira.updateIssue(issueId, { fields });
        logger.info({ issueId, fields }, 'Jira issue fields updated successfully');
        return { success: true, issueId };
      } catch (err) {
        logger.error({
          issueId, fields,
          errorMessage: err && err.message ? err.message : null,
          errorStack: err && err.stack ? err.stack : null,
          errorResponse: err && err.response ? err.response : null,
          errorRaw: err
        }, 'Failed to update Jira issue fields');
        return { error: `Failed to update Jira issue fields: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}` };
      }
    }
  },

  // NEW: updateStory tool
  updateStory: {
    name: 'updateStory',
    description: 'Update the description and/or acceptance criteria of a Jira story',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        description: { type: 'string', description: 'The main description of the story.' },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'An array of strings, where each string is an acceptance criterion.'
        }
      },
      required: ['issueId'] // description and acceptanceCriteria can be optional for update
    },
    execute: async ({ issueId, description, acceptanceCriteria }) => {
      logger.info({ issueId, description, acceptanceCriteria }, 'updateStory called');
      try {
        const adfContent = [];

        // Add main description if provided
        if (description) {
          adfContent.push(toAdfParagraph(description));
        }

        // Add acceptance criteria if provided
        if (acceptanceCriteria && acceptanceCriteria.length > 0) {
          // Add a heading for acceptance criteria
          adfContent.push({
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Acceptance Criteria:' }]
          });
          adfContent.push(toAdfBulletList(acceptanceCriteria));
        }

        const adfDescription = {
          type: 'doc',
          version: 1,
          content: adfContent
        };

        const updateFields = {
          fields: {
            description: adfDescription
          }
        };

        await jira.updateIssue(issueId, updateFields);
        logger.info({ issueId }, 'Jira story updated successfully');
        return { success: true, issueId };
      } catch (err) {
        logger.error({
          issueId,
          errorMessage: err && err.message ? err.message : null,
          errorStack: err && err.stack ? err.stack : null,
          errorResponse: err && err.response ? err.response : null,
          errorRaw: err
        }, 'Failed to update Jira story');
        return { error: `Failed to update Jira story: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}` };
      }
    }
  },

  // FIX APPLIED HERE: addComment tool now passes the ADF document directly as the comment body
  addComment: {
    name: 'addComment',
    description: 'Add a comment to a Jira issue',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        comment: { type: 'string', description: 'The text content of the comment.' }
      },
      required: ['issueId', 'comment']
    },
    execute: async ({ issueId, comment }) => {
      logger.info({ issueId, comment }, 'addComment called');
      try {
        // Construct the full Atlassian Document Format (ADF) for the comment
        const adfDocument = {
          type: 'doc',
          version: 1,
          content: [toAdfParagraph(comment)] // Use the helper to make a paragraph from the comment string
        };

        // The jira-client's addComment expects the ADF document directly as the second argument (the comment object)
        await jira.addComment(issueId, adfDocument); // THIS IS THE KEY FIX
        
        logger.info({ issueId }, 'Comment added to Jira issue successfully');
        return { success: true, issueId };
      } catch (err) {
        logger.error({
          issueId,
          errorMessage: err && err.message ? err.message : null,
          errorStack: err && err.stack ? err.stack : null,
          errorResponse: err && err.response ? err.response : null,
          errorRaw: err
        }, 'Failed to add comment to Jira issue');
        return { error: `Failed to add comment to Jira issue: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}` };
      }
    }
  },

  // Updated getIssue tool to return a flattened, predictable structure
  getIssue: {
    name: 'getIssue',
    description: 'Get details of a Jira issue, including rich description (ADF) and extracted image URLs.',
    parameters: {
      type: 'object',
      properties: { issueId: { type: 'string' } },
      required: ['issueId']
    },
    execute: async ({ issueId }) => {
      logger.info({ issueId }, 'getIssue called');
      try {
        const issue = await jira.findIssue(issueId);
        logger.info({ issue: { key: issue.key, summary: issue.fields.summary } }, 'Fetched Jira issue (summary)');

        const descriptionAdf = issue.fields.description;
        const adfMediaRefs = extractMediaReferencesFromAdf(descriptionAdf); // Get references from ADF
        
        // --- Correlate ADF media references with actual attachments from issue.fields.attachment ---
        const attachmentsInIssue = issue.fields.attachment || [];
        const finalImageUrls = []; // This will store the actual fetchable URLs {url, filename}

        for (const ref of adfMediaRefs) {
          if (ref.url) { // It's an external URL reference
            finalImageUrls.push({ url: ref.url, filename: ref.filename || ref.url.split('/').pop() });
          } else if (ref.adfType === 'file' && ref.filename) { // It's a Jira attachment reference by filename
            // Find the matching attachment in issue.fields.attachment array using filename
            const matchingAttachment = attachmentsInIssue.find(att =>
                att.filename === ref.filename
            );

            if (matchingAttachment && matchingAttachment.content) {
              finalImageUrls.push({ url: matchingAttachment.content, filename: matchingAttachment.filename });
              logger.debug({ adfFilename: ref.filename, matchingAttId: matchingAttachment.id, contentUrl: matchingAttachment.content }, 'Matched ADF filename to Jira attachment content URL.');
            } else {
              logger.warn({ adfMediaRef: ref, attachmentsInIssue: attachmentsInIssue.map(a => ({ id: a.id, filename: a.filename })), issueId }, 'Could not find a matching attachment content URL for ADF media filename.');
            }
          }
        }

        const storyText = descriptionAdf ? extractPlainTextFromAdf(descriptionAdf, finalImageUrls) : issue.fields.summary;

        logger.info({ issueId, extractedImageUrlsCount: finalImageUrls.length, storyTextLength: storyText.length, hasDescriptionAdf: !!descriptionAdf }, 'Extracted data from Jira description');
        return {
          issueKey: issue.key,
          summary: issue.fields.summary,
          storyText: storyText,
          descriptionAdf: descriptionAdf,
          extractedImageUrls: finalImageUrls, // Now an array of {url, filename} objects
          status: issue.fields.status.name,
          assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        };
      } catch (err) {
        logger.error({ issueId, errorMessage: err.message, errorStack: err.stack, errorResponse: err.response?.data || err.response }, 'Failed to fetch Jira issue or extract images');
        return { error: `Failed to fetch Jira issue or extract images: ${JSON.stringify(err.message || err, Object.getOwnPropertyNames(err))}` };
      }
    }
  },

  // Existing listSubTasks tool
  listSubTasks: {
    name: 'listSubTasks',
    description: 'List all sub-tasks for a parent Jira issue',
    parameters: {
      type: 'object',
      properties: { parentIssueId: { type: 'string' } },
      required: ['parentIssueId']
    },
    execute: async ({ parentIssueId }) => {
      logger.info({ parentIssueId }, 'listSubTasks called');
      const jql = `parent=${parentIssueId}`;
      try {
        const result = await jira.searchJira(jql);
        logger.info({ count: result.issues.length }, 'Fetched sub-tasks');
        return result.issues.map(issue => ({ key: issue.key, summary: issue.fields.summary }));
      } catch (err) {
        logger.error({ parentIssueId, error: err.message }, 'Failed to list Jira sub-tasks');
        return { error: err.message };
      }
    }
  }
};