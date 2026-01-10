# WWIDesigner Web

A TypeScript/Bun port of WWIDesigner, a woodwind instrument design and optimization application using acoustic modeling.

## Overview

WWIDesigner Web calculates the acoustic behavior of wind instruments using the Transfer Matrix Method (TMM). It can:

- Predict playing frequencies for any fingering
- Optimize hole positions and sizes for target tunings
- Compare instrument designs
- Visualize bore profiles and hole placements

**Key Achievement**: All acoustic calculations achieve **exact parity** with the original Java WWIDesigner code (810 tests passing, 1.41 cents average deviation identical to Java).

## Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test

# Start web server
bun run dev
```

The web interface is available at http://localhost:3000

### Security

The server includes rate limiting, input validation, and session management for public deployment. See [CLAUDE.md](CLAUDE.md#security-features) for configuration details.

## Documentation

### Acoustic Theory

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System overview and component diagram |
| [Transfer Matrix Method](docs/TRANSFER-MATRIX-METHOD.md) | Core TMM theory with equations |
| [Physical Parameters](docs/PHYSICAL-PARAMETERS.md) | Air properties (CIPM-2007 formulas) |
| [Bore Sections](docs/BORE-SECTIONS.md) | Cylinder and cone transfer matrices |
| [Tone Holes](docs/TONE-HOLES.md) | Hole acoustic model (Lefebvre-Scavone 2012) |
| [Mouthpieces](docs/MOUTHPIECES.md) | Fipple, embouchure, and reed models |
| [Termination](docs/TERMINATION.md) | Radiation impedance (Silva 2008) |
| [Optimization](docs/OPTIMIZATION.md) | DIRECT, BOBYQA, Brent, CMA-ES, Simplex, Powell algorithms |

### Developer Notes

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Main developer guide, API reference, Bun/TypeScript config |
| [Development Guide](docs/DEVELOPMENT.md) | TypeScript patterns, testing, contributing |
| [Java Parity](docs/JAVA_PARITY.md) | Complete Java class mapping and verification |

### TypeScript

The project uses strict TypeScript with `noUncheckedIndexedAccess` for maximum type safety:

```bash
bunx tsc --noEmit   # Type check (should show 0 errors)
```

## Supported Instrument Types

| Type | Calculator | Description |
|------|------------|-------------|
| NAF | `createNAFCalculator()` | Native American Flute (thick-walled, fipple) |
| Whistle | `createWhistleCalculator()` | Tin whistle, penny whistle (thin-walled) |
| Flute | `createFluteCalculator()` | Transverse flute (embouchure hole) |

## Optimization

The optimizer supports **51 objective functions** and **6 optimization algorithms**:

### Algorithms

| Algorithm | Type | Use Case |
|-----------|------|----------|
| **DIRECT** | Global | Broad search, escaping local minima |
| **BOBYQA** | Local | Refinement near optimum |
| **Brent** | Univariate | Single-variable optimization |
| **CMA-ES** | Evolutionary | Population-based multivariate |
| **Simplex** | Derivative-free | Nelder-Mead method |
| **Powell** | Direction-based | Conjugate direction search |

### Objective Function Categories

| Category | Examples |
|----------|----------|
| **Holes** | Hole position, size, or both |
| **Grouped Holes** | Holes in groups with equal spacing |
| **Single Taper** | Bore taper with various hole grouping |
| **Hemi-Head** | NAF with hemispherical bore head |
| **Bore** | Bore diameter, length, position |
| **Mouthpiece** | Fipple factor, window height, beta |
| **Combined** | Hole + bore combined optimization |

```typescript
import { createObjectiveFunction } from "./core/optimization/index.ts";

// Create any objective function by name
const objective = createObjectiveFunction(
  "FippleFactorObjectiveFunction", // or any of 51 functions
  calculator,
  tuning,
  evaluator
);

// Optimize (uses objective function's default maxEvaluations)
const result = optimizeObjectiveFunction(objective);
console.log(`Error: ${result.initialNorm} → ${result.finalNorm}`);
```

## Usage Example

```typescript
import { loadInstrument, loadTuning } from "./utils/xml-converter.ts";
import { createNAFCalculator } from "./core/modelling/calculator-factory.ts";
import { InstrumentTuner } from "./core/modelling/instrument-tuner.ts";
import { PhysicalParameters } from "./core/physics/physical-parameters.ts";

// Load instrument and tuning
const instrument = loadInstrument("NAF_D_minor.xml");
const tuning = loadTuning("NAF_D_minor_tuning.xml");

// Create calculator and tuner
const params = new PhysicalParameters(72, "F"); // 72F, 45% humidity
const calculator = createNAFCalculator(instrument, params);
const tuner = new InstrumentTuner(calculator);

// Predict frequencies
for (const fingering of tuning.fingering) {
  const predicted = tuner.predictedFrequency(fingering);
  const target = fingering.note.frequency;
  const cents = 1200 * Math.log2(predicted / target);
  console.log(`${fingering.note.name}: ${cents.toFixed(1)} cents`);
}
```

## Project Structure

```
src/
├── core/
│   ├── constants.ts           # Physical and musical constants
│   ├── math/                  # Complex, TransferMatrix, StateVector
│   ├── physics/               # PhysicalParameters (CIPM-2007)
│   ├── geometry/              # Bore, hole, mouthpiece, termination
│   ├── modelling/             # Calculator, tuner, playing range
│   └── optimization/          # DIRECT algorithm, objective functions
├── models/                    # Instrument and tuning data models
├── utils/                     # XML converter for legacy files
└── web/                       # Bun.serve web interface

presets/
└── NAF/                       # Native American Flute presets (67 XML files)
    ├── instruments/           # Starter instruments (various bore sizes)
    ├── tunings/               # Chromatic tunings by key
    ├── constraints/           # Optimization constraints by objective function
    ├── scales/                # Chromatic scale definitions
    ├── temperaments/          # ET and Just Intonation temperaments
    ├── fingerings/            # Standard 6-hole fingering chart
    └── symbols/               # Note symbol systems
```

## Testing

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch

# Run parity tests only
bun test tests/parity/

# Run specific test file
bun test tests/core/physical-parameters.test.ts
```

**Test Summary**: 810 tests, including 68+ parity tests against Java output.

## References

- Lefebvre, A., & Kergomard, J. (2013). "Externally-excited acoustic resonators"
- Silva, F., et al. (2008). "Acoustic radiation of musical instruments"
- Lefebvre, A., & Scavone, G. (2012). "Characterization of woodwind instrument toneholes"
- CIPM-2007: Air property calculations from Committee on Data for Science and Technology
- Jones, D. R., et al. (1993). "DIRECT optimization algorithm"
- Powell, M.J.D. (2009). "BOBYQA algorithm"
- Brent, R.P. (1973). "Algorithms for Minimization without Derivatives"
- Hansen, N. (2016). "The CMA Evolution Strategy"

## License

Original Java code: Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
TypeScript port: (C) 2026, WWIDesigner Contributors.

This program is free software under the GNU General Public License v3.
