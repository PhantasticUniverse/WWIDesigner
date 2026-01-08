# WWIDesigner to Bun/Web Migration Plan

## Executive Summary

This document outlines the migration strategy for porting WWIDesigner (Woodwind Instrument Designer) from a Java Swing desktop application to a modern web application using Bun as the runtime and build system.

**Current State:** Java 8 desktop application with JIDE GUI framework
**Target State:** TypeScript/Bun web application with modern UI framework

---

## Project Overview

### What WWIDesigner Does
- Designs and optimizes woodwind instruments (flutes, recorders, NAF, saxophones)
- Uses acoustic modeling via transfer matrix method
- Performs multi-variable optimization to achieve target tuning
- Calculates instrument dimensions for optimum tuning accuracy

### Current Tech Stack
- **Language:** Java 8 (264 source files, 62 test files)
- **Build:** Eclipse IDE (no Maven/Gradle)
- **GUI:** JIDE Soft commercial framework
- **Math:** Apache Commons Math 3.6.1
- **Data:** XML with JAXB binding (3 XSD schemas)
- **Optimization:** Custom DIRECT algorithm implementation

### Target Tech Stack
- **Runtime:** Bun
- **Language:** TypeScript (strict mode)
- **Build:** Bun's native bundler
- **Frontend:** React with modern component library
- **Math:** Custom port + math.js for complex numbers
- **Data:** JSON with TypeScript interfaces + Zod validation
- **State:** Zustand or Redux Toolkit
- **Visualization:** D3.js or Plotly for acoustic charts

---

## Migration Phases

### Phase 1: Foundation & Data Models
**Estimated Complexity:** Medium
**Dependencies:** None

#### 1.1 Project Setup
- [ ] Initialize Bun project with TypeScript
- [ ] Configure strict TypeScript settings
- [ ] Set up ESLint + Prettier
- [ ] Configure Vitest for testing
- [ ] Set up project structure

```
wwi-designer-web/
├── src/
│   ├── core/           # Core calculation engine
│   │   ├── math/       # Transfer matrix, complex numbers
│   │   ├── modelling/  # Acoustic calculators
│   │   ├── optimization/ # DIRECT algorithm, objectives
│   │   └── geometry/   # Instrument geometry calculations
│   ├── models/         # Data models & validation
│   │   ├── instrument.ts
│   │   ├── tuning.ts
│   │   └── constraints.ts
│   ├── services/       # Business logic services
│   ├── components/     # React UI components
│   ├── hooks/          # React hooks
│   ├── store/          # State management
│   └── utils/          # Utilities
├── tests/              # Test files mirroring src structure
├── data/               # Sample instruments, tunings
└── docs/               # Documentation
```

#### 1.2 Data Models (Port from Java)

**Source Files to Port:**
| Java Source | TypeScript Target | Priority |
|-------------|-------------------|----------|
| `geometry/Instrument.java` | `models/instrument.ts` | P0 |
| `geometry/BorePoint.java` | `models/instrument.ts` | P0 |
| `geometry/Hole.java` | `models/instrument.ts` | P0 |
| `geometry/Mouthpiece.java` | `models/instrument.ts` | P0 |
| `geometry/Termination.java` | `models/instrument.ts` | P0 |
| `note/Tuning.java` | `models/tuning.ts` | P0 |
| `note/Fingering.java` | `models/tuning.ts` | P0 |
| `note/Note.java` | `models/tuning.ts` | P0 |
| `optimization/Constraints.java` | `models/constraints.ts` | P0 |
| `note/Temperament.java` | `models/temperament.ts` | P1 |
| `note/Scale.java` | `models/scale.ts` | P1 |

**Key Considerations:**
- Convert XML schemas to JSON Schema / Zod schemas
- Preserve all field names and types exactly
- Create migration utilities for existing XML files → JSON
- Add runtime validation with Zod

#### 1.3 Physical Constants

**Source:** `util/Constants.java`

Port all physical constants with exact values:
- Speed of sound calculations
- Air density at temperature
- Viscosity coefficients
- Standard temperature/pressure

```typescript
// src/core/constants.ts
export const Constants = {
  SPEED_OF_SOUND_AT_0C: 331.3, // m/s
  TEMP_COEFFICIENT: 0.6, // m/s per degree C
  AIR_DENSITY_AT_20C: 1.2041, // kg/m³
  // ... etc
} as const;
```

