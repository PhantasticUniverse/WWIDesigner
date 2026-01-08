# Optimization - DIRECT and BOBYQA Algorithms

This document details the optimization system used to find optimal hole positions and sizes for wind instruments.

## Overview

The optimization system uses a **two-stage approach** combining global and local optimizers:

1. **DIRECT (DIviding RECTangles)** - Global optimizer for broad exploration
2. **BOBYQA (Bound Optimization BY Quadratic Approximation)** - Local optimizer for refinement

This combination is well-suited for instrument optimization where:
- The objective function is expensive to compute
- The search space has multiple local minima
- Gradients are not readily available
- High precision is required in the final solution

## DIRECT Algorithm

### Reference

> D. R. Jones, C. D. Perttunen, and B. E. Stuckmann, "Lipschitzian optimization without the lipschitz constant," J. Optimization Theory and Applications, vol. 79, p. 157 (1993).

### Key Idea

DIRECT explores the search space by:
1. Dividing the domain into hyperrectangles
2. Sampling the function at rectangle centers
3. Identifying "potentially optimal" rectangles on the lower convex hull
4. Dividing those rectangles into thirds along their longest sides
5. Repeating until convergence

```
 f(x)
   │
   │    ●
   │  ●   ●          ← Large rectangles with high f
   │●       ●
   │          ●      ← Lower convex hull
   │            ●●
   │                 ← Small rectangles with low f
   └─────────────────────────── diameter
```

Points on the **lower convex hull** are potentially optimal because they could contain the global minimum under some Lipschitz constant.

### Algorithm Steps

```
1. Initialize: Create one rectangle covering entire domain
2. Evaluate: f(center)
3. Divide: Split along longest side(s) into thirds
4. Identify: Find potentially optimal rectangles (lower convex hull)
5. Repeat: Divide potentially optimal rectangles
6. Stop: When convergence criteria met
```

## Implementation Details

### Hyperrectangle Structure

```typescript
interface RectangleKey {
  diameter: number;   // √(Σ w_i²) / 2
  fValue: number;     // Function value at center
  serial: number;     // Unique identifier for ordering
}

interface RectangleValue {
  centre: number[];   // Center point in normalized coordinates
  width: number[];    // Width in each dimension (0-1 scale)
  maxWidth: number;   // Width of longest side
  longCount: number;  // Number of equally-long sides
  longIdx: number;    // Index of first longest side
}
```

### Division Strategy

When dividing a rectangle:

1. If **multiple longest sides**: Sample all directions first, then divide in order of increasing function value
2. If **single longest side**: Divide only that dimension

This strategy ensures promising directions are explored with smaller rectangles.

```
Before division:         After trisection:
┌─────────────────┐     ┌─────┬─────┬─────┐
│                 │     │  ●  │  ●  │  ●  │
│        ●        │  →  │     │     │     │
│                 │     │     │     │     │
└─────────────────┘     └─────┴─────┴─────┘
```

### Lower Convex Hull

The potentially optimal rectangles form the lower convex hull of points (diameter, f-value):

```typescript
private getPotentiallyOptimal(): number {
  // Sort rectangles by (diameter, fValue)
  const entries = Array.from(this.rtree.values()).sort(...);

  // Build lower convex hull using left-turn criterion
  let nhull = 0;
  for (const entry of entries) {
    // Remove points until we are making a "left turn"
    while (nhull >= 1) {
      const cross = /* cross product */;
      if (cross >= 0) break;  // Left turn - keep
      nhull--;                 // Right turn - remove
    }
    this.hull[nhull++] = entry;
  }
  return nhull;
}
```

### Convergence Criteria

```typescript
private hasConverged(nrPromising: number): boolean {
  // 1. Evaluation limit
  if (this.evaluationsDone >= this.maxEvaluations) return true;

  // 2. Target value reached
  if (this.currentBest.value <= this.targetFunctionValue) return true;

  // 3. X convergence (all rectangle widths < threshold)
  if (!this.isXConverged) return false;

  // 4. No promising divisions and past minimum iterations
  if (nrPromising === 0 && iterationsDone >= iterationOfLastImprovement + 1 + dimension)
    return true;

  // 5. Too many iterations without improvement
  if (iterationsDone >= iterationOfLastImprovement + convergedIterationsThreshold)
    return true;

  return false;
}
```

### Configuration Options

```typescript
interface DIRECTOptions {
  convergenceThreshold?: number;      // X accuracy (default: 1e-4)
  maxEvaluations?: number;            // Max function calls (default: 10000)
  targetValue?: number;               // Stop if reached
  convergedIterationsThreshold?: number;  // Iterations without improvement (default: 20)
  allowDuplicatesInHull?: boolean;    // Jones vs Gablonsky variant (default: true)
}
```

## Objective Functions

### Base Interface

```typescript
interface IObjectiveFunction {
  // Get lower and upper bounds for optimization variables
  getLowerBounds(): number[];
  getUpperBounds(): number[];

  // Evaluate objective at a point
  evaluate(point: number[]): number;

  // Apply optimal point to instrument
  applyOptimalPoint(point: number[]): void;
}
```

