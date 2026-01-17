# Optimization Algorithms Skill

## Overview

WWIDesigner uses 6 optimization algorithms and 51 objective functions to find optimal instrument designs.

## Six Algorithms

### 1. DIRECT (Global)

**File:** `src/core/optimization/direct-optimizer.ts`
**Type:** Global, derivative-free
**Use Case:** Broad exploration, escaping local minima

DIviding RECTangles algorithm. Partitions search space recursively, identifying "potentially optimal" rectangles for further exploration.

```typescript
const optimizer = new DirectOptimizer({
    maxEvaluations: 10000,
    convergenceTolerance: 1e-6
});
```

### 2. BOBYQA (Local)

**File:** `src/core/optimization/bobyqa-optimizer.ts`
**Type:** Local, derivative-free, bounded
**Use Case:** Refinement near good solution

Bound Optimization BY Quadratic Approximation. Builds quadratic model from function evaluations, handles bounds natively.

```typescript
const optimizer = new BOBYQAOptimizer({
    initialTrustRadius: 0.1,
    stoppingTrustRadius: 1e-6
});
```

### 3. Brent (Univariate)

**File:** `src/core/optimization/brent-optimizer.ts`
**Type:** 1D only, derivative-free
**Use Case:** Single-parameter optimization (e.g., fipple factor)

Combines golden section with parabolic interpolation. Guaranteed convergence.

```typescript
const optimizer = new BrentOptimizer({
    tolerance: 1e-6
});
```

### 4. CMA-ES (Evolutionary)

**File:** `src/core/optimization/cmaes-optimizer.ts`
**Type:** Population-based, evolutionary
**Use Case:** Complex multi-modal landscapes

Covariance Matrix Adaptation Evolution Strategy. Adapts search distribution based on successful steps.

**Known Issue:** Eigendecomposition not fully implemented (lines 279-283). The covariance matrix adaptation is simplified, reducing effectiveness compared to Java.

```typescript
const optimizer = new CMAESOptimizer({
    populationSize: 12,
    maxIterations: 1000
});
```

### 5. Simplex (Nelder-Mead)

**File:** `src/core/optimization/simplex-optimizer.ts`
**Type:** Local, derivative-free
**Use Case:** General purpose local optimization

Classic Nelder-Mead downhill simplex. Uses reflection, expansion, contraction operations.

```typescript
const optimizer = new SimplexOptimizer({
    sideLength: 0.1,
    convergenceTolerance: 1e-6
});
```

### 6. Powell (Direction-based)

**File:** `src/core/optimization/powell-optimizer.ts`
**Type:** Local, direction search
**Use Case:** Smooth objective functions

Powell's conjugate direction method. Performs 1D searches along conjugate directions.

```typescript
const optimizer = new PowellOptimizer({
    lineSearchTolerance: 1e-6
});
```

## Optimizer Selection

From `src/core/optimization/optimizer-types.ts`:

```typescript
enum OptimizerType {
    DIRECT,   // Global search
    BOBYQA,   // Local refinement
    BRENT,    // 1D only
    CMAES,    // Evolutionary
    SIMPLEX,  // Nelder-Mead
    POWELL    // Direction search
}
```

Each objective function specifies its preferred optimizer via `getOptimizerType()`.

## 51 Objective Functions

**File:** `src/core/optimization/hole-position-objective.ts` (and related)

### Categories

| Category | Dimensions | Examples |
|----------|------------|----------|
| **Holes** | N holes | `HolePositionObjectiveFunction`, `HoleSizeObjectiveFunction` |
| **Grouped Holes** | G groups + N sizes | `HoleGroupFromTopObjectiveFunction` |
| **Bore** | P bore points | `BoreDiameterFromTopObjectiveFunction` |
| **Taper** | 3-4 | `SingleTaperRatioObjectiveFunction` |
| **Mouthpiece** | 1 | `FippleFactorObjectiveFunction` (uses BRENT) |
| **Combined** | 2N + 4 | `HoleAndTaperObjectiveFunction` |
| **Global** | varies | `GlobalHoleObjectiveFunction` (uses DIRECT) |
| **Hemi-Head** | NAF-specific | `SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction` |

### Objective Function Interface

```typescript
interface ObjectiveFunction {
    // Number of optimization dimensions
    getNrDimensions(): number;

    // Get bounds for each dimension
    getLowerBounds(): number[];
    getUpperBounds(): number[];

    // Preferred optimizer for this function
    getOptimizerType(): OptimizerType;

    // Calculate error given parameter vector
    calculateError(params: number[]): number;

    // Apply optimized parameters to instrument
    setGeometry(instrument: Instrument, params: number[]): void;
}
```

## Two-Stage Optimization

Many optimizations use two stages:

1. **Global search** (DIRECT) - Find promising region
2. **Local refinement** (BOBYQA) - Fine-tune solution

Implemented in `ObjectiveFunctionOptimizer`:

```typescript
// Two-stage is automatic when objective uses DIRECT
const result = await optimizer.optimize(instrument, tuning, constraints);
```

## Evaluators

**File:** `src/core/optimization/evaluator.ts`

Calculate tuning error from predicted vs target frequencies:

| Evaluator | Description |
|-----------|-------------|
| `CentDeviationEvaluator` | Standard cents deviation |
| `FminEvaluator` | Minimum frequency error |
| `FmaxEvaluator` | Maximum frequency error |
| `ReactanceEvaluator` | Reactance-based error |
| `ZminEvaluator` | Minimum impedance error |
| `ZmaxEvaluator` | Maximum impedance error |

## Constraint System

Constraints define bounds and fixed values for optimization:

```typescript
interface Constraints {
    // Fixed parameters (not optimized)
    fixedHolePositions?: number[];
    fixedHoleSizes?: number[];

    // Bounds for optimization
    holePositionBounds?: [number, number][];
    holeSizeBounds?: [number, number][];

    // Groupings
    holeGroups?: number[][];
}
```

## Performance Tips

1. **Start with DIRECT** for new problems (escapes local minima)
2. **Use BOBYQA for refinement** after DIRECT finds good region
3. **Use BRENT for 1D** problems (much faster than multivariate)
4. **Avoid CMA-ES** until eigendecomposition is fixed
5. **Check evaluations count** - DIRECT can be expensive

## Documentation

See `wwi-designer-web/docs/OPTIMIZATION.md` for algorithm details.