---

### Phase 2: Math & Transfer Matrix Engine
**Estimated Complexity:** High (Critical for accuracy)
**Dependencies:** Phase 1

This is the most critical phase - the acoustic calculations must be **exact** to preserve instrument design accuracy.

#### 2.1 Complex Number Operations

**Source:** Various files using `org.apache.commons.math3.complex.Complex`

Options:
1. Use `mathjs` library (recommended for accuracy)
2. Use `complex.js` library
3. Custom implementation

```typescript
// src/core/math/complex.ts
import { Complex, complex, add, multiply, divide, exp, sqrt } from 'mathjs';

// Wrapper for consistent API
export class ComplexNumber {
  constructor(public re: number, public im: number) {}

  add(other: ComplexNumber): ComplexNumber { ... }
  multiply(other: ComplexNumber): ComplexNumber { ... }
  divide(other: ComplexNumber): ComplexNumber { ... }
  exp(): ComplexNumber { ... }
  sqrt(): ComplexNumber { ... }
  abs(): number { ... }
  arg(): number { ... }
  conjugate(): ComplexNumber { ... }
}
```

#### 2.2 Transfer Matrix Implementation

**Source:** `math/TransferMatrix.java`

This is the core of the acoustic model - a 2x2 complex matrix representing acoustic transmission.

```typescript
// src/core/math/transfer-matrix.ts
export class TransferMatrix {
  // 2x2 complex matrix: [[P_p, P_u], [U_p, U_u]]
  private matrix: [[ComplexNumber, ComplexNumber], [ComplexNumber, ComplexNumber]];

  constructor() {
    // Initialize as identity matrix
  }

  // Critical operations:
  multiply(other: TransferMatrix): TransferMatrix { ... }
  inverse(): TransferMatrix { ... }
  determinant(): ComplexNumber { ... }

  // Acoustic operations:
  getImpedance(): ComplexNumber { ... }
  getReflectance(): ComplexNumber { ... }
}
```

**CRITICAL:** Must port exact formulas from:
- `TransferMatrix.java` - Matrix operations
- `StateVector.java` - Pressure/velocity state

#### 2.3 State Vector

**Source:** `math/StateVector.java`

```typescript
// src/core/math/state-vector.ts
export class StateVector {
  constructor(
    public pressure: ComplexNumber,    // Acoustic pressure
    public volumeFlow: ComplexNumber   // Volume velocity
  ) {}

  applyTransferMatrix(tm: TransferMatrix): StateVector { ... }
}
```

---

### Phase 3: Geometry Calculators
**Estimated Complexity:** High
**Dependencies:** Phase 2

#### 3.1 Bore Section Calculator

**Source:** `geometry/calculation/BoreSectionCalculator.java`

Calculates acoustic properties of cylindrical and conical bore segments.

Key methods to port:
- `calcTransferMatrix(freq, boreSection)` - Transfer matrix for a bore segment
- Handles cylindrical sections (parallel walls)
- Handles conical sections (tapered walls)
- Accounts for viscous and thermal losses

#### 3.2 Hole Calculator

**Source:** `geometry/calculation/HoleCalculator.java` and subclasses

Multiple hole models:
- `SimpleHoleCalculator` - Basic tone hole
- `WhistleHoleCalculator` - Whistle/recorder holes
- `KeyedHoleCalculator` - Holes with pad mechanisms

Key formulas:
- Hole impedance (shunt admittance)
- Radiation impedance
- End correction factors

#### 3.3 Mouthpiece Calculators

**Sources:**
- `geometry/calculation/FluteMouthpieceCalculator.java`
- `geometry/calculation/SimpleFippleMouthpieceCalculator.java`
- `geometry/calculation/WhistleFippleMouthpieceCalculator.java`
- `geometry/calculation/SimpleReedMouthpieceCalculator.java`

Each type has specific acoustic model:
- Embouchure hole (transverse flute) - Helmholtz resonator model
- Fipple (recorder, NAF) - Edge tone + resonator
- Single/double reed - Mass-spring-damper model

#### 3.4 Termination Calculators

**Sources:**
- `geometry/calculation/IdealOpenEndCalculator.java`
- `geometry/calculation/UnflangedEndCalculator.java`
- `geometry/calculation/ThickFlangedOpenEndCalculator.java`

End correction formulas for different termination types.

---

