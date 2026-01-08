/**
 * Tests for two-stage evaluator optimization.
 *
 * Two-stage optimization uses a fast "first-stage" evaluator for exploration,
 * then switches to a more accurate evaluator for refinement.
 */

import { describe, expect, test } from "bun:test";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "../../../src/core/optimization/base-objective-function.ts";
import type { IEvaluator } from "../../../src/core/optimization/evaluator.ts";
import type { Tuning, Fingering } from "../../../src/models/tuning.ts";
import type { IInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { optimizeObjectiveFunction } from "../../../src/core/optimization/objective-function-optimizer.ts";

/**
 * Mock evaluator that tracks how many times it was called.
 * Used to verify evaluator switching behavior.
 */
class MockEvaluator implements IEvaluator {
  public callCount = 0;
  public name: string;
  public errorMultiplier: number;

  constructor(name: string, errorMultiplier = 1) {
    this.name = name;
    this.errorMultiplier = errorMultiplier;
  }

  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    this.callCount++;
    // Return error proportional to multiplier
    return fingeringTargets.map(() => 10 * this.errorMultiplier);
  }

  reset(): void {
    this.callCount = 0;
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
      lengthType: "MM",
      borePoint: [
        { borePosition: 0, boreDiameter: 10 },
        { borePosition: 100, boreDiameter: 10 },
      ],
      hole: [
        {
          name: "Hole1",
          position: 50,
          diameter: 5,
          height: 3,
        },
      ],
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
 * Test objective function that uses mock evaluators.
 */
class TestObjectiveFunction extends BaseObjectiveFunction {
  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 2;
    this.lowerBounds = [0, 0];
    this.upperBounds = [10, 10];
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    return [5, 5]; // Default starting point
  }

  setGeometryPoint(_point: number[]): void {
    // No-op for testing
  }

  protected setConstraints(): void {
    // No additional constraints
  }
}

describe("Two-Stage Evaluator", () => {
  const mockCalculator = new MockCalculator() as unknown as IInstrumentCalculator;
  const mockTuning: Tuning = {
    name: "Test Tuning",
    numberOfHoles: 1,
    fingering: [
      {
        note: { name: "A4", frequency: 440 },
        openHole: [true],
      },
    ],
  };

  test("isRunTwoStageOptimization returns false by default", () => {
    const evaluator = new MockEvaluator("main");
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      evaluator
    );

    expect(objective.isRunTwoStageOptimization()).toBe(false);
  });

  test("isRunTwoStageOptimization returns false when enabled but no first-stage evaluator", () => {
    const evaluator = new MockEvaluator("main");
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      evaluator
    );

    objective.setRunTwoStageOptimization(true);
    expect(objective.isRunTwoStageOptimization()).toBe(false);
  });

  test("isRunTwoStageOptimization returns true when enabled with first-stage evaluator", () => {
    const mainEvaluator = new MockEvaluator("main");
    const firstStageEvaluator = new MockEvaluator("first-stage");
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);

    expect(objective.isRunTwoStageOptimization()).toBe(true);
    expect(objective.getFirstStageEvaluator()).toBe(firstStageEvaluator);
  });

  test("setFirstStageEvaluator and getFirstStageEvaluator work correctly", () => {
    const mainEvaluator = new MockEvaluator("main");
    const firstStageEvaluator = new MockEvaluator("first-stage");
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    // Initially null
    expect(objective.getFirstStageEvaluator()).toBeNull();

    // Set and get
    objective.setFirstStageEvaluator(firstStageEvaluator);
    expect(objective.getFirstStageEvaluator()).toBe(firstStageEvaluator);

    // Set to null
    objective.setFirstStageEvaluator(null);
    expect(objective.getFirstStageEvaluator()).toBeNull();
  });

  test("two-stage optimization uses first-stage evaluator in DIRECT phase", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.DIRECT);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    objective.setMaxEvaluations(100);

    // Run optimization
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
    });

    // Both evaluators should have been called
    // First-stage for DIRECT, main for BOBYQA refinement
    expect(firstStageEvaluator.callCount).toBeGreaterThan(0);
    expect(mainEvaluator.callCount).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  test("two-stage optimization uses first-stage evaluator in BOBYQA first run", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.BOBYQA);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    objective.setMaxEvaluations(100);

    // Run optimization
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
    });

    // Both evaluators should have been called
    expect(firstStageEvaluator.callCount).toBeGreaterThan(0);
    expect(mainEvaluator.callCount).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  test("single-stage optimization only uses main evaluator", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.BOBYQA);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(false); // Disabled
    objective.setMaxEvaluations(100);

    // Run optimization
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
    });

    // Only main evaluator should be called
    expect(firstStageEvaluator.callCount).toBe(0);
    expect(mainEvaluator.callCount).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  test("evaluator switching restores original evaluator on completion", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.DIRECT);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    objective.setMaxEvaluations(100);

    // Verify initial evaluator
    expect(objective.getEvaluator()).toBe(mainEvaluator);

    // Run optimization
    optimizeObjectiveFunction(objective, { maxEvaluations: 100 });

    // Evaluator should be restored to original after optimization
    expect(objective.getEvaluator()).toBe(mainEvaluator);
  });

  test("two-stage with multi-start uses first-stage for all starts", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.DIRECT);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    objective.setMaxEvaluations(200);

    // Run multi-start optimization
    const result = optimizeObjectiveFunction(objective, {
      maxEvaluations: 200,
      numberOfStarts: 3,
    });

    // Both evaluators should have been called
    // First-stage for all starts, main for final refinement
    expect(firstStageEvaluator.callCount).toBeGreaterThan(0);
    expect(mainEvaluator.callCount).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  test("disabling two-stage mid-optimization is safe", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    // Enable two-stage
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    expect(objective.isRunTwoStageOptimization()).toBe(true);

    // Disable by setting flag false
    objective.setRunTwoStageOptimization(false);
    expect(objective.isRunTwoStageOptimization()).toBe(false);

    // Disable by setting evaluator to null
    objective.setRunTwoStageOptimization(true);
    objective.setFirstStageEvaluator(null);
    expect(objective.isRunTwoStageOptimization()).toBe(false);
  });
});

describe("Two-Stage Evaluator Progress Messages", () => {
  const mockCalculator = new MockCalculator() as unknown as IInstrumentCalculator;
  const mockTuning: Tuning = {
    name: "Test Tuning",
    numberOfHoles: 1,
    fingering: [
      {
        note: { name: "A4", frequency: 440 },
        openHole: [true],
      },
    ],
  };

  test("progress messages indicate evaluator switching", () => {
    const mainEvaluator = new MockEvaluator("main", 1);
    const firstStageEvaluator = new MockEvaluator("first-stage", 2);
    const objective = new TestObjectiveFunction(
      mockCalculator,
      mockTuning,
      mainEvaluator
    );

    objective.setOptimizerType(OptimizerType.DIRECT);
    objective.setFirstStageEvaluator(firstStageEvaluator);
    objective.setRunTwoStageOptimization(true);
    objective.setMaxEvaluations(100);

    const messages: string[] = [];
    optimizeObjectiveFunction(objective, {
      maxEvaluations: 100,
      onProgress: (msg) => messages.push(msg),
    });

    // Should have messages about evaluator switching
    const hasFirstStageMessage = messages.some(
      (m) => m.includes("first-stage") || m.includes("global search")
    );
    const hasRefinementMessage = messages.some(
      (m) => m.includes("full evaluator") || m.includes("refinement") || m.includes("Refining")
    );

    expect(hasFirstStageMessage).toBe(true);
    expect(hasRefinementMessage).toBe(true);
  });
});
