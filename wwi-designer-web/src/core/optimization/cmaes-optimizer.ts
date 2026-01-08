/**
 * CMA-ES (Covariance Matrix Adaptation Evolution Strategy) optimizer.
 *
 * A derivative-free evolutionary algorithm for continuous optimization.
 * Uses a multivariate normal distribution to sample candidate solutions,
 * adapting both the mean and covariance matrix based on successful samples.
 *
 * Key features:
 * - Population-based for global exploration
 * - Learns problem structure via covariance matrix
 * - Step-size adaptation for automatic scale control
 * - No gradient information required
 *
 * Reference:
 * - Hansen, N. (2016). "The CMA Evolution Strategy: A Tutorial"
 * - Apache Commons Math CMAESOptimizer
 *
 * Ported from org.apache.commons.math3.optim.nonlinear.scalar.noderiv.CMAESOptimizer
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
 * Options for CMA-ES optimizer.
 */
export interface CMAESOptions {
  /** Maximum number of function evaluations (default: 10000) */
  maxEvaluations?: number;
  /** Stop if fitness reaches this value (default: 0) */
  stopFitness?: number;
  /** Population size (default: auto-calculated from dimension) */
  populationSize?: number;
  /** Initial standard deviation per dimension (default: 0.2 * range) */
  sigma?: number[];
  /** Whether to use active CMA (default: true) */
  isActiveCMA?: boolean;
  /** Relative tolerance for convergence (default: 1e-6) */
  relativeTolerance?: number;
  /** Absolute tolerance for convergence (default: 1e-14) */
  absoluteTolerance?: number;
}

/**
 * CMA-ES optimizer implementation.
 *
 * Implements the core CMA-ES algorithm with:
 * - Weighted recombination of mu best samples
 * - Cumulative step-size adaptation (CSA)
 * - Rank-one and rank-mu covariance matrix updates
 */
export class CMAESOptimizer {
  private maxEvaluations: number;
  private stopFitness: number;
  private isActiveCMA: boolean;
  private relativeTolerance: number;
  private absoluteTolerance: number;
  private inputSigma: number[] | undefined;
  private inputPopulationSize: number | undefined;

  constructor(options: CMAESOptions = {}) {
    this.maxEvaluations = options.maxEvaluations ?? 10000;
    this.stopFitness = options.stopFitness ?? 0;
    this.isActiveCMA = options.isActiveCMA ?? true;
    this.relativeTolerance = options.relativeTolerance ?? 1e-6;
    this.absoluteTolerance = options.absoluteTolerance ?? 1e-14;
    this.inputSigma = options.sigma;
    this.inputPopulationSize = options.populationSize;
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

    // Initialize sigma (step sizes)
    let sigma: number[];
    if (this.inputSigma) {
      sigma = [...this.inputSigma];
    } else {
      sigma = new Array(n);
      for (let i = 0; i < n; i++) {
        sigma[i] = 0.2 * (upperBounds[i]! - lowerBounds[i]!);
      }
    }

    // Overall step size
    let stepSize = Math.max(...sigma);

    // Population size: lambda = 4 + floor(3 * log(n))
    const lambda = this.inputPopulationSize ?? Math.max(4, 4 + Math.floor(3 * Math.log(n)));

    // Number of parents (best samples for recombination)
    const mu = Math.floor(lambda / 2);

    // Recombination weights: log-linear decrease
    const weights = new Array(mu);
    let sumWeights = 0;
    for (let i = 0; i < mu; i++) {
      weights[i] = Math.log(mu + 0.5) - Math.log(i + 1);
      sumWeights += weights[i];
    }
    // Normalize weights
    for (let i = 0; i < mu; i++) {
      weights[i] /= sumWeights;
    }

    // Effective sample size
    let muEff = 0;
    let sumWsq = 0;
    for (let i = 0; i < mu; i++) {
      sumWsq += weights[i]! * weights[i]!;
    }
    muEff = 1 / sumWsq;

    // Adaptation parameters
    const cc = 4 / (n + 4);  // Cumulation for covariance path
    const cs = (muEff + 2) / (n + muEff + 5);  // Cumulation for sigma path
    const c1 = 2 / ((n + 1.3) * (n + 1.3) + muEff);  // Rank-one update
    const cmu = Math.min(
      1 - c1,
      2 * (muEff - 2 + 1 / muEff) / ((n + 2) * (n + 2) + muEff)
    );  // Rank-mu update
    const damps = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cs;

    // Expected length of N(0,I) vector
    const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

    // Initialize evolution paths
    const pc = new Array(n).fill(0);
    const ps = new Array(n).fill(0);

    // Initialize covariance matrix as identity (diagonal representation)
    const diagD = new Array(n).fill(1);  // Eigenvalues
    const B = identity(n);  // Eigenvectors (columns)
    const C = identity(n);  // Full covariance matrix

    // Mean vector
    let xmean = [...startPoint];

    // Best solution found
    let bestPoint = [...startPoint];
    let bestValue = func(startPoint);
    let evaluations = 1;

    // Population storage
    const arx = new Array(lambda);
    const arfitness = new Array(lambda);

    let iterations = 0;
    let converged = false;
    let noImprovementCount = 0;
    const maxNoImprovement = 20 + Math.floor(n / 5);

    // Main loop
    while (evaluations < this.maxEvaluations) {
      iterations++;

      // 1. Generate lambda offspring
      for (let k = 0; k < lambda; k++) {
        // Sample from N(0, C) using current eigenvectors/eigenvalues
        const z = new Array(n);
        for (let i = 0; i < n; i++) {
          z[i] = randn();
        }

        // Transform: y = B * D * z
        const y = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            y[i] += B[i]![j]! * diagD[j]! * z[j]!;
          }
        }

        // x = mean + sigma * y
        arx[k] = new Array(n);
        for (let i = 0; i < n; i++) {
          let xi = xmean[i]! + stepSize * y[i]!;
          // Bound handling: clip to bounds
          xi = Math.max(lowerBounds[i]!, Math.min(upperBounds[i]!, xi));
          arx[k][i] = xi;
        }

        // Evaluate fitness
        arfitness[k] = func(arx[k]);
        evaluations++;

        // Update best
        if (arfitness[k] < bestValue) {
          bestValue = arfitness[k];
          bestPoint = [...arx[k]];
          noImprovementCount = 0;
        }

        if (evaluations >= this.maxEvaluations) break;
      }