### Phase 4: Instrument Calculators & Tuners
**Estimated Complexity:** High
**Dependencies:** Phase 3

#### 4.1 Default Instrument Calculator

**Source:** `modelling/DefaultInstrumentCalculator.java`

Main acoustic calculator that:
1. Chains transfer matrices from all components
2. Calculates impedance spectrum
3. Finds resonance frequencies
4. Computes playing frequency for each fingering

#### 4.2 Specialized Calculators

**Sources:**
- `modelling/FluteCalculator.java`
- `modelling/NAFCalculator.java`
- `modelling/WhistleCalculator.java`

Each extends base calculator with instrument-specific behavior.

#### 4.3 Instrument Tuner

**Source:** `modelling/InstrumentTuner.java`

Iterative algorithm to find playing frequency:
1. Start with target frequency
2. Calculate impedance
3. Find zero-crossing of imaginary part
4. Iterate until convergence

#### 4.4 Evaluators

**Sources:** `modelling/*Evaluator.java`

- `CentDeviationEvaluator` - Measures tuning error in cents
- `FminmaxEvaluator` - Min/max frequency evaluation
- `ReflectionEvaluator` - Reflection coefficient
- `ReactanceEvaluator` - Reactance calculation

---

### Phase 5: Optimization Engine
**Estimated Complexity:** Very High
**Dependencies:** Phase 4

#### 5.1 DIRECT Algorithm

**Source:** `math/DIRECTOptimizer.java` (and variants)

Port the DIRECT (Dividing Rectangles) global optimization algorithm.

This is a sophisticated algorithm - must be ported carefully:
- `DIRECTOptimizer.java` - Main implementation
- `DIRECT_L_Optimizer.java` - Locally-biased variant
- `DIRECT1Optimizer.java` - Alternative implementation
- `DIRECTCOptimizer.java` - Constrained version

```typescript
// src/core/optimization/direct-optimizer.ts
export class DIRECTOptimizer {
  constructor(options: DIRECTOptions) { ... }

  optimize(
    objectiveFunction: ObjectiveFunction,
    bounds: Bounds[],
    maxEvaluations: number
  ): OptimizationResult { ... }
}
```

#### 5.2 Base Objective Function

**Source:** `optimization/BaseObjectiveFunction.java`

Abstract base class for all optimization objectives.

```typescript
// src/core/optimization/base-objective-function.ts
export abstract class BaseObjectiveFunction {
  protected instrument: Instrument;
  protected tuning: Tuning;
  protected calculator: InstrumentCalculator;
  protected evaluator: Evaluator;

  abstract getGeometryPoint(): number[];
  abstract setGeometryPoint(point: number[]): void;
  abstract value(point: number[]): number;

  getConstraints(): Constraints { ... }
  setConstraints(constraints: Constraints): void { ... }
}
```

#### 5.3 Objective Function Implementations

**50+ objective functions to port** - prioritize by usage:

**P0 - Core Functions:**
| Java Source | Description |
|-------------|-------------|
| `HolePositionObjectiveFunction` | Optimize hole positions |
| `HoleSizeObjectiveFunction` | Optimize hole diameters |
| `BorePositionObjectiveFunction` | Optimize bore profile |
| `SingleTaperSimpleRatioHoleGroupObjectiveFunction` | Common optimization |

**P1 - NAF/Flute Specific:**
| Java Source | Description |
|-------------|-------------|
| `NafStudyModel` related functions | NAF-specific objectives |
| `FluteStudyModel` related functions | Flute-specific objectives |

**P2 - Advanced Functions:**
- Fipple factor optimization
- Multi-segment bore optimization
- Combined hole/bore optimization

#### 5.4 Multi-Start Optimization

**Sources:**
- `optimization/multistart/GridRangeProcessor.java`
- `optimization/multistart/RandomRangeProcessor.java`

Implements multi-start strategies to avoid local minima.

---

### Phase 6: Web UI Development
**Estimated Complexity:** High
**Dependencies:** Phase 4 (can start in parallel with Phase 5)

#### 6.1 Technology Choices

**Recommended Stack:**
- **Framework:** React 18+ with TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **State:** Zustand (simpler) or Redux Toolkit (more features)
- **Charts:** Plotly.js or Recharts for acoustic visualizations
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router or TanStack Router

#### 6.2 Core UI Components

