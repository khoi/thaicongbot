# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run cli.ts "prompt" # Run agent with prompt (CLI mode)
bun run bot.ts          # Run Telegram bot
bun run typecheck       # TypeScript type checking
bun run check           # Biome lint/format check
bun run check:fix       # Auto-fix lint/format issues

# Deploy to pi5
rsync -avz --progress . khoi@pi5.local:/home/khoi/thaicongbot/ && ssh khoi@pi5.local 'sudo systemctl restart thaicongbot && sudo systemctl status thaicongbot'
```

## Environment Variables

See `.env.example`: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `RADARR_URL`, `RADARR_API_KEY`, `SONARR_URL`, `SONARR_API_KEY`

## Architecture

AI SDK 6 app (Anthropic provider) with two interfaces:
- **CLI**: `cli.ts` → `agent.ts` - single prompt/response
- **Telegram bot**: `bot.ts` → `agent.ts` - multi-turn with message history per chat

**Core**: `agent.ts` - uses `ToolLoopAgent` with the Anthropic provider and explicit tools for Radarr/Sonarr. Conversation state is a `ModelMessage[]` history.

**Skills**: `.claude/skills/` is kept as reference docs; runtime tools are defined in `agent.ts`.

## Code Style

- Biome: tabs, double quotes
- Prefer self-documented code over comments

## Docuementation

- AI SDK https://ai-sdk.dev/llms.txt
