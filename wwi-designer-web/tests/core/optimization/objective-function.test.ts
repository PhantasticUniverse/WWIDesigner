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
  HoleGroupPositionFromTopObjectiveFunction,
  HoleGroupFromTopObjectiveFunction,
  HoleGroupObjectiveFunction,
  BoreDiameterFromBottomObjectiveFunction,
  BoreDiameterFromTopObjectiveFunction,
  BasicTaperObjectiveFunction,
  SingleTaperRatioObjectiveFunction,
  SingleTaperSimpleRatioObjectiveFunction,
  FippleFactorObjectiveFunction,
  WindowHeightObjectiveFunction,
  HoleAndTaperObjectiveFunction,
  HoleAndBoreDiameterFromTopObjectiveFunction,
  HoleAndBoreDiameterFromBottomObjectiveFunction,
  BetaObjectiveFunction,
  AirstreamLengthObjectiveFunction,
  NafHoleSizeObjectiveFunction,
  ReedCalibratorObjectiveFunction,
  StopperPositionObjectiveFunction,
  ConicalBoreObjectiveFunction,
  BoreLengthAdjustmentType,
  // Global optimizer variants
  GlobalHolePositionObjectiveFunction,
  GlobalHoleObjectiveFunction,
  GlobalHoleAndTaperObjectiveFunction,
  GlobalHoleAndBoreDiameterFromBottomObjectiveFunction,
  GlobalHoleAndBoreDiameterFromTopObjectiveFunction,
  // SingleTaper merged objectives
  SingleTaperNoHoleGroupingObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopObjectiveFunction,
  SingleTaperHoleGroupObjectiveFunction,
  SingleTaperHoleGroupFromTopObjectiveFunction,
  // Combined bore objectives
  HoleAndConicalBoreObjectiveFunction,
  HeadjointObjectiveFunction,
  HoleAndHeadjointObjectiveFunction,
  // Bore position and spacing objectives
  BorePositionObjectiveFunction,
  BoreSpacingFromTopObjectiveFunction,
  BoreFromBottomObjectiveFunction,
  HoleAndBoreFromBottomObjectiveFunction,
  HoleAndBorePositionObjectiveFunction,
  HoleAndBoreSpacingFromTopObjectiveFunction,
  GlobalBoreFromBottomObjectiveFunction,
  GlobalHoleAndBoreFromBottomObjectiveFunction,
  // Hemispherical bore head
  HemisphericalBoreHead,
  SingleTaperSimpleRatioHemiHeadObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction,
  SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction,
  // Calibration objectives
  FluteCalibrationObjectiveFunction,
  WhistleCalibrationObjectiveFunction,
} from "../../../src/core/optimization/hole-position-objective.ts";
import { OptimizerType } from "../../../src/core/optimization/base-objective-function.ts";
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
      expect(constraintList[0]!.type as string).toBe("DIMENSIONAL");

      // Second constraint is top hole ratio (dimensionless)
      expect(constraintList[1]!.name).toContain("bore-length fraction");
      expect(constraintList[1]!.type as string).toBe("DIMENSIONLESS");
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
        expect(constraint!.type as string).toBe("DIMENSIONLESS");
        expect(constraint!.name).toContain("Ratio");
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
        expect(constraint!.type as string).toBe("DIMENSIONLESS");
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
        expect(constraint!.type as string).toBe("DIMENSIONLESS");
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

  describe("FippleFactorObjectiveFunction", () => {
    const createWhistleWithFipple = (): Instrument => ({
      name: "Test Whistle",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        fipple: {
          windowWidth: 10,
          windowLength: 8,
          windowHeight: 3,
          fippleFactor: 1.0,
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

    test("creates single-dimension objective", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns fipple factor", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBe(1.0);
    });

    test("setGeometryPoint modifies fipple factor", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      objective.setGeometryPoint([1.5]);

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.fipple!.fippleFactor).toBe(1.5);
    });

    test("uses only lowest frequency note", () => {
      const whistle = createWhistleWithFipple();
      // Tuning with multiple notes
      const tuning: Tuning = {
        name: "Test Tuning",
        numberOfHoles: 3,
        fingering: [
          {
            note: { name: "G5", frequency: 783.99 },
            openHole: [true, true, true],
          },
          {
            note: { name: "G4", frequency: 392.0 }, // Lowest
            openHole: [false, false, false],
          },
          {
            note: { name: "A5", frequency: 880.0 },
            openHole: [true, false, true],
          },
        ],
      };

      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Should still work with single dimension
      expect(objective.getNrDimensions()).toBe(1);
    });

    test("constraint is dimensionless", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONLESS");
      expect(constraintList[0]!.name).toBe("Fipple factor");
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FippleFactorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("WindowHeightObjectiveFunction", () => {
    const createWhistleWithFipple = (): Instrument => ({
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

    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        embouchureHole: {
          length: 12,
          width: 10,
          height: 5,
          airstreamLength: 8,
          airstreamHeight: 2,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 600, boreDiameter: 19 },
      ],
      hole: [
        { position: 400, diameter: 8, height: 4 },
        { position: 440, diameter: 8, height: 4 },
        { position: 480, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates single-dimension objective for fipple", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("creates single-dimension objective for embouchure", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns window height for fipple", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBeCloseTo(0.003, 4); // 3mm in metres
    });

    test("getGeometryPoint returns embouchure height for flute", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBeCloseTo(0.005, 4); // 5mm in metres
    });

    test("setGeometryPoint modifies fipple window height", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      objective.setGeometryPoint([0.004]); // 4mm

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.fipple!.windowHeight).toBeCloseTo(0.004, 4);
    });

    test("setGeometryPoint modifies embouchure height", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      objective.setGeometryPoint([0.006]); // 6mm

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.embouchureHole!.height).toBeCloseTo(0.006, 4);
    });

    test("constraint is dimensional", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONAL");
      expect(constraintList[0]!.name).toBe("Window height");
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WindowHeightObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndTaperObjectiveFunction", () => {
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

    test("creates merged objective function", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // bore + 3 hole spacings + 3 hole sizes + 2 taper params = 9 dimensions
      expect(objective.getNrDimensions()).toBe(9);
    });

    test("getGeometryPoint returns positions, sizes, and taper", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(9);
      // First should be bore length
      expect(geometry[0]).toBeCloseTo(0.3, 4);
    });

    test("setGeometryPoint round-trips correctly", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndTaperObjectiveFunction(
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

    test("has mixed dimensional and dimensionless constraints", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      // Should have both dimensional (positions, sizes) and dimensionless (taper ratios)
      const hasDimensional = constraintList.some((c) => c.type === "DIMENSIONAL");
      const hasDimensionless = constraintList.some((c) => c.type === "DIMENSIONLESS");
      expect(hasDimensional).toBe(true);
      expect(hasDimensionless).toBe(true);
    });

    test("value returns finite error", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("BetaObjectiveFunction", () => {
    const createWhistleWithBeta = (): Instrument => ({
      name: "Test Whistle",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        beta: 0.35,
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

    test("creates single-dimension objective", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BetaObjectiveFunction(calc, tuning, evaluator);

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns beta", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BetaObjectiveFunction(calc, tuning, evaluator);

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBe(0.35);
    });

    test("setGeometryPoint modifies beta", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BetaObjectiveFunction(calc, tuning, evaluator);

      objective.setGeometryPoint([0.45]);

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.beta).toBe(0.45);
    });

    test("constraint is dimensionless", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BetaObjectiveFunction(calc, tuning, evaluator);

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONLESS");
      expect(constraintList[0]!.name).toBe("Beta");
    });
  });

  describe("AirstreamLengthObjectiveFunction", () => {
    const createWhistleWithFipple = (): Instrument => ({
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

    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        embouchureHole: {
          length: 12,
          width: 10,
          height: 5,
          airstreamLength: 8,
          airstreamHeight: 2,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 600, boreDiameter: 19 },
      ],
      hole: [
        { position: 400, diameter: 8, height: 4 },
        { position: 440, diameter: 8, height: 4 },
        { position: 480, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates single-dimension objective for fipple", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new AirstreamLengthObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns window length for fipple", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new AirstreamLengthObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBeCloseTo(0.008, 4); // 8mm in metres
    });

    test("getGeometryPoint returns airstream length for embouchure", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new AirstreamLengthObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBeCloseTo(0.008, 4); // 8mm in metres
    });

    test("setGeometryPoint modifies fipple window length", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new AirstreamLengthObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      objective.setGeometryPoint([0.01]); // 10mm

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.fipple!.windowLength).toBeCloseTo(0.01, 4);
    });

    test("constraint is dimensional", () => {
      const whistle = createWhistleWithFipple();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new AirstreamLengthObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONAL");
      expect(constraintList[0]!.name).toBe("Airstream length");
    });
  });

  describe("NafHoleSizeObjectiveFunction", () => {
    test("extends HoleSizeObjectiveFunction", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new NafHoleSizeObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Same dimensions as HoleSizeObjectiveFunction
      expect(objective.getNrDimensions()).toBe(3);
    });

    test("has custom trust region parameters", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new NafHoleSizeObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });

    test("getGeometryPoint and setGeometryPoint work correctly", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new NafHoleSizeObjectiveFunction(
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
  });

  describe("HoleGroupPositionFromTopObjectiveFunction", () => {
    test("creates objective with grouped holes", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      // Group holes: [0,1] and [2]
      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupPositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      // bore length + top ratio + group spacing + between groups + final spacing
      expect(objective.getNrDimensions()).toBeGreaterThanOrEqual(3);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupPositionFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleGroupFromTopObjectiveFunction", () => {
    test("creates merged objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      // Should have dimensions from grouped position + hole sizes
      expect(objective.getNrDimensions()).toBeGreaterThanOrEqual(6);
    });

    test("has custom trust region parameters", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndBoreDiameterFromTopObjectiveFunction", () => {
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

    test("creates merged objective function", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // bore + hole spacings + hole sizes + bore diameter ratios
      expect(objective.getNrDimensions()).toBeGreaterThanOrEqual(8);
    });

    test("getGeometryPoint returns positions, sizes, and diameter ratios", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBeGreaterThanOrEqual(8);
      // First should be bore length
      expect(geometry[0]).toBeCloseTo(0.3, 4);
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithMoreBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleGroupObjectiveFunction", () => {
    test("creates merged objective function", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      // Should have dimensions from grouped position + hole sizes
      expect(objective.getNrDimensions()).toBeGreaterThanOrEqual(6);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1], [2]];

      const objective = new HoleGroupObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndBoreDiameterFromBottomObjectiveFunction", () => {
    const createWhistleWithMultipleBorePoints = (): Instrument => ({
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

    test("creates merged objective function", () => {
      const whistle = createWhistleWithMultipleBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        1
      );

      // bore + hole spacings + hole sizes + bore diameter ratios
      expect(objective.getNrDimensions()).toBeGreaterThanOrEqual(7);
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithMultipleBorePoints();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        1
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ReedCalibratorObjectiveFunction", () => {
    const createClarinetWithSingleReed = (): Instrument => ({
      name: "Test Clarinet",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        beta: 0.35,
        singleReed: {
          alpha: 0.5,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 15 },
        { borePosition: 600, boreDiameter: 15 },
      ],
      hole: [
        { position: 400, diameter: 10, height: 5 },
        { position: 440, diameter: 10, height: 5 },
        { position: 480, diameter: 10, height: 5 },
      ],
      termination: { flangeDiameter: 20 },
    });

    test("creates two-dimension objective", () => {
      const clarinet = createClarinetWithSingleReed();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(clarinet, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ReedCalibratorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(2);
    });

    test("getGeometryPoint returns alpha and beta", () => {
      const clarinet = createClarinetWithSingleReed();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(clarinet, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ReedCalibratorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(2);
      expect(geometry[0]).toBe(0.5); // alpha
      expect(geometry[1]).toBe(0.35); // beta
    });

    test("setGeometryPoint modifies alpha and beta", () => {
      const clarinet = createClarinetWithSingleReed();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(clarinet, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ReedCalibratorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      objective.setGeometryPoint([0.7, 0.4]);

      const instrument = calc.getInstrument();
      expect(instrument.mouthpiece.singleReed!.alpha).toBe(0.7);
      expect(instrument.mouthpiece.beta).toBe(0.4);
    });

    test("constraints are dimensionless", () => {
      const clarinet = createClarinetWithSingleReed();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(clarinet, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ReedCalibratorObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(2);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONLESS");
      expect(constraintList[1]!.type as string).toBe("DIMENSIONLESS");
    });
  });

  describe("StopperPositionObjectiveFunction", () => {
    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 20,
        embouchureHole: {
          length: 12,
          width: 10,
          height: 5,
          airstreamLength: 8,
          airstreamHeight: 2,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 600, boreDiameter: 19 },
      ],
      hole: [
        { position: 400, diameter: 8, height: 4 },
        { position: 440, diameter: 8, height: 4 },
        { position: 480, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates single-dimension objective", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new StopperPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns stopper distance", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new StopperPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      // Should be mouthpiecePosition - topOfBore - halfEmbouchureLength
      // = 0.02 - 0 - 0.006 = 0.014
      expect(geometry[0]).toBeCloseTo(0.014, 3);
    });

    test("constraint is dimensional", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new StopperPositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        false
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONAL");
    });

    test("value returns finite error", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new StopperPositionObjectiveFunction(
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

  describe("ConicalBoreObjectiveFunction", () => {
    const createConicalWhistle = (): Instrument => ({
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
        { borePosition: 150, boreDiameter: 14 },
        { borePosition: 300, boreDiameter: 12 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 15 },
    });

    test("creates single-dimension objective", () => {
      const whistle = createConicalWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(1);
    });

    test("getGeometryPoint returns foot diameter", () => {
      const whistle = createConicalWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(1);
      expect(geometry[0]).toBeCloseTo(0.012, 4); // 12mm in metres
    });

    test("setGeometryPoint scales bottom half of bore", () => {
      const whistle = createConicalWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Increase foot diameter by 50%
      objective.setGeometryPoint([0.018]);

      const instrument = calc.getInstrument();
      // Find the bottom bore point
      const sortedBore = [...instrument.borePoint].sort(
        (a, b) => a.borePosition - b.borePosition
      );
      const bottomPoint = sortedBore[sortedBore.length - 1]!;
      expect(bottomPoint.boreDiameter).toBeCloseTo(0.018, 4);
    });

    test("constraint is dimensional", () => {
      const whistle = createConicalWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(1);
      expect(constraintList[0]!.type as string).toBe("DIMENSIONAL");
      expect(constraintList[0]!.name).toBe("Foot diameter");
    });

    test("value returns finite error", () => {
      const whistle = createConicalWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new ConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperSimpleRatioObjectiveFunction", () => {
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
        { borePosition: 0, boreDiameter: 18 },
        { borePosition: 100, boreDiameter: 18 },
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

      const objective = new SingleTaperSimpleRatioObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBe(3);
    });

    test("getGeometryPoint returns taper parameters", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      expect(geometry.length).toBe(3);
      // Taper ratio: 18/14 ≈ 1.286
      expect(geometry[0]).toBeCloseTo(18 / 14, 2);
    });

    test("setGeometryPoint round-trips correctly", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      // Allow some tolerance due to bore point reconstruction
      expect(newGeometry[0]).toBeCloseTo(geometry[0]!, 1);
    });

    test("constraints are all dimensionless", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const constraints = objective.getConstraints();
      const constraintList = constraints.getConstraints();

      expect(constraintList.length).toBe(3);
      for (const constraint of constraintList) {
        expect(constraint!.type as string).toBe("DIMENSIONLESS");
      }
    });

    test("value returns finite error", () => {
      const whistle = createTaperedWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Global Optimizer Variants
  // ===========================================================================

  describe("GlobalHolePositionObjectiveFunction", () => {
    test("creates objective with DIRECT optimizer type", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(30000);
    });

    test("has same dimensions as HolePositionObjectiveFunction", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const globalObj = new GlobalHolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );
      const regularObj = new HolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(globalObj.getNrDimensions()).toBe(regularObj.getNrDimensions());
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHolePositionObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GlobalHoleObjectiveFunction", () => {
    test("creates objective with DIRECT optimizer type", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(40000);
    });

    test("has same dimensions as HoleObjectiveFunction", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const globalObj = new GlobalHoleObjectiveFunction(
        calc,
        tuning,
        evaluator
      );
      const regularObj = new HoleObjectiveFunction(calc, tuning, evaluator);

      expect(globalObj.getNrDimensions()).toBe(regularObj.getNrDimensions());
    });
  });

  describe("GlobalHoleAndTaperObjectiveFunction", () => {
    test("creates objective with DIRECT optimizer type", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(30000);
    });

    test("has same dimensions as HoleAndTaperObjectiveFunction", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const globalObj = new GlobalHoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );
      const regularObj = new HoleAndTaperObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(globalObj.getNrDimensions()).toBe(regularObj.getNrDimensions());
    });
  });

  describe("GlobalHoleAndBoreDiameterFromBottomObjectiveFunction", () => {
    const createMultiBoreWhistle = (): Instrument => ({
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
        { borePosition: 300, boreDiameter: 14 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates objective with DIRECT optimizer type", () => {
      const whistle = createMultiBoreWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(60000);
    });

    test("value returns finite error", () => {
      const whistle = createMultiBoreWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreDiameterFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GlobalHoleAndBoreDiameterFromTopObjectiveFunction", () => {
    const createMultiBoreWhistle = (): Instrument => ({
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
        { borePosition: 300, boreDiameter: 14 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates objective with DIRECT optimizer type", () => {
      const whistle = createMultiBoreWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(60000);
    });

    test("value returns finite error", () => {
      const whistle = createMultiBoreWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreDiameterFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // SingleTaper Merged Objective Functions
  // ===========================================================================

  describe("SingleTaperNoHoleGroupingObjectiveFunction", () => {
    test("creates merged objective with 3 components", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Dimensions: holes (4) + hole sizes (3) + taper (4) = 11
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry round-trips", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      for (let i = 0; i < Math.min(geometry.length, newGeometry.length); i++) {
        // Some tolerance for bore point reconstruction
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperNoHoleGroupingFromTopObjectiveFunction", () => {
    test("creates merged objective with 3 components", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("has trust region methods", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperHoleGroupObjectiveFunction", () => {
    const createSixHoleWhistle = (): Instrument => ({
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
        { position: 150, diameter: 8, height: 4 },
        { position: 170, diameter: 8, height: 4 },
        { position: 190, diameter: 8, height: 4 },
        { position: 210, diameter: 8, height: 4 },
        { position: 230, diameter: 8, height: 4 },
        { position: 250, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    const createSixHoleTuning = (): Tuning => ({
      name: "Test Tuning",
      numberOfHoles: 6,
      fingering: [
        {
          note: { name: "D4", frequency: 294 },
          openHole: [false, false, false, false, false, false],
        },
        {
          note: { name: "E4", frequency: 330 },
          openHole: [false, false, false, false, false, true],
        },
      ],
    });

    test("creates objective with hole groups", () => {
      const whistle = createSixHoleWhistle();
      const tuning = createSixHoleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [
        [0, 1, 2],
        [3, 4, 5],
      ];

      const objective = new SingleTaperHoleGroupObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("value returns finite error", () => {
      const whistle = createSixHoleWhistle();
      const tuning = createSixHoleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [
        [0, 1, 2],
        [3, 4, 5],
      ];

      const objective = new SingleTaperHoleGroupObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperHoleGroupFromTopObjectiveFunction", () => {
    const createSixHoleWhistle = (): Instrument => ({
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
        { position: 150, diameter: 8, height: 4 },
        { position: 170, diameter: 8, height: 4 },
        { position: 190, diameter: 8, height: 4 },
        { position: 210, diameter: 8, height: 4 },
        { position: 230, diameter: 8, height: 4 },
        { position: 250, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    const createSixHoleTuning = (): Tuning => ({
      name: "Test Tuning",
      numberOfHoles: 6,
      fingering: [
        {
          note: { name: "D4", frequency: 294 },
          openHole: [false, false, false, false, false, false],
        },
      ],
    });

    test("creates objective with hole groups from top", () => {
      const whistle = createSixHoleWhistle();
      const tuning = createSixHoleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [
        [0, 1, 2],
        [3, 4, 5],
      ];

      const objective = new SingleTaperHoleGroupFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("has trust region methods", () => {
      const whistle = createSixHoleWhistle();
      const tuning = createSixHoleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [
        [0, 1, 2],
        [3, 4, 5],
      ];

      const objective = new SingleTaperHoleGroupFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });
  });

  // ===========================================================================
  // Combined Bore Objective Functions
  // ===========================================================================

  describe("HoleAndConicalBoreObjectiveFunction", () => {
    test("creates merged objective with 3 components", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Dimensions: holes (4) + hole sizes (3) + conical (1) = 8
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(30000);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndConicalBoreObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HeadjointObjectiveFunction", () => {
    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 20,
        embouchureHole: {
          length: 10,
          width: 8,
          height: 3,
          airstreamLength: 8,
          airstreamHeight: 2,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 50, boreDiameter: 18 },
        { borePosition: 100, boreDiameter: 17 },
        { borePosition: 300, boreDiameter: 17 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective for headjoint", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HeadjointObjectiveFunction(calc, tuning, evaluator);

      // Dimensions: stopper (1) + bore diameters from top
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(40000);
    });

    test("value returns finite error", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HeadjointObjectiveFunction(calc, tuning, evaluator);

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("accepts explicit bore point count", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HeadjointObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      expect(objective.getNrDimensions()).toBeGreaterThan(0);
    });
  });

  describe("HoleAndHeadjointObjectiveFunction", () => {
    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 20,
        embouchureHole: {
          length: 10,
          width: 8,
          height: 3,
          airstreamLength: 8,
          airstreamHeight: 2,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 50, boreDiameter: 18 },
        { borePosition: 100, boreDiameter: 17 },
        { borePosition: 300, boreDiameter: 17 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective for holes and headjoint", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndHeadjointObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // Dimensions: holes (2*3) + stopper (1) + bore diameters from top
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(50000);
    });

    test("value returns finite error", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndHeadjointObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("geometry round-trips", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndHeadjointObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });
  });

  // ============================================================================
  // Bore Position and Spacing Objective Functions
  // ============================================================================

  describe("BorePositionObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates with correct dimensions and optimizer", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2 // Leave 2 bore points unchanged from top
      );

      // 5 bore points - 2 unchanged from top = 3 dimensions
      expect(objective.getNrDimensions()).toBe(3);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 6);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });

    test("with bottomPointUnchanged=true", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2,
        true // bottomPointUnchanged
      );

      // 5 bore points - 2 unchanged from top - 1 unchanged at bottom = 2 dimensions
      expect(objective.getNrDimensions()).toBe(2);
    });
  });

  describe("BoreSpacingFromTopObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates with correct dimensions", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        3 // Change 3 bore points from top
      );

      expect(objective.getNrDimensions()).toBe(3);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry contains spacings", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();

      // First spacing: 50mm = 0.05m (values are in meters)
      expect(geometry[0]).toBeCloseTo(0.05, 6);
      // Second spacing: 100 - 50 = 50mm = 0.05m
      expect(geometry[1]).toBeCloseTo(0.05, 6);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 6);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("BoreFromBottomObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective with correct components", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Combined dimensions from BorePosition + BoreDiameterFromBottom
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(40000);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new BoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndBoreFromBottomObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective with all components", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Combined dimensions: HolePosition + HoleSize + BorePosition + BoreDiameter
      expect(objective.getNrDimensions()).toBeGreaterThan(6);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(60000);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndBorePositionObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Combined dimensions: HolePosition + HoleSize + BorePosition
      expect(objective.getNrDimensions()).toBeGreaterThan(6);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(50000);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBorePositionObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HoleAndBoreSpacingFromTopObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates merged objective", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Combined dimensions: HolePosition + HoleSize + BoreSpacing
      expect(objective.getNrDimensions()).toBeGreaterThan(6);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
      expect(objective.getMaxEvaluations()).toBe(50000);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new HoleAndBoreSpacingFromTopObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GlobalBoreFromBottomObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("uses DIRECT optimizer", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(40000);
    });

    test("has same dimensions as non-global variant", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const globalObj = new GlobalBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      // Create a fresh calculator for the non-global version
      const inst2 = createMultiBoreInstrument();
      const calc2 = new DefaultInstrumentCalculator(inst2, params);
      const evaluator2 = new CentDeviationEvaluator(calc2);

      const localObj = new BoreFromBottomObjectiveFunction(
        calc2,
        tuning,
        evaluator2,
        2
      );

      expect(globalObj.getNrDimensions()).toBe(localObj.getNrDimensions());
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });

    test("value returns finite error", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GlobalHoleAndBoreFromBottomObjectiveFunction", () => {
    const createMultiBoreInstrument = (): Instrument => ({
      name: "Multi-bore Instrument",
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
        { borePosition: 0, boreDiameter: 16, name: "Head" },
        { borePosition: 50, boreDiameter: 16, name: "Head" },
        { borePosition: 100, boreDiameter: 17, name: "Body" },
        { borePosition: 200, boreDiameter: 18 },
        { borePosition: 300, boreDiameter: 18 },
      ],
      hole: [
        { position: 200, diameter: 8, height: 4 },
        { position: 220, diameter: 8, height: 4 },
        { position: 240, diameter: 8, height: 4 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("uses DIRECT optimizer", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      expect(objective.getOptimizerType()).toBe(OptimizerType.DIRECT);
      expect(objective.getMaxEvaluations()).toBe(60000);
    });

    test("geometry round-trips", () => {
      const inst = createMultiBoreInstrument();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(inst, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new GlobalHoleAndBoreFromBottomObjectiveFunction(
        calc,
        tuning,
        evaluator,
        2
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 1);
      }
    });
  });

  // ============================================================================
  // Hemispherical Bore Head Tests
  // ============================================================================

  describe("HemisphericalBoreHead", () => {
    test("addHemiHead creates correct number of bore points", () => {
      const borePoints: Array<{ borePosition: number; boreDiameter: number }> = [];
      HemisphericalBoreHead.addHemiHead(0, 0.016, borePoints);

      // Should create 11 points (1 top + 10 hemi points)
      expect(borePoints.length).toBe(11);
    });

    test("addHemiHead creates points with increasing diameter", () => {
      const borePoints: Array<{ borePosition: number; boreDiameter: number }> = [];
      HemisphericalBoreHead.addHemiHead(0, 0.016, borePoints);

      // Diameters should increase from near-zero to headDiameter
      for (let i = 1; i < borePoints.length; i++) {
        expect(borePoints[i]!.boreDiameter).toBeGreaterThan(
          borePoints[i - 1]!.boreDiameter
        );
      }

      // Last point should have diameter equal to headDiameter
      expect(borePoints[borePoints.length - 1]!.boreDiameter).toBeCloseTo(0.016, 6);
    });

    test("addHemiHead creates hemispherical profile", () => {
      const borePoints: Array<{ borePosition: number; boreDiameter: number }> = [];
      const headDiameter = 0.02;
      HemisphericalBoreHead.addHemiHead(0, headDiameter, borePoints);

      // The equator (last point) should be at position headDiameter/2
      expect(borePoints[borePoints.length - 1]!.borePosition).toBeCloseTo(
        headDiameter / 2,
        6
      );
    });

    test("getHemiTopPoint finds equator from existing bore", () => {
      const sortedPoints = [
        { borePosition: 0, boreDiameter: 0.00001 },
        { borePosition: 0.008, boreDiameter: 0.016 },
        { borePosition: 0.3, boreDiameter: 0.016 },
      ];

      const hemiTop = HemisphericalBoreHead.getHemiTopPoint(sortedPoints);

      // Should find the hemisphere equator
      expect(hemiTop.boreDiameter).toBeCloseTo(0.016, 6);
    });
  });

  describe("SingleTaperSimpleRatioHemiHeadObjectiveFunction", () => {
    test("creates with correct dimensions", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // 3 dimensions: taper ratio, taper start fraction, taper length fraction
      expect(objective.getNrDimensions()).toBe(3);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry round-trips", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 2);
      }
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperSimpleRatioHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction", () => {
    test("creates merged objective", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // HolePositionFromTop + HoleSize + SingleTaperHemiHead
      expect(objective.getNrDimensions()).toBeGreaterThan(3);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("has correct trust region settings", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction", () => {
    test("creates merged objective with hole groups", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1, 2]]; // All holes in one group
      const objective = new SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getNrDimensions()).toBeGreaterThan(3);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("has correct trust region settings", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1, 2]];
      const objective = new SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      expect(objective.getInitialTrustRegionRadius()).toBe(10.0);
      expect(objective.getStoppingTrustRegionRadius()).toBe(1e-8);
    });

    test("value returns finite error", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const holeGroups = [[0, 1, 2]];
      const objective = new SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction(
        calc,
        tuning,
        evaluator,
        holeGroups
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Calibration Objective Function Tests
  // ============================================================================

  describe("FluteCalibrationObjectiveFunction", () => {
    const createFluteWithEmbouchure = (): Instrument => ({
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        embouchureHole: {
          length: 10,
          width: 10,
          height: 3,
          airstreamLength: 12, // 12mm
          airstreamHeight: 2,  // 2mm
        },
        beta: 0.3,
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 19 },
        { borePosition: 400, boreDiameter: 19 },
      ],
      hole: [
        { position: 250, diameter: 10, height: 5 },
        { position: 280, diameter: 10, height: 5 },
        { position: 310, diameter: 10, height: 5 },
      ],
      termination: { flangeDiameter: 0 },
    });

    test("creates with correct dimensions", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FluteCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // 2 dimensions: airstream length, beta
      expect(objective.getNrDimensions()).toBe(2);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry extracts calibration parameters", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FluteCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();

      // First dimension is airstream length (0.012m)
      expect(geometry[0]).toBeCloseTo(0.012, 6);
      // Second dimension is beta (0.3)
      expect(geometry[1]).toBeCloseTo(0.3, 6);
    });

    test("geometry round-trips", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FluteCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 6);
      }
    });

    test("value returns finite error", () => {
      const flute = createFluteWithEmbouchure();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(flute, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new FluteCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("WhistleCalibrationObjectiveFunction", () => {
    const createWhistleWithBeta = (): Instrument => ({
      name: "Test Whistle",
      lengthType: "MM",
      mouthpiece: {
        position: 0,
        fipple: {
          windowWidth: 10,
          windowLength: 8,
          windowHeight: 3,
        },
        beta: 0.4,
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

    test("creates with correct dimensions", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WhistleCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      // 2 dimensions: window height, beta
      expect(objective.getNrDimensions()).toBe(2);
      expect(objective.getOptimizerType()).toBe(OptimizerType.BOBYQA);
    });

    test("geometry extracts calibration parameters", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WhistleCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();

      // First dimension is window height (3mm = 0.003m)
      expect(geometry[0]).toBeCloseTo(0.003, 6);
      // Second dimension is beta (0.4)
      expect(geometry[1]).toBeCloseTo(0.4, 6);
    });

    test("geometry round-trips", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WhistleCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const geometry = objective.getGeometryPoint();
      objective.setGeometryPoint(geometry);

      const newGeometry = objective.getGeometryPoint();
      expect(newGeometry.length).toBe(geometry.length);
      for (let i = 0; i < geometry.length; i++) {
        expect(newGeometry[i]).toBeCloseTo(geometry[i]!, 6);
      }
    });

    test("value returns finite error", () => {
      const whistle = createWhistleWithBeta();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = new WhistleCalibrationObjectiveFunction(
        calc,
        tuning,
        evaluator
      );

      const value = objective.value(objective.getGeometryPoint());
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });
});
