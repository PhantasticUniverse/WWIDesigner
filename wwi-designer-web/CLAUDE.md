# WWIDesigner Web - Developer Notes

## Project Overview

This is a TypeScript/Bun port of WWIDesigner, a Java application for designing and optimizing woodwind instruments using acoustic modeling and multi-variable optimization.

**Critical Requirement:** All acoustic calculations must achieve perfect parity with the Java version. Results must match within 0.001% tolerance.

## Architecture

```
src/
├── core/
│   ├── constants.ts       # Physical & musical constants
│   ├── math/              # Complex numbers, transfer matrices, state vectors
│   ├── physics/           # Air properties (PhysicalParameters)
│   └── geometry/          # Bore section calculators, tube formulas
├── models/                # Data models (Instrument, Tuning, Constraints)
└── utils/                 # XML converter for legacy files
```

## Key Acoustic Concepts

### Transfer Matrix Method
The core acoustic model uses 2x2 complex transfer matrices to represent acoustic transmission through bore sections, holes, and mouthpieces. For a component:
```
[P_out]   [PP  PU] [P_in]
[U_out] = [UP  UU] [U_in]
```
Where P is pressure and U is volume flow.

### Critical Formulas (must match Java exactly)

1. **Cylinder Transfer Matrix:**
   - Uses complex wave number with loss term: `k_complex = k * (1 + ε - jε)`
   - `ε = α / (r * √k)` where α is the alpha constant from PhysicalParameters

2. **Cone Transfer Matrix:**
   - From Lefebvre & Kergomard formulas
   - Uses mean complex wave vector along cone length

3. **Radiation Impedance:**
   - Unflanged: Silva et al., 2008 formulas
   - Flanged: Kergomard et al., 2015 formulas

### PhysicalParameters
Calculates temperature/pressure/humidity-dependent air properties using CIPM-2007 formulas:
- Speed of sound, density, viscosity
- Gamma (specific heat ratio)
- Alpha constant for loss calculations

## Testing

Run tests: `bun test`
Run with watch: `bun test --watch`
Run parity tests: `bun test tests/parity/`

Tests are critical for verifying Java parity. Each acoustic calculation should have corresponding Java output to validate against.

### Parity Testing Results

The `tests/parity/` directory contains comprehensive tests verifying Java-TypeScript calculation parity:

#### Physical Parameters (from Java PhysicalParametersTest.java)
| Condition | Java Speed of Sound | TS Speed of Sound | Status |
|-----------|---------------------|-------------------|--------|
| Dry air, 0°C | 331.34 m/s | 331.34 m/s | ✅ |
| Dry air, 20°C | 343.23 m/s | 343.23 m/s | ✅ |
| Saturated air, 20°C | 344.47 m/s | 344.47 m/s | ✅ |
| Exhaled air, 37°C | 353.22 m/s | 353.22 m/s | ✅ |
| Saturated, 90 kPa | 344.64 m/s | 344.64 m/s | ✅ |

#### Tube Calculations (from Java CalculationTest.java)
| Test | Java Value | TS Value | Status |
|------|------------|----------|--------|
| Radiation impedance Re(Z) | 0.00101768 | 0.00101768 | ✅ |
| Radiation impedance Im(Z) | 0.039132 | 0.039132 | ✅ |
| Cylinder impedance Re(Z) | 0.03696 | 0.03696 | ✅ |
| Cylinder impedance Im(Z) | -0.48516 | -0.48516 | ✅ |
| Cone impedance Re(Z) | 0.03856 | 0.03856 | ✅ |
| Cone impedance Im(Z) | -0.4592 | -0.4592 | ✅ |

