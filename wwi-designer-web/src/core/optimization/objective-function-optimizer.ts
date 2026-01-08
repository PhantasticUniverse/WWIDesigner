/**
 * Orchestrator for running optimization on objective functions.
 *
 * Supports multiple optimizer types and two-stage optimization.
 *
 * Ported from com.wwidesigner.optimization.ObjectiveFunctionOptimizer.java
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { DIRECTOptimizer, type OptimizationResult } from "./direct-optimizer.ts";
import { BOBYQAOptimizer } from "./bobyqa-optimizer.ts";
import { BrentOptimizer } from "./brent-optimizer.ts";
import { CMAESOptimizer } from "./cmaes-optimizer.ts";
import { SimplexOptimizer } from "./simplex-optimizer.ts";
import { PowellOptimizer } from "./powell-optimizer.ts";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "./base-objective-function.ts";
import { RandomRangeProcessor } from "./range-processor.ts";

/**
 * Result of an optimization run with additional statistics.
 */
export interface OptimizationOutcome {
  /** Whether optimization succeeded */
  success: boolean;
  /** Optimal point found */
  point: number[];
  /** Final error norm */
  finalNorm: number;
  /** Initial error norm */
  initialNorm: number;
  /** Residual error ratio (finalNorm / initialNorm) */
  residualErrorRatio: number;
  /** Number of function evaluations */
  evaluations: number;
  /** Number of tuning calculations */
  tunings: number;
  /** Elapsed time in milliseconds */
  elapsedTime: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for the optimizer.
 */
export interface OptimizerOptions {
  /** Maximum number of function evaluations */
  maxEvaluations?: number;
  /** Target function value (stop if reached) */
  targetValue?: number;
  /** Convergence threshold for DIRECT */
  convergenceThreshold?: number;
  /** Whether to run two-stage optimization */
  twoStage?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string, progress?: number) => void;
  /** Number of multi-start runs (0 or undefined = single start) */
  numberOfStarts?: number;
  /** Multi-start strategy: "random", "grid", or "lhs" */
  multiStartStrategy?: "random" | "grid" | "lhs";
  /** Indices of dimensions to vary in multi-start (null = all) */
  indicesToVary?: number[] | null;
  /** Force use of DIRECT optimizer regardless of objective function's preference */
  forceDirectOptimizer?: boolean;
}

/**
 * Result from a single optimization start.
 */
interface SingleStartResult {
  point: number[];
  value: number;
  evaluations: number;
}

/**
 * Format an error vector for display.
 */
function formatErrors(description: string, norm: number, _errorVector?: number[]): string {
  return `${description}${norm.toFixed(4)}`;
}

/**
 * Optimize an objective function using the DIRECT algorithm.
 */
function runDirect(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const optimizer = new DIRECTOptimizer({
    convergenceThreshold: options.convergenceThreshold ?? 7.0e-8,
    maxEvaluations: options.maxEvaluations ?? objective.getMaxEvaluations() * 2,
    targetValue: options.targetValue ?? 0.001,
  });

  return optimizer.optimize(
    (point) => objective.value(point),
    objective.getLowerBounds(),
    objective.getUpperBounds(),
    startPoint
  );
}

/**
 * Optimize using the BOBYQA algorithm.
 *
 * BOBYQA (Bound Optimization BY Quadratic Approximation) is a
 * derivative-free optimizer that uses quadratic interpolation
 * models within a trust region framework.
 */
function runBobyqa(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const trustRegion = objective.getInitialTrustRegionRadius(startPoint);
  const stoppingTrustRegion = objective.getStoppingTrustRegionRadius();
  const nrInterpolations = objective.getNrInterpolations();

  const optimizer = new BOBYQAOptimizer(
    nrInterpolations,
    trustRegion,
    stoppingTrustRegion,
    options.maxEvaluations ?? objective.getMaxEvaluations()
  );

  return optimizer.optimize(
    (point) => objective.value(point),
    objective.getLowerBounds(),
    objective.getUpperBounds(),
    startPoint
  );
}

