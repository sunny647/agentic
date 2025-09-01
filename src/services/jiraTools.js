
import logger from '../logger.js';
import JiraClient from 'jira-client';


const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_HOST, // e.g. 'your-domain.atlassian.net'
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '3',
  strictSSL: true
});

export const jiraTools = {
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
                      { type: 'text', text: description || '' }
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
        const subTask = await jira.addNewIssue({
          fields: {
              // Fetch all issue types for the project to get the sub-task type ID
              project: { key: projectKey },
              parent: { key: parentIssueId },
              summary,
              description,
              issuetype: (() => {
                // This is a synchronous block for single sub-task creation
                // Ideally, cache this if called repeatedly
                return jira.getProject(projectKey)
                  .then(projectMeta => {
                    const subTaskType = (projectMeta.issueTypes || []).find(type => type.subtask || type.name.toLowerCase().includes('sub-task'));
                    if (!subTaskType) throw new Error('Sub-task issue type not found for project: ' + projectKey);
                    return { id: subTaskType.id };
                  });
              })()
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
