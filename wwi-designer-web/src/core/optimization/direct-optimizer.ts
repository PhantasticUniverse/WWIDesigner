/**
 * DIRECT (DIviding RECTangles) optimizer for global optimization.
 *
 * Implementation of the DIRECT algorithm described in:
 *     D. R. Jones, C. D. Perttunen, and B. E. Stuckmann,
 *     "Lipschitzian optimization without the lipschitz constant,"
 *     J. Optimization Theory and Applications, vol. 79, p. 157 (1993).
 *
 * Ported from com.wwidesigner.math.DIRECTOptimizer.java
 * Original C implementation by Steven G. Johnson (MIT License).
 * Java translation by Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Result of an optimization run.
 */
export interface OptimizationResult {
  /** Optimal point found */
  point: number[];
  /** Function value at optimal point */
  value: number;
  /** Number of function evaluations performed */
  evaluations: number;
  /** Number of iterations performed */
  iterations: number;
  /** Whether the optimizer converged */
  converged: boolean;
}

/**
 * Objective function type - takes a point and returns a scalar value.
 */
export type ObjectiveFunction = (point: number[]) => number;

/**
 * Options for the DIRECT optimizer.
 */
export interface DIRECTOptions {
  /** Convergence threshold for x values (relative to bounds) */
  convergenceThreshold?: number;
  /** Maximum number of function evaluations */
  maxEvaluations?: number;
  /** Target function value (stop if reached) */
  targetValue?: number;
  /** Number of iterations without improvement before stopping (after convergence threshold met) */
  convergedIterationsThreshold?: number;
  /** Whether to allow duplicate points in the convex hull (Jones vs Gablonsky) */
  allowDuplicatesInHull?: boolean;
}

/** Default convergence threshold on x values */
const DEFAULT_X_THRESHOLD = 1.0e-4;

/** Default iteration threshold after convergence */
const DEFAULT_ITERATION_THRESHOLD = 20;

/** One third constant */
const THIRD = 1 / 3;

/** Tolerance for equating side sizes */
const EQUAL_SIDE_TOL = 5e-2;

/** Granularity for diameter comparisons */
const DIAMETER_GRANULARITY = 1.0e-13;

/**
 * Key for a hyperrectangle in the search tree.
 */
interface RectangleKey {
  diameter: number;
  fValue: number;
  serial: number;
}

/**
 * Value stored for a hyperrectangle.
 */
interface RectangleValue {
  centre: number[];
  width: number[];
  potential: number[] | null;
  maxWidth: number;
  longCount: number;
  longIdx: number;
}

/**
 * A rectangle entry combining key and value.
 */
interface Rectangle {
  key: RectangleKey;
  value: RectangleValue;
}

/**
 * Description of which sides of a rectangle should be divided.
 */
interface EligibleSides {
  nrEligibleSides: number;
  eligibleSide: number;
  isEligibleSide: boolean[];
}

/**
 * Compare two rectangle keys for sorting.
 */
function compareKeys(a: RectangleKey, b: RectangleKey): number {
  if (a.diameter > b.diameter) return 1;
  if (a.diameter < b.diameter) return -1;
  if (a.fValue > b.fValue) return 1;
  if (a.fValue < b.fValue) return -1;
  if (a.serial > b.serial) return 1;
  if (a.serial < b.serial) return -1;
  return 0;
}

/**
 * DIRECT optimizer for global optimization without derivatives.
 */
export class DIRECTOptimizer {
  private convergenceXThreshold: number;
  private convergedIterationsThreshold: number;
  private targetFunctionValue: number | null;
  private allowDuplicatesInHull: boolean;
  private maxEvaluations: number;

  // Working state
  private objective!: ObjectiveFunction;
  private lowerBounds!: number[];
  private upperBounds!: number[];
  private boundDifference!: number[];
  private dimension!: number;
  private nextSerial!: number;
  private rtree!: Map<string, { key: RectangleKey; value: RectangleValue }>;
  private hull!: Rectangle[];
  private fv!: number[];
  private isort!: number[];
  private currentBest!: { point: number[]; value: number };
  private fMax!: number;
  private evaluationsDone!: number;
  private iterationsDone!: number;
  private iterationOfLastImprovement!: number;
  private isXConverged!: boolean;