### Hole Position Objective

Optimizes hole positions while keeping sizes fixed.

```typescript
class HolePositionObjectiveFunction implements IObjectiveFunction {
  evaluate(point: number[]): number {
    // Map point to hole positions
    this.setHolePositions(point);

    // Calculate tuning errors
    const errors = this.evaluator.calculateErrorVector(fingerings);

    // Return sum of squared cent deviations
    return errors.reduce((sum, e) => sum + e * e, 0);
  }
}
```

Bounds:
- Lower: Minimum spacing from previous hole or mouthpiece
- Upper: Maximum spacing before next hole or termination

### Hole Size Objective

Optimizes hole diameters while keeping positions fixed.

```typescript
class HoleSizeObjectiveFunction implements IObjectiveFunction {
  evaluate(point: number[]): number {
    // Map point to hole diameters
    this.setHoleSizes(point);

    // Calculate tuning errors
    const errors = this.evaluator.calculateErrorVector(fingerings);

    // Return sum of squared cent deviations
    return errors.reduce((sum, e) => sum + e * e, 0);
  }
}
```

Bounds:
- Lower: Minimum manufacturable hole size (e.g., 3mm)
- Upper: Maximum hole size (e.g., bore diameter)

### Combined Objective

Optimizes both positions and sizes simultaneously.

```typescript
class HoleObjectiveFunction implements IObjectiveFunction {
  // Point structure: [pos_1, pos_2, ..., pos_n, size_1, size_2, ..., size_n]

  evaluate(point: number[]): number {
    const n = this.instrument.holes.length;
    const positions = point.slice(0, n);
    const sizes = point.slice(n);

    this.setHolePositions(positions);
    this.setHoleSizes(sizes);

    const errors = this.evaluator.calculateErrorVector(fingerings);
    return errors.reduce((sum, e) => sum + e * e, 0);
  }
}
```

## Evaluators

### Cent Deviation Evaluator

The primary evaluator for tuning optimization:

```typescript
class CentDeviationEvaluator implements IEvaluator {
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errors = fingeringTargets.map(target => {
      const targetFreq = target.note.frequency;
      const predictedFreq = this.tuner.predictedFrequency(target);
      return calcCents(targetFreq, predictedFreq);
    });
    return errors;
  }
}

// Cent calculation
function calcCents(target: number, predicted: number): number {
  return 1200 * Math.log2(predicted / target);
}
```

### Available Evaluators

| Evaluator | Metric | Use Case |
|-----------|--------|----------|
| `CentDeviationEvaluator` | Cents from target frequency | Primary tuning optimization |
| `FrequencyDeviationEvaluator` | Hz deviation | Absolute frequency matching |
| `ReactanceEvaluator` | Im(Z) at target freq | Resonance matching |
| `FminEvaluator` | Cents from target fmin | Playing range minimum |
| `FmaxEvaluator` | Cents from target fmax | Playing range maximum |
| `FminmaxEvaluator` | Weighted fmin+fmax deviation | Full playing range optimization |
| `BellNoteEvaluator` | Cents for bell note only | Bell note (all holes closed) optimization |
| `ReflectionEvaluator` | Reflection phase angle | Resonance quality/stability |

### Playing Range Evaluators

The `FminEvaluator`, `FmaxEvaluator`, and `FminmaxEvaluator` evaluate deviations from the minimum and maximum frequencies of a playing range.

```typescript
// FminEvaluator - evaluates deviation from target frequencyMin
class FminEvaluator extends BaseEvaluator {
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    return fingeringTargets.map(target => {
      if (target.note?.frequencyMin === undefined) return 0; // Exclude
      const predicted = this.tuner.predictedNote(target);
      return calcCents(target.note.frequencyMin, predicted.frequencyMin ?? 0);
    });
  }
}

// FmaxEvaluator - evaluates deviation from target frequencyMax
class FmaxEvaluator extends BaseEvaluator {
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    return fingeringTargets.map(target => {
      if (target.note?.frequencyMax === undefined) return 0; // Exclude
      const predicted = this.tuner.predictedNote(target);
      return calcCents(target.note.frequencyMax, predicted.frequencyMax ?? 0);
    });
  }
}

// FminmaxEvaluator - weighted combination
// FMAX_WEIGHT = 4.0, FMIN_WEIGHT = 1.0, FPLAYING_WEIGHT = 1.0
class FminmaxEvaluator extends BaseEvaluator {
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    return fingeringTargets.map(target => {
      const predicted = this.tuner.predictedNote(target);

      // Priority: fmax → fmin → nominal frequency
      if (target.note?.frequencyMax && predicted.frequencyMax) {
        const fmaxDev = 4.0 * calcCents(target.note.frequencyMax, predicted.frequencyMax);
        if (target.note.frequencyMin && predicted.frequencyMin) {
          const fminDev = 1.0 * calcCents(target.note.frequencyMin, predicted.frequencyMin);
          return Math.sqrt(fmaxDev² + fminDev²); // Combined
        }
        return fmaxDev;
      }
      // Fall back to nominal frequency
      return calcCents(target.note?.frequency ?? 0, predicted.frequency ?? 0);
    });
  }
}
```

