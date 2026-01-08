/**
 * Tests for CMA-ES (Covariance Matrix Adaptation Evolution Strategy) optimizer.
 *
 * Tests cover:
 * - Convergence on standard test functions
 * - Configuration options
 * - Bounds handling
 * - Integration with objective function optimizer
 */

import { describe, expect, test } from "bun:test";
import {
  CMAESOptimizer,
  cmaesMinimize,
} from "../../../src/core/optimization/cmaes-optimizer.ts";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "../../../src/core/optimization/base-objective-function.ts";
import { optimizeObjectiveFunction } from "../../../src/core/optimization/objective-function-optimizer.ts";
import type { IEvaluator } from "../../../src/core/optimization/evaluator.ts";
import type { Tuning, Fingering } from "../../../src/models/tuning.ts";
import type { IInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";

describe("CMA-ES Optimizer - Basic Convergence", () => {
  test("finds minimum of sphere function in 2D", () => {
    // f(x) = x1^2 + x2^2, minimum at (0, 0)
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [2, 2],
      { maxEvaluations: 2000 }
    );

    expect(result.converged).toBe(true);
    expect(Math.abs(result.point[0]!)).toBeLessThan(0.5);
    expect(Math.abs(result.point[1]!)).toBeLessThan(0.5);
    expect(result.value).toBeLessThan(0.5);
  });

  test("finds minimum of sphere function in 3D", () => {
    // f(x) = sum(xi^2), minimum at origin
    const result = cmaesMinimize(
      (x) => x.reduce((sum, xi) => sum + xi * xi, 0),
      [-5, -5, -5],
      [5, 5, 5],
      [2, 2, 2],
      { maxEvaluations: 3000 }
    );

    expect(result.converged).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(result.point[i]!)).toBeLessThan(1);
    }
  });

  test("finds minimum of shifted sphere function", () => {
    // f(x) = (x1-3)^2 + (x2-2)^2, minimum at (3, 2)
    const result = cmaesMinimize(
      (x) => (x[0]! - 3) * (x[0]! - 3) + (x[1]! - 2) * (x[1]! - 2),
      [0, 0],
      [10, 10],
      [5, 5],
      { maxEvaluations: 2000 }
    );

    expect(result.converged).toBe(true);
    expect(result.point[0]!).toBeCloseTo(3, 0);
    expect(result.point[1]!).toBeCloseTo(2, 0);
  });

  test("finds minimum of ellipsoid function", () => {
    // f(x) = x1^2 + 10*x2^2, tests handling of different scales
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + 10 * x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [2, 2],
      { maxEvaluations: 3000 }
    );

    expect(result.converged).toBe(true);
    expect(Math.abs(result.point[0]!)).toBeLessThan(1);
    expect(Math.abs(result.point[1]!)).toBeLessThan(0.5);
  });
});

describe("CMA-ES Optimizer - Configuration", () => {
  test("respects population size parameter", () => {
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [2, 2],
      { maxEvaluations: 1000, populationSize: 10 }
    );

    // Should work with custom population size
    expect(result.evaluations).toBeGreaterThan(0);
  });

  test("respects stopFitness parameter", () => {
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [0.1, 0.1], // Start close to optimum
      { stopFitness: 0.01, maxEvaluations: 5000 }
    );

    expect(result.converged).toBe(true);
    expect(result.value).toBeLessThanOrEqual(0.1);
  });

  test("respects custom sigma", () => {
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [1, 1],
      { sigma: [0.5, 0.5], maxEvaluations: 2000 }
    );

    expect(result.evaluations).toBeGreaterThan(0);
    expect(result.value).toBeLessThan(5);
  });

  test("respects maxEvaluations limit", () => {
    const maxEval = 50;
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]!,
      [-5, -5],
      [5, 5],
      [2, 2],
      { maxEvaluations: maxEval }
    );

    expect(result.evaluations).toBeLessThanOrEqual(maxEval + 10); // Small buffer for population
  });
});

describe("CMA-ES Optimizer - Bounds Handling", () => {
  test("respects lower bounds", () => {
    // Minimum would be at (-5, -5) but lower bound is (0, 0)
    const result = cmaesMinimize(
      (x) => (x[0]! + 5) * (x[0]! + 5) + (x[1]! + 5) * (x[1]! + 5),
      [0, 0],
      [10, 10],
      [5, 5],
      { maxEvaluations: 2000 }
    );

    expect(result.point[0]!).toBeGreaterThanOrEqual(-0.1);
    expect(result.point[1]!).toBeGreaterThanOrEqual(-0.1);
  });

  test("respects upper bounds", () => {
    // Minimum would be at (15, 15) but upper bound is (10, 10)
    const result = cmaesMinimize(
      (x) => (x[0]! - 15) * (x[0]! - 15) + (x[1]! - 15) * (x[1]! - 15),
      [0, 0],
      [10, 10],
      [5, 5],
      { maxEvaluations: 2000 }
    );

    expect(result.point[0]!).toBeLessThanOrEqual(10.1);
    expect(result.point[1]!).toBeLessThanOrEqual(10.1);
  });
});