  constructor(options: DIRECTOptions = {}) {
    this.convergenceXThreshold =
      options.convergenceThreshold ?? DEFAULT_X_THRESHOLD;
    this.convergedIterationsThreshold =
      options.convergedIterationsThreshold ?? DEFAULT_ITERATION_THRESHOLD;
    this.targetFunctionValue = options.targetValue ?? null;
    this.allowDuplicatesInHull = options.allowDuplicatesInHull ?? true;
    this.maxEvaluations = options.maxEvaluations ?? 10000;
  }

  /**
   * Optimize an objective function within the given bounds.
   */
  optimize(
    objective: ObjectiveFunction,
    lowerBounds: number[],
    upperBounds: number[],
    startPoint?: number[]
  ): OptimizationResult {
    this.objective = objective;
    this.lowerBounds = lowerBounds;
    this.upperBounds = upperBounds;
    this.dimension = lowerBounds.length;

    // Validate
    if (this.dimension < 1) {
      throw new Error("Dimension must be at least 1");
    }
    if (upperBounds.length !== this.dimension) {
      throw new Error("Upper bounds dimension mismatch");
    }

    // Initialize
    this.setup();

    const convergenceDiameter = this.thresholdDiameter(
      this.convergenceXThreshold,
      this.dimension
    );

    // Main optimization loop
    let nrPromising: number;
    do {
      this.iterationsDone++;
      nrPromising = this.dividePotentiallyOptimal(convergenceDiameter);
    } while (!this.hasConverged(nrPromising));

    return {
      point: [...this.currentBest.point],
      value: this.currentBest.value,
      evaluations: this.evaluationsDone,
      iterations: this.iterationsDone,
      converged: true,
    };
  }

  /**
   * Initialize the optimizer state.
   */
  private setup(): void {
    this.boundDifference = new Array(this.dimension);
    const centre = new Array(this.dimension);
    const width = new Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      this.boundDifference[i] = this.upperBounds[i] - this.lowerBounds[i];
      centre[i] = 0.5 * (this.upperBounds[i] + this.lowerBounds[i]);
      width[i] = this.boundDifference[i] > 0 ? 1.0 : 0.0;
    }

    this.nextSerial = 0;
    this.rtree = new Map();
    this.fv = new Array(2 * this.dimension);
    this.isort = new Array(this.dimension);

    const hullSize = Math.max(150, Math.floor(Math.sqrt(this.maxEvaluations)));
    this.hull = new Array(hullSize);

    this.evaluationsDone = 0;
    this.iterationsDone = 0;
    this.iterationOfLastImprovement = 0;
    this.fMax = 1.0;

    // Initialize currentBest
    this.currentBest = { point: [...centre], value: Number.MAX_VALUE };

    // Create first rectangle
    const firstRectValue = this.createRectangleValue(centre, width);
    const fValue = this.computeObjectiveValue(centre);
    this.fMax = fValue;

    const firstKey: RectangleKey = {
      diameter: this.rectangleDiameter(width),
      fValue: fValue,
      serial: ++this.nextSerial,
    };