### Evaluator Factory

```typescript
import { createEvaluator, EvaluatorType } from "./optimization/evaluator.ts";

// Available types: "cents" | "frequency" | "reactance" | "fmin" | "fmax" | "fminmax" | "bellnote" | "reflection"
const evaluator = createEvaluator("fminmax", calculator, tuner);
```

## All Objective Functions (52 Implemented - 100% Java Parity)

All objective functions from the Java WWIDesigner have been ported to TypeScript with identical behavior.

### Basic Hole Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `LengthObjectiveFunction` | 1 | Bore length from bottom |
| `HolePositionObjectiveFunction` | N holes | Hole positions as spacing from bottom |
| `HolePositionFromTopObjectiveFunction` | N holes | Hole positions as ratios from top |
| `HoleSizeObjectiveFunction` | N holes | Hole diameters |
| `HoleObjectiveFunction` | 2N | Position + size (merged) |
| `HoleFromTopObjectiveFunction` | 2N | Position from top + size (merged) |
| `NafHoleSizeObjectiveFunction` | N holes | NAF-specific hole sizes with max constraint |

### Grouped Hole Objectives

These optimize holes in groups where holes within each group maintain equal spacing.

| Function | Dimensions | Description |
|----------|------------|-------------|
| `HoleGroupPositionObjectiveFunction` | G groups + 1 | Grouped hole positions from bottom |
| `HoleGroupPositionFromTopObjectiveFunction` | G groups + 1 | Grouped hole positions as ratios from top |
| `HoleGroupFromTopObjectiveFunction` | G + N + 1 | Grouped positions from top + sizes (merged) |
| `HoleGroupObjectiveFunction` | G + N + 1 | Grouped positions + sizes (merged) |

### Bore Diameter Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `BoreDiameterFromBottomObjectiveFunction` | P points | Bore diameter ratios from bottom |
| `BoreDiameterFromTopObjectiveFunction` | P points | Bore diameter ratios from top |
| `ConicalBoreObjectiveFunction` | 1 | Conical bore foot diameter |

### Bore Position and Spacing Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `BorePositionObjectiveFunction` | P points | Relative bore point positions from bottom |
| `BoreSpacingFromTopObjectiveFunction` | P points | Absolute bore point spacing from top |
| `BoreFromBottomObjectiveFunction` | 2P | Position + diameter from bottom (merged) |

### Taper Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `BasicTaperObjectiveFunction` | 3 | Two-section taper (position, bore1, bore2) |
| `SingleTaperRatioObjectiveFunction` | 4 | Three-section taper with variable bore point count |
| `SingleTaperSimpleRatioObjectiveFunction` | 3 | Three-section taper with simple ratio |

### Hemispherical Head Objectives (NAF)

For Native American Flutes with hemispherical bore tops:

| Function | Dimensions | Description |
|----------|------------|-------------|
| `SingleTaperSimpleRatioHemiHeadObjectiveFunction` | 3 | Taper with hemispherical head |
| `SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction` | N + 3 | No-grouping + hemi-head (merged) |
| `SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction` | G + N + 3 | Grouped holes + hemi-head (merged) |

**Utility class:** `HemisphericalBoreHead` - Creates hemispherical bore profiles

### Combined Hole + Bore Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `HoleAndTaperObjectiveFunction` | 2N + 4 | Holes + single taper (merged) |
| `HoleAndBoreDiameterFromTopObjectiveFunction` | 2N + P | Holes + bore diameters from top |
| `HoleAndBoreDiameterFromBottomObjectiveFunction` | 2N + P | Holes + bore diameters from bottom |
| `HoleAndBoreFromBottomObjectiveFunction` | 2N + 2P | Holes + bore position + diameter |
| `HoleAndBorePositionObjectiveFunction` | 2N + P | Holes + bore position only |
| `HoleAndBoreSpacingFromTopObjectiveFunction` | 2N + P | Holes + bore spacing from top |
| `HoleAndConicalBoreObjectiveFunction` | 2N + 1 | Holes + conical bore (merged) |

### Headjoint Objectives (Flute)

| Function | Dimensions | Description |
|----------|------------|-------------|
| `HeadjointObjectiveFunction` | 1 + P | Stopper position + bore diameters |
| `HoleAndHeadjointObjectiveFunction` | 2N + P + 1 | Holes + headjoint (merged) |

### Single Taper Merged Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `SingleTaperNoHoleGroupingObjectiveFunction` | 2N + 3 | No hole grouping + taper (merged) |
| `SingleTaperNoHoleGroupingFromTopObjectiveFunction` | 2N + 3 | From top + taper (merged) |
| `SingleTaperHoleGroupObjectiveFunction` | G + N + 3 | Grouped holes + taper (merged) |
| `SingleTaperHoleGroupFromTopObjectiveFunction` | G + N + 3 | Grouped from top + taper (merged) |

### Global Optimizer Variants (DIRECT)