**Instrument Editor:**
- Bore profile editor (visual + table)
- Hole editor (position, diameter, height)
- Mouthpiece parameter editor
- Termination selector

**Tuning Editor:**
- Fingering pattern grid
- Note/frequency input
- Scale/temperament selector
- Import from standard formats

**Optimization Panel:**
- Objective function selector
- Constraint editor
- Progress visualization
- Results comparison

**Visualization:**
- Instrument cross-section diagram
- Impedance spectrum chart
- Tuning deviation chart
- Frequency response plot

#### 6.3 UI Component Mapping

| JIDE Component | Web Replacement |
|----------------|-----------------|
| DataView/DataModel | React components + hooks |
| JideTable | AG Grid or TanStack Table |
| JideChart | Plotly.js or D3.js |
| DockableFrame | Resizable panels (react-resizable-panels) |
| PropertyPane | Form components |
| FileChooser | File input + drag-drop |

---

### Phase 7: Testing & Validation
**Estimated Complexity:** Medium
**Dependencies:** All phases

#### 7.1 Unit Tests

Port all 62 Java test files to Vitest:
- Math operations (transfer matrix, complex numbers)
- Geometry calculations
- Optimization convergence
- Model validation

#### 7.2 Integration Tests

- End-to-end optimization workflows
- File import/export
- UI interactions

#### 7.3 Validation Against Java Version

**CRITICAL:** The web version must produce **identical results** to the Java version.

Validation strategy:
1. Create test fixtures from Java version
2. Run same inputs through TypeScript version
3. Compare outputs with tolerance (1e-10 for calculations)
4. Document any intentional differences

```typescript
// tests/validation/java-parity.test.ts
describe('Java Parity Tests', () => {
  test('impedance calculation matches Java', () => {
    const instrument = loadFixture('test-flute.json');
    const result = calculator.calculateImpedance(instrument, 440);
    expect(result.re).toBeCloseTo(javaResult.re, 10);
    expect(result.im).toBeCloseTo(javaResult.im, 10);
  });
});
```

---

### Phase 8: Data Migration & Compatibility
**Estimated Complexity:** Medium
**Dependencies:** Phase 1

#### 8.1 XML to JSON Converter

Create tooling to convert existing XML instrument files to JSON:

```typescript
// tools/xml-to-json-converter.ts
export function convertInstrumentXML(xml: string): Instrument { ... }
export function convertTuningXML(xml: string): Tuning { ... }
export function convertConstraintsXML(xml: string): Constraints { ... }
```

#### 8.2 Sample Data Migration

Convert all sample files in `/releases/`:
- FluteStudy instruments and tunings
- NafStudy instruments and tunings
- WhistleStudy instruments and tunings
- ReedStudy instruments and tunings

#### 8.3 Backward Compatibility

- Support importing original XML format
- Export to JSON (primary) and XML (legacy)

---

### Phase 9: Deployment & Infrastructure
**Estimated Complexity:** Low-Medium
**Dependencies:** Phase 6, 7

#### 9.1 Build Configuration

```typescript
// bunfig.toml
[build]
target = "browser"
minify = true
sourcemap = true

[serve]
port = 3000
```

#### 9.2 Deployment Options

**Option A: Static Site (Recommended for Start)**
- Vercel, Netlify, or GitHub Pages
- All computation client-side
- No backend needed initially

**Option B: With Backend (For Heavy Optimization)**
- Bun server for compute-intensive operations
- WebSocket for progress updates
- Consider Web Workers for client-side parallelism

#### 9.3 Progressive Enhancement

1. Start with client-side only
2. Add Web Workers for optimization (non-blocking UI)
3. Optional: Add backend for shared instrument library

---

## Risk Assessment

### High Risk Items

1. **Numerical Precision**
   - Risk: JavaScript floating-point may differ from Java
   - Mitigation: Use BigDecimal.js for critical calculations, extensive testing

2. **DIRECT Algorithm Port**
   - Risk: Complex algorithm with subtle edge cases
   - Mitigation: Line-by-line port with comprehensive test coverage

3. **Performance**
   - Risk: Optimization may be slower in JS than Java
   - Mitigation: Web Workers, WASM for hot paths if needed

### Medium Risk Items

4. **Complex Number Library**
   - Risk: Different implementations may have different precision
   - Mitigation: Standardize on mathjs, validate thoroughly

