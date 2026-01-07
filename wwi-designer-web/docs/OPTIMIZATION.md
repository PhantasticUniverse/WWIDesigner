# Optimization - DIRECT Algorithm

This document details the optimization system used to find optimal hole positions and sizes for wind instruments.

## Overview

The optimization system uses the **DIRECT (DIviding RECTangles)** algorithm, a global optimization method that doesn't require derivatives. This is well-suited for instrument optimization where:
- The objective function is expensive to compute
- The search space has multiple local minima
- Gradients are not readily available

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

### Other Evaluators

| Evaluator | Metric | Use Case |
|-----------|--------|----------|
| `CentDeviationEvaluator` | Cents from target | Primary tuning optimization |
| `FrequencyDeviationEvaluator` | Hz deviation | Absolute frequency matching |
| `ReactanceEvaluator` | Im(Z) at target freq | Resonance matching |

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

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Core acoustic calculations
- [TONE-HOLES.md](./TONE-HOLES.md) - Hole model equations