These use the DIRECT global optimizer for more thorough exploration:

| Function | Parent | Description |
|----------|--------|-------------|
| `GlobalHolePositionObjectiveFunction` | HolePosition | Global hole position search |
| `GlobalHoleObjectiveFunction` | HoleObjective | Global hole position + size |
| `GlobalHoleAndTaperObjectiveFunction` | HoleAndTaper | Global holes + taper |
| `GlobalHoleAndBoreDiameterFromBottomObjectiveFunction` | HoleAndBoreDiameterFromBottom | Global holes + bore from bottom |
| `GlobalHoleAndBoreDiameterFromTopObjectiveFunction` | HoleAndBoreDiameterFromTop | Global holes + bore from top |
| `GlobalBoreFromBottomObjectiveFunction` | BoreFromBottom | Global bore from bottom |
| `GlobalHoleAndBoreFromBottomObjectiveFunction` | HoleAndBoreFromBottom | Global holes + bore |

### Mouthpiece/Fipple Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `FippleFactorObjectiveFunction` | 1 | Fipple factor calibration |
| `WindowHeightObjectiveFunction` | 1 | Window/embouchure height |
| `BetaObjectiveFunction` | 1 | Mouthpiece beta parameter |
| `AirstreamLengthObjectiveFunction` | 1 | Window/airstream length |

### Calibration Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `FluteCalibrationObjectiveFunction` | 2 | Flute airstream length + beta |
| `WhistleCalibrationObjectiveFunction` | 2 | Whistle window height + beta |
| `ReedCalibratorObjectiveFunction` | 2 | Reed alpha + beta calibration |

### Flute Objectives

| Function | Dimensions | Description |
|----------|------------|-------------|
| `StopperPositionObjectiveFunction` | 1 | Flute headjoint stopper position |

### Bore Length Adjustment Modes

Many objective functions support different bore length adjustment modes:

```typescript
enum BoreLengthAdjustmentType {
  PRESERVE_BORE,    // Keep bore unchanged
  PRESERVE_TAPER,   // Adjust bore to preserve taper angle
  MOVE_BOTTOM       // Move bottom bore point
}
```

### Example: Using HoleGroupObjectiveFunction

```typescript
import {
  HoleGroupObjectiveFunction,
  BoreLengthAdjustmentType
} from "./optimization/hole-position-objective.ts";

// Define hole groups: [[0,1,2], [3,4,5]] = two groups of 3 holes each
const holeGroups = [[0, 1, 2], [3, 4, 5]];

const objective = new HoleGroupObjectiveFunction(
  calculator,
  tuning,
  evaluator,
  holeGroups,
  BoreLengthAdjustmentType.MOVE_BOTTOM
);

// Dimensions: (2 groups * 2) + (6 hole sizes) + 1 length = 11
console.log(objective.nrDimensions); // 11
```

### Example: Using ReedCalibratorObjectiveFunction

```typescript
import { ReedCalibratorObjectiveFunction } from "./optimization/hole-position-objective.ts";

// For reed instruments (single reed, double reed, or lip reed)
const objective = new ReedCalibratorObjectiveFunction(
  calculator,
  tuning,
  evaluator
);

// Dimensions: 2 (alpha + beta)
// Optimizes mouthpiece.singleReed.alpha (or doubleReed/lipReed)
// and mouthpiece.beta
```

### Example: Using StopperPositionObjectiveFunction

```typescript
import { StopperPositionObjectiveFunction } from "./optimization/hole-position-objective.ts";

// For transverse flutes - optimizes headjoint length
const objective = new StopperPositionObjectiveFunction(
  calculator,
  tuning,
  evaluator,
  true  // preserveTaper: adjust bore diameter to maintain taper
);

// Dimensions: 1 (distance from stopper to embouchure hole)
```

## Instrument Tuners

Tuners predict the playing frequency for a given fingering. Different tuners use different models for how a player would typically play each note.

### SimpleInstrumentTuner

The basic tuner finds the frequency where Im(Z) = 0:

```typescript
class SimpleInstrumentTuner extends InstrumentTuner {
  predictedFrequency(fingering: Fingering): number | null {
    const range = new PlayingRange(this.calculator, fingering);
    return range.findXZero(targetFreq); // Where Im(Z) = 0
  }
}
```

### LinearVInstrumentTuner

A more sophisticated tuner that models a linear change in blowing velocity from fmax (lowest note) to fmin (highest note). This better matches how real players adjust their breath pressure across the instrument's range.

**Reference:** Fletcher and Rossing, *The physics of musical instruments*, 2nd ed., section 16.10

```typescript
import { LinearVInstrumentTuner, createLinearVTuner } from "./instrument-tuner.ts";

// Create with blowing level (0-10, default 5)
const tuner = createLinearVTuner(instrument, tuning, params, 5);

// Or manually:
const tuner = new LinearVInstrumentTuner(
  instrument,
  tuning,
  calculator,
  params,
  blowingLevel // 0 = soft, 10 = hard
);
```

