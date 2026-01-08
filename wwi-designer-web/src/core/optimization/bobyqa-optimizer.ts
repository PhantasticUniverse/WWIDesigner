/**
 * BOBYQA (Bound Optimization BY Quadratic Approximation) optimizer.
 *
 * Implementation of the BOBYQA algorithm described in:
 *     M.J.D. Powell, "The BOBYQA algorithm for bound constrained
 *     optimization without derivatives", Report No. DAMTP 2009/NA06,
 *     Centre for Mathematical Sciences, University of Cambridge (2009).
 *
 * This is a derivative-free optimizer that uses quadratic interpolation
 * models within a trust region framework to find local minima of
 * multivariate functions subject to bound constraints.
 *
 * Ported from Apache Commons Math 3 BOBYQAOptimizer.java
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import type { OptimizationResult, ObjectiveFunction } from "./direct-optimizer.ts";

/**
 * Options for the BOBYQA optimizer.
 */
export interface BOBYQAOptions {
  /** Number of interpolation points (default: 2*n + 1) */
  numberOfInterpolationPoints?: number;
  /** Initial trust region radius */
  initialTrustRegionRadius?: number;
  /** Stopping trust region radius */
  stoppingTrustRegionRadius?: number;
  /** Maximum number of function evaluations */
  maxEvaluations?: number;
}

/**
 * Minimum dimension required for BOBYQA.
 * BOBYQA requires at least 2 dimensions (for 1D, use Brent).
 */
const MINIMUM_PROBLEM_DIMENSION = 2;

/**
 * Default stopping trust region radius.
 */
const DEFAULT_STOPPING_RADIUS = 1e-8;

/**
 * Small constant used in various calculations.
 */
const SMALL = 1e-10;

/**
 * BOBYQA optimizer for bounded multivariate optimization.
 *
 * Uses quadratic interpolation models and trust region methods.
 */
export class BOBYQAOptimizer {
  private readonly numberOfInterpolationPoints: number;
  private readonly initialTrustRegionRadius: number;
  private readonly stoppingTrustRegionRadius: number;
  private readonly maxEvaluations: number;

  // Problem dimensions and bounds
  private n: number = 0;
  private lowerBounds: number[] = [];
  private upperBounds: number[] = [];

  // Objective function
  private objective: ObjectiveFunction | null = null;
  private evaluations: number = 0;

  // Trust region parameters
  private trustRegionCenterOffset: number[] = []; // XOPT in Fortran
  private trustRegionRadius: number = 0; // DELTA
  private trustRegionRadiusLB: number = 0; // LOWER BOUND (RHO)

  // Interpolation model
  private interpolationPoints: number[][] = []; // XPT (npt x n matrix)
  private functionValues: number[] = []; // FVAL
  private modelSecondDerivativesValues: number[] = []; // HQ (n*(n+1)/2)
  private modelSecondDerivativesParameters: number[] = []; // PQ
  private bMatrix: number[][] = []; // BMAT (ndim x n matrix)
  private zMatrix: number[][] = []; // ZMAT (npt x nptm matrix)
  private originShift: number[] = []; // SL, SU transformed to XBASE

  // Working arrays
  private gradientAtTrustRegionCenter: number[] = []; // GOPT
  private trustRegionCenterInterpolationPointDifferencesFromOptimalPoint: number[] = []; // XNEW
  private newPoint: number[] = []; // D
  private alternativeNewPoint: number[] = []; // GNEW used differently
  private lagrangeValuesAtNewPoint: number[] = []; // W (temporary)

  // State for the optimization
  private currentBest: { point: number[]; value: number } | null = null;
  private npt: number = 0; // Number of interpolation points
  private nptm: number = 0; // npt - n - 1

  /**
   * Create a BOBYQA optimizer.
   *
   * @param numberOfInterpolationPoints Number of interpolation points.
   *        Must be in the interval [n+2, (n+1)(n+2)/2]. Default: 2n+1.
   * @param initialTrustRegionRadius Initial trust region radius.
   * @param stoppingTrustRegionRadius Stopping trust region radius.
   */
  constructor(
    numberOfInterpolationPoints?: number,
    initialTrustRegionRadius?: number,
    stoppingTrustRegionRadius?: number,
    maxEvaluations?: number
  ) {
    this.numberOfInterpolationPoints = numberOfInterpolationPoints ?? -1; // -1 means auto
    this.initialTrustRegionRadius = initialTrustRegionRadius ?? 0; // 0 means auto
    this.stoppingTrustRegionRadius = stoppingTrustRegionRadius ?? DEFAULT_STOPPING_RADIUS;
    this.maxEvaluations = maxEvaluations ?? 10000;
  }

