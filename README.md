# Agentic Supervisor: Jira Story → Estimation → Tasks → Code → Tests → PR

This is a modular Node.js + Express API using LangChain + LangGraph and the OpenAI SDK to orchestrate a multi-agent flow.

## Quickstart

1. **Clone & install**
```bash
npm install
cp .env.example .env
# fill OPENAI_API_KEY and (optionally) GitHub/Jira vars
```

2. **Run**
```bash
npm run dev
curl -X POST https://agentic-i1ng.onrender.com/api/story/run \
  -H 'Content-Type: application/json' \
  -d '{
    "story": "As a user, I can log in with SSO and see my dashboard.",
    "context": {
      "repo": { "owner": "acme", "name": "shop" },
      "techStack": ["Node", "React"],
      "acceptanceCriteria": [
        "Login via OAuth2",
        "Session persisted",
        "Show personalized dashboard"
      ]
    }
  }'
```

3. **What it does**
- Supervisor orchestrates a linear flow
- Estimation → Decomposition → Coding → Testing → Git PR
- If GitHub vars are missing, it will throw on PR step — comment out `git` node to test earlier steps only.

## Notes
- Prompts are intentionally minimal; refine for your domains.
- For production, replace naive parsers with **structured output** (JSON schemas) and add **guardrails**.
- Extend with RAG by injecting architecture context before `codingAgent`.
- https://sharathmech.atlassian.net
- https://agentic-i1ng.onrender.com
- https://github.com/sunny647/agentic
