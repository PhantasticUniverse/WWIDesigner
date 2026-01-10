# Development Guide

This guide covers development practices, TypeScript configuration, and common patterns for contributing to WWIDesigner Web.

## Prerequisites

- **Bun** (v1.0+): Runtime and package manager
- **TypeScript** knowledge: Strict mode with advanced type safety
- **Git**: Version control

## Getting Started

```bash
# Clone and install
git clone <repository>
cd wwi-designer-web
bun install

# Verify setup
bunx tsc --noEmit  # Should show 0 errors
bun test           # Should show 810 tests passing
```

## Project Structure

```
wwi-designer-web/
├── src/
│   ├── core/               # Core acoustic engine
│   │   ├── math/           # Complex, TransferMatrix, StateVector
│   │   ├── physics/        # PhysicalParameters (CIPM-2007)
│   │   ├── geometry/       # Bore, hole, mouthpiece, termination
│   │   ├── modelling/      # Calculator, tuner, playing range
│   │   └── optimization/   # Optimizers, objective functions, evaluators
│   ├── models/             # Data interfaces (Instrument, Tuning)
│   ├── utils/              # XML converter, helpers
│   └── web/                # Server and frontend
├── tests/
│   ├── core/               # Unit tests (mirrors src/core/)
│   ├── parity/             # Java comparison tests
│   ├── web/                # API endpoint tests
│   └── e2e/                # Playwright browser tests (.e2e.ts)
├── docs/                   # Theory and API documentation
└── sample-instruments/     # Test instrument XML files
```

## TypeScript Configuration

The project uses **strict TypeScript** with additional safety checks beyond the standard `strict` flag.

### tsconfig.json Settings

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### What Each Setting Does

| Setting | Effect | Why It Matters |
|---------|--------|----------------|
| `strict` | Enables `strictNullChecks`, `noImplicitAny`, etc. | Catches null/undefined errors |
| `noUncheckedIndexedAccess` | `array[i]` returns `T \| undefined` | Prevents out-of-bounds access |
| `noImplicitOverride` | Requires `override` keyword | Catches accidental overrides |
| `noFallthroughCasesInSwitch` | Requires `break` in switch | Prevents fall-through bugs |

### Common Patterns

#### 1. Array Access

With `noUncheckedIndexedAccess`, array indexing returns `T | undefined`:

```typescript
const items = [1, 2, 3];
const item = items[0];  // Type: number | undefined

// Pattern 1: Non-null assertion (when you know it exists)
const item = items[0]!;  // Type: number

// Pattern 2: Guard check
const item = items[0];
if (item === undefined) {
  throw new Error("Expected item at index 0");
}
// item is now type: number

// Pattern 3: Nullish coalescing
const item = items[0] ?? defaultValue;
```

**When to use non-null assertion (`!`):**
- Inside a loop where `i < array.length` guarantees bounds
- After checking `array.length > 0` for `array[0]`
- When the logic guarantees the value exists

```typescript
// Safe: loop bounds guarantee valid index
for (let i = 0; i < array.length; i++) {
  const value = array[i]!;  // Safe
}

// Safe: find with guaranteed match
const item = array.find(x => x.id === knownId);
if (!item) throw new Error("Item not found");
doSomething(item);  // No assertion needed after check
```

#### 2. Override Methods

When extending a class, use `override`:

```typescript
class SimpleInstrumentTuner extends BaseInstrumentTuner {
  // Must use 'override' keyword
  override predictedFrequency(fingering: Fingering): number {
    return this.playingRange.findResonance(fingering);
  }
}
```

#### 3. Interface Implementation

```typescript
interface IEvaluator {
  calculateErrorVector(fingerings: Fingering[]): number[];
}

// Implementing class
class CentDeviationEvaluator implements IEvaluator {
  calculateErrorVector(fingerings: Fingering[]): number[] {
    return fingerings.map(f => this.calculateDeviation(f));
  }
}
```

#### 4. Mock Objects in Tests

Partial mocks require double assertion:

```typescript
// Mock that only implements some methods
class MockCalculator {
  calcZ(fingering: Fingering): Complex {
    return new Complex(1, 0);
  }
  // Missing: calcReflectionCoefficient, calcGain, etc.
}

// Use double assertion for partial implementation
const calc = new MockCalculator() as unknown as IInstrumentCalculator;
```

#### 5. Type Guards

```typescript
function processValue(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase();  // TypeScript knows it's string
  }
  return value.toFixed(2);  // TypeScript knows it's number
}
```

## Testing

### Unit Tests (bun test)