**Key features:**
- Uses Strouhal number-based velocity estimation
- Linear interpolation of blowing velocity between lowest and highest notes
- Predicts fmin, fmax, AND nominal frequency for each note
- Blowing level lookup tables from Java implementation

**Velocity calculation:**

```typescript
// Strouhal number based on impedance ratio
const strouhal = 0.26 - 0.037 * (z.im / z.re);

// Velocity = f * windowLength / strouhal
const velocity = f * windowLength / strouhal;

// Reverse: predict Z ratio from velocity
const zRatio = (0.26 - f * windowLength / velocity) / 0.037;
```

**Predicted note:**

```typescript
predictedNote(fingering: Fingering): Note {
  const range = new PlayingRange(this.calculator, fingering);

  // fmax = where Im(Z) = 0
  const fmax = range.findXZero(target);

  // fmin = minimum playable frequency (gain drops or local minimum of Im/Re)
  const fmin = range.findFmin(fmax);

  // fnom = where Im(Z)/Re(Z) = predicted ratio for this velocity
  const fnom = range.findZRatio(target, zRatioTarget);

  return { frequencyMin: fmin, frequencyMax: fmax, frequency: fnom };
}
```

### Available Tuners

| Tuner | Model | When to Use |
|-------|-------|-------------|
| `SimpleInstrumentTuner` | Im(Z) = 0 | Basic tuning, fast computation |
| `LinearVInstrumentTuner` | Linear velocity model | Playing range analysis, fmin/fmax prediction |

## Optimization Workflow

```typescript
// 1. Create calculator for instrument
const calculator = createNAFCalculator(instrument, params);

// 2. Create evaluator
const evaluator = new CentDeviationEvaluator(calculator);

// 3. Create objective function
const objective = new HolePositionObjectiveFunction(calculator, tuning, evaluator);

// 4. Run optimization
const optimizer = new DIRECTOptimizer({
  maxEvaluations: 1000,
  convergenceThreshold: 1e-4,
});

const result = optimizer.optimize(
  (point) => objective.evaluate(point),
  objective.getLowerBounds(),
  objective.getUpperBounds()
);

// 5. Apply result
objective.applyOptimalPoint(result.point);
console.log(`Optimal error: ${result.value} cents²`);
console.log(`Evaluations: ${result.evaluations}`);
```

## Performance Characteristics

### Complexity

- Each iteration: O(n log n) for convex hull computation
- Function evaluations: Grows slowly with dimension (no curse of dimensionality)
- Typically 500-2000 evaluations for 6-hole instruments

### Convergence

DIRECT guarantees convergence to the global optimum:
- Given infinite iterations, will sample arbitrarily close to any point
- No local minima trapping (unlike gradient methods)
- Practical convergence in reasonable time for up to ~20 dimensions

### Memory

- Stores all evaluated rectangles
- Memory: O(evaluations)
- Hull computation: O(n) temporary storage

## Usage Example

```typescript
import { DIRECTOptimizer } from "./optimization/direct-optimizer.ts";
import { HolePositionObjectiveFunction } from "./optimization/hole-position-objective.ts";
import { CentDeviationEvaluator } from "./optimization/evaluator.ts";
import { createNAFCalculator } from "./modelling/calculator-factory.ts";

// Load instrument and tuning
const instrument = loadInstrument("NAF_D_minor.xml");
const tuning = loadTuning("NAF_D_minor_tuning.xml");
const params = new PhysicalParameters(72, "F");

// Set up optimization
const calculator = createNAFCalculator(instrument, params);
const evaluator = new CentDeviationEvaluator(calculator);
const objective = new HolePositionObjectiveFunction(calculator, tuning, evaluator);

// Optimize
const optimizer = new DIRECTOptimizer({
  maxEvaluations: 1000,
  convergenceThreshold: 1e-6,
});

const result = optimizer.optimize(
  (point) => objective.evaluate(point),
  objective.getLowerBounds(),
  objective.getUpperBounds()
);

// Apply and report
objective.applyOptimalPoint(result.point);
const optimizedInstrument = calculator.getInstrument();

console.log("Optimization complete:");
console.log(`  Evaluations: ${result.evaluations}`);
console.log(`  Final error: ${Math.sqrt(result.value).toFixed(2)} cents RMS`);
console.log(`  Converged: ${result.converged}`);
```

## References

1. **Jones, D. R., et al. (1993)** - "Lipschitzian optimization without the lipschitz constant" - Original DIRECT algorithm

2. **Gablonsky, J. M. (2001)** - "Modifications of the DIRECT algorithm" - Improvements and variants

3. **WWIDesigner Java source** - Original implementation by Steven G. Johnson (MIT), Burton Patkau

## Objective Function Factory

The factory provides a unified way to create any objective function by name, enabling dynamic selection from the UI.

### Creating Objective Functions

