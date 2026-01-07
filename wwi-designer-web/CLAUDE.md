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
- **442 total tests**, 441 passing, 1 failing (BP7 Whistle edge case)
- **68+ parity tests** specifically for Java comparison
- Tests use actual NAF sample instrument files and Java example files
- Core calculations verified within 0.001% tolerance

## Migration Status

- [x] Phase 1: Data models
- [x] Phase 2: Math (Complex, TransferMatrix, StateVector)
- [x] Phase 3: Physics + Geometry (PhysicalParameters, Tube, BoreSectionCalculator)
- [x] Phase 4: Component Calculators (holes, mouthpieces, terminations, instrument calculator)
- [x] Phase 5: Playing Range + Tuner (Brent solver, resonance finding, tuning prediction)
- [x] Phase 6: Optimization (DIRECT algorithm, evaluators, objective functions)
- [x] Phase 7: Web UI (Bun.serve, instrument/tuning editors, visualization, optimization)

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
