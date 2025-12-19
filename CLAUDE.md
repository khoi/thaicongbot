# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start "prompt"      # Run agent with prompt (CLI mode)
bun run bot.ts          # Run Telegram bot
bun run typecheck       # TypeScript type checking
bun run check           # Biome lint/format check
bun run check:fix       # Auto-fix lint/format issues
```

## Environment Variables

See `.env.example`: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `RADARR_URL`, `RADARR_API_KEY`

## Architecture

Claude Agent SDK app with two interfaces:
- **CLI**: `index.ts` → `agent.ts` - single prompt/response
- **Telegram bot**: `bot.ts` → `agent.ts` - multi-turn with session persistence per chat

**Core**: `agent.ts` - wraps `query()` from Agent SDK, uses `settingSources: ["project"]` to auto-load skills from `.claude/skills/*/SKILL.md`. Supports session resumption via `sessionId`.

**Skills**: Add new skills as directories in `.claude/skills/` with a `SKILL.md` file containing YAML frontmatter (`name`, `description`) and markdown instructions.

## Code Style

- Biome: tabs, double quotes
- Prefer self-documented code over comments
