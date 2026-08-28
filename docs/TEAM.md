# Team

The project owner (client) is external. **You (the user) are the Project Manager.** Claude is the delivery team: five specialist subagents, each defined in `.claude/agents/`, invoked by name for the part of the work they own. There is no separate human dev team — treat each agent's output as you would a specialist's, and route follow-up work back to the same role.

| Agent file | Role | Owns |
|---|---|---|
| `tech-lead.md` | Tech Lead / Full-stack | Architecture, infra/DevOps setup, cross-cutting decisions, code review, unblocking the other four |
| `backend-engineer.md` | Backend Engineer | FastAPI services, database schema/migrations, search indexing, video pipeline integration, admin APIs |
| `frontend-engineer.md` | Frontend Engineer | React app — public search/discovery UI, business dashboard, admin panel, the interactive/motion layer |
| `ui-ux-designer.md` | UI/UX Designer | Wireframes, UI kit, interaction design, design QA of what ships against the design intent |
| `qa-engineer.md` | QA Engineer | Test plans, bug bash, cross-browser/responsive checks, security/RBAC sanity checks before each launch milestone |

## How this works day to day

- You tell Claude (the orchestrator) what needs doing, in plain terms ("get the business profile page designed", "wire up video upload", "check Sprint 3 for bugs"). Claude decides which agent(s) the work belongs to and dispatches it.
- New screens go **designer → frontend engineer**, not straight to frontend — the owner cares about UI/UX quality, so design intent should exist before it's built.
- Anything cross-cutting (schema changes, new infra, a decision that affects both frontend and backend) routes through the **Tech Lead** first.
- Each agent should read `docs/PROJECT_BRIEF.md` and `docs/DEVELOPMENT_PLAN.md` before starting a task — that's the shared source of truth, so you don't need to re-explain project context every time.
- Sprint scope lives in `DEVELOPMENT_PLAN.md`. If a request doesn't fit the current sprint's must-ship list, Claude will flag that rather than silently expanding scope — say the word if you want to pull it forward anyway.