/**
 * Optimize using Brent's algorithm for univariate (1D) functions.
 *
 * Brent's method combines parabolic interpolation with golden section
 * search for fast, reliable convergence on single-variable problems.
 */
function runBrent(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  if (objective.getNrDimensions() !== 1) {
    throw new Error("Brent optimizer requires exactly 1 dimension");
  }

  const optimizer = new BrentOptimizer({
    relativeTolerance: 1e-6,
    absoluteTolerance: 1e-14,
    maxEvaluations: options.maxEvaluations ?? objective.getMaxEvaluations(),
  });

  const lowerBounds = objective.getLowerBounds();
  const upperBounds = objective.getUpperBounds();

  // Create a univariate wrapper function
  const univariateFunc = (x: number) => objective.value([x]);

  const result = optimizer.optimize(
    univariateFunc,
    lowerBounds[0]!,
    upperBounds[0]!,
    startPoint[0]
  );

  return {
    point: [result.point],
    value: result.value,
    evaluations: result.evaluations,
    iterations: result.iterations,
    converged: result.converged,
  };
}

/**
 * Optimize using CMA-ES (Covariance Matrix Adaptation Evolution Strategy).
 *
 * A population-based evolutionary algorithm that adapts the covariance
 * matrix of a multivariate normal distribution to sample better solutions.
 */
function runCmaes(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const lowerBounds = objective.getLowerBounds();
  const upperBounds = objective.getUpperBounds();
  const n = startPoint.length;

  // Calculate sigma (step sizes) as 0.2 * range per dimension
  const sigma = new Array(n);
  for (let i = 0; i < n; i++) {
    sigma[i] = 0.2 * (upperBounds[i]! - lowerBounds[i]!);
  }

  // Population size: 5 + 5*log(n) as per Java implementation
  const populationSize = 5 + Math.floor(5 * Math.log(n));

  const optimizer = new CMAESOptimizer({
    maxEvaluations: options.maxEvaluations ?? objective.getMaxEvaluations(),
    stopFitness: options.targetValue ?? 0.0001,
    sigma,
    populationSize,
    relativeTolerance: 1e-6,
    absoluteTolerance: 1e-14,
  });

  return optimizer.optimize(
    (point) => objective.value(point),
    lowerBounds,
    upperBounds,
    startPoint
  );
}

/**
 * Optimize using Simplex (Nelder-Mead) method.
 *
 * A derivative-free method using a geometric simplex that moves
 * through the search space via reflection, expansion, and contraction.
 */
function runSimplex(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const lowerBounds = objective.getLowerBounds();
  const upperBounds = objective.getUpperBounds();

  // Calculate step sizes (25% of distance to more distant bound) as per Java
  const stepSizes = objective.getSimplexStepSize();

  const optimizer = new SimplexOptimizer({
    maxEvaluations: options.maxEvaluations ?? objective.getMaxEvaluations(),
    relativeTolerance: 1e-6,
    absoluteTolerance: 1e-14,
    stepSizes,
  });

  return optimizer.optimize(
    (point) => objective.value(point),
    lowerBounds,
    upperBounds,
    startPoint
  );
}

/**
 * Optimize using Powell's conjugate direction method.
 *
 * A derivative-free method using successive line searches
 * along conjugate directions.
 */
function runPowell(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const lowerBounds = objective.getLowerBounds();
  const upperBounds = objective.getUpperBounds();

  const optimizer = new PowellOptimizer({
    maxEvaluations: options.maxEvaluations ?? objective.getMaxEvaluations(),
    relativeTolerance: 1e-6,
    absoluteTolerance: 1e-14,
  });

  return optimizer.optimize(
    (point) => objective.value(point),
    lowerBounds,
    upperBounds,
    startPoint
  );
}

/**
 * Run a simple local optimization using coordinate descent.
 *
 * This is used as a fallback for optimizer types that are not yet implemented.
 */