```typescript
import {
  createObjectiveFunction,
  getObjectiveFunctionsByCategory,
  getObjectiveFunctionNames,
  OBJECTIVE_FUNCTION_INFO,
} from "./optimization/objective-function-factory.ts";

// Create by name
const objective = createObjectiveFunction(
  "HolePositionObjectiveFunction",
  calculator,
  tuning,
  evaluator
);

// Get all available function names
const names = getObjectiveFunctionNames();
// ["FippleFactorObjectiveFunction", "HolePositionObjectiveFunction", ...]

// Get functions grouped by category
const byCategory = getObjectiveFunctionsByCategory();
// {
//   "Mouthpiece": [{ name: "FippleFactorObjectiveFunction", displayName: "Fipple factor", ... }],
//   "Holes": [{ name: "HolePositionObjectiveFunction", ... }],
//   ...
// }

// Get metadata for a specific function
const info = OBJECTIVE_FUNCTION_INFO["HolePositionObjectiveFunction"];
// { displayName: "Hole size & position", category: "Holes", description: "..." }
```

### Available Categories

| Category | Description |
|----------|-------------|
| **Mouthpiece** | Fipple factor, window height, beta, airstream length |
| **Holes** | Position, size, and combined hole optimization |
| **Grouped Holes** | Holes in groups with equal spacing |
| **Single Taper** | Single taper bore with various hole grouping options |
| **Hemi-Head** | Single taper with hemispherical bore head (NAF) |
| **Bore** | Bore length, diameter, position, and spacing |
| **Combined** | Hole + bore combined optimization |
| **Global** | Global optimizer variants (DIRECT) |
| **Calibration** | Instrument calibration objectives |

### API Endpoint Usage

The web API accepts the objective function name directly:

```typescript
// POST /api/optimize
const response = await fetch("/api/optimize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instrument,
    tuning,
    objectiveFunction: "FippleFactorObjectiveFunction", // Or any registered name
    temperature: 20,
    humidity: 45,
  }),
});

const result = await response.json();
// {
//   optimizedInstrument: { ... },
//   initialError: 245.3,
//   finalError: 8.2,
//   iterations: 523,
//   converged: true,
//   objectiveFunction: "FippleFactorObjectiveFunction",
//   dimensions: 1
// }
```

### Sidebar Integration

The web UI sidebar shows available optimizers. Selecting one updates `state.selectedOptimizer`, which is passed to the API when clicking Optimize.

```
Optimizer (sidebar)
├─ Fipple factor
├─ Grouped-hole position & size
├─ Hole size & position (default)
├─ Hole size only
├─ Single taper, grouped hole
├─ Single taper, hemi-head, grouped hole
├─ Single taper, hemi-head, no hole grouping
└─ Single taper, no hole grouping
```

## BOBYQA Algorithm

### Reference

> M. J. D. Powell, "The BOBYQA algorithm for bound constrained optimization without derivatives," Technical Report DAMTP 2009/NA06, Centre for Mathematical Sciences, University of Cambridge, 2009.

### Key Idea

BOBYQA is a derivative-free optimizer that:
1. Builds a quadratic model using interpolation points
2. Optimizes within a trust region
3. Iteratively refines the solution as the trust region shrinks

```
Trust Region Concept:

                    ●  interpolation points
             ●      ○  current best
               ╭─────╮
            ●  │  ○  │  ●
               │     │
            ●  ╰─────╯  ●
                    ●

The quadratic model approximates f(x) locally.
Trust region radius shrinks as we converge.
```

### Algorithm Steps

```
1. Initialize: Place n+1 to (n+1)(n+2)/2 interpolation points
2. Build: Construct quadratic model from function values
3. Solve: Find minimum of model within trust region
4. Update: Evaluate function at trial point
5. Adjust: Shrink/expand trust region based on actual vs predicted improvement
6. Repeat: Until trust region radius < threshold
```

### Implementation Details

```typescript
interface BOBYQAOptions {
  numberOfInterpolationPoints?: number;  // Default: 2n+1
  initialTrustRegionRadius?: number;     // Starting radius
  stoppingTrustRegionRadius?: number;    // Convergence threshold
  maxEvaluations?: number;               // Maximum function calls
}
```

### Configuration

- **Interpolation points**: Between n+2 and (n+1)(n+2)/2 where n is dimension
- **Trust region**: Starts large, shrinks during optimization
- **Stopping radius**: Typically 1e-6 to 1e-8 for high precision

### When to Use BOBYQA

| Situation | Optimizer |
|-----------|-----------|
| Unknown landscape, need global search | DIRECT |
| Near optimum, need refinement | BOBYQA |
| Single-variable optimization | Brent |
| Population-based evolution | CMA-ES |
| Simple derivative-free | Simplex |
| Direction-based search | Powell |
| Standard two-stage workflow | DIRECT → BOBYQA |

## Brent Algorithm (Univariate)

### Reference

> Brent, R.P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall, Englewood Cliffs, NJ.

### Key Idea

Brent's method combines **parabolic interpolation** for fast convergence with **golden section search** for guaranteed convergence:

1. Maintains a bracket [a, b] containing the minimum
2. Tries parabolic interpolation through 3 points
3. Falls back to golden section if parabolic step is invalid
4. Iteratively narrows the bracket until convergence

