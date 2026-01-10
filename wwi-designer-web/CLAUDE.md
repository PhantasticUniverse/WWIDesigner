# WWIDesigner Web - Developer Guide

## Project Overview

**WWIDesigner Web** is a complete TypeScript/Bun port of the Java WWIDesigner application for designing and optimizing woodwind instruments using acoustic modeling.

### What This Application Does

1. **Predicts Playing Frequencies**: Given an instrument's physical dimensions and a fingering pattern, calculates what note it will play
2. **Optimizes Instrument Design**: Finds optimal hole positions, sizes, bore tapers, and mouthpiece parameters to achieve target tunings
3. **Visualizes Instruments**: Renders cross-section diagrams of bore profiles and tone holes
4. **Compares Designs**: Side-by-side comparison of instrument geometries

### Key Achievement

**All acoustic calculations achieve exact parity with Java WWIDesigner** (verified to 15+ significant digits). The 1.41 cents average tuning deviation for NAF D Minor is identical to Java output.

---

## Project Status: Complete Port

| Component | Status | Notes |
|-----------|--------|-------|
| Acoustic Engine | **100%** | Exact numerical parity |
| Optimization Algorithms | **6/6** | DIRECT, BOBYQA, Brent, CMA-ES, Simplex, Powell |
| Objective Functions | **51/51** | All hole, bore, taper, mouthpiece functions |
| Evaluators | **7/8** | Missing only WhistleEvaluator |
| Tuners | **5/5** | Simple, LinearV, LinearX, BellNotes, base |
| Spectrum Analyzers | **3/3** | Impedance, Reflectance, PlayingRange |
| Tests | **810** | All passing |

### Not Implemented (Low Priority)

- **Study Framework** (NafStudyModel, WhistleStudyModel, etc.): Application workflow patterns - not needed for core functionality
- **WhistleEvaluator**: Requires WhistleCalculator extensions

### Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| **CMA-ES missing eigendecomposition** | Loses covariance adaptation | Open |

**CMA-ES eigendecomposition (not yet implemented):**

The CMA-ES optimizer (`src/core/optimization/cmaes-optimizer.ts` lines 279-283) uses a simplified approach:
- B matrix stays identity (never updated)
- Eigenvalues extracted from diagonal only

This breaks covariance adaptation, the main advantage of CMA-ES over simpler methods. Java uses Apache Commons Math which handles eigendecomposition internally. Fix requires implementing Jacobi algorithm for symmetric matrices.

### Resolved Issues

| Issue | Resolution |
|-------|------------|
| **Complex class object allocation** | ✅ In-place operations added (`multiplyInPlace`, `addInPlace`, etc.) |
| **TransferMatrix memory pressure** | ✅ Scratch objects with in-place operations implemented |
| **TypeScript strict mode errors** | ✅ All 782 errors fixed, zero errors remaining |

**Complex class performance (resolved):**

The `Complex` class now has mutable in-place operations for hot paths:
```typescript
// Immutable (creates intermediate objects):
result = a.multiply(b).add(c.multiply(d));

// Mutable (reuses objects, faster):
result = a.copy().multiplyInPlace(b).addInPlace(c.copy().multiplyInPlace(d));
```

### Real-World Testing Status

While unit tests verify numerical parity with Java, real-world testing with actual instruments is ongoing:

| Instrument Type | Optimization Type | Status | Notes |
|-----------------|-------------------|--------|-------|
| **NAF** | Hole Size | ✅ Tested | Working correctly |
| **NAF** | Hole Position | ⏳ Pending | |
| **NAF** | Hole Groups | ⏳ Pending | |
| **NAF** | Bore/Taper | ⏳ Pending | |
| **NAF** | Fipple Factor | ⏳ Pending | 1D Brent optimizer |
| **NAF** | Beta/Embouchure | ⏳ Pending | |
| **NAF** | Combined (holes + taper) | ⏳ Pending | |
| **NAF** | Hemi-Head | ⏳ Pending | NAF-specific |
| **Whistle** | All | ⏳ Pending | |
| **Flute** | All | ⏳ Pending | |

