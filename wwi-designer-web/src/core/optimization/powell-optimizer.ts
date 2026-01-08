/**
 * Powell's conjugate direction method optimizer.
 *
 * A derivative-free optimization method that uses successive line searches
 * along a set of directions. The directions are updated to be mutually
 * conjugate, enabling faster convergence on quadratic functions.
 *
 * Reference:
 * - Powell, M. J. D. (1964). "An efficient method for finding the minimum
 *   of a function of several variables without calculating derivatives."
 *   The Computer Journal, 7(2), 155-162.
 * - Apache Commons Math PowellOptimizer
 *
 * Ported from org.apache.commons.math3.optim.nonlinear.scalar.noderiv.PowellOptimizer
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
import { BrentOptimizer } from "./brent-optimizer.ts";

/**
 * Options for Powell optimizer.
 */
export interface PowellOptimizerOptions {
  /** Maximum number of function evaluations (default: 10000) */
  maxEvaluations?: number;
  /** Maximum number of iterations (default: unlimited) */
  maxIterations?: number;
  /** Relative tolerance for convergence (default: 1e-6) */
  relativeTolerance?: number;
  /** Absolute tolerance for convergence (default: 1e-14) */
  absoluteTolerance?: number;
  /** Line search relative tolerance (default: 1e-6) */
  lineSearchRelativeTolerance?: number;
  /** Line search absolute tolerance (default: 1e-14) */
  lineSearchAbsoluteTolerance?: number;
}

/**
 * Powell optimizer using conjugate direction method.
 *
 * The algorithm:
 * 1. Starts with the coordinate axes as search directions
 * 2. Performs line search along each direction
 * 3. Updates directions to become conjugate (improving convergence)
 * 4. Repeats until convergence
 */
export class PowellOptimizer {
  private maxEvaluations: number;
  private maxIterations: number;
  private relativeTolerance: number;
  private absoluteTolerance: number;
  private lineSearchRelativeTolerance: number;
  private lineSearchAbsoluteTolerance: number;

  constructor(options: PowellOptimizerOptions = {}) {
    this.maxEvaluations = options.maxEvaluations ?? 10000;
    this.maxIterations = options.maxIterations ?? Number.MAX_SAFE_INTEGER;
    this.relativeTolerance = options.relativeTolerance ?? 1e-6;
    this.absoluteTolerance = options.absoluteTolerance ?? 1e-14;
    this.lineSearchRelativeTolerance = options.lineSearchRelativeTolerance ?? 1e-6;
    this.lineSearchAbsoluteTolerance = options.lineSearchAbsoluteTolerance ?? 1e-14;
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
    let evaluations = 0;

    // Wrapper function that counts evaluations
    const wrappedFunc = (point: number[]): number => {
      evaluations++;
      return func(point);
    };

    // Initialize search directions as coordinate axes
    const directions: number[][] = [];
    for (let i = 0; i < n; i++) {
      const dir = new Array(n).fill(0);
      dir[i] = 1;
      directions.push(dir);
    }

    // Current best point and value
    let x = [...startPoint];
    let fVal = wrappedFunc(x);

    let iterations = 0;
    let converged = false;

    // Main optimization loop
    while (evaluations < this.maxEvaluations && iterations < this.maxIterations) {
      iterations++;

      const x0 = [...x];
      const fVal0 = fVal;

      // Find direction with largest decrease
      let bigDelta = 0;
      let bigDeltaIndex = 0;

      // Line search along each direction
      for (let i = 0; i < n; i++) {
        const direction = directions[i]!;
        const fValBefore = fVal;

        const lineSearchResult = this.lineSearch(
          wrappedFunc,
          x,
          direction,
          lowerBounds,
          upperBounds
        );
        x = lineSearchResult.point;
        fVal = lineSearchResult.value;

        const delta = Math.abs(fValBefore - fVal);
        if (delta > bigDelta) {
          bigDelta = delta;
          bigDeltaIndex = i;
        }

        if (evaluations >= this.maxEvaluations) break;
      }

      if (evaluations >= this.maxEvaluations) break;

      // Check convergence
      const tolerance =
        this.relativeTolerance * Math.abs(fVal0) + this.absoluteTolerance;

      if (2 * Math.abs(fVal0 - fVal) <= tolerance) {
        converged = true;
        break;
      }

      // Compute new direction: x - x0
      const newDirection = new Array(n);
      for (let j = 0; j < n; j++) {
        newDirection[j] = x[j]! - x0[j]!;
      }

      // Line search along new direction
      const x1 = [...x];
      const lineSearchResult = this.lineSearch(
        wrappedFunc,
        x,
        newDirection,
        lowerBounds,
        upperBounds
      );
      x = lineSearchResult.point;
      fVal = lineSearchResult.value;

      if (evaluations >= this.maxEvaluations) break;

      // Compute extrapolated point
      const x2 = new Array(n);
      for (let j = 0; j < n; j++) {
        x2[j] = 2 * x1[j]! - x0[j]!;
        x2[j] = Math.max(lowerBounds[j]!, Math.min(upperBounds[j]!, x2[j]!));
      }
      const fVal2 = wrappedFunc(x2);

      // Decide whether to replace direction with largest decrease
      if (fVal2 < fVal0) {
        const t = 2 * (fVal0 - 2 * fVal + fVal2) * Math.pow(fVal0 - fVal - bigDelta, 2);
        const s = bigDelta * Math.pow(fVal0 - fVal2, 2);

        if (t < s) {
          // Replace the direction that gave largest decrease with new direction
          directions[bigDeltaIndex] = [...newDirection];
        }
      }
    }

    return {
      point: x,
      value: fVal,
      evaluations,
      iterations,
      converged,
    };
  }

