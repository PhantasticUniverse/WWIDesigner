/**
 * Tests for Brent's univariate optimizer.
 *
 * Tests cover:
 * - Convergence on standard test functions
 * - Tolerance handling
 * - Bounds handling
 * - Edge cases
 * - Integration with objective function optimizer
 */

import { describe, expect, test } from "bun:test";
import {
  BrentOptimizer,
  brentMinimize,
} from "../../../src/core/optimization/brent-optimizer.ts";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "../../../src/core/optimization/base-objective-function.ts";
import { optimizeObjectiveFunction } from "../../../src/core/optimization/objective-function-optimizer.ts";
import type { IEvaluator } from "../../../src/core/optimization/evaluator.ts";
import type { Tuning, Fingering } from "../../../src/models/tuning.ts";
import type { IInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";

describe("Brent Optimizer - Basic Convergence", () => {
  test("finds minimum of quadratic function", () => {
    // f(x) = (x - 3)^2, minimum at x = 3
    const result = brentMinimize(
      (x) => (x - 3) * (x - 3),
      0,
      10,
      5
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(3, 6);
    expect(result.value).toBeCloseTo(0, 10);
    expect(result.evaluations).toBeLessThan(50);
  });

  test("finds minimum of quartic function", () => {
    // f(x) = (x - 2)^4, minimum at x = 2
    const result = brentMinimize(
      (x) => Math.pow(x - 2, 4),
      -5,
      5,
      0
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(2, 5);
    expect(result.value).toBeCloseTo(0, 8);
  });

  test("finds minimum of sine function in [0, pi]", () => {
    // f(x) = -sin(x), minimum at x = pi/2 where sin(x) = 1
    const result = brentMinimize(
      (x) => -Math.sin(x),
      0,
      Math.PI,
      1
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(Math.PI / 2, 5);
    expect(result.value).toBeCloseTo(-1, 8);
  });

  test("finds minimum of cosine function in [0, 2*pi]", () => {
    // f(x) = cos(x), minimum at x = pi
    const result = brentMinimize(
      (x) => Math.cos(x),
      0,
      2 * Math.PI,
      Math.PI
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(Math.PI, 5);
    expect(result.value).toBeCloseTo(-1, 8);
  });

  test("finds minimum of exponential-quadratic", () => {
    // f(x) = exp(x) + x^2, minimum around x = -0.35
    const result = brentMinimize(
      (x) => Math.exp(x) + x * x,
      -2,
      2,
      0
    );

    expect(result.converged).toBe(true);
    // Analytical minimum at x where 2x + exp(x) = 0, approximately -0.3517
    expect(result.point).toBeCloseTo(-0.3517, 3);
  });
});

describe("Brent Optimizer - Tolerance Handling", () => {
  test("respects relative tolerance", () => {
    const optimizer = new BrentOptimizer({
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-10,
    });

    const result = optimizer.optimize(
      (x) => (x - 5) * (x - 5),
      0,
      10,
      7
    );

    expect(result.converged).toBe(true);
    // With looser relative tolerance, should still find approximate minimum
    expect(Math.abs(result.point - 5)).toBeLessThan(0.01);
  });

  test("respects absolute tolerance", () => {
    const optimizer = new BrentOptimizer({
      relativeTolerance: 1e-10,
      absoluteTolerance: 1e-3,
    });

    const result = optimizer.optimize(
      (x) => (x - 0.001) * (x - 0.001),
      0,
      1,
      0.5
    );

    expect(result.converged).toBe(true);
    expect(Math.abs(result.point - 0.001)).toBeLessThan(0.01);
  });

  test("throws on invalid relative tolerance", () => {
    expect(() => {
      new BrentOptimizer({ relativeTolerance: 1e-20 });
    }).toThrow();
  });

  test("throws on invalid absolute tolerance", () => {
    expect(() => {
      new BrentOptimizer({ absoluteTolerance: 0 });
    }).toThrow();

    expect(() => {
      new BrentOptimizer({ absoluteTolerance: -1 });
    }).toThrow();
  });
});

describe("Brent Optimizer - Bounds Handling", () => {
  test("respects lower bound", () => {
    // Minimum at x = -5, but lower bound is 0
    const result = brentMinimize(
      (x) => (x + 5) * (x + 5),
      0,
      10,
      5
    );

    expect(result.converged).toBe(true);
    // Minimum within bounds is at x = 0
    expect(result.point).toBeCloseTo(0, 4);
  });

  test("respects upper bound", () => {
    // Minimum at x = 15, but upper bound is 10
    const result = brentMinimize(
      (x) => (x - 15) * (x - 15),
      0,
      10,
      5
    );

    expect(result.converged).toBe(true);
    // Minimum within bounds is at x = 10
    expect(result.point).toBeCloseTo(10, 4);
  });

  test("throws on invalid bounds", () => {
    expect(() => {
      brentMinimize((x) => x * x, 10, 0); // lower > upper
    }).toThrow();

    expect(() => {
      brentMinimize((x) => x * x, 5, 5); // lower == upper
    }).toThrow();
  });

  test("handles start point outside bounds", () => {
    // Start point will be clamped to midpoint
    const result = brentMinimize(
      (x) => (x - 5) * (x - 5),
      0,
      10,
      50 // outside bounds
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(5, 5);
  });
});

describe("Brent Optimizer - Edge Cases", () => {
  test("handles very narrow interval", () => {
    const result = brentMinimize(
      (x) => (x - 0.5) * (x - 0.5),
      0.4,
      0.6,
      0.5
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(0.5, 5);
  });

  test("handles very wide interval", () => {
    const result = brentMinimize(
      (x) => (x - 500) * (x - 500),
      -1000,
      1000,
      0
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(500, 3);
  });

  test("handles minimum at boundary", () => {
    // f(x) = x, minimum at x = 0 (boundary)
    const result = brentMinimize((x) => x, 0, 10, 5);

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(0, 4);
  });

  test("handles flat function region", () => {
    // f(x) = max(0, (x-5)^2 - 1) - flat in [4, 6]
    const result = brentMinimize(
      (x) => Math.max(0, (x - 5) * (x - 5) - 1),
      0,
      10,
      5
    );

    expect(result.converged).toBe(true);
    expect(result.value).toBeCloseTo(0, 6);
    expect(result.point).toBeGreaterThanOrEqual(4);
    expect(result.point).toBeLessThanOrEqual(6);
  });

  test("respects max evaluations limit", () => {
    const optimizer = new BrentOptimizer({
      maxEvaluations: 5,
    });

    const result = optimizer.optimize(
      (x) => (x - 5) * (x - 5),
      0,
      10,
      0
    );

    expect(result.evaluations).toBeLessThanOrEqual(5);
    // May not converge with so few evaluations
  });
});

describe("Brent Optimizer - Comparison with Golden Section", () => {
  test("converges faster than pure golden section on smooth functions", () => {
    // Count evaluations for a smooth quadratic
    let evalCount = 0;
    const result = brentMinimize(
      (x) => {
        evalCount++;
        return (x - 3) * (x - 3);
      },
      0,
      10,
      5
    );

    // Brent should use parabolic interpolation and converge quickly
    // Pure golden section would need more evaluations
    expect(evalCount).toBeLessThan(20);
    expect(result.point).toBeCloseTo(3, 6);
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
class MockCalculator implements Partial<IInstrumentCalculator> {
  private mockInstrument: Partial<Instrument>;

  constructor() {
    this.mockInstrument = {
      name: "Test Instrument",
      lengthType: "metric",
      borePoint: [
        { position: 0, boreDiameter: 10 },
        { position: 100, boreDiameter: 10 },
      ],
      hole: [],
    };
  }

  getInstrument(): Instrument {
    return this.mockInstrument as Instrument;
  }

  getParams(): PhysicalParameters {
    return { temperature: 20, humidity: 50 } as PhysicalParameters;
  }
}

/**
 * Univariate test objective function.
 */
class UnivariateTestObjective extends BaseObjectiveFunction {
  private targetValue: number;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    targetValue: number = 5
  ) {
    super(calculator, tuning, evaluator);
    this.targetValue = targetValue;
    this.nrDimensions = 1;
    this.lowerBounds = [0];
    this.upperBounds = [10];
    this.setConstraints();
    this.optimizerType = OptimizerType.BRENT;
  }

  getGeometryPoint(): number[] {
    return [this.targetValue];
  }

  setGeometryPoint(_point: number[]): void {
    // No-op for testing
  }

  protected setConstraints(): void {
    // No additional constraints
  }

  // Override value to return simple quadratic
  value(point: number[]): number {
    const x = point[0]!;
    return (x - this.targetValue) * (x - this.targetValue);
  }
}

describe("Brent Optimizer - Integration with Objective Functions", () => {
  const mockCalculator = new MockCalculator() as IInstrumentCalculator;
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

  test("optimizeObjectiveFunction uses Brent for 1D objectives", () => {
    const objective = new UnivariateTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      5
    );

    const messages: string[] = [];
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
      onProgress: (msg) => messages.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.point[0]).toBeCloseTo(5, 4);

    // Should mention Brent in progress messages
    const hasBrentMessage = messages.some((m) => m.includes("Brent"));
    expect(hasBrentMessage).toBe(true);
  });

  test("Brent finds minimum for univariate objective", () => {
    const objective = new UnivariateTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      3
    );

    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
    });

    expect(result.success).toBe(true);
    expect(result.point[0]).toBeCloseTo(3, 4);
    // Note: finalNorm uses the mock evaluator, not the objective's value()
    // The optimization itself found the correct point
  });

  test("Brent handles boundary minimum", () => {
    // Minimum at target = 0 (at boundary)
    const objective = new UnivariateTestObjective(
      mockCalculator,
      mockTuning,
      mockEvaluator,
      0
    );

    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
    });

    expect(result.success).toBe(true);
    expect(result.point[0]).toBeCloseTo(0, 3);
  });
});

describe("Brent Optimizer - Performance", () => {
  test("converges efficiently on Rosenbrock 1D slice", () => {
    // 1D slice of Rosenbrock: fix y=1, minimize f(x) = (1-x)^2
    const result = brentMinimize(
      (x) => (1 - x) * (1 - x),
      -5,
      5,
      0
    );

    expect(result.converged).toBe(true);
    expect(result.point).toBeCloseTo(1, 6);
    expect(result.evaluations).toBeLessThan(30);
  });

  test("handles oscillatory function", () => {
    // f(x) = x^2 + 0.1*sin(10*x) - local minima but global near 0
    const result = brentMinimize(
      (x) => x * x + 0.1 * Math.sin(10 * x),
      -2,
      2,
      0
    );

    expect(result.converged).toBe(true);
    // Should find a minimum near 0
    expect(Math.abs(result.point)).toBeLessThan(0.5);
  });
});
