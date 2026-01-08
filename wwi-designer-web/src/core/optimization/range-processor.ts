/**
 * Range processors for multi-start optimization.
 *
 * These classes generate starting points for multi-start optimization runs.
 * Different strategies allow for random exploration or systematic grid search.
 *
 * Ported from com.wwidesigner.optimization.multistart.AbstractRangeProcessor.java
 * and related classes.
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
 * Interface for generating random/pseudo-random vectors for multi-start optimization.
 */
export interface RandomVectorGenerator {
  /**
   * Generate the next starting vector.
   */
  nextVector(): number[];

  /**
   * Get the number of starts configured.
   */
  getNumberOfStarts(): number;
}

/**
 * Abstract base class for range processors.
 *
 * A range processor generates starting points within the optimization bounds,
 * optionally varying only a subset of dimensions.
 */
export abstract class AbstractRangeProcessor implements RandomVectorGenerator {
  /** Lower bounds for each dimension */
  protected lowVector: number[];

  /** Range (upper - lower) for each dimension */
  protected range: number[];

  /** Which dimensions should vary between starts */
  protected valuesToVary: boolean[];

  /** Total number of starting points to generate */
  protected numberOfSetsToGenerate: number;

  /** Number of dimensions that actually vary */
  protected numberOfValuesToVary: number;

  /** Current start index */
  protected currentStart: number = 0;

  /**
   * Create a range processor.
   *
   * @param lowerBound - Lower bounds for optimization variables
   * @param upperBound - Upper bounds for optimization variables
   * @param indicesToVary - Which dimensions to vary (null = all dimensions)
   * @param numberOfStarts - Number of starting points to generate
   */
  constructor(
    lowerBound: number[],
    upperBound: number[],
    indicesToVary: number[] | null,
    numberOfStarts: number
  ) {
    const vectorLength = lowerBound.length;

    this.lowVector = [...lowerBound];
    this.range = new Array(vectorLength);
    this.valuesToVary = new Array(vectorLength).fill(false);
    this.numberOfSetsToGenerate = numberOfStarts;

    // Calculate ranges
    for (let i = 0; i < vectorLength; i++) {
      this.range[i] = upperBound[i]! - lowerBound[i]!;
    }

    // Determine which values to vary
    if (indicesToVary === null || indicesToVary.length === 0) {
      // Vary all dimensions
      for (let i = 0; i < vectorLength; i++) {
        this.valuesToVary[i] = true;
      }
      this.numberOfValuesToVary = vectorLength;
    } else {
      // Only vary specified dimensions
      for (const idx of indicesToVary) {
        if (idx >= 0 && idx < vectorLength) {
          this.valuesToVary[idx] = true;
        }
      }
      this.numberOfValuesToVary = indicesToVary.length;
    }
  }

  /**
   * Set static values for dimensions that don't vary.
   * For non-varying dimensions, the lowVector is used as the static value.
   *
   * @param startValues - Starting values to use for non-varying dimensions
   */
  setStaticValues(startValues: number[]): void {
    for (let i = 0; i < this.lowVector.length; i++) {
      if (!this.valuesToVary[i]) {
        this.lowVector[i] = startValues[i]!;
        this.range[i] = 0; // No variation for static values
      }
    }
  }

  /**
   * Get the number of starts configured.
   */
  getNumberOfStarts(): number {
    return this.numberOfSetsToGenerate;
  }

  /**
   * Generate the next starting vector.
   * Must be implemented by subclasses.
   */
  abstract nextVector(): number[];
}

/**
 * Random range processor that generates uniformly distributed starting points.
 *
 * For each varying dimension, generates a random value in [lower, upper].
 * Non-varying dimensions use their static values.
 */
export class RandomRangeProcessor extends AbstractRangeProcessor {
  /**
   * Generate the next random starting vector.
   */
  nextVector(): number[] {
    const vectorLength = this.lowVector.length;
    const vector = new Array(vectorLength);

    for (let i = 0; i < vectorLength; i++) {
      if (this.valuesToVary[i]) {
        // Generate random value in range: low + random(0,1) * range
        vector[i] = this.lowVector[i]! + this.range[i]! * Math.random();
      } else {
        // Keep static value
        vector[i] = this.lowVector[i]!;
      }
    }

    this.currentStart++;
    return vector;
  }
}

/**
 * Grid range processor that generates starting points on a regular grid.
 *
 * For systematic exploration, divides the parameter space into a regular grid
 * and generates points at grid intersections.
 *
 * Example: 27 starts with 3 varying dimensions = 3x3x3 grid
 */
export class GridRangeProcessor extends AbstractRangeProcessor {
  /** Number of grid points per varying dimension */
  private gridPointsPerDimension: number;

  /** Current position in the grid */
  private gridPoint: number[];

  /** Indices of varying dimensions */
  private varyingIndices: number[];

  /**
   * Create a grid range processor.
   */
  constructor(
    lowerBound: number[],
    upperBound: number[],
    indicesToVary: number[] | null,
    numberOfStarts: number
  ) {
    super(lowerBound, upperBound, indicesToVary, numberOfStarts);

    // Calculate grid points per dimension
    // numberOfStarts = gridPointsPerDimension^numberOfValuesToVary
    if (this.numberOfValuesToVary > 0) {
      this.gridPointsPerDimension = Math.floor(
        Math.pow(numberOfStarts, 1.0 / this.numberOfValuesToVary)
      );
      // Ensure at least 2 points per dimension
      this.gridPointsPerDimension = Math.max(2, this.gridPointsPerDimension);
    } else {
      this.gridPointsPerDimension = 1;
    }

    // Collect varying dimension indices
    this.varyingIndices = [];
    for (let i = 0; i < this.valuesToVary.length; i++) {
      if (this.valuesToVary[i]) {
        this.varyingIndices.push(i);
      }
    }

    // Initialize grid position to all zeros
    this.gridPoint = new Array(this.numberOfValuesToVary).fill(0);
  }