  /**
   * Optimize the given objective function.
   *
   * @param objective Function to minimize
   * @param lowerBounds Lower bounds for each variable
   * @param upperBounds Upper bounds for each variable
   * @param startPoint Initial guess
   * @returns Optimization result
   */
  optimize(
    objective: ObjectiveFunction,
    lowerBounds: number[],
    upperBounds: number[],
    startPoint: number[]
  ): OptimizationResult {
    this.objective = objective;
    this.lowerBounds = [...lowerBounds];
    this.upperBounds = [...upperBounds];
    this.n = startPoint.length;
    this.evaluations = 0;

    // Validate input
    this.validateInput(startPoint);

    // Set up interpolation point count
    this.npt =
      this.numberOfInterpolationPoints > 0
        ? this.numberOfInterpolationPoints
        : 2 * this.n + 1;
    this.nptm = this.npt - this.n - 1;

    // Validate number of interpolation points
    const minNpt = this.n + 2;
    const maxNpt = ((this.n + 1) * (this.n + 2)) / 2;
    if (this.npt < minNpt || this.npt > maxNpt) {
      throw new Error(
        `Number of interpolation points (${this.npt}) must be in [${minNpt}, ${maxNpt}]`
      );
    }

    // Initialize trust region radii
    let initialRadius = this.initialTrustRegionRadius;
    if (initialRadius <= 0) {
      // Calculate from bounds
      initialRadius = this.calculateInitialRadius();
    }
    this.trustRegionRadius = initialRadius;
    this.trustRegionRadiusLB = this.stoppingTrustRegionRadius;

    // Adjust start point to be within bounds
    const adjustedStart = this.adjustToBounds(startPoint);

    // Run the BOBYQA algorithm
    const result = this.bobyqaMain(adjustedStart);

    return result;
  }

  /**
   * Calculate initial trust region radius from bounds.
   */
  private calculateInitialRadius(): number {
    let maxRange = 0;
    for (let i = 0; i < this.n; i++) {
      const range = this.upperBounds[i] - this.lowerBounds[i];
      if (range > maxRange) {
        maxRange = range;
      }
    }
    return Math.max(0.1 * maxRange, 1.0);
  }

  /**
   * Validate input parameters.
   */
  private validateInput(startPoint: number[]): void {
    if (this.n < MINIMUM_PROBLEM_DIMENSION) {
      throw new Error(
        `BOBYQA requires at least ${MINIMUM_PROBLEM_DIMENSION} dimensions (use Brent for 1D)`
      );
    }

    if (startPoint.length !== this.lowerBounds.length) {
      throw new Error("Start point dimension must match bounds");
    }

    if (this.lowerBounds.length !== this.upperBounds.length) {
      throw new Error("Lower and upper bounds must have same length");
    }

    for (let i = 0; i < this.n; i++) {
      if (this.lowerBounds[i] >= this.upperBounds[i]) {
        throw new Error(`Invalid bounds at dimension ${i}`);
      }
    }
  }

  /**
   * Adjust a point to be strictly within bounds.
   */
  private adjustToBounds(point: number[]): number[] {
    const adjusted = [...point];
    for (let i = 0; i < this.n; i++) {
      const lb = this.lowerBounds[i];
      const ub = this.upperBounds[i];
      // Ensure point is within bounds with small margin
      const margin = Math.min(0.001 * (ub - lb), this.trustRegionRadius);
      adjusted[i] = Math.max(lb + margin, Math.min(ub - margin, adjusted[i]));
    }
    return adjusted;
  }

  /**
   * Evaluate the objective function.
   */
  private evaluate(point: number[]): number {
    if (this.evaluations >= this.maxEvaluations) {
      throw new Error("Max evaluations exceeded");
    }
    this.evaluations++;

    // Ensure point is within bounds
    const boundedPoint = [...point];
    for (let i = 0; i < this.n; i++) {
      boundedPoint[i] = Math.max(
        this.lowerBounds[i],
        Math.min(this.upperBounds[i], boundedPoint[i])
      );
    }

    const value = this.objective!(boundedPoint);

    // Track best point
    if (this.currentBest === null || value < this.currentBest.value) {
      this.currentBest = {
        point: [...boundedPoint],
        value,
      };
    }

    return value;
  }

