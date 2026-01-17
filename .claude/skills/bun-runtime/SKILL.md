# Bun Runtime Skill

## Overview

WWIDesigner uses **Bun** exclusively as its JavaScript runtime. Never use npm, yarn, or Node.js commands.

## Essential Commands

### Installation

```bash
# Install dependencies (NOT npm install)
bun install

# Add a package
bun add <package-name>

# Add dev dependency
bun add -d <package-name>
```

### Running Scripts

```bash
# Development server with hot reload
bun run dev

# Production server
bun run start

# Execute TypeScript directly (no transpilation needed)
bun <file.ts>
```

### Testing

```bash
# Run all unit tests
bun test

# Watch mode
bun test --watch

# Run specific test file
bun test tests/core/optimization/bobyqa.test.ts

# Run tests matching pattern
bun test --test-name-pattern "BOBYQA"

# E2E tests (Playwright)
bun run test:e2e
bun run test:e2e:ui      # With Playwright UI
bun run test:e2e:debug   # Debug mode
```

### Type Checking

```bash
# Run TypeScript compiler (type check only)
bunx tsc --noEmit
```

## Bun APIs Used

### Bun.serve()

HTTP server with route-based bundling:

```typescript
// src/web/server.ts
const server = Bun.serve({
    port: 3000,

    // Static routes with HTML bundling
    routes: {
        '/': 'src/web/index.html',
    },

    // API middleware
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname.startsWith('/api/')) {
            return handleAPI(req);
        }

        return new Response('Not found', { status: 404 });
    },
});
```

### Bun.file()

File operations:

```typescript
// Read file
const file = Bun.file('path/to/file.txt');
const text = await file.text();
const json = await file.json();

// Write file
await Bun.write('output.json', JSON.stringify(data));
```

### bun:test

Testing framework (built-in):

```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

describe('MyComponent', () => {
    beforeEach(() => {
        // Setup
    });

    it('should do something', () => {
        expect(result).toBe(expected);
    });

    it('should handle async', async () => {
        const result = await asyncFunction();
        expect(result).toEqual(expected);
    });
});
```

### Test Matchers

```typescript
expect(value).toBe(exact);           // Strict equality
expect(value).toEqual(deep);         // Deep equality
expect(value).toBeCloseTo(num, 5);   // Float comparison
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toContain(item);
expect(value).toHaveLength(n);
expect(fn).toThrow(Error);
expect(fn).toHaveBeenCalled();
```

### Mocking

```typescript
import { mock, spyOn } from 'bun:test';

// Mock function
const mockFn = mock(() => 42);

// Spy on object method
const spy = spyOn(object, 'method');

// Reset mocks
mockFn.mockReset();
spy.mockRestore();
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "bun run src/web/server.ts",
    "start": "bun run src/web/server.ts",
    "test": "bun test",
    "test:e2e": "bunx playwright test",
    "test:e2e:ui": "bunx playwright test --ui",
    "test:e2e:debug": "bunx playwright test --debug"
  }
}
```

## Key Differences from Node.js

| Node.js | Bun |
|---------|-----|
| `npm install` | `bun install` |
| `npm run test` | `bun test` |
| `npx tsc` | `bunx tsc` |
| `node file.js` | `bun file.ts` |
| `jest` | `bun:test` (built-in) |
| `require()` | Native ESM imports |

## Performance Benefits

1. **Native TypeScript** - No transpilation step
2. **Fast installation** - Binary lockfile, symlinks
3. **Built-in testing** - No separate test runner
4. **Fast bundling** - Native bundler for frontend

## File Extensions

```
.ts      - TypeScript source files
.test.ts - Unit test files (bun test)
.e2e.ts  - E2E test files (Playwright)
```

## Environment

Server runs at http://localhost:3000

Environment variables via `.env`:
```bash
PORT=3000
NODE_ENV=development
```

## Common Issues

### "Module not found"

```bash
# Clear cache and reinstall
rm -rf node_modules bun.lockb
bun install
```

### Test timeout

```typescript
// Increase timeout for slow tests
it('slow test', async () => {
    // test code
}, { timeout: 10000 });  // 10 seconds
```

### Type check errors

```bash
# Full type check
bunx tsc --noEmit

# Should show 0 errors
```
