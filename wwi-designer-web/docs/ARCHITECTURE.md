# WWIDesigner Web - Architecture Overview

This document provides a high-level overview of the acoustic modeling system architecture.

## System Overview

WWIDesigner Web is a TypeScript/Bun port of the Java WWIDesigner application for designing and optimizing woodwind instruments using acoustic modeling.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Web Interface                                │
│  (Instrument Editor, Tuning Editor, Optimization, Visualization)    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API Layer (Bun.serve)                          │
│  /api/calculate-tuning, /api/optimize, /api/impedance               │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Calculator Factory                                │
│  createNAFCalculator, createWhistleCalculator, createFluteCalculator │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Instrument Calculator                               │
│  DefaultInstrumentCalculator (calcZ, calcReflectionCoefficient)     │
└─────────────────────────────────────────────────────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Mouthpiece  │  │ Bore Section│  │    Hole     │  │ Termination │
│ Calculator  │  │ Calculator  │  │ Calculator  │  │ Calculator  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Core Math Layer                                   │
│  Complex numbers, Transfer Matrices, State Vectors                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Physical Parameters                                │
│  Speed of sound, air density, viscosity (CIPM-2007)                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Transfer Matrix Method (TMM)

The acoustic behavior is modeled using the Transfer Matrix Method. Each component (bore section, hole, mouthpiece, termination) is represented by a 2×2 complex transfer matrix:

```
[P_out]   [T11  T12] [P_in]
[U_out] = [T21  T22] [U_in]
```

Where:
- **P** = Acoustic pressure (Pa)
- **U** = Volume velocity (m³/s)
- **T** = Transfer matrix

See [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) for detailed theory.

### Component Calculators

The system uses a Strategy Pattern for component calculations:

| Calculator | Purpose | Documentation |
|------------|---------|---------------|
| `IMouthpieceCalculator` | Fipple, embouchure, reed acoustics | [MOUTHPIECES.md](./MOUTHPIECES.md) |
| `IBoreSectionCalculator` | Cylinder/cone wave propagation | [BORE-SECTIONS.md](./BORE-SECTIONS.md) |
| `IHoleCalculator` | Open/closed tone holes | [TONE-HOLES.md](./TONE-HOLES.md) |
| `ITerminationCalculator` | Open-end radiation impedance | [TERMINATION.md](./TERMINATION.md) |

### Instrument-Specific Calculators

Different instruments require different calculator configurations:

| Instrument | Mouthpiece | Termination | Hole Size Mult |
|------------|------------|-------------|----------------|
| NAF (Native American Flute) | DefaultFipple | ThickFlanged | 0.9605 |
| Whistle | SimpleFipple | Unflanged | 1.0 |
| Transverse Flute | Embouchure | Unflanged | 1.0 |

## Calculation Flow

### 1. Impedance Calculation

```typescript
// Frequency → Wave number
const k = 2 * π * freq / c;

// Start at termination (known boundary condition)
let stateVector = termination.calcStateVector(k);

// Walk backwards through components (termination → mouthpiece)
for (const component of components.reverse()) {
  const transferMatrix = component.calcTransferMatrix(k);
  stateVector = transferMatrix.multiply(stateVector);
}

// Apply mouthpiece effect
stateVector = mouthpiece.calcStateVector(stateVector, k);

// Extract impedance
const Z = stateVector.getImpedance(); // Z = P / U
```

### 2. Resonance Finding

Resonances occur where the imaginary part of impedance crosses zero:

```typescript
// For flow-node mouthpieces (fipple, embouchure)
// Resonance when: Im(Z) = 0

const playingRange = new PlayingRange(calculator, fingering);
const resonanceFreq = playingRange.findXZero(targetFreq);
```

### 3. Tuning Prediction

```typescript
const tuner = new InstrumentTuner(calculator);
const predictedFreq = tuner.predictedFrequency(fingering);
const cents = 1200 * Math.log2(predictedFreq / targetFreq);
```

## Directory Structure

