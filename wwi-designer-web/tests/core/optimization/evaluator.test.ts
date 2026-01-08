/**
 * Tests for instrument evaluators
 *
 * These tests verify that evaluators correctly calculate
 * error between target and predicted tunings.
 */

import { describe, test, expect } from "bun:test";
import {
  CentDeviationEvaluator,
  FrequencyDeviationEvaluator,
  ReactanceEvaluator,
  createEvaluator,
} from "../../../src/core/optimization/evaluator.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Fingering } from "../../../src/models/tuning.ts";

describe("Evaluators", () => {
  const params = new PhysicalParameters(20, "C");

  // Create a simple whistle-like instrument
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
      { position: 260, diameter: 8, height: 4 },
      { position: 270, diameter: 8, height: 4 },
      { position: 280, diameter: 8, height: 4 },
    ],
    termination: { flangeDiameter: 0 },
  });

  describe("CentDeviationEvaluator", () => {
    test("creates evaluator from calculator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      expect(evaluator).toBeInstanceOf(CentDeviationEvaluator);
    });

    test("calculates error vector for fingerings", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const fingerings: Fingering[] = [
        {
          note: { name: "D4", frequency: 294 },
          openHole: [false, false, false, false, false, false],
        },
        {
          note: { name: "E4", frequency: 330 },
          openHole: [false, false, false, false, false, true],
        },
      ];

      const errors = evaluator.calculateErrorVector(fingerings);

      expect(errors.length).toBe(2);
      // Errors should be finite numbers (could be positive or negative)
      expect(Number.isFinite(errors[0])).toBe(true);
      expect(Number.isFinite(errors[1])).toBe(true);
    });

    test("returns zero error for fingering without target frequency", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new CentDeviationEvaluator(calc);

      const fingerings: Fingering[] = [
        {
          note: { name: "Unknown" }, // No frequency
          openHole: [false, false, false, false, false, false],
        },
      ];

      const errors = evaluator.calculateErrorVector(fingerings);

      expect(errors[0]).toBe(0);
    });
  });

  describe("FrequencyDeviationEvaluator", () => {
    test("creates evaluator from calculator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new FrequencyDeviationEvaluator(calc);

      expect(evaluator).toBeInstanceOf(FrequencyDeviationEvaluator);
    });

    test("calculates frequency deviation", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new FrequencyDeviationEvaluator(calc);

      const fingerings: Fingering[] = [
        {
          note: { name: "D4", frequency: 294 },
          openHole: [false, false, false, false, false, false],
        },
      ];

      const errors = evaluator.calculateErrorVector(fingerings);

      expect(errors.length).toBe(1);
      expect(Number.isFinite(errors[0])).toBe(true);
    });
  });

  describe("ReactanceEvaluator", () => {
    test("creates evaluator from calculator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new ReactanceEvaluator(calc);

      expect(evaluator).toBeInstanceOf(ReactanceEvaluator);
    });

    test("calculates reactance at target frequencies", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = new ReactanceEvaluator(calc);

      const fingerings: Fingering[] = [
        {
          note: { name: "D4", frequency: 294 },
          openHole: [false, false, false, false, false, false],
        },
      ];

      const errors = evaluator.calculateErrorVector(fingerings);

      expect(errors.length).toBe(1);
      expect(Number.isFinite(errors[0])).toBe(true);
    });
  });

  describe("createEvaluator factory", () => {
    test("creates cents evaluator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = createEvaluator("cents", calc);

      expect(evaluator).toBeInstanceOf(CentDeviationEvaluator);
    });

    test("creates frequency evaluator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = createEvaluator("frequency", calc);

      expect(evaluator).toBeInstanceOf(FrequencyDeviationEvaluator);
    });

    test("creates reactance evaluator", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const evaluator = createEvaluator("reactance", calc);

      expect(evaluator).toBeInstanceOf(ReactanceEvaluator);
    });
  });
});
