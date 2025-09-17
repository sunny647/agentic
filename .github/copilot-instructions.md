# Copilot Instructions for Agentic Multi-Agent Codebase

## Big Picture Architecture
- **Multi-agent orchestration** using Node.js, Express, LangChain, and LangGraph. The system automates software delivery from Jira story to estimation, decomposition, coding, testing, and PR.
- **Agents** are modular: `supervisor`, `estimation`, `decomposition`, `coding`, `testing`, and `git`. Each agent is a function in `src/agents/` and receives a shared `state` object.
- **Supervisor agent** coordinates the flow, validates outputs, and decides next steps. See `src/agents/supervisor.agent.js`.
- **Prompts and schemas** are managed centrally in `src/prompts/prompt.manager.js` for structured LLM output (JSON, Zod schemas).
- **External integrations**: OpenAI (via SDK), GitHub (PR/commit), Jira (story context), and optionally LangSmith for tracing.

## Developer Workflows
- **Install**: `npm install` in project root.
- **Environment**: Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`, `GITHUB_*`, `JIRA_*` as needed.
- **Run**: `npm run dev` (development) or `npm start` (production).
- **API Usage**: Main endpoint is `/api/story/run` (see README for example payloads).
- **Testing**: No formal test suite; agents are validated by running the full pipeline and inspecting logs/output.
- **Debugging**: Use `logger.js` for structured logs. Each agent logs its state and decisions.

## Project-Specific Patterns
- **Agent state**: All agents mutate and return a shared `state` object. Always preserve previous logs and decisions.
- **LLM output**: Agents expect strict JSON responses. Use schemas from `prompt.manager.js` for validation.
- **File changes**: Coding agent expects full file content for modifications, not diffs. See `src/agents/coding.agent.js` for required JSON format.
- **Prompts**: Minimal by default; refine for domain-specific needs. Guardrails and structured output are recommended for production.
- **Error handling**: If an agent fails (e.g., LLM output not parseable), log error and return a fallback decision in the state.

## Integration Points
- **GitHub**: PR creation, branch management via `services/githubTools.js`.
- **Jira**: Story context via `services/jiraTools.js`.
- **LangSmith**: Optional tracing/monitoring (see README for link).
- **Frontend**: UI in `public/` (e.g., `story_input.html`, `story_input.js`) for story input and visualization.

## Key Files & Directories
- `src/agents/` — All agent logic (supervisor, coding, decomposition, etc.)
- `src/prompts/prompt.manager.js` — Centralized prompt/schema management
- `src/logger.js` — Logging utility
- `services/` — External integrations (GitHub, Jira)
- `public/` — Frontend assets
- `.env.example` — Environment variable template
- `README.md` — Quickstart, API usage, and workflow overview

## Example: Coding Agent Output Format
```json
{
  "files": {
    "src/example.js": { "action": "modify", "content": "..." },
    "src/newFile.js": { "action": "create", "content": "..." },
    "src/oldFile.js": { "action": "delete" }
  }
}
```

---
