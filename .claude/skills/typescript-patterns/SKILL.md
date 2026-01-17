# TypeScript Patterns Skill

## Overview

WWIDesigner uses strict TypeScript configuration. This skill documents patterns for working with the codebase.

## TypeScript Configuration

From `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

## Key Patterns

### 1. Array Access (noUncheckedIndexedAccess)

With `noUncheckedIndexedAccess`, array access returns `T | undefined`:

```typescript
const arr = [1, 2, 3];
const value = arr[0];  // Type: number | undefined

// Pattern 1: Non-null assertion (when bounds are guaranteed)
const firstHole = holes[0]!;  // Type: Hole

// Pattern 2: Conditional check
const maybeHole = holes[index];
if (maybeHole) {
    // maybeHole is now type Hole (not undefined)
}

// Pattern 3: Default value
const holeOrDefault = holes[index] ?? defaultHole;
```

**When to use `!` assertion:**
- Loop indices guaranteed to be in bounds
- Array length already checked
- Index from `findIndex()` after checking !== -1

### 2. Override Methods (noImplicitOverride)

Methods overriding base class must use `override` keyword:

```typescript
class NAFCalculator extends InstrumentCalculator {
    // REQUIRED: override keyword
    override calcFrequency(fingering: Fingering): number {
        return super.calcFrequency(fingering);
    }

    // ERROR without override:
    // calcFrequency(fingering: Fingering): number { ... }
}
```

### 3. Mock Objects (Double Assertion)

For partial mocks in tests, use double assertion:

```typescript
// Partial mock - only implements needed methods
const mockCalculator = {
    calcFrequency: jest.fn().mockReturnValue(440),
} as unknown as InstrumentCalculator;

// Full mock with all required properties
const mockInstrument: Instrument = {
    name: 'Test',
    bore: [],
    holes: [],
    // ... all required properties
};
```

### 4. Type Guards

Custom type guards for runtime checks:

```typescript
function isNAFInstrument(inst: Instrument): inst is NAFInstrument {
    return 'fippleFactor' in inst;
}

// Usage
if (isNAFInstrument(instrument)) {
    console.log(instrument.fippleFactor);  // Type-safe
}
```

### 5. Readonly Arrays

Prefer `readonly` for arrays that shouldn't be mutated:

```typescript
interface Tuning {
    readonly notes: readonly Note[];  // Immutable
}

// This prevents accidental mutation:
// tuning.notes.push(newNote);  // ERROR
// tuning.notes[0] = newNote;   // ERROR
```

### 6. Optional Chaining

Use for nested optional properties:

```typescript
const holeSize = instrument.holes[index]?.diameter ?? DEFAULT_SIZE;
const firstNoteFreq = tuning.notes[0]?.targetFrequency;
```

### 7. Discriminated Unions

For variant types:

```typescript
type Result =
    | { success: true; value: number }
    | { success: false; error: string };

function handleResult(result: Result) {
    if (result.success) {
        console.log(result.value);  // Type: number
    } else {
        console.log(result.error);  // Type: string
    }
}
```

### 8. Generic Constraints

For reusable utility functions:

```typescript
function clamp<T extends number>(value: T, min: T, max: T): T {
    return Math.max(min, Math.min(max, value)) as T;
}
```

## Common Patterns by Context

### Iterating with Index

```typescript
// Safe iteration with index access
for (let i = 0; i < array.length; i++) {
    const item = array[i]!;  // Safe: i < length guarantees bounds
    process(item);
}

// Alternative: forEach with index
array.forEach((item, index) => {
    // item is already typed correctly
});
```

### Map/Filter/Reduce

```typescript
// Map preserves array type
const diameters = holes.map(h => h.diameter);  // number[]

// Filter with type guard
const openHoles = holes.filter((h): h is OpenHole => h.isOpen);

// Reduce with initial value types correctly
const sum = values.reduce((acc, val) => acc + val, 0);
```

### Async/Await

```typescript
async function optimize(instrument: Instrument): Promise<OptimizationResult> {
    const result = await optimizer.run(instrument);
    if (!result.success) {
        throw new Error(result.error);
    }
    return result;
}
```

## Type Check Command

```bash
# Run type checker
bunx tsc --noEmit

# Should output nothing (0 errors)
```

## Common Errors and Fixes

### "Object is possibly 'undefined'"

```typescript
// Error:
const freq = tuning.notes[0].frequency;

// Fix 1: Non-null assertion (if certain)
const freq = tuning.notes[0]!.frequency;

// Fix 2: Conditional access
const freq = tuning.notes[0]?.frequency;
```

### "Property 'x' does not exist"

```typescript
// Error:
const value = someObject.x;

// Fix: Add to interface or use type assertion
interface ExtendedType extends BaseType {
    x: number;
}
const value = (someObject as ExtendedType).x;
```

### "Missing override modifier"

```typescript
// Error:
calcFrequency() { ... }

// Fix: Add override
override calcFrequency() { ... }
```

## Documentation

See `wwi-designer-web/docs/DEVELOPMENT.md` for more patterns and examples.