**Test instrument:** NAF D Minor Cherry (14 fingerings, 6 holes)

---

## Architecture

```
src/
├── core/
│   ├── constants.ts              # Physical & musical constants
│   ├── math/                     # Complex, TransferMatrix, StateVector
│   ├── physics/                  # PhysicalParameters (CIPM-2007 air properties)
│   ├── geometry/                 # Bore, hole, mouthpiece, termination calculators
│   ├── modelling/                # InstrumentCalculator, tuners, playing range
│   └── optimization/             # All optimizers, objective functions, evaluators
├── models/                       # Instrument, Tuning, Constraints interfaces
├── utils/                        # XML converter for legacy files
└── web/
    ├── server.ts                 # Bun.serve API endpoints
    └── frontend.ts               # Web UI (instrument editor, visualization)
```

### Core Acoustic Engine

The **Transfer Matrix Method (TMM)** models sound propagation through the instrument:

```
[P_out]   [T11  T12] [P_in]
[U_out] = [T21  T22] [U_in]
```

Each component (bore section, hole, mouthpiece, termination) has a 2×2 complex transfer matrix. Resonances occur where Im(Z) = 0 at the mouthpiece.

### Instrument Calculator Types

| Type | Factory Function | Use Case |
|------|------------------|----------|
| NAF | `createNAFCalculator()` | Native American Flute (thick-walled, fipple) |
| Whistle | `createWhistleCalculator()` | Tin whistle, penny whistle (thin-walled) |
| Flute | `createFluteCalculator()` | Transverse flute (embouchure hole) |

---

## Optimization System

### Six Algorithms

| Algorithm | Type | Use Case | Optimizer Type |
|-----------|------|----------|----------------|
| **DIRECT** | Global | Broad exploration, escaping local minima | `OptimizerType.DIRECT` |
| **BOBYQA** | Local | Refinement near optimum | `OptimizerType.BOBYQA` |
| **Brent** | Univariate | Single-variable (1D) problems | `OptimizerType.BRENT` |
| **CMA-ES** | Evolutionary | Population-based multivariate | `OptimizerType.CMAES` |
| **Simplex** | Derivative-free | Nelder-Mead method | `OptimizerType.SIMPLEX` |
| **Powell** | Direction-based | Conjugate direction search | `OptimizerType.POWELL` |

### Optimizer Selection

Each objective function specifies its preferred optimizer:
- **1D problems** (FippleFactorObjectiveFunction): Use `BRENT`
- **Multi-dimensional local**: Use `BOBYQA`
- **Global search**: Use `DIRECT` (runs DIRECT → BOBYQA two-stage)

### 51 Objective Functions

Organized by category:

| Category | Examples | Dimensions |
|----------|----------|------------|
| **Holes** | HolePositionObjectiveFunction, HoleSizeObjectiveFunction | N holes |
| **Grouped Holes** | HoleGroupFromTopObjectiveFunction | G groups + N sizes |
| **Bore** | BoreDiameterFromTopObjectiveFunction | P bore points |
| **Taper** | SingleTaperRatioObjectiveFunction | 3-4 |
| **Mouthpiece** | FippleFactorObjectiveFunction (1D), BetaObjectiveFunction | 1 |
| **Combined** | HoleAndTaperObjectiveFunction | 2N + 4 |
| **Global** | GlobalHoleObjectiveFunction | Uses DIRECT |
| **Hemi-Head** | SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction | NAF-specific |

---

## Testing

```bash
bun test                           # Run all 810 tests
bun test --watch                   # Watch mode
bun test tests/parity/             # Java comparison tests only
bun test tests/core/optimization/  # Optimization tests only
```

### Test Categories

