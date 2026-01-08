/**
 * Simplex optimizer (Nelder-Mead method).
 *
 * A derivative-free optimization method that uses a simplex of n+1 points
 * in n dimensions. The simplex moves through the search space via reflection,
 * expansion, contraction, and shrinkage operations.
 *
 * Reference:
 * - Nelder, J. A. & Mead, R. (1965). "A simplex method for function minimization."
 *   The Computer Journal, 7(4), 308-313.
 * - Apache Commons Math SimplexOptimizer
 *
 * Ported from org.apache.commons.math3.optim.nonlinear.scalar.noderiv.SimplexOptimizer
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { OptimizationResult } from "./direct-optimizer.ts";

/**
 * Options for Simplex optimizer.
 */
export interface SimplexOptimizerOptions {
  /** Maximum number of function evaluations (default: 10000) */
  maxEvaluations?: number;
  /** Maximum number of iterations (default: unlimited) */
  maxIterations?: number;
  /** Relative tolerance for convergence (default: 1e-6) */
  relativeTolerance?: number;
  /** Absolute tolerance for convergence (default: 1e-14) */
  absoluteTolerance?: number;
  /** Initial step sizes per dimension (default: calculated from bounds) */
  stepSizes?: number[];
  /** Reflection coefficient (default: 1.0) */
  rho?: number;
  /** Expansion coefficient (default: 2.0) */
  chi?: number;
  /** Contraction coefficient (default: 0.5) */
  gamma?: number;
  /** Shrinkage coefficient (default: 0.5) */
  sigma?: number;
}

/**
 * A point in the simplex with its function value.
 */
interface SimplexPoint {
  point: number[];
  value: number;
}

/**
 * Simplex optimizer using the Nelder-Mead method.
 *
 * The algorithm maintains a simplex (geometric shape with n+1 vertices in n dimensions)
 * and iteratively modifies it using:
 * - Reflection: reflects the worst point through the centroid
 * - Expansion: extends the reflection if it's very good
 * - Contraction: contracts toward the best point if reflection is bad
 * - Shrinkage: shrinks entire simplex toward the best point
 */
export class SimplexOptimizer {
  private maxEvaluations: number;
  private maxIterations: number;
  private relativeTolerance: number;
  private absoluteTolerance: number;
  private inputStepSizes: number[] | undefined;
  private rho: number;  // Reflection
  private chi: number;  // Expansion
  private gamma: number;  // Contraction
  private sigma: number;  // Shrinkage

  constructor(options: SimplexOptimizerOptions = {}) {
    this.maxEvaluations = options.maxEvaluations ?? 10000;
    this.maxIterations = options.maxIterations ?? Number.MAX_SAFE_INTEGER;
    this.relativeTolerance = options.relativeTolerance ?? 1e-6;
    this.absoluteTolerance = options.absoluteTolerance ?? 1e-14;
    this.inputStepSizes = options.stepSizes;
    this.rho = options.rho ?? 1.0;
    this.chi = options.chi ?? 2.0;
    this.gamma = options.gamma ?? 0.5;
    this.sigma = options.sigma ?? 0.5;
  }

  /**
   * Optimize a function.
   *
   * @param func The objective function to minimize
   * @param lowerBounds Lower bounds for each dimension
   * @param upperBounds Upper bounds for each dimension
   * @param startPoint Initial guess
   * @returns Optimization result
   */
  optimize(
    func: (point: number[]) => number,
    lowerBounds: number[],
    upperBounds: number[],
    startPoint: number[]
  ): OptimizationResult {
    const n = startPoint.length;

    // Calculate step sizes (25% of distance to more distant bound)
    let stepSizes: number[];
    if (this.inputStepSizes) {
      stepSizes = [...this.inputStepSizes];
    } else {
      stepSizes = new Array(n);
      for (let i = 0; i < n; i++) {
        const toUpper = upperBounds[i]! - startPoint[i]!;
        const toLower = startPoint[i]! - lowerBounds[i]!;
        stepSizes[i] = 0.25 * (Math.abs(toUpper) > Math.abs(toLower) ? toUpper : -toLower);
        if (stepSizes[i] === 0) {
          stepSizes[i] = 0.1 * startPoint[i]!;
          if (stepSizes[i] === 0) {
            stepSizes[i] = 0.1;
          }
        }
      }
    }

    // Build initial simplex: n+1 points
    const simplex: SimplexPoint[] = new Array(n + 1);
    let evaluations = 0;

    // First point is the start point
    simplex[0] = {
      point: [...startPoint],
      value: func(startPoint),
    };
    evaluations++;

    // Generate remaining points by stepping in each direction
    for (let i = 0; i < n; i++) {
      const newPoint = [...startPoint];
      newPoint[i] = newPoint[i]! + stepSizes[i]!;
      // Clip to bounds
      newPoint[i] = Math.max(lowerBounds[i]!, Math.min(upperBounds[i]!, newPoint[i]!));
      simplex[i + 1] = {
        point: newPoint,
        value: func(newPoint),
      };
      evaluations++;
    }

    // Sort simplex by function value (best first)
    simplex.sort((a, b) => a.value - b.value);

    let iterations = 0;
    let converged = false;

    // Main optimization loop
    while (evaluations < this.maxEvaluations && iterations < this.maxIterations) {
      iterations++;

      // Check convergence
      const valueRange = simplex[n]!.value - simplex[0]!.value;
      const tolerance = this.relativeTolerance * Math.abs(simplex[0]!.value) + this.absoluteTolerance;

      if (valueRange < tolerance) {
        converged = true;
        break;
      }

      // Calculate centroid of all points except the worst
      const centroid = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          centroid[j] += simplex[i]!.point[j]!;
        }
      }
      for (let j = 0; j < n; j++) {
        centroid[j] /= n;
      }

