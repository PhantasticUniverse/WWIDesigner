/**
 * Tests for objective functions
 *
 * These tests verify that objective functions correctly extract
 * and apply geometry changes.
 */

import { describe, test, expect } from "bun:test";
import {
  LengthObjectiveFunction,
  HolePositionObjectiveFunction,
  HolePositionFromTopObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
  HoleFromTopObjectiveFunction,
  HoleGroupPositionObjectiveFunction,
  BoreDiameterFromBottomObjectiveFunction,
  BoreDiameterFromTopObjectiveFunction,
  BasicTaperObjectiveFunction,
  SingleTaperRatioObjectiveFunction,
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

  describe("LengthObjectiveFunction", () => {
    test("creates single-dimension objective", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new LengthObjectiveFunction(calc, tuning, evaluator);

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns bore length", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new LengthObjectiveFunction(calc, tuning, evaluator);

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      // 300mm = 0.3m
      expect(geometry[0]).toBeCloseTo(0.3, 4);
    });

    test("setGeometryPoint modifies bore length", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new LengthObjectiveFunction(calc, tuning, evaluator);

      objective.setGeometryPoint([0.35]);

      const geometry = objective.getGeometryPoint();
      expect(geometry[0]).toBeCloseTo(0.35, 4);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new LengthObjectiveFunction(calc, tuning, evaluator);

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleGroupPositionObjectiveFunction", () => {
    test("creates grouped hole objective", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // All three holes in one group
      const groups = [[0, 1, 2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      // bore length + group spacing + spacing to bore end = 3
      expect(objective.getNrDimensions()).toBe(3);
    });

    test("handles individual holes (no grouping)", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // Each hole is its own group
      const groups = [[0], [1], [2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      // bore length + 3 individual spacings = 4 (same as HolePositionObjectiveFunction)
      expect(objective.getNrDimensions()).toBe(4);
    });

    test("getGeometryPoint returns bore and spacings", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const groups = [[0, 1, 2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(3);
      expect(geometry[0]).toBeCloseTo(0.3, 4); // bore length
    });

    test("setGeometryPoint applies equal spacing within group", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const groups = [[0, 1, 2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      // Holes should be equally spaced within the group
      const instrument = calc.getInstrument();
      const holes = instrument.hole;
      const spacing1 = holes[1]!.position - holes[0]!.position;
      const spacing2 = holes[2]!.position - holes[1]!.position;
      expect(spacing1).toBeCloseTo(spacing2, 4);
    });

    test("validates hole groups", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // Invalid: missing hole 1
      expect(() => {
        new HoleGroupPositionObjectiveFunction(
          calc,
          tuning,
          evaluator,
          [[0], [2]]
        );
      }).toThrow();
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const groups = [[0, 1, 2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("getHoleGroups returns the configuration", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const groups = [[0, 1], [2]];
      const objective = new HoleGroupPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        groups
      );

      const retrievedGroups = objective.getHoleGroups();
      expect(retrievedGroups).toEqual([[0, 1], [2]]);
    });
  });

  describe("BoreDiameterFromBottomObjectiveFunction", () => {
    const createWhistleWithMoreBorePoints = (): Instrument => ({
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
        { borePosition: 100, boreDiameter: 15 },
        { borePosition: 200, boreDiameter: 14 },
        { borePosition: 300, boreDiameter: 13 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 15 },
    });

    test("creates bore diameter objective", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // Leave first 2 bore points unchanged
      const objective = new BoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // 4 bore points - 2 unchanged = 2 dimensions
      expect(objective.getNrDimensions()).toBe(2);
    });

    test("getGeometryPoint returns diameter ratios", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(2);
      // Ratios should be close to diameter ratios in original
      // Point 2 (0.014) / Point 1 (0.015) ≈ 0.933
      // Point 3 (0.013) / Point 2 (0.014) ≈ 0.929
      expect(geometry[0]).toBeCloseTo(14 / 15, 3);
      expect(geometry[1]).toBeCloseTo(13 / 14, 3);
    });

    test("setGeometryPoint modifies bore diameters", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Set ratios to 1.0 (cylindrical bore from point 1)
      objective.setGeometryPoint([1.0, 1.0]);

      const instrument = calc.getInstrument();
      // Point 1 diameter (0.015m) should propagate down
      expect(instrument.borePoint[2]!.boreDiameter).toBeCloseTo(0.015, 4);
      expect(instrument.borePoint[3]!.boreDiameter).toBeCloseTo(0.015, 4);
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("getTopOfBody estimates body start", () => {
      const whistle = createWhistleWithMoreBorePoints();

      // No named bore points, should estimate based on holes
      const topIdx = BoreDiameterFromBottomObjectiveFunction.getTopOfBody(whistle);
      expect(topIdx).toBeGreaterThanOrEqual(0);
      expect(topIdx).toBeLessThan(whistle.borePoint.length);
    });
  });

  describe("HolePositionFromTopObjectiveFunction", () => {
    test("creates objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(4); // bore + 3 holes
    });

    test("getGeometryPoint returns bore length and top hole ratio", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();

      expect(geometry.length).toBe(4);
      // First dimension is bore length (0.3m)
      expect(geometry[0]).toBeCloseTo(0.3, 4);
      // Second dimension is top hole ratio (position 200 / bore 300 = 0.667)
      // With mouthpiece at 0, realOrigin = 0, so ratio = 0.2 / 0.3 ≈ 0.667
      expect(geometry[1]).toBeCloseTo(200 / 300, 3);
    });

    test("setGeometryPoint applies positions from top down", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Get current geometry
      const geometry = objective.getGeometryPoint();

      // Apply same geometry (round-trip test)
      objective.setGeometryPoint(geometry);

      const instrument = calc.getInstrument();
      const holes = instrument.hole;

      // Holes should be at approximately the same positions
      expect(holes[0]!.position).toBeCloseTo(0.2, 3); // 200mm in metres
    });

    test("top hole ratio is dimensionless in constraints", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      // First constraint is bore length (dimensional)
      expect(constraintList[0]!.name).toBe("Bore length");
      expect(constraintList[0]!.type).toBe("DIMENSIONAL");

      // Second constraint is top hole ratio (dimensionless)
      expect(constraintList[1]!.name).toContain("bore-length fraction");
      expect(constraintList[1]!.type).toBe("DIMENSIONLESS");
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HolePositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("BoreDiameterFromTopObjectiveFunction", () => {
    const createWhistleWithMoreBorePoints = (): Instrument => ({
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
        { borePosition: 100, boreDiameter: 15 },
        { borePosition: 200, boreDiameter: 14 },
        { borePosition: 300, boreDiameter: 13 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 15 },
    });

    test("creates bore diameter from top objective", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // Optimize top 2 bore points
      const objective = new BoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // 2 dimensions for top 2 points
      expect(objective.getNrDimensions()).toBe(2);
    });

    test("getGeometryPoint returns diameter ratios from top down", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(2);
      // Point 0 (0.016) / Point 1 (0.015) ≈ 1.067 (ratio of point 0 to point 1)
      // Point 1 (0.015) / Point 2 (0.014) ≈ 1.071 (ratio of point 1 to point 2)
      expect(geometry[0]).toBeCloseTo(16 / 15, 3);
      expect(geometry[1]).toBeCloseTo(15 / 14, 3);
    });

    test("setGeometryPoint modifies bore diameters from top down", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Set ratios to 1.0 (cylindrical bore from reference point)
      objective.setGeometryPoint([1.0, 1.0]);

      const instrument = calc.getInstrument();
      // Points 0 and 1 should equal Point 2 diameter (0.014m)
      expect(instrument.borePoint[0]!.boreDiameter).toBeCloseTo(0.014, 4);
      expect(instrument.borePoint[1]!.boreDiameter).toBeCloseTo(0.014, 4);
    });

    test("getLowestPoint finds named bore point", () => {
      const whistle = createWhistleWithMoreBorePoints();
      // Add a named bore point
      whistle.borePoint[1]!.name = "Head End";

      const idx = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        whistle,
        "Head"
      );
      expect(idx).toBe(1);
    });

    test("getLowestPoint estimates when name not found", () => {
      const whistle = createWhistleWithMoreBorePoints();

      // No named bore points, should estimate based on holes
      const idx = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        whistle,
        "Head"
      );
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(whistle.borePoint.length);
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("constraints are dimensionless", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      // All constraints should be dimensionless (ratios)
      for (const constraint of constraintList) {
        expect(constraint.type).toBe("DIMENSIONLESS");
        expect(constraint.name).toContain("Ratio");
      }
    });
  });

  describe("HoleFromTopObjectiveFunction", () => {
    test("creates merged objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // bore + 3 hole positions + 3 hole sizes = 7 dimensions
      expect(objective.getNrDimensions()).toBe(7);
    });

    test("getGeometryPoint returns positions and sizes", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(7);
      // First should be bore length
      expect(geometry[0]).toBeCloseTo(0.3, 4);
    });

    test("setGeometryPoint round-trips correctly", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 4);
      }
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("BasicTaperObjectiveFunction", () => {
    const createTaperedWhistle = (): Instrument => ({
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
        { borePosition: 100, boreDiameter: 15 },
        { borePosition: 300, boreDiameter: 14 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates two-dimension objective", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BasicTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(2);
    });

    test("getGeometryPoint returns head ratio and taper ratio", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BasicTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(2);
      // Head length ratio: (100-0)/(300-0) = 0.333
      expect(geometry[0]).toBeCloseTo(100 / 300, 3);
      // Foot diameter ratio: 14/15 = 0.933
      expect(geometry[1]).toBeCloseTo(14 / 15, 3);
    });

    test("setGeometryPoint modifies bore profile", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BasicTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Set head ratio to 0.5 and foot ratio to 1.0 (cylindrical)
      objective.setGeometryPoint([0.5, 1.0]);

      const instrument = calc.getInstrument();
      // Should have 3 bore points
      expect(instrument.borePoint.length).toBe(3);
      // Middle point should be at half bore length
      expect(instrument.borePoint[1]!.borePosition).toBeCloseTo(0.15, 3); // 0.5 * 0.3
    });

    test("constraints are dimensionless", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BasicTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(2);
      for (const constraint of constraintList) {
        expect(constraint.type).toBe("DIMENSIONLESS");
      }
    });

    test("value returns finite error", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BasicTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperRatioObjectiveFunction", () => {
    const createTaperedWhistle = (): Instrument => ({
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
        { borePosition: 100, boreDiameter: 16 },
        { borePosition: 200, boreDiameter: 14 },
        { borePosition: 300, boreDiameter: 14 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates three-dimension objective", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false // Don't set starting geometry
      );

      expect(objective.getNrDimensions()).toBe(3);
    });

    test("getGeometryPoint returns taper ratios", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(3);
      // Taper ratio: 16/14 ≈ 1.143
      expect(geometry[0]).toBeCloseTo(16 / 14, 3);
    });

    test("setStartingGeometry creates 4 bore points", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        true // Set starting geometry
      );

      const instrument = calc.getInstrument();
      expect(instrument.borePoint.length).toBe(4);
    });

    test("setGeometryPoint creates appropriate bore points", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      // Full taper from head to foot
      objective.setGeometryPoint([1.1, 1.0, 0.0]);

      const instrument = calc.getInstrument();
      // Should have at least 2 bore points
      expect(instrument.borePoint.length).toBeGreaterThanOrEqual(2);
    });

    test("constraints are all dimensionless", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(3);
      for (const constraint of constraintList) {
        expect(constraint.type).toBe("DIMENSIONLESS");
      }
    });

    test("value returns finite error", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperRatioObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });
});