| Category | Count | Purpose |
|----------|-------|---------|
| Optimization | 355 | All algorithms and objective functions |
| Parity | 68+ | Java comparison verification |
| BOBYQA | 20 | Convergence and bounds |
| Brent | 24 | Univariate optimization |
| CMA-ES | 16 | Evolutionary optimization |
| Simplex | 18 | Nelder-Mead |
| Powell | 18 | Conjugate direction |
| Multi-start | 15 | Range processors |
| Two-stage | 11 | Evaluator switching |
| Server API | 15 | Web endpoints |

### Parity Verification

NAF D Minor Cherry tuning (14 notes):
- **Average deviation**: 1.41 cents
- **Result**: Identical to Java WWIDesigner

---

## Web Server API

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main web UI |
| `/api/calculate-tuning` | POST | Predict frequencies for fingerings |
| `/api/optimize` | POST | Optimize instrument geometry |
| `/api/sketch` | POST | Get visualization data |
| `/api/constraints/get` | POST | Get constraints for objective function |
| `/api/constraints/parse` | POST | Parse constraints from XML/JSON |
| `/api/constraints/export` | POST | Export constraints to XML/JSON |
| `/api/constraints/objective-functions` | GET | List all 51 objective functions |
| `/api/session` | POST/GET | Session management |

### Example: Optimize Instrument

```json
POST /api/optimize
{
  "instrument": { /* instrument object */ },
  "tuning": { /* tuning object */ },
  "objectiveFunction": "HolePositionObjectiveFunction",
  "temperature": 20,
  "humidity": 45
}
```

Response:
```json
{
  "optimizedInstrument": { /* updated geometry */ },
  "initialError": 45.2,
  "finalError": 2.1,
  "evaluations": 1547,
  "success": true,
  "dimensions": 6,
  "targetNotes": 7,
  "residualRatio": 0.046,
  "elapsedTime": 3.2
}
```

### Security Features

The server includes security hardening for public deployment:

| Feature | Configuration | Default |
|---------|--------------|---------|
| Request size limit | `MAX_REQUEST_SIZE` | 1MB |
| Rate limit (optimize) | Per IP | 5/minute |
| Rate limit (default) | Per IP | 60/minute |
| Session expiry | `SESSION_EXPIRY_MS` | 1 hour |
| Max sessions | `MAX_SESSIONS` | 10,000 |
| Temperature bounds | `TEMPERATURE_MIN/MAX` | -50°C to 60°C |
| Humidity bounds | `HUMIDITY_MIN/MAX` | 0% to 100% |
| Array limits | Bore/holes/fingerings | 100/50/100 max |
| XML parser limits | Size/depth/elements | 1MB/50/10000 |

Configuration in `src/web/server.ts` under `SECURITY_CONFIG`.

### Error Responses

All errors return JSON with `error` message and `code`:

```json
{ "error": "Rate limited", "code": "RATE_LIMITED" }
{ "error": "Missing instrument or tuning", "code": "MISSING_INPUT" }
{ "error": "Invalid temperature range", "code": "INVALID_PARAMS" }
```

Error codes: `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `MISSING_INPUT`, `INVALID_INSTRUMENT`, `INVALID_TUNING`, `INVALID_PARAMS`, `INVALID_OBJECTIVE`, `NOT_FOUND`, `INTERNAL_ERROR`

---

## Running the Application

```bash
# Install dependencies
bun install

# Development server (hot reload)
bun run dev

