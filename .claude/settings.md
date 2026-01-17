# Claude Code Hooks Documentation

## Overview

This project uses Claude Code hooks to automate common development tasks and enforce best practices.

## Active Hooks

### 1. Branch Protection (PreToolUse)

**File:** `.claude/hooks/branch-protection.sh`
**Trigger:** Before any Edit or Write operation
**Purpose:** Prevents direct edits to protected branches (main, master)

**Behavior:**
- Checks current git branch
- If on main or master, blocks the edit and returns an error
- Prompts to create a feature branch first

**Bypass:** Create a feature branch before making changes:
```bash
git checkout -b feature/my-changes
```

### 2. Auto Type Check (PostToolUse)

**File:** `.claude/hooks/auto-typecheck.sh`
**Trigger:** After any Edit or Write operation on `.ts` files
**Purpose:** Runs TypeScript compiler to catch type errors immediately

**Behavior:**
- Only runs for `.ts` file changes in `wwi-designer-web/`
- Executes `bunx tsc --noEmit` in the web project directory
- Reports any type errors to the conversation

**Performance:**
- Runs in ~2-3 seconds for full type check
- Only triggers for TypeScript files

### 3. Auto Test (PostToolUse)

**File:** `.claude/hooks/auto-test.sh`
**Trigger:** After any Edit or Write operation on test files
**Purpose:** Automatically runs relevant tests when test files change

**Behavior:**
- Detects `.test.ts` and `.e2e.ts` file changes
- For unit tests: runs `bun test <file>`
- For E2E tests: runs `bun run test:e2e <file>`
- Reports test results to the conversation

## Hook Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [...],   // Run before tool execution
    "PostToolUse": [...]   // Run after tool execution
  }
}
```

### Hook Matchers

- `Edit|Write` - Matches file editing tools
- `Bash` - Matches shell commands
- `*` - Matches all tools

### Environment Variables

Hooks receive these environment variables:
- `$TOOL_INPUT` - JSON input to the tool
- `$TOOL_OUTPUT` - JSON output from the tool (PostToolUse only)

## Customization

### Disabling Hooks Temporarily

To disable hooks for a session, rename or remove `.claude/settings.json` temporarily.

### Adding New Hooks

1. Create a new script in `.claude/hooks/`
2. Make it executable: `chmod +x .claude/hooks/your-hook.sh`
3. Add the hook configuration to `.claude/settings.json`

### Hook Script Guidelines

- Exit code 0: Success (continue execution)
- Exit code 2: Block the operation (PreToolUse only)
- Any stdout goes to the conversation as feedback

## Troubleshooting

### "Permission denied" on hook scripts

```bash
chmod +x .claude/hooks/*.sh
```

### Hooks not running

1. Check `.claude/settings.json` syntax
2. Verify hook scripts exist and are executable
3. Check the matcher pattern matches the tool name

### Type check taking too long

The project has 810 tests and strict TypeScript. Full type check should take 2-3 seconds. If slower:
1. Check for circular dependencies
2. Verify `bun` is installed correctly

## Related Files

- `.claude/settings.json` - Hook configuration
- `.claude/settings.local.json` - Personal permissions (gitignored)
- `.claude/hooks/` - Hook scripts directory
