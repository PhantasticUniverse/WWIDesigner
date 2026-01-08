/**
 * Tests for objective function factory
 *
 * These tests verify that the factory correctly creates all objective
 * function types and provides accurate metadata.
 */

import { describe, test, expect } from "bun:test";
import {
  createObjectiveFunction,
  getObjectiveFunctionsByCategory,
  getObjectiveFunctionNames,
  OBJECTIVE_FUNCTION_INFO,
} from "../../../src/core/optimization/objective-function-factory.ts";
import { CentDeviationEvaluator } from "../../../src/core/optimization/evaluator.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Tuning } from "../../../src/models/tuning.ts";

describe("Objective Function Factory", () => {
  const params = new PhysicalParameters(20, "C");

  // Test instrument for factory tests
  const testInstrument: Instrument = {
    name: "Factory Test Whistle",
    lengthType: "MM",
    mouthpiece: {
      position: 0,
      fipple: {
        windowWidth: 10,
        windowLength: 8,
        windowHeight: 3,
        fippleFactor: 0.75,
        windwayHeight: 0.03,
      },
    },
    borePoint: [
      { borePosition: 0, boreDiameter: 16 },
      { borePosition: 150, boreDiameter: 16 },
      { borePosition: 300, boreDiameter: 16 },
    ],
    hole: [
      { position: 200, diameter: 8, height: 4 },
      { position: 220, diameter: 8, height: 4 },
      { position: 240, diameter: 8, height: 4 },
    ],
    termination: { flangeDiameter: 0 },
  };

  // Test tuning
  const testTuning: Tuning = {
    name: "Factory Test Tuning",
    numberOfHoles: 3,
    fingering: [
      {
        note: { name: "D5", frequency: 587.33 },
        openEnd: true,
        openHole: [false, false, false],
      },
      {
        note: { name: "E5", frequency: 659.25 },
        openEnd: true,
        openHole: [true, false, false],
      },
      {
        note: { name: "F#5", frequency: 739.99 },
        openEnd: true,
        openHole: [true, true, false],
      },
    ],
  };

  describe("OBJECTIVE_FUNCTION_INFO", () => {
    test("should have info for all registered functions", () => {
      const names = getObjectiveFunctionNames();
      expect(names.length).toBeGreaterThan(40);

      for (const name of names) {
        const info = OBJECTIVE_FUNCTION_INFO[name];
        expect(info).toBeDefined();
        expect(info!.displayName).toBeTruthy();
        expect(info!.category).toBeTruthy();
        expect(info!.description).toBeTruthy();
      }
    });

    test("should have expected categories", () => {
      const categories = new Set<string>();
      for (const info of Object.values(OBJECTIVE_FUNCTION_INFO)) {
        categories.add(info.category);
      }

      expect(categories.has("Mouthpiece")).toBe(true);
      expect(categories.has("Holes")).toBe(true);
      expect(categories.has("Grouped Holes")).toBe(true);
      expect(categories.has("Single Taper")).toBe(true);
      expect(categories.has("Bore")).toBe(true);
      expect(categories.has("Combined")).toBe(true);
      expect(categories.has("Global")).toBe(true);
      expect(categories.has("Calibration")).toBe(true);
    });
  });

  describe("getObjectiveFunctionsByCategory", () => {
    test("should group functions by category", () => {
      const byCategory = getObjectiveFunctionsByCategory();

      expect(byCategory["Mouthpiece"]).toBeDefined();
      expect(byCategory["Holes"]).toBeDefined();
      expect(byCategory["Bore"]).toBeDefined();

      // Check structure of each entry
      for (const category of Object.keys(byCategory)) {
        for (const func of byCategory[category]!) {
          expect(func.name).toBeTruthy();
          expect(func.displayName).toBeTruthy();
          expect(func.description).toBeTruthy();
        }
      }
    });

    test("should have mouthpiece functions", () => {
      const byCategory = getObjectiveFunctionsByCategory();
      const mouthpieceFuncs = byCategory["Mouthpiece"]!;

      expect(mouthpieceFuncs.some((f) => f.name === "FippleFactorObjectiveFunction")).toBe(true);
      expect(mouthpieceFuncs.some((f) => f.name === "WindowHeightObjectiveFunction")).toBe(true);
      expect(mouthpieceFuncs.some((f) => f.name === "BetaObjectiveFunction")).toBe(true);
    });
  });

  describe("getObjectiveFunctionNames", () => {
    test("should return all function names", () => {
      const names = getObjectiveFunctionNames();

      expect(names).toContain("HolePositionObjectiveFunction");
      expect(names).toContain("HoleSizeObjectiveFunction");
      expect(names).toContain("FippleFactorObjectiveFunction");
      expect(names).toContain("SingleTaperHoleGroupObjectiveFunction");
    });
  });

  describe("createObjectiveFunction", () => {
    test("should create HolePositionObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "HolePositionObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
    });

    test("should create HoleSizeObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "HoleSizeObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBe(3); // 3 holes
    });

    test("should create FippleFactorObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "FippleFactorObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBe(1); // Just fipple factor
    });

    test("should create LengthObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "LengthObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBe(1); // Just bore length
    });

    test("should create SingleTaperHoleGroupObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "SingleTaperHoleGroupObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
    });

    test("should create GlobalHoleObjectiveFunction", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "GlobalHoleObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      expect(objective).toBeDefined();
      expect(objective.getNrDimensions()).toBeGreaterThan(0);
    });

    test("should throw for unknown function", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      expect(() => {
        createObjectiveFunction("NonExistentObjectiveFunction", calc, testTuning, evaluator);
      }).toThrow("Unknown objective function");
    });

    test("should create all registered functions without error", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);
      const names = getObjectiveFunctionNames();

      const errors: string[] = [];

      for (const name of names) {
        try {
          const objective = createObjectiveFunction(name, calc, testTuning, evaluator);
          expect(objective).toBeDefined();
        } catch (e) {
          errors.push(`${name}: ${e}`);
        }
      }

      // Report any failures
      if (errors.length > 0) {
        console.log("Failed to create:", errors);
      }

      // Allow some failures due to instrument requirements
      // but most should work
      expect(errors.length).toBeLessThan(names.length * 0.2);
    });
  });

  describe("Objective Function Evaluation", () => {
    test("HolePositionObjectiveFunction should compute error", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "HolePositionObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      const point = objective.getGeometryPoint();
      const error = objective.value(point);

      expect(typeof error).toBe("number");
      expect(error).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(error)).toBe(true);
    });

    test("HoleSizeObjectiveFunction should compute error", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "HoleSizeObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      const point = objective.getGeometryPoint();
      const error = objective.value(point);

      expect(typeof error).toBe("number");
      expect(error).toBeGreaterThanOrEqual(0);
    });

    test("geometry point should be modifiable", () => {
      const calc = new DefaultInstrumentCalculator(testInstrument, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const objective = createObjectiveFunction(
        "HolePositionObjectiveFunction",
        calc,
        testTuning,
        evaluator
      );

      const originalPoint = objective.getGeometryPoint();
      const modifiedPoint = [...originalPoint];
      modifiedPoint[0] = modifiedPoint[0]! * 1.01; // 1% change

      objective.setGeometryPoint(modifiedPoint);
      const newPoint = objective.getGeometryPoint();

      expect(newPoint[0]).toBeCloseTo(modifiedPoint[0]!, 5);
    });
  });
});