#### Java Example Files Parity (from NAFTuningTest.java, NafOptimizationTest.java, InstrumentImpedanceTest.java)
| Test Category | Files Used | Status |
|---------------|------------|--------|
| NAF D Minor Cherry Tuning | NAF_D_minor_cherry_actual_*.xml | ✅ (1.41 cents avg, exact Java parity) |
| BP7 Whistle Impedance | BP7.xml, BP7-tuning.xml | ✅ |
| No-Hole NAF Geometry | NoHoleNAF1.xml | ✅ |
| 6-Hole NAF Geometry | 6HoleNAF1.xml | ✅ |
| Tapered NAF Geometry | NoHoleTaperNAF.xml | ✅ |

*NAF tuning predictions now achieve **exact parity** with Java (1.41 cents average deviation, identical to Java). This was achieved by:*
*1. Implementing ThickFlangedOpenEndCalculator and DefaultFippleMouthpieceCalculator matching Java's NAFCalculator*
*2. Starting the component list from mouthpiece position (not first bore point), with headspace handled separately*

#### Test Summary
- **670 total tests**, all passing ✅
- **68+ parity tests** specifically for Java comparison
- **20 BOBYQA optimizer tests** for convergence and bounds handling
- Tests use actual NAF sample instrument files and Java example files
- Core calculations verified within 0.001% tolerance

## Migration Status

### Core Acoustic Engine (100% Complete)
- [x] Phase 1: Data models (Instrument, Tuning, Constraints)
- [x] Phase 2: Math (Complex, TransferMatrix, StateVector)
- [x] Phase 3: Physics + Geometry (PhysicalParameters, Tube, BoreSectionCalculator)
- [x] Phase 4: Component Calculators (holes, mouthpieces, terminations, instrument calculator)
- [x] Phase 5: Playing Range + Tuner (Brent solver, resonance finding, tuning prediction)
- [x] Phase 6: Optimization (DIRECT + BOBYQA algorithms, 7 evaluators, 52 objective functions)
- [x] Phase 7: Web UI (Bun.serve, instrument/tuning editors, visualization, optimization)

### Recently Completed Features

#### Phase 8: Visualization Parity (Complete)
- [x] Mouthpiece visualization (fipple window rectangle, embouchure oval)
- [x] Windway dashed rectangle display

#### Phase 9: Advanced Evaluators (7/8 Complete)
- [x] FminEvaluator - First minimum frequency detection
- [x] FmaxEvaluator - First maximum frequency detection
- [x] FminmaxEvaluator - Combined min/max evaluation
- [x] BellNoteEvaluator - Bell note (all holes closed) optimization
- [x] ReflectionEvaluator - Reflection coefficient phase analysis
- [ ] WhistleEvaluator - Whistle-specific evaluation (requires WhistleCalculator)

#### Phase 11: Spectrum Analysis (Complete)
- [x] ImpedanceSpectrum - Impedance magnitude vs frequency
- [x] ReflectanceSpectrum - Reflection coefficient spectrum
- [x] PlayingRangeSpectrum - Impedance ratio and loop gain analysis

#### Phase 13: Advanced Tuners (Complete)
- [x] LinearVInstrumentTuner - Velocity-based linear tuner
- [x] LinearXInstrumentTuner - Reactance-based linear tuner

### Remaining Features (~35% Remaining)