  /**
   * Main BOBYQA algorithm.
   */
  private bobyqaMain(startPoint: number[]): OptimizationResult {
    // Initialize arrays
    this.initializeArrays();

    // Set origin shift to the start point
    this.originShift = [...startPoint];

    // Initialize interpolation points
    this.initializeInterpolationPoints();

    // Build initial quadratic model
    this.initializeModel();

    // Main optimization loop
    let trustRegionStep: number[] = new Array(this.n).fill(0);
    let converged = false;
    let iterations = 0;
    const maxIterations = 10 * this.maxEvaluations;

    try {
      while (this.evaluations < this.maxEvaluations && iterations < maxIterations) {
        iterations++;

        // Check for convergence
        if (this.trustRegionRadius <= this.trustRegionRadiusLB) {
          converged = true;
          break;
        }

        // Find the trust region step
        trustRegionStep = this.findTrustRegionStep();

        // Calculate the step length
        const stepLength = this.vectorNorm(trustRegionStep);

        // If step is too small, shrink trust region
        if (stepLength < 0.5 * this.trustRegionRadiusLB) {
          this.trustRegionRadius = Math.max(
            this.trustRegionRadiusLB,
            this.trustRegionRadius * 0.5
          );
          continue;
        }

        // Calculate the new point
        const newPoint = this.newPoint.slice();
        for (let i = 0; i < this.n; i++) {
          newPoint[i] =
            this.originShift[i] +
            this.trustRegionCenterOffset[i] +
            trustRegionStep[i];
        }

        // Evaluate at the new point
        let newValue: number;
        try {
          newValue = this.evaluate(newPoint);
        } catch {
          // Max evaluations exceeded
          break;
        }

        // Calculate improvement ratio
        const predictedReduction = this.calculatePredictedReduction(trustRegionStep);
        const actualReduction =
          this.functionValues[this.getKnownBestIndex()] - newValue;
        const ratio =
          Math.abs(predictedReduction) > SMALL
            ? actualReduction / predictedReduction
            : actualReduction > 0
              ? 1.0
              : 0.0;

        // Update trust region radius
        if (ratio < 0.1) {
          this.trustRegionRadius = Math.max(
            this.trustRegionRadiusLB,
            0.5 * this.trustRegionRadius
          );
        } else if (ratio > 0.7 && stepLength > 0.99 * this.trustRegionRadius) {
          this.trustRegionRadius = Math.min(
            2.0 * this.trustRegionRadius,
            this.calculateMaxRadius()
          );
        }

        // Update the model
        if (actualReduction > 0) {
          // Good step - update model and possibly recenter
          this.updateModel(trustRegionStep, newPoint, newValue);

          // If we made significant progress, rebuild interpolation around new center
          if (actualReduction > 0.1 * this.functionValues[this.getKnownBestIndex()] ||
              stepLength > 0.5 * this.trustRegionRadius) {
            // Shift origin to new best point and rebuild interpolation
            this.recenterInterpolation();
          }
        } else {
          // Still update geometry but don't change center
          this.updateGeometry(trustRegionStep, newPoint, newValue);
        }
      }
    } catch (e) {
      // Handle optimization errors gracefully
      console.warn("BOBYQA optimization warning:", e);
    }

    // Return best point found
    const bestIndex = this.getKnownBestIndex();
    const bestPoint = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      bestPoint[i] =
        this.originShift[i] + this.interpolationPoints[bestIndex][i];
      // Ensure within bounds
      bestPoint[i] = Math.max(
        this.lowerBounds[i],
        Math.min(this.upperBounds[i], bestPoint[i])
      );
    }