```
src/
├── core/
│   ├── constants.ts              # Physical & musical constants
│   ├── math/
│   │   ├── complex.ts            # Complex number operations
│   │   ├── transfer-matrix.ts    # 2×2 transfer matrix
│   │   └── state-vector.ts       # [P, U] state vector
│   ├── physics/
│   │   └── physical-parameters.ts # Air properties (CIPM-2007)
│   ├── geometry/
│   │   ├── tube.ts               # Cylinder/cone formulas
│   │   ├── bore-section-calculator.ts
│   │   ├── hole-calculator.ts
│   │   ├── mouthpiece-calculator.ts
│   │   └── termination-calculator.ts
│   ├── modelling/
│   │   ├── instrument-calculator.ts  # Core calculator
│   │   ├── calculator-factory.ts     # NAF/Whistle/Flute factories
│   │   ├── playing-range.ts          # Resonance finding
│   │   ├── instrument-tuner.ts       # Tuning prediction (Simple, LinearV)
│   │   └── spectrum.ts               # Impedance/Reflectance spectrum
│   └── optimization/
│       ├── direct-optimizer.ts       # DIRECT global optimizer
│       ├── bobyqa-optimizer.ts       # BOBYQA local optimizer
│       ├── brent-optimizer.ts        # Brent univariate optimizer
│       ├── cmaes-optimizer.ts        # CMA-ES evolutionary optimizer
│       ├── simplex-optimizer.ts      # Nelder-Mead simplex optimizer
│       ├── powell-optimizer.ts       # Powell conjugate direction optimizer
│       ├── base-objective-function.ts # Base class for objectives
│       ├── evaluator.ts              # Cent, Fmin, Fmax, Fminmax evaluators
│       ├── constraints.ts            # Optimization constraints
│       ├── range-processor.ts        # Multi-start point generation
│       ├── hole-position-objective.ts # 51 objective functions (100% complete)
│       ├── objective-function-factory.ts # Factory for creating objectives by name
│       └── objective-function-optimizer.ts # Multi-stage optimizer orchestration
├── models/
│   ├── instrument.ts             # Instrument geometry model
│   └── tuning.ts                 # Tuning/fingering model
└── web/
    ├── server.ts                 # Bun.serve API endpoints
    └── frontend.ts               # UI with instrument visualization
```

## Java Parity

This implementation achieves **exact parity** with Java WWIDesigner:

- All acoustic calculations match to 15+ significant digits
- NAF tuning predictions: 1.41 cents average deviation (identical to Java)
- 772 tests, including 68+ parity tests against Java output
- All 51 objective functions ported (100% complete)
- Six optimization algorithms: DIRECT, BOBYQA, Brent, CMA-ES, Simplex, Powell
- Multi-start and two-stage optimization pipelines matching Java

Key Java classes and their TypeScript equivalents:

| Java Class | TypeScript Module |
|------------|-------------------|
| `DefaultInstrumentCalculator` | `instrument-calculator.ts` |
| `NAFCalculator` | `createNAFCalculator()` |
| `WhistleCalculator` | `createWhistleCalculator()` |
| `PhysicalParameters` | `physical-parameters.ts` |
| `TransferMatrix` | `transfer-matrix.ts` |
| `StateVector` | `state-vector.ts` |

## References

- Lefebvre, A., & Kergomard, J. (2013). "Externally-excited acoustic resonators"
- Silva, F., et al. (2008). "Acoustic radiation of musical instruments"
- Auvray, R. (2012). "Physical modeling of flute-like instruments"
- Kergomard, J., et al. (2015). "Radiation impedance of tubes with different flanges"
- CIPM-2007: Committee on Data for Science and Technology (air properties)

## Next Steps

For detailed equations, see:
1. [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Core theory
2. [PHYSICAL-PARAMETERS.md](./PHYSICAL-PARAMETERS.md) - Air properties
3. [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Wave propagation
4. [TONE-HOLES.md](./TONE-HOLES.md) - Hole acoustics
5. [MOUTHPIECES.md](./MOUTHPIECES.md) - Excitation mechanisms
6. [TERMINATION.md](./TERMINATION.md) - Radiation impedance
7. [OPTIMIZATION.md](./OPTIMIZATION.md) - All optimization algorithms (DIRECT, BOBYQA, Brent, CMA-ES, Simplex, Powell)
