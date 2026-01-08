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
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "./base-objective-function.ts";

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
    const optimizerType = objective.getOptimizerType();

    if (optimizerType === OptimizerType.DIRECT) {
      // Two-stage: DIRECT for global, then BOBYQA for local refinement
      onProgress("Running global optimization (DIRECT)...");

      const directResult = runDirect(objective, startPoint, {
        ...options,
        maxEvaluations: Math.floor((options.maxEvaluations ?? objective.getMaxEvaluations()) / 2),
      });

      onProgress(
        `After ${directResult.evaluations} evaluations, global optimizer found optimum ${directResult.value.toFixed(4)}`
      );

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
      // Use BOBYQA directly for local optimization
      onProgress("Running optimization (BOBYQA)...");
      const result = runBobyqa(objective, startPoint, options);
      finalPoint = result.point;
      onProgress(
        `BOBYQA found optimum ${result.value.toFixed(4)} in ${result.evaluations} evaluations`
      );
    } else if (optimizerType === OptimizerType.BRENT) {
      // Univariate optimization - use coordinate descent for now
      // TODO: Implement proper Brent optimizer for 1D
      onProgress("Running optimization (univariate)...");
      const result = runLocalOptimization(objective, startPoint, options);
      finalPoint = result.point;
    } else {
      // Fallback to coordinate descent for unimplemented optimizer types
      onProgress(`Running optimization (fallback for ${optimizerType})...`);
      const result = runLocalOptimization(objective, startPoint, options);
      finalPoint = result.point;
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
