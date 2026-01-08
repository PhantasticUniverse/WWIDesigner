/**
 * Brent's method for univariate (single-variable) optimization.
 *
 * This is a derivative-free method that combines:
 * 1. Parabolic interpolation for fast convergence near the minimum
 * 2. Golden section search for guaranteed convergence
 *
 * The algorithm maintains a bracket [a, b] containing the minimum and
 * iteratively narrows it using either parabolic steps (when valid) or
 * golden section steps (as fallback).
 *
 * Reference:
 * - Brent, R.P. (1973). Algorithms for Minimization without Derivatives.
 *   Prentice-Hall, Englewood Cliffs, NJ.
 * - Apache Commons Math BrentOptimizer implementation
 *
 * Ported from org.apache.commons.math3.optim.univariate.BrentOptimizer
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Result of a Brent optimization.
 */
export interface BrentOptimizationResult {
  /** Optimal point found */
  point: number;
  /** Function value at optimal point */
  value: number;
  /** Number of function evaluations */
  evaluations: number;
  /** Number of iterations */
  iterations: number;
  /** Whether the optimization converged */
  converged: boolean;
}

/**
 * Options for Brent optimizer.
 */
export interface BrentOptimizerOptions {
  /** Relative tolerance (default: 1e-6) */
  relativeTolerance?: number;
  /** Absolute tolerance (default: 1e-14) */
  absoluteTolerance?: number;
  /** Maximum number of function evaluations (default: 10000) */
  maxEvaluations?: number;
  /** Maximum number of iterations (default: unlimited) */
  maxIterations?: number;
}

/**
 * Brent optimizer for univariate minimization.
 *
 * Uses a combination of parabolic interpolation and golden section search
 * to find the minimum of a function within a given interval.
 */
export class BrentOptimizer {
  /** Golden ratio for minimization: (3 - sqrt(5)) / 2 */
  private static readonly GOLDEN_RATIO = 0.3819660112501051;

  /** Machine epsilon for double precision */
  private static readonly EPSILON = 2.220446049250313e-16;

  /** Minimum relative tolerance allowed */
  private static readonly MIN_RELATIVE_TOLERANCE = 2 * BrentOptimizer.EPSILON;

  private relativeTolerance: number;
  private absoluteTolerance: number;
  private maxEvaluations: number;
  private maxIterations: number;

  /**
   * Create a Brent optimizer.
   *
   * @param options Optimization options
   * @throws Error if tolerance values are invalid
   */
  constructor(options: BrentOptimizerOptions = {}) {
    this.relativeTolerance = options.relativeTolerance ?? 1e-6;
    this.absoluteTolerance = options.absoluteTolerance ?? 1e-14;
    this.maxEvaluations = options.maxEvaluations ?? 10000;
    this.maxIterations = options.maxIterations ?? Number.MAX_SAFE_INTEGER;

    // Validate parameters
    if (this.absoluteTolerance <= 0) {
      throw new Error("Absolute tolerance must be positive");
    }
    if (this.relativeTolerance < BrentOptimizer.MIN_RELATIVE_TOLERANCE) {
      throw new Error(
        `Relative tolerance must be at least ${BrentOptimizer.MIN_RELATIVE_TOLERANCE}`
      );
    }
  }

  /**
   * Find the minimum of a function within an interval.
   *
   * @param func The function to minimize
   * @param lowerBound Lower bound of search interval
   * @param upperBound Upper bound of search interval
   * @param startPoint Initial guess (should be within bounds)
   * @returns Optimization result
   */
  optimize(
    func: (x: number) => number,
    lowerBound: number,
    upperBound: number,
    startPoint?: number
  ): BrentOptimizationResult {
    // Validate bounds
    if (lowerBound >= upperBound) {
      throw new Error("Lower bound must be less than upper bound");
    }

    // Initialize bracket: [a, b] with a < b
    let a = lowerBound;
    let b = upperBound;

    // x = best point found so far
    // v = second best point
    // w = previous value of v
    let x = startPoint ?? (a + b) / 2;
    if (x < a || x > b) {
      x = (a + b) / 2;
    }
    let v = x;
    let w = x;

    // d = magnitude of step before last
    // e = magnitude of previous step
    let d = 0;
    let e = 0;

    // Evaluate at initial point
    let evaluations = 0;
    let fx = func(x);
    evaluations++;

    let fv = fx;
    let fw = fx;

    let iterations = 0;
    let converged = false;

    // Main optimization loop
    while (evaluations < this.maxEvaluations && iterations < this.maxIterations) {
      iterations++;

      const m = 0.5 * (a + b); // Midpoint
      const tol1 = this.relativeTolerance * Math.abs(x) + this.absoluteTolerance;
      const tol2 = 2 * tol1;

      // Check convergence: interval is small enough
      if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) {
        converged = true;
        break;
      }

      let u: number;
      let useGoldenSection = true;

      // Try parabolic interpolation if we have enough history
      if (Math.abs(e) > tol1) {
        // Fit parabola through (x, fx), (v, fv), (w, fw)
        let p: number;
        let q: number;
        let r: number;

        r = (x - w) * (fx - fv);
        q = (x - v) * (fx - fw);
        p = (x - v) * q - (x - w) * r;
        q = 2 * (q - r);

        if (q > 0) {
          p = -p;
        } else {
          q = -q;
        }

        r = e;
        e = d;

        // Check if parabolic step is acceptable
        if (
          Math.abs(p) < Math.abs(0.5 * q * r) &&
          p > q * (a - x) &&
          p < q * (b - x)
        ) {
          // Parabolic interpolation step
          d = p / q;
          u = x + d;

          // f must not be evaluated too close to a or b
          if (u - a < tol2 || b - u < tol2) {
            d = x < m ? tol1 : -tol1;
          }
          useGoldenSection = false;
        }
      }

      // Golden section step (fallback)
      if (useGoldenSection) {
        // Choose longer segment
        e = x < m ? b - x : a - x;
        d = BrentOptimizer.GOLDEN_RATIO * e;
      }

      // Ensure we don't evaluate too close to x
      if (Math.abs(d) >= tol1) {
        u = x + d;
      } else {
        u = x + (d > 0 ? tol1 : -tol1);
      }

      // Evaluate function at new point
      const fu = func(u);
      evaluations++;

      // Update bracket and best points
      if (fu <= fx) {
        // New best point found
        if (u < x) {
          b = x;
        } else {
          a = x;
        }
        v = w;
        fv = fw;
        w = x;
        fw = fx;
        x = u;
        fx = fu;
      } else {
        // Keep current best, but update bracket
        if (u < x) {
          a = u;
        } else {
          b = u;
        }
        if (fu <= fw || w === x) {
          v = w;
          fv = fw;
          w = u;
          fw = fu;
        } else if (fu <= fv || v === x || v === w) {
          v = u;
          fv = fu;
        }
      }
    }

    return {
      point: x,
      value: fx,
      evaluations,
      iterations,
      converged,
    };
  }
}

/**
 * Convenience function to run Brent optimization.
 *
 * @param func Function to minimize
 * @param lowerBound Lower bound
 * @param upperBound Upper bound
 * @param startPoint Optional starting point
 * @param options Optimizer options
 * @returns Optimization result
 */
export function brentMinimize(
  func: (x: number) => number,
  lowerBound: number,
  upperBound: number,
  startPoint?: number,
  options?: BrentOptimizerOptions
): BrentOptimizationResult {
  const optimizer = new BrentOptimizer(options);
  return optimizer.optimize(func, lowerBound, upperBound, startPoint);
}
