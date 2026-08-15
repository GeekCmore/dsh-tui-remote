---
name: example-skill
description: Use when the user asks what this plugin can do, or wants a demo of the example plugin's behavior.
---

# Example Skill

This is the packaged-skill demo inside the plugin template. In `apply`, the
plugin registers this file through the DSH skill registry
(`ctx.get('skills')?.register(...)`) with `provider: 'example-plugin'` and
`source: 'bundled'` — users never copy SKILL.md files by hand.

Rules from the core guide:

- Frontmatter uses single-line scalar fields only (`name`, `description`).
- Registration is best-effort: duplicate or invalid entries are skipped, a
  skill failure must never take down TUI boot.
- The body below is what the model reads when the skill activates — keep it
  focused and actionable.