  /**
   * Perform line search along a direction.
   */
  private lineSearch(
    func: (point: number[]) => number,
    origin: number[],
    direction: number[],
    lowerBounds: number[],
    upperBounds: number[]
  ): { point: number[]; value: number } {
    const n = origin.length;

    // Normalize direction
    let dirNorm = 0;
    for (let i = 0; i < n; i++) {
      dirNorm += direction[i]! * direction[i]!;
    }
    dirNorm = Math.sqrt(dirNorm);

    if (dirNorm < 1e-20) {
      // Direction is too small, return current point
      return { point: [...origin], value: func(origin) };
    }

    const normalizedDir = direction.map((d) => d / dirNorm);

    // Find valid step range based on bounds
    let alphaMin = -Infinity;
    let alphaMax = Infinity;

    for (let i = 0; i < n; i++) {
      if (normalizedDir[i]! > 1e-20) {
        const toUpper = (upperBounds[i]! - origin[i]!) / normalizedDir[i]!;
        const toLower = (lowerBounds[i]! - origin[i]!) / normalizedDir[i]!;
        alphaMax = Math.min(alphaMax, toUpper);
        alphaMin = Math.max(alphaMin, toLower);
      } else if (normalizedDir[i]! < -1e-20) {
        const toUpper = (upperBounds[i]! - origin[i]!) / normalizedDir[i]!;
        const toLower = (lowerBounds[i]! - origin[i]!) / normalizedDir[i]!;
        alphaMax = Math.min(alphaMax, toLower);
        alphaMin = Math.max(alphaMin, toUpper);
      }
    }

    // Ensure valid range
    if (alphaMin > alphaMax) {
      return { point: [...origin], value: func(origin) };
    }

    // Clip to reasonable range
    alphaMin = Math.max(alphaMin, -1e10);
    alphaMax = Math.min(alphaMax, 1e10);

    // 1D function for line search
    const lineFunc = (alpha: number): number => {
      const point = new Array(n);
      for (let i = 0; i < n; i++) {
        point[i] = origin[i]! + alpha * normalizedDir[i]!;
        point[i] = Math.max(lowerBounds[i]!, Math.min(upperBounds[i]!, point[i]!));
      }
      return func(point);
    };

    // Use Brent optimizer for line search
    const brent = new BrentOptimizer({
      relativeTolerance: this.lineSearchRelativeTolerance,
      absoluteTolerance: this.lineSearchAbsoluteTolerance,
      maxEvaluations: 100,
    });

    const result = brent.optimize(lineFunc, alphaMin, alphaMax, 0);

    // Compute final point
    const finalPoint = new Array(n);
    for (let i = 0; i < n; i++) {
      finalPoint[i] = origin[i]! + result.point * normalizedDir[i]!;
      finalPoint[i] = Math.max(lowerBounds[i]!, Math.min(upperBounds[i]!, finalPoint[i]!));
    }

    return { point: finalPoint, value: result.value };
  }
}

/**
 * Convenience function to run Powell optimization.
 */
export function powellMinimize(
  func: (point: number[]) => number,
  lowerBounds: number[],
  upperBounds: number[],
  startPoint: number[],
  options?: PowellOptimizerOptions
): OptimizationResult {
  const optimizer = new PowellOptimizer(options);
  return optimizer.optimize(func, lowerBounds, upperBounds, startPoint);
}