#### Phase 10: Objective Functions (52 of 54 implemented - 96%) ✅ MOSTLY COMPLETE
Already implemented:
- [x] LengthObjectiveFunction - Simple bore length optimization
- [x] HolePositionObjectiveFunction - Optimize hole positions from bottom
- [x] HolePositionFromTopObjectiveFunction - Optimize hole positions from top (ratio-based)
- [x] HoleSizeObjectiveFunction - Optimize hole diameters
- [x] HoleObjectiveFunction - Combined position + size optimization
- [x] HoleFromTopObjectiveFunction - Combined hole position/size from top
- [x] MergedObjectiveFunction - Abstract base for merging multiple objectives
- [x] HoleGroupPositionObjectiveFunction - Grouped holes with equal spacing
- [x] HoleGroupPositionFromTopObjectiveFunction - Grouped holes from top (ratio-based)
- [x] HoleGroupFromTopObjectiveFunction - Merged grouped position + size from top
- [x] HoleGroupObjectiveFunction - Merged grouped position + size
- [x] BoreDiameterFromBottomObjectiveFunction - Bore diameter ratios from bottom
- [x] BoreDiameterFromTopObjectiveFunction - Bore diameter ratios from top
- [x] BasicTaperObjectiveFunction - Two-section tapered bore
- [x] SingleTaperRatioObjectiveFunction - Three-section bore with single taper
- [x] SingleTaperSimpleRatioObjectiveFunction - Three-section bore with simple taper ratio
- [x] FippleFactorObjectiveFunction - Fipple factor calibration
- [x] WindowHeightObjectiveFunction - Window/embouchure height calibration
- [x] HoleAndTaperObjectiveFunction - Combined holes + taper optimization
- [x] HoleAndBoreDiameterFromTopObjectiveFunction - Holes + bore diameters from top
- [x] HoleAndBoreDiameterFromBottomObjectiveFunction - Holes + bore diameters from bottom
- [x] BetaObjectiveFunction - Mouthpiece beta parameter calibration
- [x] AirstreamLengthObjectiveFunction - Window/airstream length optimization
- [x] NafHoleSizeObjectiveFunction - NAF-specific hole size constraints
- [x] ReedCalibratorObjectiveFunction - Reed alpha/beta calibration
- [x] StopperPositionObjectiveFunction - Flute headjoint stopper position
- [x] ConicalBoreObjectiveFunction - Conical bore foot diameter

Additional implemented functions (Phase 10 completion):
- [x] SingleTaperNoHoleGroupingObjectiveFunction - Single taper, no hole grouping
- [x] SingleTaperNoHoleGroupingFromTopObjectiveFunction - From top variant
- [x] SingleTaperHoleGroupObjectiveFunction - Single taper + grouped holes
- [x] SingleTaperHoleGroupFromTopObjectiveFunction - From top variant
- [x] GlobalHoleObjectiveFunction - Global combined hole optimization
- [x] GlobalHolePositionObjectiveFunction - Global hole positions
- [x] GlobalHoleAndTaperObjectiveFunction - Global holes + taper
- [x] GlobalHoleAndBoreDiameterFromBottomObjectiveFunction - Global holes + bore
- [x] GlobalHoleAndBoreDiameterFromTopObjectiveFunction - Global holes + bore from top
- [x] GlobalBoreFromBottomObjectiveFunction - Global bore from bottom
- [x] GlobalHoleAndBoreFromBottomObjectiveFunction - Global holes + bore
- [x] HoleAndConicalBoreObjectiveFunction - Holes + conical bore
- [x] HeadjointObjectiveFunction - Flute headjoint
- [x] HoleAndHeadjointObjectiveFunction - Holes + headjoint
- [x] BorePositionObjectiveFunction - Bore point positions
- [x] BoreSpacingFromTopObjectiveFunction - Bore spacing from top
- [x] BoreFromBottomObjectiveFunction - Bore from bottom
- [x] HoleAndBoreFromBottomObjectiveFunction - Holes + bore from bottom
- [x] HoleAndBorePositionObjectiveFunction - Holes + bore position
- [x] HoleAndBoreSpacingFromTopObjectiveFunction - Holes + bore spacing
- [x] SingleTaperSimpleRatioHemiHeadObjectiveFunction - Hemi-head taper
- [x] SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction - Hemi-head no grouping
- [x] SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction - Hemi-head grouped
- [x] FluteCalibrationObjectiveFunction - Flute calibration
- [x] WhistleCalibrationObjectiveFunction - Whistle calibration

Still needed (2 remaining):
- [ ] Additional specialized variants as needed

#### Phase 12: Study Framework
- [ ] BaseStudyModel abstraction
- [ ] NafStudyModel - Native American Flute workflows
- [ ] WhistleStudyModel - Whistle instrument workflows
- [ ] FluteStudyModel - Transverse flute workflows
- [ ] ReedStudyModel - Reed instrument workflows