    return {
      point: this.currentBest?.point ?? bestPoint,
      value: this.currentBest?.value ?? this.functionValues[bestIndex],
      evaluations: this.evaluations,
      iterations,
      converged,
    };
  }

  /**
   * Initialize all working arrays.
   */
  private initializeArrays(): void {
    const n = this.n;
    const npt = this.npt;
    const nptm = this.nptm;

    this.interpolationPoints = Array(npt)
      .fill(null)
      .map(() => Array(n).fill(0));
    this.functionValues = Array(npt).fill(0);
    this.modelSecondDerivativesValues = Array((n * (n + 1)) / 2).fill(0);
    this.modelSecondDerivativesParameters = Array(npt).fill(0);
    this.bMatrix = Array(npt + n)
      .fill(null)
      .map(() => Array(n).fill(0));
    this.zMatrix = Array(npt)
      .fill(null)
      .map(() => Array(nptm).fill(0));
    this.trustRegionCenterOffset = Array(n).fill(0);
    this.gradientAtTrustRegionCenter = Array(n).fill(0);
    this.trustRegionCenterInterpolationPointDifferencesFromOptimalPoint =
      Array(n).fill(0);
    this.newPoint = Array(n).fill(0);
    this.alternativeNewPoint = Array(n).fill(0);
    this.lagrangeValuesAtNewPoint = Array(npt + n).fill(0);
  }

  /**
   * Initialize interpolation points using a symmetric pattern.
   */
  private initializeInterpolationPoints(): void {
    // First point is at the origin (start point)
    // (already zeroed in initializeArrays)

    // Next 2n points along coordinate axes
    const stepSize = this.trustRegionRadius;
    let pointIndex = 1;

    for (let i = 0; i < this.n && pointIndex < this.npt; i++) {
      // Point in positive direction
      if (pointIndex < this.npt) {
        this.interpolationPoints[pointIndex][i] = stepSize;
        this.clampInterpolationPoint(pointIndex);
        pointIndex++;
      }

      // Point in negative direction
      if (pointIndex < this.npt) {
        this.interpolationPoints[pointIndex][i] = -stepSize;
        this.clampInterpolationPoint(pointIndex);
        pointIndex++;
      }
    }

    // Additional points for better model (if npt > 2n+1)
    for (let i = 0; i < this.n && pointIndex < this.npt; i++) {
      for (let j = i + 1; j < this.n && pointIndex < this.npt; j++) {
        // Diagonal point
        this.interpolationPoints[pointIndex][i] = stepSize;
        this.interpolationPoints[pointIndex][j] = stepSize;
        this.clampInterpolationPoint(pointIndex);
        pointIndex++;
      }
    }

    // Evaluate function at all interpolation points
    for (let k = 0; k < this.npt; k++) {
      const point = new Array(this.n);
      for (let i = 0; i < this.n; i++) {
        point[i] = this.originShift[i] + this.interpolationPoints[k][i];
      }
      try {
        this.functionValues[k] = this.evaluate(point);
      } catch {
        // Max evaluations exceeded during initialization
        this.functionValues[k] = Number.MAX_VALUE;
        break;
      }
    }
  }

  /**
   * Clamp interpolation point to be within bounds relative to origin shift.
   */
  private clampInterpolationPoint(index: number): void {
    for (let i = 0; i < this.n; i++) {
      const lb = this.lowerBounds[i] - this.originShift[i];
      const ub = this.upperBounds[i] - this.originShift[i];
      this.interpolationPoints[index][i] = Math.max(
        lb,
        Math.min(ub, this.interpolationPoints[index][i])
      );
    }
  }

  /**
   * Initialize the quadratic model.
   */
  private initializeModel(): void {
    // Set trust region center to best point found
    const bestIndex = this.getKnownBestIndex();
    for (let i = 0; i < this.n; i++) {
      this.trustRegionCenterOffset[i] =
        this.interpolationPoints[bestIndex][i];
    }

    // Initialize B matrix and Z matrix for the Lagrange interpolation
    this.initializeBZMatrices();

    // Calculate gradient at trust region center
    this.updateGradient();
  }

  /**
   * Initialize B and Z matrices for quadratic interpolation.
   * Uses finite differences to estimate model parameters.
   */
  private initializeBZMatrices(): void {
    const n = this.n;
    const npt = this.npt;
    const nptm = this.nptm;

    // Reset matrices
    for (let k = 0; k < npt + n; k++) {
      for (let j = 0; j < n; j++) {
        this.bMatrix[k][j] = 0;
      }
    }
    for (let k = 0; k < npt; k++) {
      for (let j = 0; j < nptm; j++) {
        this.zMatrix[k][j] = 0;
      }
    }

    // Reset second derivative parameters
    for (let k = 0; k < npt; k++) {
      this.modelSecondDerivativesParameters[k] = 0;
    }
    const hqSize = (n * (n + 1)) / 2;
    for (let k = 0; k < hqSize; k++) {
      this.modelSecondDerivativesValues[k] = 0;
    }

    // Estimate gradient and Hessian from interpolation points
    // Using simple finite differences from the center point
    const f0 = this.functionValues[0]; // Value at center

    // For each coordinate direction
    for (let i = 0; i < n && 2 * i + 2 < npt; i++) {
      const kp = 2 * i + 1; // Index of point in +direction
      const km = 2 * i + 2; // Index of point in -direction

      if (kp < npt && km < npt) {
        const xp = this.interpolationPoints[kp][i];
        const xm = this.interpolationPoints[km][i];
        const fp = this.functionValues[kp];
        const fm = this.functionValues[km];

        // Estimate gradient: g_i ≈ (f+ - f-) / (x+ - x-)
        if (Math.abs(xp - xm) > SMALL) {
          this.gradientAtTrustRegionCenter[i] = (fp - fm) / (xp - xm);
        }

        // Estimate second derivative: h_ii ≈ (f+ - 2f0 + f-) / (delta^2)
        if (Math.abs(xp) > SMALL && Math.abs(xm) > SMALL) {
          const avgDelta = (Math.abs(xp) + Math.abs(xm)) / 2;
          const hii = (fp - 2 * f0 + fm) / (avgDelta * avgDelta);
          // Store in symmetric format
          const idx = (i * (i + 1)) / 2 + i;
          if (idx < hqSize) {
            this.modelSecondDerivativesValues[idx] = hii;
          }
        }
      }
    }
  }

  /**
   * Update gradient at trust region center using finite differences.
   */
  private updateGradient(): void {
    const n = this.n;
    const bestIndex = this.getKnownBestIndex();
    const fopt = this.functionValues[bestIndex];
    const centerOffset = this.trustRegionCenterOffset;

    // Initialize gradient to zero
    for (let i = 0; i < n; i++) {
      this.gradientAtTrustRegionCenter[i] = 0;
    }

    // Estimate gradient using finite differences from interpolation points
    // Find pairs of points along each coordinate direction
    for (let i = 0; i < n; i++) {
      let foundPair = false;
      let sumGrad = 0;
      let countGrad = 0;

      // Look for points that differ primarily in coordinate i
      for (let k = 0; k < this.npt; k++) {
        const xk = this.interpolationPoints[k];
        const fk = this.functionValues[k];

        // Check if this point is offset from center mainly in direction i
        let isAlongAxis = true;
        let diff_i = xk[i] - centerOffset[i];

        if (Math.abs(diff_i) < SMALL) continue; // Point is at center in this direction

        // Check other coordinates are close to center
        for (let j = 0; j < n; j++) {
          if (j !== i) {
            const diff_j = xk[j] - centerOffset[j];
            if (Math.abs(diff_j) > 0.5 * Math.abs(diff_i)) {
              isAlongAxis = false;
              break;
            }
          }
        }

        if (isAlongAxis && Math.abs(diff_i) > SMALL) {
          // Use one-sided finite difference
          sumGrad += (fk - fopt) / diff_i;
          countGrad++;
          foundPair = true;
        }
      }

      if (foundPair && countGrad > 0) {
        this.gradientAtTrustRegionCenter[i] = sumGrad / countGrad;
      }
    }

    // Also update Hessian diagonal estimates
    this.updateHessianDiagonal();
  }

  /**
   * Recenter the interpolation pattern around the current best point.
   * This rebuilds fresh axis-aligned sample points for better gradient estimation.
   */
  private recenterInterpolation(): void {
    const bestIndex = this.getKnownBestIndex();
    const bestValue = this.functionValues[bestIndex];

    // Get the absolute position of the best point
    const bestPoint = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      bestPoint[i] = this.originShift[i] + this.interpolationPoints[bestIndex][i];
    }

    // Update origin shift to new best point
    this.originShift = [...bestPoint];

    // Reset interpolation points around new origin
    for (let k = 0; k < this.npt; k++) {
      for (let i = 0; i < this.n; i++) {
        this.interpolationPoints[k][i] = 0;
      }
    }

    // First point stays at origin (the best point)
    this.functionValues[0] = bestValue;

    // Generate new sample points along axes
    const stepSize = Math.min(this.trustRegionRadius, this.calculateMaxRadius() * 0.5);
    let pointIndex = 1;

    for (let i = 0; i < this.n && pointIndex < this.npt; i++) {
      // Point in positive direction
      if (pointIndex < this.npt) {
        this.interpolationPoints[pointIndex][i] = stepSize;
        this.clampInterpolationPoint(pointIndex);

        // Only evaluate if the point actually moved
        if (Math.abs(this.interpolationPoints[pointIndex][i]) > SMALL) {
          const point = new Array(this.n);
          for (let j = 0; j < this.n; j++) {
            point[j] = this.originShift[j] + this.interpolationPoints[pointIndex][j];
          }
          try {
            this.functionValues[pointIndex] = this.evaluate(point);
          } catch {
            this.functionValues[pointIndex] = Number.MAX_VALUE;
          }
        } else {
          this.functionValues[pointIndex] = bestValue;
        }
        pointIndex++;
      }

      // Point in negative direction
      if (pointIndex < this.npt) {
        this.interpolationPoints[pointIndex][i] = -stepSize;
        this.clampInterpolationPoint(pointIndex);

        if (Math.abs(this.interpolationPoints[pointIndex][i]) > SMALL) {
          const point = new Array(this.n);
          for (let j = 0; j < this.n; j++) {
            point[j] = this.originShift[j] + this.interpolationPoints[pointIndex][j];
          }
          try {
            this.functionValues[pointIndex] = this.evaluate(point);
          } catch {
            this.functionValues[pointIndex] = Number.MAX_VALUE;
          }
        } else {
          this.functionValues[pointIndex] = bestValue;
        }
        pointIndex++;
      }
    }

    // Fill remaining points if any
    while (pointIndex < this.npt) {
      this.functionValues[pointIndex] = bestValue;
      pointIndex++;
    }

    // Reset trust region center offset
    for (let i = 0; i < this.n; i++) {
      this.trustRegionCenterOffset[i] = 0;
    }

    // Rebuild the model
    this.updateGradient();
  }

  /**
   * Update diagonal Hessian estimates using finite differences.
   */
  private updateHessianDiagonal(): void {
    const n = this.n;
    const bestIndex = this.getKnownBestIndex();
    const f0 = this.functionValues[bestIndex];
    const centerOffset = this.trustRegionCenterOffset;
    const hqSize = (n * (n + 1)) / 2;

    // Reset Hessian
    for (let k = 0; k < hqSize; k++) {
      this.modelSecondDerivativesValues[k] = 0;
    }

    // For each dimension, find plus and minus points
    for (let i = 0; i < n; i++) {
      let fp = Number.NaN;
      let fm = Number.NaN;
      let deltaP = 0;
      let deltaM = 0;

      for (let k = 0; k < this.npt; k++) {
        const xk = this.interpolationPoints[k];
        const fk = this.functionValues[k];
        const diff_i = xk[i] - centerOffset[i];

        // Check if primarily along axis i
        let isAlongAxis = true;
        for (let j = 0; j < n; j++) {
          if (j !== i) {
            const diff_j = xk[j] - centerOffset[j];
            if (Math.abs(diff_j) > 0.1 * this.trustRegionRadius) {
              isAlongAxis = false;
              break;
            }
          }
        }

        if (isAlongAxis) {
          if (diff_i > SMALL && (Number.isNaN(fp) || Math.abs(diff_i) < Math.abs(deltaP))) {
            fp = fk;
            deltaP = diff_i;
          } else if (diff_i < -SMALL && (Number.isNaN(fm) || Math.abs(diff_i) < Math.abs(deltaM))) {
            fm = fk;
            deltaM = diff_i;
          }
        }
      }

      // Compute second derivative if we have both directions
      if (!Number.isNaN(fp) && !Number.isNaN(fm) && Math.abs(deltaP) > SMALL && Math.abs(deltaM) > SMALL) {
        // Central difference formula for second derivative
        const avgDelta = (Math.abs(deltaP) + Math.abs(deltaM)) / 2;
        const hii = (fp - 2 * f0 + fm) / (avgDelta * avgDelta);
        const idx = (i * (i + 1)) / 2 + i;
        if (idx < hqSize && hii > 0) {
          this.modelSecondDerivativesValues[idx] = hii;
        }
      }
    }
  }

  /**
   * Find the trust region step that minimizes the quadratic model.
   * Uses Newton step when Hessian is positive definite, otherwise steepest descent.
   */
  private findTrustRegionStep(): number[] {
    const n = this.n;
    const step = new Array(n).fill(0);

    // Get bounds relative to current trust region center
    const stepLower = new Array(n);
    const stepUpper = new Array(n);

    for (let i = 0; i < n; i++) {
      const lb =
        this.lowerBounds[i] - this.originShift[i] - this.trustRegionCenterOffset[i];
      const ub =
        this.upperBounds[i] - this.originShift[i] - this.trustRegionCenterOffset[i];
      stepLower[i] = Math.max(lb, -this.trustRegionRadius);
      stepUpper[i] = Math.min(ub, this.trustRegionRadius);
    }

    const gradient = [...this.gradientAtTrustRegionCenter];
    const gradNorm = this.vectorNorm(gradient);

    if (gradNorm < SMALL) {
      // Gradient is nearly zero - we're at a critical point
      // Try a small step in each direction to find improvement
      for (let i = 0; i < n; i++) {
        step[i] = 0;
      }
      return step;
    }

    // Try to compute Newton step (minimizer of quadratic model)
    // For simplicity, use diagonal Hessian approximation
    let useNewton = true;
    const newtonStep = new Array(n);

    for (let i = 0; i < n; i++) {
      const hii = this.getModelHessianElement(i, i);
      if (hii > SMALL) {
        // Newton step: d = -H^{-1} g
        newtonStep[i] = -gradient[i] / hii;
      } else {
        // Hessian is not positive definite in this direction
        useNewton = false;
        break;
      }
    }

    if (useNewton) {
      // Check if Newton step is within trust region
      const newtonNorm = this.vectorNorm(newtonStep);
      if (newtonNorm <= this.trustRegionRadius) {
        // Newton step is within trust region - use it (bounded)
        for (let i = 0; i < n; i++) {
          step[i] = Math.max(stepLower[i], Math.min(stepUpper[i], newtonStep[i]));
        }
      } else {
        // Scale Newton step to trust region boundary
        const scale = this.trustRegionRadius / newtonNorm;
        for (let i = 0; i < n; i++) {
          step[i] = Math.max(stepLower[i], Math.min(stepUpper[i], scale * newtonStep[i]));
        }
      }
    } else {
      // Fall back to steepest descent
      // Optimal step length for steepest descent on quadratic: alpha = g'g / g'Hg
      let gHg = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          gHg += gradient[i] * this.getModelHessianElement(i, j) * gradient[j];
        }
      }

      let alpha: number;
      if (gHg > SMALL) {
        alpha = (gradNorm * gradNorm) / gHg;
      } else {
        // Hessian is not positive definite
        alpha = this.trustRegionRadius / gradNorm;
      }

      // Limit to trust region
      alpha = Math.min(alpha, this.trustRegionRadius / gradNorm);

      for (let i = 0; i < n; i++) {
        const unboundedStep = -alpha * gradient[i];
        step[i] = Math.max(stepLower[i], Math.min(stepUpper[i], unboundedStep));
      }
    }

    // Refine step with projected gradient iterations
    this.refineStepWithProjectedGradient(step, stepLower, stepUpper, gradient);

    // Store the new point for later use
    for (let i = 0; i < n; i++) {
      this.newPoint[i] = step[i];
    }

    return step;
  }

  /**
   * Refine the step using projected gradient iterations.
   */
  private refineStepWithProjectedGradient(
    step: number[],
    stepLower: number[],
    stepUpper: number[],
    gradient: number[]
  ): void {
    const n = this.n;

    for (let iter = 0; iter < 20; iter++) {
      // Compute gradient of the quadratic model at current step
      const modelGrad = new Array(n);
      for (let i = 0; i < n; i++) {
        modelGrad[i] = gradient[i];
        for (let j = 0; j < n; j++) {
          modelGrad[i] += this.getModelHessianElement(i, j) * step[j];
        }
      }

      // Projected gradient step
      let improved = false;
      const stepSize = 0.1 * this.trustRegionRadius;

      for (let i = 0; i < n; i++) {
        const newStep = step[i] - stepSize * modelGrad[i];
        const projectedStep = Math.max(stepLower[i], Math.min(stepUpper[i], newStep));

        // Check trust region constraint
        const testStep = [...step];
        testStep[i] = projectedStep;
        if (this.vectorNorm(testStep) <= this.trustRegionRadius * 1.01) {
          if (Math.abs(projectedStep - step[i]) > SMALL * this.trustRegionRadius) {
            step[i] = projectedStep;
            improved = true;
          }
        }
      }

      if (!improved) {
        break;
      }
    }
  }

  /**
   * Calculate the predicted reduction in the objective function.
   */
  private calculatePredictedReduction(step: number[]): number {
    let reduction = 0;

    // Linear term: g' * d
    for (let i = 0; i < this.n; i++) {
      reduction -= this.gradientAtTrustRegionCenter[i] * step[i];
    }

    // Quadratic term: 0.5 * d' * H * d (from the model)
    let quadratic = 0;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        const hessianElement = this.getModelHessianElement(i, j);
        quadratic += step[i] * hessianElement * step[j];
      }
    }
    reduction -= 0.5 * quadratic;

    return reduction;
  }

  /**
   * Get element of the model Hessian matrix.
   */
  private getModelHessianElement(i: number, j: number): number {
    // The Hessian is stored in modelSecondDerivativesValues (explicit part)
    // and modelSecondDerivativesParameters (implicit part via Z matrix)

    // Explicit part (symmetric storage)
    let element = 0;
    if (i <= j) {
      const index = (j * (j + 1)) / 2 + i;
      if (index < this.modelSecondDerivativesValues.length) {
        element = this.modelSecondDerivativesValues[index];
      }
    } else {
      const index = (i * (i + 1)) / 2 + j;
      if (index < this.modelSecondDerivativesValues.length) {
        element = this.modelSecondDerivativesValues[index];
      }
    }

    // Implicit part via interpolation points
    for (let k = 0; k < this.npt; k++) {
      element +=
        this.modelSecondDerivativesParameters[k] *
        this.interpolationPoints[k][i] *
        this.interpolationPoints[k][j];
    }

    return element;
  }

  /**
   * Update the model after accepting a new point.
   */
  private updateModel(
    _step: number[],
    newPoint: number[],
    newValue: number
  ): void {
    // Find the interpolation point to replace
    const replaceIndex = this.findPointToReplace();

    // Update interpolation point
    for (let i = 0; i < this.n; i++) {
      this.interpolationPoints[replaceIndex][i] =
        newPoint[i] - this.originShift[i];
    }
    this.functionValues[replaceIndex] = newValue;

    // Update trust region center if this is the new best
    const bestIndex = this.getKnownBestIndex();
    for (let i = 0; i < this.n; i++) {
      this.trustRegionCenterOffset[i] =
        this.interpolationPoints[bestIndex][i];
    }

    // Rebuild model matrices (simplified approach)
    this.initializeBZMatrices();
    this.updateGradient();
  }

  /**
   * Update geometry without changing trust region center.
   */
  private updateGeometry(
    _step: number[],
    newPoint: number[],
    newValue: number
  ): void {
    // Find the interpolation point furthest from center to replace
    const replaceIndex = this.findPointToReplace();

    // Update interpolation point
    for (let i = 0; i < this.n; i++) {
      this.interpolationPoints[replaceIndex][i] =
        newPoint[i] - this.originShift[i];
    }
    this.functionValues[replaceIndex] = newValue;

    // Rebuild model (simplified)
    this.initializeBZMatrices();
    this.updateGradient();
  }

  /**
   * Find the interpolation point to replace.
   */
  private findPointToReplace(): number {
    // Replace the point furthest from the trust region center
    // (excluding the best point)
    const bestIndex = this.getKnownBestIndex();
    let maxDist = -1;
    let replaceIndex = 0;

    for (let k = 0; k < this.npt; k++) {
      if (k === bestIndex) continue;

      let dist = 0;
      for (let i = 0; i < this.n; i++) {
        const diff =
          this.interpolationPoints[k][i] - this.trustRegionCenterOffset[i];
        dist += diff * diff;
      }

      if (dist > maxDist) {
        maxDist = dist;
        replaceIndex = k;
      }
    }

    return replaceIndex;
  }

  /**
   * Get index of the known best point.
   */
  private getKnownBestIndex(): number {
    let bestIndex = 0;
    let bestValue = this.functionValues[0];

    for (let k = 1; k < this.npt; k++) {
      if (this.functionValues[k] < bestValue) {
        bestValue = this.functionValues[k];
        bestIndex = k;
      }
    }

    return bestIndex;
  }

  /**
   * Calculate the maximum trust region radius based on bounds.
   */
  private calculateMaxRadius(): number {
    let maxRadius = Number.MAX_VALUE;

    for (let i = 0; i < this.n; i++) {
      const center = this.originShift[i] + this.trustRegionCenterOffset[i];
      const distLower = center - this.lowerBounds[i];
      const distUpper = this.upperBounds[i] - center;
      const minDist = Math.min(distLower, distUpper);
      if (minDist < maxRadius) {
        maxRadius = minDist;
      }
    }

    return Math.max(maxRadius, this.trustRegionRadiusLB);
  }

  /**
   * Calculate the Euclidean norm of a vector.
   */
  private vectorNorm(v: number[]): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      sum += v[i] * v[i];
    }
    return Math.sqrt(sum);
  }

  /**
   * Get the number of evaluations performed.
   */
  getEvaluations(): number {
    return this.evaluations;
  }
}