```bash
# All unit tests
bun test

# Watch mode
bun test --watch

# Specific file
bun test tests/core/optimization/bobyqa-optimizer.test.ts

# Pattern matching
bun test --grep "BOBYQA"

# Specific directory
bun test tests/parity/
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests (headless)
bun run test:e2e

# Run with Playwright UI
bun run test:e2e:ui

# Run in debug mode
bun run test:e2e:debug
```

E2E tests use `.e2e.ts` extension (not `.spec.ts`) to avoid conflicts with `bun test`.

### Test Structure

Tests use `bun:test` framework:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";

describe("ComponentName", () => {
  let instance: ComponentType;

  beforeEach(() => {
    instance = new ComponentType();
  });

  test("should do something", () => {
    expect(instance.method()).toBe(expected);
  });

  test("should handle edge case", () => {
    expect(() => instance.invalidMethod()).toThrow();
  });
});
```

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `tests/core/` | Individual component tests |
| Parity | `tests/parity/` | Java comparison tests |
| Integration | `tests/web/` | API endpoint tests |
| E2E | `tests/e2e/` | Browser-based workflow tests (Playwright) |

## Code Style

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `TransferMatrix` |
| Interfaces | IPascalCase | `IHoleCalculator` |
| Functions | camelCase | `calculateImpedance()` |
| Constants | UPPER_SNAKE | `AIR_GAMMA` |
| Files | kebab-case | `hole-calculator.ts` |

### Import Order

```typescript
// 1. External dependencies
import { describe, test } from "bun:test";

// 2. Internal core modules
import { Complex } from "../math/complex.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";

// 3. Types (with 'type' keyword)
import type { Instrument, Fingering } from "../../models/instrument.ts";
```

### Documentation

```typescript
/**
 * Calculate the transfer matrix for a cylindrical bore section.
 *
 * Uses the wave equation solution for a cylinder with viscothermal losses.
 *
 * @param length - Section length in meters
 * @param radius - Section radius in meters
 * @param k - Wave number (complex for lossy)
 * @param params - Physical parameters (temperature, humidity)
 * @returns 2x2 complex transfer matrix
 */
function calcCylinderMatrix(
  length: number,
  radius: number,
  k: Complex,
  params: PhysicalParameters
): TransferMatrix {
  // Implementation
}
```

## Performance Considerations

### Complex Number Operations

For hot paths (called millions of times during optimization), use in-place operations:

```typescript
// Slow: Creates many intermediate objects
result = a.multiply(b).add(c.multiply(d));

// Fast: Reuses objects
result = a.copy().multiplyInPlace(b).addInPlace(c.copy().multiplyInPlace(d));

// Fastest: Use scratch objects
const scratch = Complex.zero();
result.set(a).multiplyInPlace(b);
scratch.set(c).multiplyInPlace(d);
result.addInPlace(scratch);
```

### TransferMatrix Operations

The `TransferMatrix` class has optimized multiplication:

```typescript
// Use scratch objects for hot paths
const scratch = TransferMatrix.identity();
const result = TransferMatrix.identity();

for (const section of boreSections) {
  const tm = section.calcTransferMatrix(k, params);
  result.multiplyInPlace(tm, scratch);
}
```

## Debugging

### Type Errors

```bash
# Check all type errors
bunx tsc --noEmit

# With verbose output
bunx tsc --noEmit --extendedDiagnostics
```

### Common Type Error Fixes

| Error | Fix |
|-------|-----|
| `Object is possibly 'undefined'` | Add `!` assertion or guard check |
| `This member must have an 'override' modifier` | Add `override` keyword |
| `Type 'X' is not assignable to type 'Y'` | Check interface match or use assertion |
| `Property 'x' does not exist` | Check property name or interface |

### Runtime Debugging

```typescript
// Add debug logging
console.log(`Value: ${value.toFixed(6)}`);
console.log(`Array length: ${array.length}`);
console.log(`Type: ${typeof value}`);

// Use debugger statement
debugger;  // Breakpoint when dev tools open
```

## Contributing

### Before Submitting

1. **Type check**: `bunx tsc --noEmit` (0 errors)
2. **Test**: `bun test` (all passing)
3. **Verify parity**: Run relevant parity tests if changing acoustic code

### Commit Messages

```
<type>: <short description>

<optional body>

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`

### Pull Request Checklist

- [ ] TypeScript compiles with 0 errors
- [ ] All 810+ tests pass
- [ ] New code has tests
- [ ] Documentation updated if needed
- [ ] No console.log statements (except in debug utilities)

## Resources

- [CLAUDE.md](../CLAUDE.md) - Main developer guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
- [JAVA_PARITY.md](./JAVA_PARITY.md) - Java comparison reference
- [OPTIMIZATION.md](./OPTIMIZATION.md) - Algorithm details
