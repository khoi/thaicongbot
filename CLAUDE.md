# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start "prompt"      # Run agent with prompt
bun run typecheck       # TypeScript type checking
bun run check           # Biome lint/format check
bun run check:fix       # Auto-fix lint/format issues
```

## Architecture

Claude Agent SDK app that serves customers via skills loaded from `.claude/skills/`.

**Entry point**: `index.ts` - creates agent with `query()`, uses `settingSources: ["project"]` to auto-load skills from `.claude/skills/*/SKILL.md`.

**Skills**: Add new skills as directories in `.claude/skills/` with a `SKILL.md` file containing YAML frontmatter (`name`, `description`) and markdown instructions.

## Code Style

- Biome: tabs, double quotes
- Prefer self-documented code over comments
