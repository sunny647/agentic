// src/agents/solution.architect.agent.js
import { reasoningModel } from '../llm/models.js'; // Use a more powerful model for complex design
import logger from '../logger.js';
import { z } from "zod";
import { confluenceTools } from '../services/confluenceTools.js'; // Import Confluence tools
import { getPrompt, SolutionDesignOutputSchema } from '../prompts/prompt.manager.js'; // NEW: Import prompt and schema


const structuredSolutionArchitectModel =
  reasoningModel.withStructuredOutput(SolutionDesignOutputSchema, {
    name: "SolutionDesignOutput",
  }).bind({ temperature: 0.2 }); // Keep a slightly higher temperature for creativity in design


export async function solutionArchitectAgent(state) {
  logger.info({ state }, 'solutionArchitectAgent called');
  let validationNotes = [];

  const decompositionTasks = [
    ...(state.decomposition?.feTasks || []),
    ...(state.decomposition?.beTasks || []),
    ...(state.decomposition?.sharedTasks || []),
  ];
  const formattedTasks = decompositionTasks.map(taskObj =>
    `- [${taskObj.type || 'Shared'}] ${taskObj.task}:\n  Solution Approach: ${taskObj.solution}`
  ).join('\n');

  // Get prompt from prompt manager
  const messages = getPrompt('solutionArchitectAgent', state);

  let solutionDesignResult;

  try {
    solutionDesignResult = await structuredSolutionArchitectModel.invoke(messages);
    logger.info({ solutionDesignResult }, 'Solution Architect agent structured output');
  } catch (error) {
    logger.error({ error, messages }, 'Solution Architect model failed to produce structured JSON. Falling back.');
    validationNotes.push(`Solution design generation failed: ${error.message || 'Unknown error'}.`);
    solutionDesignResult = {
      title: `Solution Design for ${state.issueID || state.story || 'New Feature'} (Fallback)`,
      solutionDesign: "Failed to generate detailed solution design. Manual design needed.",
      diagramCode: "",
      diagramType: "none",
      confluenceSpaceKey: process.env.CONFLUENCE_DEFAULT_SPACE_KEY || "SPACE", // Fallback space
      parentPageTitle: undefined,
    };
  }

  // --- Create/Update Confluence Page ---
  let confluencePageUrl = null;
  let confluencePageId = null;
  try {
    // Attempt to find parent page if title is provided
    let parentPageId = null;
    if (solutionDesignResult.parentPageTitle) {
      // You'd need a jiraTools.findConfluencePage or similar to get ID from title
      // For simplicity here, we assume direct parentId if available in state or config
      logger.warn('Automated parent page lookup by title is not implemented. Defaulting to no parent.');
    }

    // Construct full content including diagram
    let fullPageContent = solutionDesignResult.solutionDesign;
    if (solutionDesignResult.diagramCode) {
        fullPageContent += `\n\n--- Diagram ---\n${solutionDesignResult.diagramCode}\n`;
    }

    const pageCreationResult = await confluenceTools.createPage.execute({
      spaceKey: solutionDesignResult.confluenceSpaceKey,
      title: `${solutionDesignResult.title} - ${state.issueID || state.story}`, // Ensure unique title
      content: fullPageContent,
      parentPageId: parentPageId, // Pass resolved parentPageId
      diagramType: solutionDesignResult.diagramType,
    });

    if (pageCreationResult.success) {
      confluencePageUrl = pageCreationResult.pageUrl;
      confluencePageId = pageCreationResult.pageId;
      logger.info({ confluencePageId, confluencePageUrl }, 'Confluence page created successfully.');
      validationNotes.push(`Confluence solution design page created: ${confluencePageUrl}`);

      // Add comment to Jira with Confluence page link
      if (state.issueID) {
        await jiraTools.addComment.execute({
          issueId: state.issueID,
          comment: `Solution Design Confluence Page: ${confluencePageUrl}`,
        });
        logger.info({ issueId: state.issueID, confluencePageUrl }, 'Jira comment added with Confluence page link.');
      }
    } else {
      throw new Error(pageCreationResult.error);
    }

  } catch (err) {
    validationNotes.push(`Confluence page creation failed: ${err.message}`);
    logger.error({ err, issueId: state.issueID }, 'Failed to create Confluence solution design page.');
  }


  const logs = Array.isArray(state.logs) ? state.logs : [];

  const nextState = {
    ...state,
    solutionDesign: { // Store the structured result in state
      ...solutionDesignResult,
      confluencePageUrl,
      confluencePageId,
    },
    logs: [...logs, 'solutionArchitect:done'],
    validationNotes: [...validationNotes, ...(state.validationNotes || [])],
  };
  logger.info({ nextState }, 'solutionArchitectAgent returning state');
  return nextState;
}
