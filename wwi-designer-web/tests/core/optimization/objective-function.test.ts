/**
 * Tests for objective functions
 *
 * These tests verify that objective functions correctly extract
 * and apply geometry changes.
 */

import { describe, test, expect } from "bun:test";
import {
  HolePositionObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
  BoreLengthAdjustmentType,
} from "../../../src/core/optimization/hole-position-objective.ts";
import { CentDeviationEvaluator } from "../../../src/core/optimization/evaluator.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Tuning } from "../../../src/models/tuning.ts";

describe("Objective Functions", () => {
  const params = new PhysicalParameters(20, "C");

  const createSimpleWhistle = (): Instrument => ({
    name: "Test Whistle",
    lengthType: "MM",
    mouthpiece: {
      position: 0,
      fipple: {
        windowWidth: 10,
        windowLength: 8,
        windowHeight: 3,
      },
    },
    borePoint: [
      { borePosition: 0, boreDiameter: 16 },
      { borePosition: 300, boreDiameter: 16 },
    ],
    hole: [
      { position: 200, diameter: 8, height: 4 },
      { position: 220, diameter: 8, height: 4 },
      { position: 240, diameter: 8, height: 4 },
    ],
    termination: { flangeDiameter: 0 },
  });

  const createSimpleTuning = (): Tuning => ({
    name: "Test Tuning",
    numberOfHoles: 3,
    fingering: [
      {
        note: { name: "D4", frequency: 294 },
        openHole: [false, false, false],
      },
      {
        note: { name: "E4", frequency: 330 },
        openHole: [false, false, true],
      },
      {
        note: { name: "F#4", frequency: 370 },
        openHole: [false, true, true],
      },
    ],
  });

  describe("HolePositionObjectiveFunction", () => {
    test("creates objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(4); // bore + 3 holes
    });

    test("getGeometryPoint returns correct dimensions", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();

      expect(geometry.length).toBe(4);
      // Calculator converts to metres: 300mm = 0.3m
      expect(geometry[0]).toBeCloseTo(0.3, 4); // Bore length in metres
      // Spacings should be positive
      for (let i = 1; i < geometry.length; i++) {
        expect(geometry[i]).toBeGreaterThan(0);
      }
    });

    test("setGeometryPoint modifies instrument", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const originalGeometry = objective.getGeometryPoint();
      const newGeometry = originalGeometry.map((v) => v * 1.1);

      objective.setGeometryPoint(newGeometry);

      const updatedGeometry = objective.getGeometryPoint();
      expect(updatedGeometry[0]).toBeCloseTo(newGeometry[0]!, 1);
    });

    test("value() returns error norm", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      const value = objective.value(geometry);

      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("constraints are properly set up", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      expect(constraints.getNumberOfConstraints()).toBe(4);
      expect(constraints.getNumberOfHoles()).toBe(3);
    });
  });

  describe("HoleSizeObjectiveFunction", () => {
    test("creates objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleSizeObjectiveFunction(calc, tuning, evaluator);

      expect(objective.getNrDimensions()).toBe(3); // 3 hole diameters
    });

    test("getGeometryPoint returns hole diameters", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleSizeObjectiveFunction(calc, tuning, evaluator);

      const geometry = objective.getGeometryPoint();

      expect(geometry.length).toBe(3);
      // All holes have diameter 8mm = 0.008m (converted to metres)
      for (const d of geometry) {
        expect(d).toBeCloseTo(0.008, 4);
      }
    });

    test("setGeometryPoint modifies hole sizes", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleSizeObjectiveFunction(calc, tuning, evaluator);

      objective.setGeometryPoint([10, 9, 8]);

      const updated = objective.getGeometryPoint();
      expect(updated[0]).toBe(10);
      expect(updated[1]).toBe(9);
      expect(updated[2]).toBe(8);
    });
  });

  describe("HoleObjectiveFunction", () => {
    test("creates combined objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleObjectiveFunction(calc, tuning, evaluator);

      // 1 bore length + 3 spacings + 3 diameters = 7
      expect(objective.getNrDimensions()).toBe(7);
    });

    test("getGeometryPoint returns positions and sizes", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleObjectiveFunction(calc, tuning, evaluator);

      const geometry = objective.getGeometryPoint();

      expect(geometry.length).toBe(7);
      // Calculator converts to metres: 300mm = 0.3m
      expect(geometry[0]).toBeCloseTo(0.3, 4); // Bore length in metres
    });
  });

  describe("BoreLengthAdjustmentType", () => {
    test("MOVE_BOTTOM adjusts only last bore point", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      );

      const geometry = objective.getGeometryPoint();
      geometry[0] = 0.35; // Increase bore length (in metres)
      objective.setGeometryPoint(geometry);

      const instrument = objective.getInstrument();
      // Check that bore length changed (instrument is in metres)
      expect(instrument.borePoint[1]?.borePosition).toBeCloseTo(0.35, 4);
    });
  });

  describe("getInitialPoint", () => {
    test("returns point within bounds", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const initial = objective.getInitialPoint();
      const lower = objective.getLowerBounds();
      const upper = objective.getUpperBounds();

      for (let i = 0; i < initial.length; i++) {
        expect(initial[i]).toBeGreaterThanOrEqual(lower[i]!);
        expect(initial[i]).toBeLessThanOrEqual(upper[i]!);
      }
    });
  });

  describe("error calculation", () => {
    test("calcNorm computes weighted sum of squares", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const errorVector = [10, 20, 30]; // cents deviations
      const norm = objective.calcNorm(errorVector);

      // Default weight is 1
      const expected = 10 * 10 + 20 * 20 + 30 * 30;
      expect(norm).toBe(expected);
    });
  });
});