  /**
   * Generate the next grid-based starting vector.
   */
  nextVector(): number[] {
    const vectorLength = this.lowVector.length;
    const vector = new Array(vectorLength);

    // Set non-varying dimensions to static values
    for (let i = 0; i < vectorLength; i++) {
      if (!this.valuesToVary[i]) {
        vector[i] = this.lowVector[i];
      }
    }

    // Set varying dimensions based on grid position
    for (let j = 0; j < this.varyingIndices.length; j++) {
      const i = this.varyingIndices[j]!;
      // Calculate position: low + (gridPoint / (gridPoints - 1)) * range
      // This distributes points evenly including endpoints
      const fraction =
        this.gridPointsPerDimension > 1
          ? this.gridPoint[j]! / (this.gridPointsPerDimension - 1)
          : 0.5;
      vector[i] = this.lowVector[i]! + fraction * this.range[i]!;
    }

    // Increment grid position (like a multi-digit counter)
    this.incrementGridPosition();

    this.currentStart++;
    return vector;
  }

  /**
   * Increment the grid position counter.
   */
  private incrementGridPosition(): void {
    for (let j = 0; j < this.gridPoint.length; j++) {
      this.gridPoint[j]!++;
      if (this.gridPoint[j]! < this.gridPointsPerDimension) {
        break; // No carry needed
      }
      this.gridPoint[j] = 0; // Carry to next dimension
    }
  }
}

/**
 * Latin Hypercube Sampling range processor.
 *
 * Generates starting points using Latin Hypercube Sampling (LHS),
 * which ensures good coverage of the parameter space while being
 * more space-filling than pure random sampling.
 */
export class LatinHypercubeRangeProcessor extends AbstractRangeProcessor {
  /** Pre-generated samples */
  private samples: number[][] | null = null;

  /** Current sample index */
  private sampleIndex: number = 0;

  /**
   * Generate all Latin Hypercube samples upfront.
   */
  private generateSamples(): void {
    const n = this.numberOfSetsToGenerate;
    const d = this.numberOfValuesToVary;

    if (d === 0) {
      this.samples = [];
      return;
    }

    // Collect varying indices
    const varyingIndices: number[] = [];
    for (let i = 0; i < this.valuesToVary.length; i++) {
      if (this.valuesToVary[i]) {
        varyingIndices.push(i);
      }
    }

    // Generate LHS samples
    // For each dimension, create a random permutation of [0, 1, ..., n-1]
    const permutations: number[][] = [];
    for (let j = 0; j < d; j++) {
      const perm = Array.from({ length: n }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = n - 1; i > 0; i--) {
        const randIdx = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[randIdx]] = [perm[randIdx]!, perm[i]!];
      }
      permutations.push(perm);
    }

    // Generate full vectors
    this.samples = [];
    const vectorLength = this.lowVector.length;

    for (let i = 0; i < n; i++) {
      const vector = new Array(vectorLength);

      // Set non-varying dimensions to static values
      for (let j = 0; j < vectorLength; j++) {
        if (!this.valuesToVary[j]) {
          vector[j] = this.lowVector[j];
        }
      }

      // Set varying dimensions using LHS
      for (let jIdx = 0; jIdx < varyingIndices.length; jIdx++) {
        const j = varyingIndices[jIdx]!;
        // Sample within the stratum with random offset
        const stratum = permutations[jIdx]![i]!;
        const lower = stratum / n;
        const upper = (stratum + 1) / n;
        const fraction = lower + Math.random() * (upper - lower);
        vector[j] = this.lowVector[j]! + fraction * this.range[j]!;
      }

      this.samples.push(vector);
    }
  }

  /**
   * Generate the next LHS-based starting vector.
   */
  nextVector(): number[] {
    if (this.samples === null) {
      this.generateSamples();
    }

    if (this.sampleIndex >= this.samples!.length) {
      // Wrap around or regenerate
      this.sampleIndex = 0;
    }

    const vector = this.samples![this.sampleIndex]!;
    this.sampleIndex++;
    this.currentStart++;

    return vector;
  }
}

/**
 * Create a range processor with the specified strategy.
 *
 * @param strategy - Strategy: "random", "grid", or "lhs" (Latin Hypercube)
 * @param lowerBound - Lower bounds for optimization variables
 * @param upperBound - Upper bounds for optimization variables
 * @param indicesToVary - Which dimensions to vary (null = all)
 * @param numberOfStarts - Number of starting points
 */
export function createRangeProcessor(
  strategy: "random" | "grid" | "lhs",
  lowerBound: number[],
  upperBound: number[],
  indicesToVary: number[] | null,
  numberOfStarts: number
): AbstractRangeProcessor {
  switch (strategy) {
    case "random":
      return new RandomRangeProcessor(
        lowerBound,
        upperBound,
        indicesToVary,
        numberOfStarts
      );
    case "grid":
      return new GridRangeProcessor(
        lowerBound,
        upperBound,
        indicesToVary,
        numberOfStarts
      );
    case "lhs":
      return new LatinHypercubeRangeProcessor(
        lowerBound,
        upperBound,
        indicesToVary,
        numberOfStarts
      );
    default:
      return new RandomRangeProcessor(
        lowerBound,
        upperBound,
        indicesToVary,
        numberOfStarts
      );
  }
}