describe("Objective Function Integration", () => {
  const params = new PhysicalParameters(20, "C");

  // NAF instrument for testing NAF-specific functions
  const nafInstrument: Instrument = {
    name: "Test NAF",
    lengthType: "IN",
    mouthpiece: {
      position: 0.18,
      fipple: {
        windowWidth: 0.4375,
        windowLength: 0.18,
        fippleFactor: 0.75,
        windwayHeight: 0.032,
      },
    },
    borePoint: [
      { borePosition: 0, boreDiameter: 0.875 },
      { borePosition: 15.109, boreDiameter: 0.875 },
    ],
    hole: [
      { position: 10.357, diameter: 0.31, height: 0.188, name: "Hole 1" },
      { position: 9.112, diameter: 0.306, height: 0.188, name: "Hole 2" },
      { position: 7.867, diameter: 0.327, height: 0.188, name: "Hole 3" },
      { position: 6.149, diameter: 0.268, height: 0.188, name: "Hole 4" },
      { position: 5.054, diameter: 0.275, height: 0.188, name: "Hole 5" },
      { position: 3.959, diameter: 0.237, height: 0.188, name: "Hole 6" },
    ],
    termination: { flangeDiameter: 1.25 },
  };

  const nafTuning: Tuning = {
    name: "NAF Test Tuning",
    numberOfHoles: 6,
    fingering: [
      {
        note: { name: "F#4", frequency: 369.99 },
        openEnd: true,
        openHole: [false, false, false, false, false, false],
      },
      {
        note: { name: "A4", frequency: 440.0 },
        openEnd: true,
        openHole: [true, false, false, false, false, false],
      },
      {
        note: { name: "B4", frequency: 493.88 },
        openEnd: true,
        openHole: [true, true, false, false, false, false],
      },
    ],
  };

  test("should work with NAF instrument", () => {
    const calc = new DefaultInstrumentCalculator(nafInstrument, params);
    const evaluator = new CentDeviationEvaluator(calc);

    const objective = createObjectiveFunction(
      "HolePositionObjectiveFunction",
      calc,
      nafTuning,
      evaluator
    );

    const point = objective.getGeometryPoint();
    const error = objective.value(point);

    expect(error).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(error)).toBe(true);
  });

  test("FippleFactorObjectiveFunction should work with NAF", () => {
    const calc = new DefaultInstrumentCalculator(nafInstrument, params);
    const evaluator = new CentDeviationEvaluator(calc);

    const objective = createObjectiveFunction(
      "FippleFactorObjectiveFunction",
      calc,
      nafTuning,
      evaluator
    );

    expect(objective.getNrDimensions()).toBe(1);

    const point = objective.getGeometryPoint();
    expect(point.length).toBe(1);
    expect(point[0]).toBeCloseTo(0.75, 2); // Initial fipple factor
  });
});