function runLocalOptimization(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): OptimizationResult {
  const maxEval = options.maxEvaluations ?? objective.getMaxEvaluations();
  const lowerBounds = objective.getLowerBounds();
  const upperBounds = objective.getUpperBounds();
  const n = startPoint.length;

  let currentPoint = [...startPoint];
  let currentValue = objective.value(currentPoint);
  let evaluations = 1;
  let improved = true;
  let iterations = 0;

  // Coordinate descent with adaptive step sizes
  const stepSizes = new Array(n);
  for (let i = 0; i < n; i++) {
    stepSizes[i] = 0.1 * (upperBounds[i]! - lowerBounds[i]!);
  }

  while (improved && evaluations < maxEval) {
    improved = false;
    iterations++;

    for (let dim = 0; dim < n && evaluations < maxEval; dim++) {
      // Try positive step
      const testPoint1 = [...currentPoint];
      testPoint1[dim] = Math.min(
        upperBounds[dim]!,
        currentPoint[dim]! + stepSizes[dim]!
      );

      const value1 = objective.value(testPoint1);
      evaluations++;

      if (value1 < currentValue) {
        currentPoint = testPoint1;
        currentValue = value1;
        improved = true;
        stepSizes[dim] = stepSizes[dim]! * 1.2; // Increase step
        continue;
      }

      // Try negative step
      const testPoint2 = [...currentPoint];
      testPoint2[dim] = Math.max(
        lowerBounds[dim]!,
        currentPoint[dim]! - stepSizes[dim]!
      );

      const value2 = objective.value(testPoint2);
      evaluations++;

      if (value2 < currentValue) {
        currentPoint = testPoint2;
        currentValue = value2;
        improved = true;
        stepSizes[dim] = stepSizes[dim]! * 1.2;
      } else {
        // Reduce step size
        stepSizes[dim] = stepSizes[dim]! * 0.5;
      }
    }

    // Check if all step sizes are very small
    const minStep = Math.min(...stepSizes);
    const maxRange = Math.max(
      ...upperBounds.map((ub, i) => ub - lowerBounds[i]!)
    );
    if (minStep < maxRange * 1e-10) {
      break;
    }
  }

  return {
    point: currentPoint,
    value: currentValue,
    evaluations,
    iterations,
    converged: true,
  };
}

/**
 * Run a single optimization start from a given starting point.
 */
function doSingleStart(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): SingleStartResult {
  // Use DIRECT if forceDirectOptimizer is set, otherwise use objective's preferred type
  const optimizerType = options.forceDirectOptimizer
    ? OptimizerType.DIRECT
    : objective.getOptimizerType();

  let result: OptimizationResult;

  if (optimizerType === OptimizerType.DIRECT) {
    // Two-stage: DIRECT for global, then BOBYQA for local refinement
    const directResult = runDirect(objective, startPoint, {
      ...options,
      maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
    });

    const bobyqaResult = runBobyqa(objective, directResult.point, {
      ...options,
      maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
    });

    result = bobyqaResult.value < directResult.value ? bobyqaResult : directResult;
  } else if (optimizerType === OptimizerType.BOBYQA) {
    result = runBobyqa(objective, startPoint, options);
  } else if (optimizerType === OptimizerType.BRENT) {
    // Brent optimizer for univariate (1D) problems
    if (objective.getNrDimensions() === 1) {
      result = runBrent(objective, startPoint, options);
    } else {
      // Fall back to BOBYQA for multivariate
      result = runBobyqa(objective, startPoint, options);
    }
  } else if (optimizerType === OptimizerType.CMAES) {
    // CMA-ES evolutionary optimizer
    result = runCmaes(objective, startPoint, options);
  } else if (optimizerType === OptimizerType.SIMPLEX) {
    // Simplex (Nelder-Mead) optimizer
    result = runSimplex(objective, startPoint, options);
  } else if (optimizerType === OptimizerType.POWELL) {
    // Powell's conjugate direction optimizer
    result = runPowell(objective, startPoint, options);
  } else {
    result = runLocalOptimization(objective, startPoint, options);
  }

  return {
    point: result.point,
    value: result.value,
    evaluations: result.evaluations,
  };
}