```
Brent's Method Concept:

f(x) │    ●
     │   / \     ← Parabolic fit through 3 points
     │  ●   ●
     │ /     \   → Predicts minimum location
     │●       ●
     └─────────────── x
     a         b
```

### Configuration

```typescript
interface BrentOptimizerOptions {
  relativeTolerance?: number;   // Default: 1e-6
  absoluteTolerance?: number;   // Default: 1e-14
  maxEvaluations?: number;      // Default: 10000
  maxIterations?: number;       // Default: unlimited
}
```

### Usage

```typescript
import { brentMinimize } from "./optimization/brent-optimizer.ts";

// Find minimum of f(x) = (x - 3)^2 on [0, 10]
const result = brentMinimize(
  (x) => (x - 3) * (x - 3),
  0,      // lower bound
  10,     // upper bound
  5       // starting point
);

console.log(result.point);   // ≈ 3
console.log(result.value);   // ≈ 0
```

## CMA-ES Algorithm

### Reference

> Hansen, N. (2016). The CMA Evolution Strategy: A Tutorial.

### Key Idea

CMA-ES (Covariance Matrix Adaptation Evolution Strategy) is a **population-based evolutionary algorithm** that:

1. Samples a population of candidate solutions
2. Selects the best candidates
3. Updates the covariance matrix to adapt search direction
4. Repeats until convergence

```
CMA-ES Evolution:

Generation 1:    Generation 2:    Generation 3:
    ●  ●             ●                ●
  ●    ●  ●       ●    ●           ●  ●
    ●                ●  ●             ●
  ●    ●           ●                  ●

   Random         Covariance        Concentrated
   sampling       adapts            at optimum
```

### Configuration

```typescript
interface CMAESOptions {
  maxEvaluations?: number;   // Default: 10000
  populationSize?: number;   // Default: 5 + 5*log(n)
  sigma?: number[];          // Initial step sizes (default: 0.2 * range)
  stopFitness?: number;      // Target value to stop
}
```

### Usage

```typescript
import { cmaesMinimize } from "./optimization/cmaes-optimizer.ts";

// Find minimum of Rosenbrock function
const result = cmaesMinimize(
  (x) => {
    const a = 1 - x[0];
    const b = x[1] - x[0] * x[0];
    return a * a + 100 * b * b;
  },
  [-5, -5],  // lower bounds
  [5, 5],    // upper bounds
  [0, 0],    // starting point
  { maxEvaluations: 5000 }
);

console.log(result.point);   // ≈ [1, 1]
```

## Simplex (Nelder-Mead) Algorithm

### Reference

> Nelder, J.A., Mead, R. (1965). A simplex method for function minimization. The Computer Journal, 7(4), 308-313.

### Key Idea

The Nelder-Mead simplex method uses a geometric figure (simplex) that moves through parameter space:

1. Start with n+1 vertices in n dimensions
2. **Reflect** the worst vertex through the centroid
3. **Expand** if improvement is large
4. **Contract** if improvement is small
5. **Shrink** the entire simplex if stuck

```
Simplex Operations (2D):

    Original        Reflection       Expansion
       ●                ●               ●
      / \              / \             / \
     ●───●  worst→    ●───●───○       ●───●───────○

    Contraction      Shrink
       ●               ●
      /|\             /|\
     ●─○─●           ○─○─○   (all vertices move toward best)
```

### Configuration

```typescript
interface SimplexOptimizerOptions {
  maxEvaluations?: number;    // Default: 10000
  maxIterations?: number;     // Default: unlimited
  functionTolerance?: number; // Default: 1e-8
  pointTolerance?: number;    // Default: 1e-6
  stepSizes?: number[];       // Initial simplex size (default: 0.25 * range)
}
```

### Usage

```typescript
import { simplexMinimize } from "./optimization/simplex-optimizer.ts";

const result = simplexMinimize(
  (x) => x[0] * x[0] + x[1] * x[1],  // Sphere function
  [-5, -5],
  [5, 5],
  [2, 2],
  { maxEvaluations: 2000 }
);

console.log(result.point);   // ≈ [0, 0]
```

## Powell Algorithm

### Reference

> Powell, M.J.D. (1964). An efficient method for finding the minimum of a function of several variables without calculating derivatives. The Computer Journal, 7(2), 155-162.

### Key Idea

Powell's method performs successive **line searches** along a set of directions:

1. Start with coordinate axes as search directions
2. Perform line search along each direction (using Brent)
3. Compute new direction from overall displacement
4. Update directions to become **conjugate**
5. Repeat until convergence

```
Powell's Conjugate Directions:

Initial directions:    After adaptation:
     y                      y
     ↑                      ↑
     │    →x               /\   ← Aligned with
     │                    /  \     function contours

Coordinate axes      Conjugate directions
(suboptimal)         (efficient)
```

### Configuration

```typescript
interface PowellOptimizerOptions {
  maxEvaluations?: number;              // Default: 10000
  maxIterations?: number;               // Default: unlimited
  relativeTolerance?: number;           // Default: 1e-6
  absoluteTolerance?: number;           // Default: 1e-14
  lineSearchRelativeTolerance?: number; // Default: 1e-6
  lineSearchAbsoluteTolerance?: number; // Default: 1e-14
}
```