# Production server
bun run start
```

Server runs at http://localhost:3000

---

## Key Files Reference

### Core Calculation

| File | Purpose |
|------|---------|
| `src/core/physics/physical-parameters.ts` | Air properties (CIPM-2007) |
| `src/core/geometry/tube.ts` | Cylinder/cone transfer matrices |
| `src/core/geometry/bore-section-calculator.ts` | Bore wave propagation |
| `src/core/geometry/hole-calculator.ts` | Tone hole acoustics |
| `src/core/geometry/mouthpiece-calculator.ts` | Fipple/embouchure models |
| `src/core/geometry/termination-calculator.ts` | Radiation impedance |
| `src/core/modelling/instrument-calculator.ts` | Main impedance calculation |
| `src/core/modelling/playing-range.ts` | Resonance finding |
| `src/core/modelling/instrument-tuner.ts` | Tuning prediction |

### Optimization

| File | Purpose |
|------|---------|
| `src/core/optimization/direct-optimizer.ts` | DIRECT global optimizer |
| `src/core/optimization/bobyqa-optimizer.ts` | BOBYQA local optimizer |
| `src/core/optimization/brent-optimizer.ts` | Brent univariate optimizer |
| `src/core/optimization/cmaes-optimizer.ts` | CMA-ES evolutionary optimizer |
| `src/core/optimization/simplex-optimizer.ts` | Nelder-Mead simplex optimizer |
| `src/core/optimization/powell-optimizer.ts` | Powell conjugate direction optimizer |
| `src/core/optimization/hole-position-objective.ts` | All 51 objective functions |
| `src/core/optimization/evaluator.ts` | Error evaluators (Cent, Fmin, Fmax, etc.) |
| `src/core/optimization/objective-function-optimizer.ts` | Optimization orchestration |

### Web Interface

| File | Purpose |
|------|---------|
| `src/web/server.ts` | Bun.serve API endpoints |
| `src/web/frontend.ts` | Instrument/tuning editors, visualization |

---

## Bun Configuration

This project uses Bun exclusively:

```bash
bun install          # Install dependencies (not npm/yarn)
bun test             # Run tests (not jest/vitest)
bun run dev          # Development server
bun <file.ts>        # Execute TypeScript directly
```

### Bun APIs Used

- `Bun.serve()` with `routes` for HTML bundling and `fetch` for API middleware
- `Bun.file()` for file operations
- `bun:test` for testing framework
- Native TypeScript execution (no transpilation step)

---

## TypeScript Configuration

The project uses **strict TypeScript** with additional safety checks:

| Setting | Effect |
|---------|--------|
| `strict: true` | All strict type checks enabled |
| `noUncheckedIndexedAccess: true` | Array access returns `T \| undefined` |
| `noImplicitOverride: true` | Requires `override` keyword on overriding methods |

### Quick Reference

```bash
bunx tsc --noEmit   # Type check (should show 0 errors)
bun test            # Run all 810 tests
```

**Common patterns:**
```typescript
array[i]!                                    // Non-null assertion for bounds-safe access
override methodName() { ... }                // Override base class methods
mockObj as unknown as IInterface             // Double assertion for partial mocks
```

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed TypeScript patterns and examples.

---

## Documentation

Detailed documentation in `docs/`:

### Developer Guides

| Document | Content |
|----------|---------|
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development practices, TypeScript patterns, testing, contributing |
| [JAVA_PARITY.md](docs/JAVA_PARITY.md) | Complete Java class mapping and verification |

### Acoustic Theory

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview and component diagram |
| [TRANSFER-MATRIX-METHOD.md](docs/TRANSFER-MATRIX-METHOD.md) | Core TMM acoustic theory |
| [PHYSICAL-PARAMETERS.md](docs/PHYSICAL-PARAMETERS.md) | Air properties (CIPM-2007) |
| [BORE-SECTIONS.md](docs/BORE-SECTIONS.md) | Cylinder/cone wave propagation |
| [TONE-HOLES.md](docs/TONE-HOLES.md) | Tone hole acoustic model |
| [MOUTHPIECES.md](docs/MOUTHPIECES.md) | Fipple, embouchure, reed models |
| [TERMINATION.md](docs/TERMINATION.md) | Radiation impedance calculations |
| [OPTIMIZATION.md](docs/OPTIMIZATION.md) | All 6 optimization algorithms |

---

## License

Original Java code: Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
TypeScript port: (C) 2026, WWIDesigner Contributors.

GNU General Public License v3.