5. **UI Complexity**
   - Risk: JIDE provides many features that need recreation
   - Mitigation: Phased UI development, MVP first

### Low Risk Items

6. **Data Model Port**
   - Risk: Low - straightforward type conversion

7. **Sample Data Migration**
   - Risk: Low - automated conversion

---

## Success Criteria

### Functional Requirements
- [ ] All instrument types supported (flute, NAF, whistle, reed)
- [ ] All optimization objectives functional
- [ ] Import existing XML instrument files
- [ ] Export to JSON and XML formats
- [ ] Visualization of acoustic properties

### Non-Functional Requirements
- [ ] Calculation results within 0.001% of Java version
- [ ] Optimization completes within 2x time of Java version
- [ ] Mobile-responsive UI
- [ ] Works offline (PWA)
- [ ] Accessible (WCAG 2.1 AA)

---

## Appendix A: File Mapping

### Priority 0 (Must Port First)

| Java File | TypeScript File | LOC Est. |
|-----------|-----------------|----------|
| `math/TransferMatrix.java` | `core/math/transfer-matrix.ts` | 200 |
| `math/StateVector.java` | `core/math/state-vector.ts` | 50 |
| `geometry/Instrument.java` | `models/instrument.ts` | 150 |
| `geometry/BorePoint.java` | `models/instrument.ts` | 30 |
| `geometry/Hole.java` | `models/instrument.ts` | 80 |
| `geometry/Mouthpiece.java` | `models/instrument.ts` | 100 |
| `note/Tuning.java` | `models/tuning.ts` | 100 |
| `note/Fingering.java` | `models/tuning.ts` | 80 |
| `util/Constants.java` | `core/constants.ts` | 50 |

### Priority 1 (Core Functionality)

| Java File | TypeScript File | LOC Est. |
|-----------|-----------------|----------|
| `geometry/calculation/BoreSectionCalculator.java` | `core/geometry/bore-calculator.ts` | 300 |
| `geometry/calculation/HoleCalculator.java` | `core/geometry/hole-calculator.ts` | 250 |
| `modelling/DefaultInstrumentCalculator.java` | `core/modelling/instrument-calculator.ts` | 400 |
| `modelling/InstrumentTuner.java` | `core/modelling/instrument-tuner.ts` | 200 |
| `math/DIRECTOptimizer.java` | `core/optimization/direct-optimizer.ts` | 500 |
| `optimization/BaseObjectiveFunction.java` | `core/optimization/base-objective.ts` | 300 |

### Priority 2 (Extended Functionality)

- All remaining objective functions
- Specialized calculators (NAF, Flute, Whistle)
- Multi-start optimization
- Advanced hole/bore adjusters

---

## Appendix B: Critical Formulas to Verify

### Transfer Matrix for Cylindrical Section
```
T = | cos(kL)        j*Z₀*sin(kL) |
    | j*sin(kL)/Z₀   cos(kL)      |

where:
  k = ω/c (wave number)
  L = length
  Z₀ = ρc/S (characteristic impedance)
```

### Transfer Matrix for Conical Section
```
Uses spherical wave solution with Bessel functions
Reference: Nederveen, "Acoustical Aspects of Woodwind Instruments"
```

### Hole Shunt Impedance
```
Z_hole = jωρ(t_e + δ)/S_h + radiation impedance

where:
  t_e = effective height (with end corrections)
  δ = end correction
  S_h = hole cross-sectional area
```

### Playing Frequency Condition
```
Im(Z_in) = 0  (zero imaginary impedance at embouchure)
```

---

## Appendix C: Dependencies

### Production Dependencies
```json
{
  "dependencies": {
    "mathjs": "^12.0.0",
    "zod": "^3.22.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "plotly.js": "^2.27.0",
    "@tanstack/react-table": "^8.10.0",
    "react-hook-form": "^7.48.0",
    "tailwindcss": "^3.3.0"
  }
}
```

### Development Dependencies
```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@types/react": "^18.2.0",
    "eslint": "^8.54.0",
    "prettier": "^3.1.0"
  }
}
```

---

## Next Steps

1. **Review this plan** and provide feedback
2. **Prioritize** which instrument types to support first
3. **Begin Phase 1** - project setup and data models
4. **Create test fixtures** from Java version for validation

---

*Document Version: 1.0*
*Created: 2026-01-07*
*Author: Claude (Migration Planning Assistant)*