    this.rtree.set(this.keyToString(firstKey), {
      key: firstKey,
      value: firstRectValue,
    });
    this.divideRectangle(firstKey, firstRectValue);
  }

  /**
   * Compute objective function value.
   */
  private computeObjectiveValue(point: number[]): number {
    this.evaluationsDone++;

    try {
      const fval = this.objective(point);

      if (fval < this.currentBest.value) {
        this.currentBest = { point: [...point], value: fval };
        this.iterationOfLastImprovement = this.iterationsDone;
      }
      if (fval > this.fMax) {
        this.fMax = fval;
      }
      return fval;
    } catch {
      // Infeasible point
      return this.fMax;
    }
  }

  /**
   * Create a rectangle value with computed long side information.
   */
  private createRectangleValue(
    centre: number[],
    width: number[],
    potential: number[] | null = null
  ): RectangleValue {
    const rect: RectangleValue = {
      centre: [...centre],
      width: [...width],
      potential,
      maxWidth: 0,
      longCount: 0,
      longIdx: 0,
    };
    this.updateLongSides(rect);
    return rect;
  }

  /**
   * Update the long side information for a rectangle.
   */
  private updateLongSides(rect: RectangleValue): void {
    rect.maxWidth = rect.width[0];
    rect.longIdx = 0;

    for (let i = 1; i < rect.width.length; i++) {
      if (rect.width[i] > rect.maxWidth) {
        rect.maxWidth = rect.width[i];
        rect.longIdx = i;
      }
    }

    rect.longCount = 0;
    for (let i = 0; i < rect.width.length; i++) {
      if (rect.width[i] >= rect.maxWidth * (1.0 - EQUAL_SIDE_TOL)) {
        rect.longCount++;
      }
    }
  }

  /**
   * Check if a dimension is a long side.
   */
  private isLongSide(rect: RectangleValue, i: number): boolean {
    if (i === rect.longIdx) return true;
    return rect.width[i] >= rect.maxWidth * (1.0 - EQUAL_SIDE_TOL);
  }

  /**
   * Check if all sides of a rectangle are smaller than threshold.
   */
  private isSmall(rect: RectangleValue): boolean {
    for (let i = 0; i < rect.width.length; i++) {
      if (rect.width[i] > this.convergenceXThreshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compute the diameter of a rectangle.
   */
  private rectangleDiameter(w: number[]): number {
    let sum = 0.0;
    for (let i = 0; i < w.length; i++) {
      if (this.boundDifference[i] > 0) {
        sum += w[i] * w[i];
      }
    }
    // Round to float precision for grouping
    return Math.fround(Math.sqrt(sum) * 0.5);
  }

  /**
   * Compute the threshold diameter for convergence.
   */
  private thresholdDiameter(
    convergenceThreshold: number,
    dimension: number
  ): number {
    if (convergenceThreshold <= 0.0) return 0.0;

    // Round threshold down to next smaller power of 1/3
    const aIterations = Math.ceil(Math.log(convergenceThreshold) / Math.log(THIRD));
    const threshold = Math.pow(THIRD, aIterations);
    return 0.5 * Math.sqrt(dimension) * threshold;
  }

  /**
   * Convert a rectangle key to a string for map storage.
   */
  private keyToString(key: RectangleKey): string {
    return `${key.diameter}:${key.fValue}:${key.serial}`;
  }

  /**
   * Check if optimization has converged.
   */
  private hasConverged(nrPromising: number): boolean {
    // Check evaluation limit
    if (this.evaluationsDone >= this.maxEvaluations) {
      return true;
    }

    // Check target value
    if (
      this.targetFunctionValue !== null &&
      this.currentBest.value <= this.targetFunctionValue
    ) {
      return true;
    }

    // Check x convergence
    if (!this.isXConverged) {
      return false;
    }

    // No promising divisions and past minimum iterations
    if (
      nrPromising === 0 &&
      this.iterationsDone >=
        this.iterationOfLastImprovement + 1 + this.dimension
    ) {
      return true;
    }

    // Too many iterations without improvement
    if (
      this.iterationsDone >=
      this.iterationOfLastImprovement + this.convergedIterationsThreshold
    ) {
      return true;
    }

    return false;
  }

  /**
   * Select which sides of a rectangle are eligible for division.
   */
  private selectEligibleSides(rectangle: RectangleValue): EligibleSides {
    const sides: EligibleSides = {
      nrEligibleSides: rectangle.longCount,
      eligibleSide: rectangle.longIdx,
      isEligibleSide: new Array(rectangle.width.length).fill(false),
    };

    for (let i = 0; i < rectangle.width.length; i++) {
      sides.isEligibleSide[i] = this.isLongSide(rectangle, i);
    }

    return sides;
  }

  /**
   * Check if a new point is promising (suggests possible improvement).
   */
  private isPromising(
    centreF: number,
    newF: number,
    _dimension: number
  ): boolean {
    // Extrapolate line from original centre through new point
    if (newF < centreF && centreF - 1.5 * (centreF - newF) < this.currentBest.value) {
      return true;
    }
    if (newF > centreF && centreF - 0.1 * (newF - centreF) < this.currentBest.value) {
      return true;
    }
    return false;
  }

  /**
   * Divide a rectangle into thirds along its longest sides.
   */
  private divideRectangle(
    rectKey: RectangleKey,
    rectangle: RectangleValue
  ): number {
    const n = rectangle.width.length;
    const c = rectangle.centre;
    const w = [...rectangle.width];
    const centreF = rectKey.fValue;
    let nrPromising = 0;

    const eligibleSides = this.selectEligibleSides(rectangle);

    if (eligibleSides.nrEligibleSides > 1) {
      // Trisect all longest sides
      for (let i = 0; i < n; i++) {
        this.isort[i] = i;
        if (eligibleSides.isEligibleSide[i]) {
          const csave = c[i];
          c[i] = csave - w[i] * THIRD * this.boundDifference[i];
          const newF1 = this.computeObjectiveValue(c);
          this.fv[2 * i] = newF1;
          if (this.isPromising(centreF, newF1, n)) nrPromising++;

          c[i] = csave + w[i] * THIRD * this.boundDifference[i];
          const newF2 = this.computeObjectiveValue(c);
          this.fv[2 * i + 1] = newF2;
          if (this.isPromising(centreF, newF2, n)) nrPromising++;

          c[i] = csave;
        } else {
          this.fv[2 * i] = Number.MAX_VALUE;
          this.fv[2 * i + 1] = Number.MAX_VALUE;
        }
      }

      // Sort dimensions by minimum function value
      this.isort.sort((a, b) => {
        const fv1 = Math.min(this.fv[2 * a], this.fv[2 * a + 1]);
        const fv2 = Math.min(this.fv[2 * b], this.fv[2 * b + 1]);
        return fv1 - fv2;
      });

      // Remove and reinsert rectangles
      let thisRectKey = rectKey;
      for (let i = 0; i < eligibleSides.nrEligibleSides; i++) {
        const dim = this.isort[i];

        // Shrink centre rectangle
        w[dim] *= THIRD;
        this.rtree.delete(this.keyToString(thisRectKey));
        this.updateLongSides(rectangle);
        rectangle.width = [...w];

        thisRectKey = {
          diameter: this.rectangleDiameter(w),
          fValue: thisRectKey.fValue,
          serial: ++this.nextSerial,
        };
        this.rtree.set(this.keyToString(thisRectKey), {
          key: thisRectKey,
          value: rectangle,
        });

        // Insert new rectangles for side divisions
        const new_c1 = [...c];
        const new_w1 = [...w];
        new_c1[dim] = c[dim] - w[dim] * this.boundDifference[dim];
        const newKey1: RectangleKey = {
          diameter: thisRectKey.diameter,
          fValue: this.fv[2 * dim],
          serial: ++this.nextSerial,
        };
        const newRect1 = this.createRectangleValue(new_c1, new_w1);
        this.rtree.set(this.keyToString(newKey1), {
          key: newKey1,
          value: newRect1,
        });

        const new_c2 = [...c];
        const new_w2 = [...w];
        new_c2[dim] = c[dim] + w[dim] * this.boundDifference[dim];
        const newKey2: RectangleKey = {
          diameter: thisRectKey.diameter,
          fValue: this.fv[2 * dim + 1],
          serial: ++this.nextSerial,
        };
        const newRect2 = this.createRectangleValue(new_c2, new_w2);
        this.rtree.set(this.keyToString(newKey2), {
          key: newKey2,
          value: newRect2,
        });
      }
    } else {
      // Divide on single longest side
      const dim = eligibleSides.eligibleSide;
      w[dim] *= THIRD;

      const newKey: RectangleKey = {
        diameter: this.rectangleDiameter(w),
        fValue: rectKey.fValue,
        serial: ++this.nextSerial,
      };

      this.rtree.delete(this.keyToString(rectKey));
      this.updateLongSides(rectangle);
      rectangle.width = [...w];
      this.rtree.set(this.keyToString(newKey), { key: newKey, value: rectangle });

      // Insert new rectangles
      const new_c1 = [...c];
      const new_w1 = [...w];
      new_c1[dim] = c[dim] - w[dim] * this.boundDifference[dim];
      const fv0 = this.computeObjectiveValue(new_c1);
      const newKey1: RectangleKey = {
        diameter: newKey.diameter,
        fValue: fv0,
        serial: ++this.nextSerial,
      };
      const newRect1 = this.createRectangleValue(new_c1, new_w1);
      this.rtree.set(this.keyToString(newKey1), { key: newKey1, value: newRect1 });
      if (this.isPromising(centreF, fv0, n)) nrPromising++;

      const new_c2 = [...c];
      const new_w2 = [...w];
      new_c2[dim] = c[dim] + w[dim] * this.boundDifference[dim];
      const fv1 = this.computeObjectiveValue(new_c2);
      const newKey2: RectangleKey = {
        diameter: newKey.diameter,
        fValue: fv1,
        serial: ++this.nextSerial,
      };
      const newRect2 = this.createRectangleValue(new_c2, new_w2);
      this.rtree.set(this.keyToString(newKey2), { key: newKey2, value: newRect2 });
      if (this.isPromising(centreF, fv1, n)) nrPromising++;
    }

    return nrPromising;
  }

  /**
   * Find and divide potentially optimal hyperrectangles.
   */
  private dividePotentiallyOptimal(convergenceDiameter: number): number {
    let nrPromisingDivisions = 0;
    this.isXConverged = false;

    const nhull = this.getPotentiallyOptimal();

    for (let i = 0; i < nhull; i++) {
      const rect = this.hull[i];
      if (
        rect.key.diameter < convergenceDiameter &&
        this.isSmall(rect.value)
      ) {
        // Rectangle already smaller than required accuracy
        this.isXConverged = true;
      } else {
        // Divide this potentially optimal rectangle
        nrPromisingDivisions += this.divideRectangle(rect.key, rect.value);
      }
    }

    return nrPromisingDivisions;
  }

  /**
   * Find the lower convex hull of rectangles (potentially optimal).
   */
  private getPotentiallyOptimal(): number {
    // Sort all rectangles by (diameter, fValue, serial)
    const entries = Array.from(this.rtree.values()).sort((a, b) =>
      compareKeys(a.key, b.key)
    );

    if (entries.length === 0) return 0;

    const xmax = entries[entries.length - 1].key.diameter;

    // Find first entry with x == xmax
    let nmaxIdx = entries.length - 1;
    while (nmaxIdx > 0 && entries[nmaxIdx - 1].key.diameter === xmax) {
      nmaxIdx--;
    }
    const ymaxmin = entries[nmaxIdx].key.fValue;

    let nhull = 0;
    let xlast = 0;
    let ylast = this.currentBest.value;
    let minslope = (ymaxmin - ylast) / (xmax - xlast);

    for (let nIdx = 0; nIdx < nmaxIdx; nIdx++) {
      const entry = entries[nIdx];
      const k = entry.key;

      // Performance hack: skip vertical lines
      if (nhull > 0 && k.diameter === xlast) {
        if (k.fValue > ylast) {
          // Skip all points with higher y at same x
          while (
            nIdx + 1 < nmaxIdx &&
            entries[nIdx + 1].key.diameter === xlast
          ) {
            nIdx++;
          }
          continue;
        }
        // Equal y values, add to hull if duplicates allowed
        if (this.allowDuplicatesInHull) {
          this.ensureHullCapacity(nhull);
          this.hull[nhull++] = { key: k, value: entry.value };
        }
        continue;
      }

      // Check if point is above the line to nmax
      if (
        nhull > 0 &&
        k.fValue > ylast + (k.diameter - xlast) * minslope
      ) {
        continue;
      }

      // Remove points until we are making a "left turn"
      while (nhull >= 1) {
        const t1 = this.hull[nhull - 1].key;
        const it2 = this.getPrunePoint(nhull, t1);

        if (it2 < 0) {
          if (t1.fValue < k.fValue) {
            // Adding first segment with positive slope
            break;
          }
        } else {
          const t2 = this.hull[it2].key;
          // Cross product for left turn
          const cross =
            (t1.diameter - t2.diameter) * (k.fValue - t2.fValue) -
            (t1.fValue - t2.fValue) * (k.diameter - t2.diameter);
          if (cross >= 0) {
            break;
          }
        }
        nhull = it2 + 1;
      }

      this.ensureHullCapacity(nhull);
      this.hull[nhull++] = { key: k, value: entry.value };
      xlast = k.diameter;
      ylast = k.fValue;
      minslope = (ymaxmin - ylast) / (xmax - xlast);
    }

    // Include points at (xmax, ymaxmin)
    if (this.allowDuplicatesInHull) {
      for (let i = nmaxIdx; i < entries.length; i++) {
        const entry = entries[i];
        if (
          entry.key.diameter === xmax &&
          entry.key.fValue === ymaxmin
        ) {
          this.ensureHullCapacity(nhull);
          this.hull[nhull++] = { key: entry.key, value: entry.value };
        }
      }
    } else {
      this.ensureHullCapacity(nhull);
      this.hull[nhull++] = {
        key: entries[nmaxIdx].key,
        value: entries[nmaxIdx].value,
      };
    }

    return nhull;
  }

  /**
   * Find the prune point in the hull.
   */
  private getPrunePoint(nhull: number, t1: RectangleKey): number {
    let it2 = nhull - 2;
    while (it2 >= 0) {
      const t2 = this.hull[it2].key;
      if (t2.diameter !== t1.diameter || t2.fValue !== t1.fValue) {
        return it2;
      }
      it2--;
    }
    return -1;
  }

  /**
   * Ensure the hull array has enough capacity.
   */
  private ensureHullCapacity(nhull: number): void {
    if (nhull >= this.hull.length - 10) {
      const newHull = new Array(this.hull.length * 2);
      for (let i = 0; i < this.hull.length; i++) {
        newHull[i] = this.hull[i];
      }
      this.hull = newHull;
    }
  }
}
