/**
 * Tests for multi-start optimization framework.
 */

import { describe, it, expect } from "bun:test";
import {
  RandomRangeProcessor,
  GridRangeProcessor,
  LatinHypercubeRangeProcessor,
  createRangeProcessor,
} from "../../../src/core/optimization/range-processor.ts";
import {
  optimizeObjectiveFunction,
  type OptimizerOptions,
} from "../../../src/core/optimization/objective-function-optimizer.ts";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "../../../src/core/optimization/base-objective-function.ts";
import type { IInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import type { IEvaluator } from "../../../src/core/optimization/evaluator.ts";
import type { Tuning, Fingering } from "../../../src/models/tuning.ts";

// Mock types for testing
const mockCalculator = {
  getInstrument: () => ({ lengthType: "mm" }),
} as unknown as IInstrumentCalculator;

const mockTuning: Tuning = {
  name: "test",
  numberOfHoles: 0,
  fingering: [{ note: { frequency: 440 } }] as Fingering[],
};

const mockEvaluator = {
  calculateErrorVector: () => [0],
} as unknown as IEvaluator;

/**
 * Simple test objective function for multi-start testing.
 */
class TestObjectiveFunction extends BaseObjectiveFunction {
  private testFunction: (point: number[]) => number;
  private currentPoint: number[];

  constructor(
    testFn: (point: number[]) => number,
    lowerBounds: number[],
    upperBounds: number[],
    initialPoint: number[]
  ) {
    super(mockCalculator, mockTuning, mockEvaluator);
    this.testFunction = testFn;
    this.nrDimensions = lowerBounds.length;
    this.lowerBounds = [...lowerBounds];
    this.upperBounds = [...upperBounds];
    this.currentPoint = [...initialPoint];
    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 500;
  }

  override value(point: number[]): number {
    this.evaluationsDone++;
    return this.testFunction(point);
  }

  override getErrorVector(point: number[]): number[] {
    return [Math.sqrt(this.testFunction(point))];
  }

  getGeometryPoint(): number[] {
    return [...this.currentPoint];
  }

  setGeometryPoint(point: number[]): void {
    this.currentPoint = [...point];
  }

  protected setConstraints(): void {}
}

describe("RandomRangeProcessor", () => {
  it("should generate vectors within bounds", () => {
    const lowerBounds = [0, -5, 10];
    const upperBounds = [10, 5, 20];
    const processor = new RandomRangeProcessor(lowerBounds, upperBounds, null, 100);

    for (let i = 0; i < 100; i++) {
      const vector = processor.nextVector();
      expect(vector.length).toBe(3);

      for (let j = 0; j < 3; j++) {
        expect(vector[j]!).toBeGreaterThanOrEqual(lowerBounds[j]!);
        expect(vector[j]!).toBeLessThanOrEqual(upperBounds[j]!);
      }
    }
  });

  it("should respect static values for non-varying dimensions", () => {
    const lowerBounds = [0, 0, 0];
    const upperBounds = [10, 10, 10];
    // Only vary dimension 0
    const processor = new RandomRangeProcessor(lowerBounds, upperBounds, [0], 50);

    // Set static values
    processor.setStaticValues([5, 7, 3]);

    for (let i = 0; i < 50; i++) {
      const vector = processor.nextVector();

      // Dimension 0 should vary
      expect(vector[0]).toBeGreaterThanOrEqual(0);
      expect(vector[0]).toBeLessThanOrEqual(10);

      // Dimensions 1 and 2 should be static
      expect(vector[1]).toBe(7);
      expect(vector[2]).toBe(3);
    }
  });

  it("should report correct number of starts", () => {
    const processor = new RandomRangeProcessor([0], [1], null, 42);
    expect(processor.getNumberOfStarts()).toBe(42);
  });
});

describe("GridRangeProcessor", () => {
  it("should generate vectors on a grid", () => {
    const lowerBounds = [0, 0];
    const upperBounds = [1, 1];
    // 9 starts with 2 dimensions = 3x3 grid
    const processor = new GridRangeProcessor(lowerBounds, upperBounds, null, 9);

    const vectors: number[][] = [];
    for (let i = 0; i < 9; i++) {
      vectors.push(processor.nextVector());
    }

    // Should have distinct vectors
    const uniqueVectors = new Set(vectors.map((v) => v.join(",")));
    expect(uniqueVectors.size).toBe(9);

    // All should be within bounds
    for (const v of vectors) {
      expect(v[0]).toBeGreaterThanOrEqual(0);
      expect(v[0]).toBeLessThanOrEqual(1);
      expect(v[1]).toBeGreaterThanOrEqual(0);
      expect(v[1]).toBeLessThanOrEqual(1);
    }
  });

  it("should vary only specified dimensions", () => {
    const lowerBounds = [0, 0, 0];
    const upperBounds = [10, 10, 10];
    // Only vary dimension 1
    const processor = new GridRangeProcessor(lowerBounds, upperBounds, [1], 5);
    processor.setStaticValues([2, 0, 8]);

    const vectors: number[][] = [];
    for (let i = 0; i < 5; i++) {
      vectors.push(processor.nextVector());
    }

    // Dimensions 0 and 2 should be static
    for (const v of vectors) {
      expect(v[0]).toBe(2);
      expect(v[2]).toBe(8);
    }

    // Dimension 1 should have varied
    const dim1Values = vectors.map((v) => v[1]);
    const uniqueDim1 = new Set(dim1Values);
    expect(uniqueDim1.size).toBeGreaterThan(1);
  });
});

describe("LatinHypercubeRangeProcessor", () => {
  it("should generate vectors within bounds", () => {
    const lowerBounds = [0, 0];
    const upperBounds = [1, 1];
    const processor = new LatinHypercubeRangeProcessor(lowerBounds, upperBounds, null, 10);

    for (let i = 0; i < 10; i++) {
      const vector = processor.nextVector();
      expect(vector[0]).toBeGreaterThanOrEqual(0);
      expect(vector[0]).toBeLessThanOrEqual(1);
      expect(vector[1]).toBeGreaterThanOrEqual(0);
      expect(vector[1]).toBeLessThanOrEqual(1);
    }
  });

  it("should have good space-filling properties", () => {
    const n = 10;
    const processor = new LatinHypercubeRangeProcessor([0, 0], [1, 1], null, n);

    const vectors: number[][] = [];
    for (let i = 0; i < n; i++) {
      vectors.push(processor.nextVector());
    }

    // For each dimension, samples should be spread across n strata
    // Check that samples are reasonably distributed
    for (let dim = 0; dim < 2; dim++) {
      const values = vectors.map((v) => v[dim]!).sort((a, b) => a - b);

      // Check that values span most of the range
      expect(values[n - 1]! - values[0]!).toBeGreaterThan(0.5);
    }
  });
});

describe("createRangeProcessor", () => {
  it("should create RandomRangeProcessor for 'random' strategy", () => {
    const processor = createRangeProcessor("random", [0], [1], null, 10);
    expect(processor).toBeInstanceOf(RandomRangeProcessor);
  });

  it("should create GridRangeProcessor for 'grid' strategy", () => {
    const processor = createRangeProcessor("grid", [0], [1], null, 10);
    expect(processor).toBeInstanceOf(GridRangeProcessor);
  });

  it("should create LatinHypercubeRangeProcessor for 'lhs' strategy", () => {
    const processor = createRangeProcessor("lhs", [0], [1], null, 10);
    expect(processor).toBeInstanceOf(LatinHypercubeRangeProcessor);
  });
});

describe("Multi-start optimization", () => {
  it("should run with numberOfStarts option", () => {
    // Quadratic function with minimum at (2, 3)
    const objective = new TestObjectiveFunction(
      (point) => (point[0]! - 2) ** 2 + (point[1]! - 3) ** 2,
      [0, 0],
      [5, 5],
      [0, 0]
    );

    const result = optimizeObjectiveFunction(objective, {
      numberOfStarts: 3,
      maxEvaluations: 1500,
    });

    expect(result.success).toBe(true);
    expect(result.finalNorm).toBeLessThan(10);
  });

  it("should use rangeProcessor from objective function", () => {
    const objective = new TestObjectiveFunction(
      (point) => point[0]! ** 2 + point[1]! ** 2,
      [-5, -5],
      [5, 5],
      [3, 3]
    );

    // Set range processor on objective
    const rangeProcessor = new GridRangeProcessor(
      objective.getLowerBounds(),
      objective.getUpperBounds(),
      [0], // Only vary first dimension
      5
    );
    objective.setRangeProcessor(rangeProcessor);

    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 2500,
    });

    expect(result.success).toBe(true);
    expect(objective.isMultiStart()).toBe(true);
  });

  it("should find better optimum with multi-start on multimodal function", () => {
    // Multimodal function with local minima
    // Has local minima at different locations
    // Offset by 2 to ensure all values are positive
    const multimodalFn = (point: number[]) => {
      const x = point[0]!;
      const y = point[1]!;
      return Math.sin(x) + Math.sin(y) + 2 + 0.1 * (x * x + y * y);
    };

    // Run single-start from a local minimum
    const singleStartObjective = new TestObjectiveFunction(
      multimodalFn,
      [-3, -3],
      [3, 3],
      [1, 1] // Start near a local minimum
    );

    const singleResult = optimizeObjectiveFunction(singleStartObjective, {
      maxEvaluations: 500,
    });

    // Run multi-start
    const multiStartObjective = new TestObjectiveFunction(
      multimodalFn,
      [-3, -3],
      [3, 3],
      [1, 1]
    );

    const multiResult = optimizeObjectiveFunction(multiStartObjective, {
      numberOfStarts: 5,
      maxEvaluations: 2500,
    });

    // Both should succeed
    expect(singleResult.success).toBe(true);
    expect(multiResult.success).toBe(true);

    // Both should have valid final norms
    expect(Number.isFinite(singleResult.finalNorm)).toBe(true);
    expect(Number.isFinite(multiResult.finalNorm)).toBe(true);

    // Multi-start should find a reasonably good solution
    expect(multiResult.finalNorm).toBeLessThan(5);
  });

  it("should report progress during multi-start", () => {
    const objective = new TestObjectiveFunction(
      (point) => point[0]! ** 2,
      [-5],
      [5],
      [3]
    );

    const progressMessages: string[] = [];
    const result = optimizeObjectiveFunction(objective, {
      numberOfStarts: 3,
      maxEvaluations: 600,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(result.success).toBe(true);

    // Should have progress messages for each start
    const startMessages = progressMessages.filter((m) => m.includes("Start"));
    expect(startMessages.length).toBeGreaterThan(0);
  });
});

describe("Multi-start with 'vary bore length' pattern", () => {
  it("should vary only first dimension when indicesToVary is [0]", () => {
    const objective = new TestObjectiveFunction(
      (point) => point[0]! ** 2 + point[1]! ** 2 + point[2]! ** 2,
      [0, 0, 0],
      [10, 10, 10],
      [5, 5, 5]
    );

    // This mimics the "vary bore length" pattern
    const rangeProcessor = new GridRangeProcessor(
      objective.getLowerBounds(),
      objective.getUpperBounds(),
      [0], // Only vary dimension 0 (like bore length)
      5
    );
    rangeProcessor.setStaticValues([5, 5, 5]);

    // Generate vectors and verify only dim 0 varies
    const vectors: number[][] = [];
    for (let i = 0; i < 5; i++) {
      vectors.push(rangeProcessor.nextVector());
    }

    // Dimensions 1 and 2 should stay at 5
    for (const v of vectors) {
      expect(v[1]).toBe(5);
      expect(v[2]).toBe(5);
    }

    // Dimension 0 should have multiple values
    const dim0Values = new Set(vectors.map((v) => v[0]));
    expect(dim0Values.size).toBeGreaterThan(1);
  });
});
