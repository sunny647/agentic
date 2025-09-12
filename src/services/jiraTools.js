import logger from '../logger.js';
import JiraClient from 'jira-client';
import axios from 'axios'; // For fetching images

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
 * Recursively extracts image URLs from a Jira ADF document.
 * @param {object} adfContent The ADF JSON content.
 * @returns {string[]} An array of image URLs.
 */
const extractImageUrlsFromAdf = (adfContent) => {
  const imageUrls = [];

  if (!adfContent || typeof adfContent !== 'object') {
    return imageUrls;
  }

  // Check if the current node is a media node with a URL
  // This handles both inline Jira attachments and external media
  if (adfContent.type === 'media' && adfContent.attrs && adfContent.attrs.url) {
    imageUrls.push(adfContent.attrs.url);
  }

  // Recursively search in 'content' array if present
  if (Array.isArray(adfContent.content)) {
    for (const node of adfContent.content) {
      imageUrls.push(...extractImageUrlsFromAdf(node));
    }
  }

  return imageUrls;
};

/**
 * Fetches an image from a URL and returns its Base64 representation as a data URI.
 * Handles Jira authentication for attachment URLs.
 * @param {string} url The URL of the image.
 * @param {string} [issueId] The Jira issue ID (needed for auth headers if it's an attachment URL).
 * @returns {Promise<string|null>} Base64 data URI string of the image (e.g., "data:image/png;base64,..."), or null if failed.
 */
const fetchImageAsBase64 = async (url, issueId) => {
  try {
    const headers = {};
    // Check if it's a Jira internal attachment URL that might require authentication
    // Assuming Jira attachment URLs contain process.env.JIRA_HOST and specific paths
    if (url.includes(process.env.JIRA_HOST) && (url.includes('/rest/api/3/attachment/') || url.includes('/secure/thumbnail/'))) {
      const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer', // Get as binary data
      headers: headers,
      // You might need to add a timeout
      timeout: 10000, // 10 seconds timeout
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream'; // Default if not provided
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error({ url, issueId, errorMessage: error.message, errorCode: error.response?.status }, 'Failed to fetch image and convert to Base64');
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

  // Existing getIssue tool
  getIssue: {
    name: 'getIssue',
    description: 'Get details of a Jira issue',
    parameters: {
      type: 'object',
      properties: { issueId: { type: 'string' } },
      required: ['issueId']
    },
    execute: async ({ issueId }) => {
      logger.info({ issueId }, 'getIssue called');
      try {
        const issue = await jira.findIssue(issueId);
        logger.info({ issue }, 'Fetched Jira issue');
        return issue;
      } catch (err) {
        logger.error({ issueId, error: err.message }, 'Failed to fetch Jira issue');
        return { error: err.message };
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