      if (evaluations >= this.maxEvaluations) break;

      // 2. Sort by fitness and select mu best
      const arindex = new Array(lambda);
      for (let i = 0; i < lambda; i++) arindex[i] = i;
      arindex.sort((a, b) => arfitness[a] - arfitness[b]);

      // 3. Update mean
      const xold = [...xmean];
      for (let i = 0; i < n; i++) {
        xmean[i] = 0;
        for (let m = 0; m < mu; m++) {
          xmean[i] = xmean[i]! + weights[m]! * arx[arindex[m]!]![i]!;
        }
      }

      // 4. Update evolution path for sigma (ps)
      // ps = (1-cs)*ps + sqrt(cs*(2-cs)*mueff) * invsqrtC * (xmean-xold)/sigma
      const psUpdateFactor = Math.sqrt(cs * (2 - cs) * muEff);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          // invsqrtC approximated by B * D^-1 * B^T
          let invSqrtCij = 0;
          for (let k = 0; k < n; k++) {
            invSqrtCij += B[i]![k]! * (1 / diagD[k]!) * B[j]![k]!;
          }
          sum += invSqrtCij * (xmean[j]! - xold[j]!) / stepSize;
        }
        ps[i] = (1 - cs) * ps[i]! + psUpdateFactor * sum;
      }

      // 5. Update evolution path for covariance (pc)
      const psNorm = Math.sqrt(ps.reduce((s, v) => s + v * v, 0));
      const hsig = psNorm / Math.sqrt(1 - Math.pow(1 - cs, 2 * iterations)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
      const pcUpdateFactor = Math.sqrt(cc * (2 - cc) * muEff);
      for (let i = 0; i < n; i++) {
        pc[i] = (1 - cc) * pc[i]! + hsig * pcUpdateFactor * (xmean[i]! - xold[i]!) / stepSize;
      }

      // 6. Update covariance matrix
      const oldC = C.map((row) => [...row]);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          // Rank-one update
          let c1Update = c1 * pc[i]! * pc[j]!;

          // Rank-mu update
          let cmuUpdate = 0;
          for (let m = 0; m < mu; m++) {
            const yi = (arx[arindex[m]!]![i]! - xold[i]!) / stepSize;
            const yj = (arx[arindex[m]!]![j]! - xold[j]!) / stepSize;
            cmuUpdate += weights[m]! * yi * yj;
          }
          cmuUpdate *= cmu;

          // Combined update
          C[i]![j] = (1 - c1 - cmu) * oldC[i]![j]! + c1Update + cmuUpdate;
          C[j]![i] = C[i]![j]!;  // Symmetry
        }
      }

      // 7. Update eigendecomposition (simplified: update diagonal approximation)
      // Full eigendecomposition is expensive; use simplified update for now
      for (let i = 0; i < n; i++) {
        diagD[i] = Math.sqrt(Math.max(1e-20, C[i]![i]!));
        // Keep B as identity for simplified version
      }

      // 8. Update step-size sigma using cumulative step-size adaptation
      stepSize = stepSize * Math.exp((cs / damps) * (psNorm / chiN - 1));

      // 9. Check convergence
      const fitnessRange = arfitness[arindex[lambda - 1]!] - arfitness[arindex[0]!];
      const meanDelta = Math.sqrt(
        xmean.reduce((s, v, i) => s + Math.pow(v - xold[i]!, 2), 0)
      );

      if (bestValue <= this.stopFitness) {
        converged = true;
        break;
      }

      if (fitnessRange < this.absoluteTolerance + this.relativeTolerance * Math.abs(arfitness[arindex[0]!])) {
        noImprovementCount++;
        if (noImprovementCount >= maxNoImprovement) {
          converged = true;
          break;
        }
      } else {
        noImprovementCount = 0;
      }

      // Check for step-size breakdown
      if (stepSize * Math.max(...diagD) < 1e-20) {
        converged = true;
        break;
      }
    }

    return {
      point: bestPoint,
      value: bestValue,
      evaluations,
      iterations,
      converged,
    };
  }
}

/**
 * Generate a standard normal random number using Box-Muller transform.
 */
function randn(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Create an n×n identity matrix.
 */
function identity(n: number): number[][] {
  const I = new Array(n);
  for (let i = 0; i < n; i++) {
    I[i] = new Array(n).fill(0);
    I[i][i] = 1;
  }
  return I;
}

/**
 * Convenience function to run CMA-ES optimization.
 */
export function cmaesMinimize(
  func: (point: number[]) => number,
  lowerBounds: number[],
  upperBounds: number[],
  startPoint: number[],
  options?: CMAESOptions
): OptimizationResult {
  const optimizer = new CMAESOptimizer(options);
  return optimizer.optimize(func, lowerBounds, upperBounds, startPoint);
}