### Usage

```typescript
import { powellMinimize } from "./optimization/powell-optimizer.ts";

const result = powellMinimize(
  (x) => x[0] * x[0] + 10 * x[1] * x[1],  // Ellipsoid
  [-5, -5],
  [5, 5],
  [3, 3],
  { maxEvaluations: 3000 }
);

console.log(result.point);   // ≈ [0, 0]
```

## Two-Stage Optimization Pipeline

The default optimization workflow uses both algorithms:

```typescript
// Stage 1: Global search with DIRECT
const directResult = runDirect(objective, startPoint, {
  maxEvaluations: maxEval / 2,
});

// Stage 2: Local refinement with BOBYQA
const bobyqaResult = runBobyqa(objective, directResult.point, {
  maxEvaluations: maxEval / 2,
});

// Use better result
const finalPoint = bobyqaResult.value < directResult.value
  ? bobyqaResult.point
  : directResult.point;
```

This pipeline matches the Java WWIDesigner behavior.

## Multi-Start Optimization

Multi-start optimization runs the optimizer from multiple starting points to escape local minima.

### Range Processors

Three strategies are available for generating starting points:

| Strategy | Class | Description |
|----------|-------|-------------|
| `random` | `RandomRangeProcessor` | Uniformly distributed random points |
| `grid` | `GridRangeProcessor` | Regular grid across parameter space |
| `lhs` | `LatinHypercubeRangeProcessor` | Latin Hypercube Sampling for space-filling |

### Usage

```typescript
import { optimizeObjectiveFunction } from "./optimization/index.ts";

// Enable multi-start with options
const result = optimizeObjectiveFunction(objective, {
  numberOfStarts: 30,               // Number of starting points
  multiStartStrategy: "random",     // Strategy: "random", "grid", or "lhs"
  indicesToVary: [0],               // Only vary first dimension (bore length)
  maxEvaluations: 30000,            // Total evaluations across all starts
});
```

### "Vary Bore Length" Pattern

To vary only bore length (dimension 0) like Java's multi-start:

```typescript
import { GridRangeProcessor } from "./optimization/index.ts";

// Create range processor that only varies dimension 0
const rangeProcessor = new GridRangeProcessor(
  objective.getLowerBounds(),
  objective.getUpperBounds(),
  [0],  // Only vary dimension 0 (bore length)
  30    // 30 starting points
);

// Set static values for other dimensions
rangeProcessor.setStaticValues(objective.getInitialPoint());

// Attach to objective function
objective.setRangeProcessor(rangeProcessor);

// Run optimization (will automatically use multi-start)
const result = optimizeObjectiveFunction(objective);
```

### Best Result Selection

Multi-start optimization:
1. Runs optimization from each starting point
2. Collects all results
3. Sorts by objective value (best first)
4. Returns the best result found

## Two-Stage Evaluator Optimization

Two-stage optimization uses a faster "first-stage" evaluator for exploration and a more accurate evaluator for refinement. This can speed up multi-start optimization.

### First-Stage vs Second-Stage Evaluators

| Evaluator | Stage | Speed | Accuracy | Use Case |
|-----------|-------|-------|----------|----------|
| `ReflectionEvaluator` | First | Fast | Approximate | Exploration phase |
| `CentDeviationEvaluator` | Second | Slower | Accurate | Refinement phase |

The `ReflectionEvaluator` uses the phase angle of the reflection coefficient, which is computationally cheaper than full frequency prediction.

### Enabling Two-Stage Optimization

```typescript
import { ReflectionEvaluator, CentDeviationEvaluator } from "./optimization/evaluator.ts";

// Create evaluators
const mainEvaluator = new CentDeviationEvaluator(calculator);
const firstStageEvaluator = new ReflectionEvaluator(calculator);

// Create objective function with main evaluator
const objective = createObjectiveFunction(name, calculator, tuning, mainEvaluator);

// Enable two-stage optimization
objective.setFirstStageEvaluator(firstStageEvaluator);
objective.setRunTwoStageOptimization(true);

// Run optimization
const result = optimizeObjectiveFunction(objective);
```

### How It Works

**For DIRECT optimizer (single-start):**
1. Use first-stage evaluator during DIRECT global search
2. Switch to main evaluator for BOBYQA refinement

**For BOBYQA optimizer (single-start):**
1. First run with first-stage evaluator
2. Apply geometry to instrument
3. Second run with main evaluator from refined starting point

**For Multi-start:**
1. All starts use first-stage evaluator
2. Final refinement of best result uses main evaluator

### Note on Default Behavior

Two-stage optimization is **disabled by default**, matching Java WWIDesigner's behavior. The Java source includes this comment:

> "Using different evaluators with a granular solution space can yield sub-optimal solutions."

Enable it only when you need faster exploration and are confident the first-stage evaluator provides reasonable guidance toward optima.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Core acoustic calculations
- [TONE-HOLES.md](./TONE-HOLES.md) - Hole model equations