/**
 * Run multi-start optimization.
 *
 * Runs the optimizer from multiple starting points and returns the best result.
 * This helps escape local minima and find better global solutions.
 *
 * When forceDirectOptimizer is set, follows Java's pattern:
 * 1. Run DIRECT once to find global region
 * 2. Refine with BOBYQA
 * 3. Then run multiple random BOBYQA starts (NOT multiple DIRECT runs)
 */
function multiStartOptimize(
  objective: BaseObjectiveFunction,
  startPoint: number[],
  options: OptimizerOptions
): SingleStartResult {
  const onProgress = options.onProgress ?? (() => {});

  // Get or create range processor
  let rangeProcessor = objective.getRangeProcessor();
  const numberOfStarts = options.numberOfStarts ?? rangeProcessor?.getNumberOfStarts() ?? 30;

  if (rangeProcessor === null) {
    // Create default random range processor
    rangeProcessor = new RandomRangeProcessor(
      objective.getLowerBounds(),
      objective.getUpperBounds(),
      options.indicesToVary ?? null,
      numberOfStarts
    );
  }

  // Set static values for non-varying dimensions
  rangeProcessor.setStaticValues(startPoint);

  // Store results from each start
  const results: (SingleStartResult | null)[] = new Array(numberOfStarts).fill(null);

  // Calculate evaluations per start
  const totalMaxEvals = options.maxEvaluations ?? objective.getMaxEvaluations() * numberOfStarts;

  // Save original evaluator for two-stage optimization
  const originalEvaluator = objective.getEvaluator();
  const firstStageEvaluator = objective.getFirstStageEvaluator();
  const runTwoStage = objective.isRunTwoStageOptimization() && firstStageEvaluator !== null;

  let totalEvaluations = 0;
  let refinedStartPoint = [...startPoint];

  // If forceDirectOptimizer is set, run DIRECT once first to find global region
  // This matches Java's behavior: DIRECT → BOBYQA refine → multi-start BOBYQA
  if (options.forceDirectOptimizer) {
    // Use first-stage evaluator for DIRECT if two-stage is enabled
    if (runTwoStage && firstStageEvaluator) {
      objective.setEvaluator(firstStageEvaluator);
    }

    onProgress("Running DIRECT global optimizer...");
    const directResult = runDirect(objective, startPoint, {
      ...options,
      maxEvaluations: Math.floor(totalMaxEvals / 4), // Use 25% of budget for DIRECT
    });
    totalEvaluations += directResult.evaluations;
    onProgress(`After global optimizer, error: ${directResult.value.toFixed(4)}`);

    // Refine with BOBYQA
    const bobyqaResult = runBobyqa(objective, directResult.point, {
      ...options,
      maxEvaluations: Math.floor(totalMaxEvals / 8), // Use 12.5% for refinement
      forceDirectOptimizer: false, // Don't use DIRECT for refinement
    });
    totalEvaluations += bobyqaResult.evaluations;
    refinedStartPoint = bobyqaResult.value < directResult.value ? bobyqaResult.point : directResult.point;
    onProgress(`Refined start, error: ${Math.min(bobyqaResult.value, directResult.value).toFixed(4)}`);

    // Restore original evaluator for multi-start phase
    if (runTwoStage) {
      objective.setEvaluator(originalEvaluator);
    }
  }

  // Use first-stage evaluator for multi-start phase if two-stage is enabled
  if (runTwoStage && firstStageEvaluator) {
    objective.setEvaluator(firstStageEvaluator);
  }

  // Calculate remaining evaluations per start
  const remainingEvals = totalMaxEvals - totalEvaluations;
  const evalsPerStart = Math.floor(remainingEvals / numberOfStarts);

  let nextStart = [...refinedStartPoint];

  // Multi-start loop - always uses BOBYQA (not DIRECT) for each start
  // This matches Java's optimizeMultiStart() behavior
  const multiStartOptions = {
    ...options,
    forceDirectOptimizer: false, // Never use DIRECT in multi-start loop
  };

  for (let startNr = 0; startNr < numberOfStarts; startNr++) {
    if (totalEvaluations >= totalMaxEvals) {
      break;
    }

    onProgress(`Start ${startNr + 1}/${numberOfStarts}...`, startNr / numberOfStarts);

    try {
      const result = doSingleStart(objective, nextStart, {
        ...multiStartOptions,
        maxEvaluations: Math.min(evalsPerStart, totalMaxEvals - totalEvaluations),
      });

      results[startNr] = result;
      totalEvaluations += result.evaluations;

      onProgress(
        `Start ${startNr + 1}: optimum ${result.value.toFixed(4)} (${result.evaluations} evals)`,
        (startNr + 1) / numberOfStarts
      );
    } catch (e) {
      // Failed start - continue with others
      onProgress(`Start ${startNr + 1}: failed - ${e instanceof Error ? e.message : String(e)}`);
    }

    // Generate next starting point
    nextStart = rangeProcessor.nextVector();
  }

  // Sort results (best to worst), with nulls at end
  const validResults = results.filter((r): r is SingleStartResult => r !== null);
  validResults.sort((a, b) => a.value - b.value);

  if (validResults.length === 0) {
    // All starts failed - return initial point
    return {
      point: startPoint,
      value: objective.value(startPoint),
      evaluations: totalEvaluations,
    };
  }

  // Get best result (guaranteed to exist since we checked length > 0 above)
  let bestResult = validResults[0]!;

  // Final refinement with original evaluator if two-stage is enabled
  if (runTwoStage) {
    objective.setEvaluator(originalEvaluator);

    onProgress("Final refinement with full evaluator...");

    try {
      const refinedResult = doSingleStart(objective, bestResult.point, {
        ...multiStartOptions,
        maxEvaluations: Math.floor(evalsPerStart / 2),
      });

      if (refinedResult.value < bestResult.value) {
        bestResult = refinedResult;
        onProgress(`Refined to ${bestResult.value.toFixed(4)}`);
      }
    } catch (e) {
      // Refinement failed - use best multi-start result
      onProgress(`Refinement failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onProgress(
    `Multi-start complete: best ${bestResult.value.toFixed(4)} from ${validResults.length} successful starts`
  );

  return {
    point: bestResult.point,
    value: bestResult.value,
    evaluations: totalEvaluations,
  };
}

/**
 * Run optimization on an objective function.
 */
export function optimizeObjectiveFunction(
  objective: BaseObjectiveFunction,
  options: OptimizerOptions = {}
): OptimizationOutcome {
  const startTime = performance.now();
  const onProgress = options.onProgress ?? (() => {});

  onProgress(
    `System has ${objective.getNrDimensions()} optimization variables and ${objective.getNrNotes()} target notes.`
  );

  if (objective.getNrDimensions() === 0) {
    return {
      success: false,
      point: [],
      finalNorm: 0,
      initialNorm: 0,
      residualErrorRatio: 1,
      evaluations: 0,
      tunings: 0,
      elapsedTime: performance.now() - startTime,
      error: "Zero optimization variables",
    };
  }

  objective.resetStatistics();

  try {
    const startPoint = objective.getInitialPoint();
    const initialErrorVector = objective.getErrorVector(startPoint);
    const initialNorm = objective.calcNorm(initialErrorVector);

    onProgress(formatErrors("Initial error: ", initialNorm));

    let finalPoint: number[];

    // Check if multi-start optimization is enabled
    const useMultiStart =
      objective.isMultiStart() ||
      (options.numberOfStarts !== undefined && options.numberOfStarts > 1);

    if (useMultiStart) {
      // Run multi-start optimization
      const numberOfStarts = options.numberOfStarts ?? objective.getRangeProcessor()?.getNumberOfStarts() ?? 30;
      onProgress(`Running multi-start optimization (${numberOfStarts} starts)...`);

      const multiStartResult = multiStartOptimize(objective, startPoint, options);
      finalPoint = multiStartResult.point;

      onProgress(
        `Multi-start found optimum ${multiStartResult.value.toFixed(4)} in ${multiStartResult.evaluations} total evaluations`
      );
    } else {
      // Single-start optimization
      // Use DIRECT if forceDirectOptimizer is set, otherwise use objective's preferred type
      const optimizerType = options.forceDirectOptimizer
        ? OptimizerType.DIRECT
        : objective.getOptimizerType();

      // Check for two-stage optimization
      const originalEvaluator = objective.getEvaluator();
      const firstStageEvaluator = objective.getFirstStageEvaluator();
      const runTwoStage = objective.isRunTwoStageOptimization() && firstStageEvaluator !== null;

      if (optimizerType === OptimizerType.DIRECT) {
        // Two-stage: DIRECT for global, then BOBYQA for local refinement

        // Use first-stage evaluator for DIRECT if two-stage is enabled
        if (runTwoStage && firstStageEvaluator) {
          onProgress("Using first-stage evaluator for global search...");
          objective.setEvaluator(firstStageEvaluator);
        }

        onProgress("Running global optimization (DIRECT)...");

        const directResult = runDirect(objective, startPoint, {
          ...options,
          maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
        });

        onProgress(
          `After ${directResult.evaluations} evaluations, global optimizer found optimum ${directResult.value.toFixed(4)}`
        );

        // Switch back to original evaluator for BOBYQA refinement
        if (runTwoStage) {
          onProgress("Switching to full evaluator for refinement...");
          objective.setEvaluator(originalEvaluator);
        }

        // Refine with BOBYQA (matching Java's two-stage pipeline)
        onProgress("Refining with BOBYQA...");
        const bobyqaResult = runBobyqa(objective, directResult.point, {
          ...options,
          maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
        });

        if (bobyqaResult.value < directResult.value) {
          finalPoint = bobyqaResult.point;
          onProgress(
            `BOBYQA refined to ${bobyqaResult.value.toFixed(4)} in ${bobyqaResult.evaluations} evaluations`
          );
        } else {
          finalPoint = directResult.point;
          onProgress(
            `BOBYQA did not improve (${bobyqaResult.value.toFixed(4)})`
          );
        }
      } else if (optimizerType === OptimizerType.BOBYQA) {
        // BOBYQA optimization - two-stage runs twice if enabled

        if (runTwoStage && firstStageEvaluator) {
          // First run with first-stage evaluator
          onProgress("Running optimization with first-stage evaluator...");
          objective.setEvaluator(firstStageEvaluator);

          const firstStageResult = runBobyqa(objective, startPoint, {
            ...options,
            maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
          });

          onProgress(
            `First stage found ${firstStageResult.value.toFixed(4)} in ${firstStageResult.evaluations} evaluations`
          );

          // Apply geometry and get new start point
          objective.setGeometryPoint(firstStageResult.point);
          const refinedStart = objective.getInitialPoint();

          // Switch to original evaluator for second run
          onProgress("Refining with full evaluator...");
          objective.setEvaluator(originalEvaluator);

          const secondStageResult = runBobyqa(objective, refinedStart, {
            ...options,
            maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
          });

          finalPoint = secondStageResult.point;
          onProgress(
            `BOBYQA refined to ${secondStageResult.value.toFixed(4)} in ${secondStageResult.evaluations} evaluations`
          );
        } else {
          // Single-stage BOBYQA
          onProgress("Running optimization (BOBYQA)...");
          const result = runBobyqa(objective, startPoint, options);
          finalPoint = result.point;
          onProgress(
            `BOBYQA found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
          );
        }
      } else if (optimizerType === OptimizerType.BRENT) {
        // Brent's method for univariate (1D) optimization
        if (objective.getNrDimensions() === 1) {
          onProgress("Running optimization (Brent univariate)...");
          const result = runBrent(objective, startPoint, options);
          finalPoint = result.point;
          onProgress(
            `Brent found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
          );
        } else {
          // Fall back to BOBYQA for multivariate problems
          onProgress("Running optimization (BOBYQA, Brent fallback for multivariate)...");
          const result = runBobyqa(objective, startPoint, options);
          finalPoint = result.point;
          onProgress(
            `BOBYQA found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
          );
        }
      } else if (optimizerType === OptimizerType.CMAES) {
        // CMA-ES evolutionary optimizer
        onProgress("Running optimization (CMA-ES)...");
        const result = runCmaes(objective, startPoint, options);
        finalPoint = result.point;
        onProgress(
          `CMA-ES found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
        );
      } else if (optimizerType === OptimizerType.SIMPLEX) {
        // Nelder-Mead simplex optimizer
        onProgress("Running optimization (Simplex/Nelder-Mead)...");
        const result = runSimplex(objective, startPoint, options);
        finalPoint = result.point;
        onProgress(
          `Simplex found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
        );
      } else if (optimizerType === OptimizerType.POWELL) {
        // Powell conjugate direction optimizer
        onProgress("Running optimization (Powell)...");
        const result = runPowell(objective, startPoint, options);
        finalPoint = result.point;
        onProgress(
          `Powell found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
        );
      } else {
        // Fallback to coordinate descent for unimplemented optimizer types
        onProgress(`Running optimization (fallback for ${optimizerType})...`);
        const result = runLocalOptimization(objective, startPoint, options);
        finalPoint = result.point;
      }
    }

    // Apply final geometry and compute final error
    objective.setGeometryPoint(finalPoint);
    const finalErrorVector = objective.getErrorVector(
      objective.getInitialPoint()
    );
    const finalNorm = objective.calcNorm(finalErrorVector);

    const elapsedTime = performance.now() - startTime;

    onProgress(formatErrors("Final error: ", finalNorm));
    onProgress(`Residual error ratio: ${(finalNorm / initialNorm).toFixed(4)}`);
    onProgress(
      `Performed ${objective.getNumberOfTunings()} tuning calculations in ${objective.getNumberOfEvaluations()} evaluations.`
    );
    onProgress(`Elapsed time: ${(elapsedTime / 1000).toFixed(1)} seconds`);

    return {
      success: true,
      point: finalPoint,
      finalNorm,
      initialNorm,
      residualErrorRatio: finalNorm / initialNorm,
      evaluations: objective.getNumberOfEvaluations(),
      tunings: objective.getNumberOfTunings(),
      elapsedTime,
    };
  } catch (e) {
    const elapsedTime = performance.now() - startTime;
    const errorMsg = e instanceof Error ? e.message : String(e);

    onProgress(`Optimization failed: ${errorMsg}`);

    return {
      success: false,
      point: objective.getInitialPoint(),
      finalNorm: Infinity,
      initialNorm: 0,
      residualErrorRatio: Infinity,
      evaluations: objective.getNumberOfEvaluations(),
      tunings: objective.getNumberOfTunings(),
      elapsedTime,
      error: errorMsg,
    };
  }
}

/**
 * Quick optimization using DIRECT only (no refinement).
 */
export function quickOptimize(
  objective: BaseObjectiveFunction,
  options: OptimizerOptions = {}
): OptimizationOutcome {
  const startTime = performance.now();

  if (objective.getNrDimensions() === 0) {
    return {
      success: false,
      point: [],
      finalNorm: 0,
      initialNorm: 0,
      residualErrorRatio: 1,
      evaluations: 0,
      tunings: 0,
      elapsedTime: 0,
      error: "Zero optimization variables",
    };
  }

  objective.resetStatistics();

  try {
    const startPoint = objective.getInitialPoint();
    const initialErrorVector = objective.getErrorVector(startPoint);
    const initialNorm = objective.calcNorm(initialErrorVector);

    const result = runDirect(objective, startPoint, options);

    objective.setGeometryPoint(result.point);
    const finalErrorVector = objective.getErrorVector(objective.getInitialPoint());
    const finalNorm = objective.calcNorm(finalErrorVector);

    return {
      success: true,
      point: result.point,
      finalNorm,
      initialNorm,
      residualErrorRatio: finalNorm / initialNorm,
      evaluations: objective.getNumberOfEvaluations(),
      tunings: objective.getNumberOfTunings(),
      elapsedTime: performance.now() - startTime,
    };
  } catch (e) {
    return {
      success: false,
      point: objective.getInitialPoint(),
      finalNorm: Infinity,
      initialNorm: 0,
      residualErrorRatio: Infinity,
      evaluations: objective.getNumberOfEvaluations(),
      tunings: objective.getNumberOfTunings(),
      elapsedTime: performance.now() - startTime,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