describe("CMA-ES Optimizer - Challenging Functions", () => {
  test("handles Rosenbrock function (valley)", () => {
    // f(x) = 100(x2 - x1^2)^2 + (1 - x1)^2, minimum at (1, 1)
    // This is a challenging function with a narrow valley
    const result = cmaesMinimize(
      (x) => {
        const x1 = x[0]!;
        const x2 = x[1]!;
        return 100 * Math.pow(x2 - x1 * x1, 2) + Math.pow(1 - x1, 2);
      },
      [-5, -5],
      [5, 5],
      [0, 0],
      { maxEvaluations: 10000 }
    );

    // CMA-ES should get reasonably close to the optimum
    expect(result.value).toBeLessThan(10);
  });

  test("handles multimodal function with local minima", () => {
    // f(x) = x1^2 + x2^2 + 2*sin(x1*x2) - has multiple local minima
    const result = cmaesMinimize(
      (x) => x[0]! * x[0]! + x[1]! * x[1]! + 2 * Math.sin(x[0]! * x[1]!),
      [-3, -3],
      [3, 3],
      [1, 1],
      { maxEvaluations: 3000 }
    );

    // Should find a reasonably good solution
    expect(result.value).toBeLessThan(3);
  });
});

/**
 * Mock evaluator for testing with objective functions.
 */
class MockEvaluator implements IEvaluator {
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    return fingeringTargets.map(() => 10);
  }
}

/**
 * Mock calculator for testing.
 */
class MockCalculator {
  private mockInstrument: Partial<Instrument>;

  constructor() {
    this.mockInstrument = {
      name: "Test Instrument",
      lengthType: "MM",
      borePoint: [
        { borePosition: 0, boreDiameter: 10 },
        { borePosition: 100, boreDiameter: 10 },
      ],
      hole: [],
    };
  }

  getInstrument(): Instrument {
    return this.mockInstrument as Instrument;
  }

  getParams(): PhysicalParameters {
    return new PhysicalParameters(20, "C");
  }
}

/**
 * Test objective function using CMAES.
 */
class CMAESTestObjective extends BaseObjectiveFunction {
  private targetValue: number[];

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    targetValue: number[] = [3, 2]
  ) {
    super(calculator, tuning, evaluator);
    this.targetValue = targetValue;
    this.nrDimensions = targetValue.length;
    this.lowerBounds = new Array(this.nrDimensions).fill(0);
    this.upperBounds = new Array(this.nrDimensions).fill(10);
    this.setConstraints();
    this.optimizerType = OptimizerType.CMAES;
  }

  getGeometryPoint(): number[] {
    return [...this.targetValue];
  }

  setGeometryPoint(_point: number[]): void {
    // No-op for testing
  }

  protected setConstraints(): void {
    // No additional constraints
  }

  // Override value to return simple quadratic
  override value(point: number[]): number {
    let sum = 0;
    for (let i = 0; i < point.length; i++) {
      sum += (point[i]! - this.targetValue[i]!) * (point[i]! - this.targetValue[i]!);
    }
    return sum;
  }
}

describe("CMA-ES Optimizer - Integration with Objective Functions", () => {
  const mockCalculator = new MockCalculator() as unknown as IInstrumentCalculator;
  const mockTuning: Tuning = {
    name: "Test Tuning",
    numberOfHoles: 0,
    fingering: [
      {
        note: { name: "A4", frequency: 440 },
        openHole: [],
      },
    ],
  };
  const mockEvaluator = new MockEvaluator();

  test("optimizeObjectiveFunction uses CMAES when specified", () => {
    const objective = new CMAESTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      [5, 5]
    );

    const messages: string[] = [];
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 2000,
      onProgress: (msg) => messages.push(msg),
    });

    expect(result.success).toBe(true);
    // Should be reasonably close to target
    expect(Math.abs(result.point[0]! - 5)).toBeLessThan(2);
    expect(Math.abs(result.point[1]! - 5)).toBeLessThan(2);

    // Should mention CMA-ES in progress messages
    const hasCmaesMessage = messages.some((m) => m.includes("CMA-ES"));
    expect(hasCmaesMessage).toBe(true);
  });

  test("CMAES handles 1D problem when objective specifies it", () => {
    // Even though Brent would be better for 1D, if CMAES is specified it should work
    const objective = new CMAESTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      [5] // 1D
    );

    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 1000,
    });

    expect(result.success).toBe(true);
    expect(Math.abs(result.point[0]! - 5)).toBeLessThan(2);
  });

  test("CMAES handles higher dimensional problems", () => {
    const objective = new CMAESTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      [3, 4, 5] // 3D
    );

    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 3000,
    });

    expect(result.success).toBe(true);
    // Should find reasonable solution
    expect(result.point.length).toBe(3);
  });
});

describe("CMA-ES Optimizer - Comparison with Other Optimizers", () => {
  test("CMA-ES converges on problems where gradient methods might struggle", () => {
    // Noisy function: f(x) = x1^2 + x2^2 + random noise (simulated by oscillations)
    let callCount = 0;
    const result = cmaesMinimize(
      (x) => {
        callCount++;
        const base = x[0]! * x[0]! + x[1]! * x[1]!;
        // Add deterministic oscillation to simulate noisy landscape
        const noise = 0.1 * Math.sin(10 * x[0]!) * Math.sin(10 * x[1]!);
        return base + noise;
      },
      [-3, -3],
      [3, 3],
      [1, 1],
      { maxEvaluations: 2000 }
    );

    // CMA-ES should handle this well due to population averaging
    expect(result.value).toBeLessThan(2);
    expect(Math.abs(result.point[0]!)).toBeLessThan(1);
    expect(Math.abs(result.point[1]!)).toBeLessThan(1);
  });
});