#### Phase 14: Additional Optimization Features
- [ ] Hole grouping constraints (linked hole sizes)
- [ ] Multi-start optimization
- [ ] Constraint validation/reporting

## Feature Gap Analysis

### Current Implementation Coverage

| Category | Java Count | TypeScript Count | Coverage |
|----------|------------|------------------|----------|
| Bore Section Calculators | 4 | 4 | 100% |
| Hole Calculators | 2 | 2 | 100% |
| Mouthpiece Calculators | 4 | 4 | 100% |
| Termination Calculators | 5 | 5 | 100% |
| Instrument Calculators | 3 | 2 | 67% |
| Evaluators | 8 | 7 | 88% |
| Objective Functions | 54 | 52 | 96% |
| Tuners | 5 | 5 | 100% |
| Spectrum Analyzers | 3 | 3 | 100% |
| Study Models | 4 | 0 | 0% |

### Priority Queue

**High Priority (Core Functionality):**
1. ~~Mouthpiece visualization - Quick win, visual parity~~ ✓
2. ~~FminEvaluator, FmaxEvaluator - Required for many objective functions~~ ✓
3. ~~BellNoteEvaluator, ReflectionEvaluator - Additional optimization evaluators~~ ✓
4. ~~LinearXInstrumentTuner - Reactance-based tuning~~ ✓
5. ~~PlayingRangeSpectrum - Loop gain analysis~~ ✓
6. ~~HoleGroupPositionObjectiveFunction - Grouped hole optimization~~ ✓
7. ~~BoreDiameterFromBottomObjectiveFunction - Bore diameter optimization~~ ✓
8. ~~HolePositionFromTopObjectiveFunction - Top-based hole optimization~~ ✓
9. ~~BoreDiameterFromTopObjectiveFunction - Top-based bore optimization~~ ✓

**Medium Priority (Extended Features):**
10. ~~ImpedanceSpectrum - Analysis tool~~ ✓
11. ~~ReflectanceSpectrum - Analysis tool~~ ✓
12. ~~HoleFromTopObjectiveFunction - Merged hole position/size from top~~ ✓
13. ~~BasicTaperObjectiveFunction - Two-section tapered bore~~ ✓
14. ~~SingleTaperRatioObjectiveFunction - Three-section single taper~~ ✓
15. ~~FippleFactorObjectiveFunction - Fipple factor calibration~~ ✓
16. ~~WindowHeightObjectiveFunction - Window height calibration~~ ✓
17. ~~HoleAndTaperObjectiveFunction - Holes + taper~~ ✓
18. ~~HoleGroupObjectiveFunction family - Grouped hole optimization~~ ✓
19. ~~ReedCalibratorObjectiveFunction - Reed alpha/beta calibration~~ ✓
20. ~~StopperPositionObjectiveFunction - Flute stopper position~~ ✓
21. ~~ConicalBoreObjectiveFunction - Conical bore foot diameter~~ ✓
22. SingleTaperHoleGroup family (4+ functions)
23. Global objective function family

**Lower Priority (Specialized):**
24. Study framework - Application-specific workflows
25. WhistleEvaluator (requires WhistleCalculator)

## Running the Web Application

Start the development server:
```sh
bun run dev
```

Or for production:
```sh
bun run start
```

The server will be available at http://localhost:3000

## Web UI Features

- **Instrument Editor**: Create and edit instrument geometry (bore points, holes, mouthpiece, termination)
- **Tuning Editor**: Define target tunings with note names, frequencies, and fingering patterns
- **Instrument Sketch**: Visual cross-section view of the instrument bore and holes
- **Tuning Analysis**: Calculate predicted vs. target frequencies with cent deviations
- **Optimization**: Optimize hole positions, sizes, or both using DIRECT algorithm
- **Instrument Comparison**: Side-by-side comparison of two instruments
- **XML Import/Export**: Save and load instruments in XML format
- **Preferences**: Configure temperature, humidity, and other calculation parameters

---

## Bun Configuration

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