      // Reflection: reflect worst point through centroid
      const reflected = new Array(n);
      for (let j = 0; j < n; j++) {
        reflected[j] = centroid[j]! + this.rho * (centroid[j]! - simplex[n]!.point[j]!);
        // Clip to bounds
        reflected[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, reflected[j]!));
      }
      const reflectedValue = func(reflected);
      evaluations++;

      if (reflectedValue < simplex[0]!.value) {
        // Reflected point is better than best - try expansion
        const expanded = new Array(n);
        for (let j = 0; j < n; j++) {
          expanded[j] = centroid[j]! + this.chi * (reflected[j]! - centroid[j]!);
          expanded[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, expanded[j]!));
        }
        const expandedValue = func(expanded);
        evaluations++;

        if (expandedValue < reflectedValue) {
          // Accept expanded point
          simplex[n] = { point: expanded, value: expandedValue };
        } else {
          // Accept reflected point
          simplex[n] = { point: reflected, value: reflectedValue };
        }
      } else if (reflectedValue < simplex[n - 1]!.value) {
        // Reflected point is better than second worst - accept it
        simplex[n] = { point: reflected, value: reflectedValue };
      } else {
        // Need to contract
        let contracted: number[];
        let contractedValue: number;

        if (reflectedValue < simplex[n]!.value) {
          // Outside contraction
          contracted = new Array(n);
          for (let j = 0; j < n; j++) {
            contracted[j] = centroid[j]! + this.gamma * (reflected[j]! - centroid[j]!);
            contracted[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, contracted[j]!));
          }
          contractedValue = func(contracted);
          evaluations++;

          if (contractedValue <= reflectedValue) {
            simplex[n] = { point: contracted, value: contractedValue };
          } else {
            // Shrink simplex toward best point
            this.shrinkSimplex(simplex, func, lowerBounds, upperBounds);
            evaluations += n;
          }
        } else {
          // Inside contraction
          contracted = new Array(n);
          for (let j = 0; j < n; j++) {
            contracted[j] = centroid[j]! + this.gamma * (simplex[n]!.point[j]! - centroid[j]!);
            contracted[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, contracted[j]!));
          }
          contractedValue = func(contracted);
          evaluations++;

          if (contractedValue < simplex[n]!.value) {
            simplex[n] = { point: contracted, value: contractedValue };
          } else {
            // Shrink simplex toward best point
            this.shrinkSimplex(simplex, func, lowerBounds, upperBounds);
            evaluations += n;
          }
        }
      }

      // Re-sort simplex
      simplex.sort((a, b) => a.value - b.value);
    }

    return {
      point: simplex[0]!.point,
      value: simplex[0]!.value,
      evaluations,
      iterations,
      converged,
    };
  }

  /**
   * Shrink the simplex toward the best point.
   */
  private shrinkSimplex(
    simplex: SimplexPoint[],
    func: (point: number[]) => number,
    lowerBounds: number[],
    upperBounds: number[]
  ): void {
    const n = simplex.length - 1;
    const best = simplex[0]!.point;

    for (let i = 1; i <= n; i++) {
      const newPoint = new Array(n);
      for (let j = 0; j < n; j++) {
        newPoint[j] = best[j]! + this.sigma * (simplex[i]!.point[j]! - best[j]!);
        newPoint[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, newPoint[j]!));
      }
      simplex[i] = { point: newPoint, value: func(newPoint) };
    }
  }
}

/**
 * Convenience function to run Simplex optimization.
 */
export function simplexMinimize(
  func: (point: number[]) => number,
  lowerBounds: number[],
  upperBounds: number[],
  startPoint: number[],
  options?: SimplexOptimizerOptions
): OptimizationResult {
  const optimizer = new SimplexOptimizer(options);
  return optimizer.optimize(func, lowerBounds, upperBounds, startPoint);
}
