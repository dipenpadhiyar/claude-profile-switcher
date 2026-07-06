# Claude Profile Switcher

Switch between multiple Claude Code accounts (e.g. Work / Personal / Client) from
inside VS Code — status bar, command palette, and a keyboard shortcut.

## Why this exists

The official Claude Code VS Code extension only supports one signed-in account
at a time under `~/.claude`, and its chat/sidebar panel does not respect the
`CLAUDE_CONFIG_DIR` environment variable (see
[anthropics/claude-code#30538](https://github.com/anthropics/claude-code/issues/30538)).
This extension works around that by giving each account its own folder
(`~/.claude-work`, `~/.claude-personal`, ...) and repointing `~/.claude` at the
active one via a **directory junction** — no admin rights required on Windows.
It also sets `CLAUDE_CONFIG_DIR` for new integrated terminals, so the `claude`
CLI picks up the right profile too.

## How it works

- Each profile = a folder holding its own `settings.json`, `CLAUDE.md`, MCP
  server config, history, and auth — everything Claude Code normally keeps in
  `~/.claude`. Because the *whole* directory is swapped, per-profile
  `CLAUDE.md` / MCP servers work automatically — nothing extra to configure.
- Profile metadata lives in `~/.claude-profiles/profiles.json` (plain JSON,
  safe to hand-edit).
- Switching a profile re-links `~/.claude` and prompts you to reload the
  window so the sidebar panel picks up the change.

## First run

If you already have an existing `~/.claude`, the extension will ask, once, to
convert it into a profile called "Default" (moves it to `~/.claude-default`
and links `~/.claude` back to it). It will never touch an existing real
`~/.claude` directory without asking first.

## Commands (Ctrl+Shift+P)

| Command | Description |
|---|---|
| Claude Profiles: Switch Profile (`Ctrl+Alt+C`) | Quick pick, then re-links `~/.claude` |
| Claude Profiles: Create Profile | New empty profile folder |
| Claude Profiles: Rename Profile | |
| Claude Profiles: Delete Profile | Removes from the list only; folder stays on disk |
| Claude Profiles: Open Config Folder | Reveals the active profile's folder in Explorer |
| Claude Profiles: Backup Profile / Restore Profile | Timestamped copies under `~/.claude-profiles/backups/` |
| Claude Profiles: Export Profile / Import Profile | Copy a profile folder to/from anywhere |
| Claude Profiles: Edit Workspace Mapping for Current Profile | Path-prefix, glob (`*`), or `git:<remote substring>` matchers |

Click the status bar item (bottom right) to switch profiles.

## Auto-switch by workspace

Set `claudeProfiles.autoSwitch.mode` (Settings) to `prompt` (default),
`silent`, or `off`. When the open folder's path or git remote matches a
profile's workspace matchers, you'll be prompted to switch (or it'll happen
silently in `silent` mode).

## Note on the email/plan shown in tooltips

Claude Code's local credential file format isn't publicly documented, so
email/plan detection is best-effort: it scans a profile's config folder for
plausible fields and clearly labels them "detected, unofficial". If nothing
is found, only the profile name is shown — this is expected and not a bug.

## Developing

```
npm install
npm run compile   # or: npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded (this repo already includes `.vscode/launch.json` and
`tasks.json` for that).

## Packaging

```
npx @vscode/vsce package
```

produces a `.vsix` you can install via "Install from VSIX..." in the
Extensions view.
