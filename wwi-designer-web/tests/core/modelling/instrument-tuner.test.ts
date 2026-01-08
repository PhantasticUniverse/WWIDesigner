/**
 * Tests for InstrumentTuner classes
 *
 * These tests verify that the instrument tuner correctly predicts
 * playing frequencies for various fingerings.
 */

import { describe, test, expect } from "bun:test";
import {
  SimpleInstrumentTuner,
  createInstrumentTuner,
  calcCents,
  compareTunings,
  calcTuningStats,
  type TuningResult,
} from "../../../src/core/modelling/instrument-tuner.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Tuning, Fingering, Note } from "../../../src/models/tuning.ts";

describe("InstrumentTuner", () => {
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

  // Create a simple tuning with 3 notes
  const createSimpleTuning = (): Tuning => ({
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
      {
        note: { name: "F#4", frequency: 370 },
        openHole: [false, false, false, false, true, true],
      },
    ],
  });

  describe("SimpleInstrumentTuner", () => {
    test("creates tuner from instrument and tuning", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      expect(tuner).toBeInstanceOf(SimpleInstrumentTuner);
      expect(tuner.getInstrument()).toBe(whistle);
      expect(tuner.getTuning()).toBe(tuning);
    });

    test("predictedFrequency returns frequency for valid fingering", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      const fingering = tuning.fingering[0]!;
      const predicted = tuner.predictedFrequency(fingering);

      expect(predicted).not.toBeNull();
      expect(predicted).toBeGreaterThan(200);
      expect(predicted).toBeLessThan(800); // Reasonable range for a whistle
    });

    test("predictedFrequency returns null for missing target frequency", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      const fingering: Fingering = {
        openHole: [false, false, false, false, false, false],
        note: { name: "Unknown" }, // No frequency
      };

      const predicted = tuner.predictedFrequency(fingering);
      expect(predicted).toBeNull();
    });

    test("predictedNote returns note with predicted frequency", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      const fingering = tuning.fingering[0]!;
      const predicted = tuner.predictedNote(fingering);

      expect(predicted.name).toBe(fingering.note?.name);
      expect(predicted.frequency).toBeDefined();
      expect(predicted.frequency).toBeGreaterThan(0);
    });

    test("getPredictedTuning returns complete tuning", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      const predicted = tuner.getPredictedTuning();

      expect(predicted.name).toBe(tuning.name);
      expect(predicted.numberOfHoles).toBe(tuning.numberOfHoles);
      expect(predicted.fingering.length).toBe(tuning.fingering.length);

      // Each fingering should have a predicted note
      for (const f of predicted.fingering) {
        expect(f.note).toBeDefined();
      }
    });

    test("opening holes raises pitch", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const tuner = new SimpleInstrumentTuner(whistle, tuning, calc, params);

      const closedFreq = tuner.predictedFrequency(tuning.fingering[0]!);
      const openFreq = tuner.predictedFrequency(tuning.fingering[2]!);

      expect(closedFreq).not.toBeNull();
      expect(openFreq).not.toBeNull();
      expect(openFreq!).toBeGreaterThan(closedFreq!);
    });
  });

  describe("createInstrumentTuner", () => {
    test("creates tuner with default parameters", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const tuner = createInstrumentTuner(whistle, tuning);

      expect(tuner).toBeInstanceOf(SimpleInstrumentTuner);
    });

    test("creates tuner with custom parameters", () => {
      const whistle = createSimpleWhistle();
      const tuning = createSimpleTuning();
      const customParams = new PhysicalParameters(25, "C");
      const tuner = createInstrumentTuner(whistle, tuning, customParams);

      expect(tuner.getParams()).toBe(customParams);
    });
  });

  describe("calcCents", () => {
    test("returns 0 for equal frequencies", () => {
      expect(calcCents(440, 440)).toBe(0);
    });

    test("returns 100 for semitone up", () => {
      const semitone = 440 * Math.pow(2, 1 / 12);
      expect(calcCents(440, semitone)).toBeCloseTo(100, 5);
    });

    test("returns -100 for semitone down", () => {
      const semitone = 440 / Math.pow(2, 1 / 12);
      expect(calcCents(440, semitone)).toBeCloseTo(-100, 5);
    });

    test("returns 1200 for octave up", () => {
      expect(calcCents(440, 880)).toBeCloseTo(1200, 5);
    });

    test("returns -1200 for octave down", () => {
      expect(calcCents(440, 220)).toBeCloseTo(-1200, 5);
    });
  });

  describe("compareTunings", () => {
    test("compares target and predicted tunings", () => {
      const target: Tuning = {
        name: "Target",
        numberOfHoles: 2,
        fingering: [
          { note: { name: "A4", frequency: 440 }, openHole: [false, false] },
          { note: { name: "B4", frequency: 494 }, openHole: [false, true] },
        ],
      };

      const predicted: Tuning = {
        name: "Predicted",
        numberOfHoles: 2,
        fingering: [
          { note: { name: "A4", frequency: 442 }, openHole: [false, false] },
          { note: { name: "B4", frequency: 490 }, openHole: [false, true] },
        ],
      };

      const results = compareTunings(target, predicted);

      expect(results.length).toBe(2);
      expect(results[0]!.name).toBe("A4");
      expect(results[0]!.targetFrequency).toBe(440);
      expect(results[0]!.predictedFrequency).toBe(442);
      expect(results[0]!.deviationCents).toBeGreaterThan(0); // Sharp
    });

    test("handles missing predicted frequencies", () => {
      const target: Tuning = {
        name: "Target",
        numberOfHoles: 1,
        fingering: [
          { note: { name: "A4", frequency: 440 }, openHole: [false] },
        ],
      };

      const predicted: Tuning = {
        name: "Predicted",
        numberOfHoles: 1,
        fingering: [
          { note: { name: "A4" }, openHole: [false] }, // No frequency
        ],
      };

      const results = compareTunings(target, predicted);

      expect(results[0]!.predictedFrequency).toBeNull();
      expect(results[0]!.deviationCents).toBeNull();
    });
  });

  describe("calcTuningStats", () => {
    test("calculates statistics for valid results", () => {
      const results: TuningResult[] = [
        {
          name: "A4",
          targetFrequency: 440,
          predictedFrequency: 442,
          deviationCents: calcCents(440, 442),
          fingering: { openHole: [] },
        },
        {
          name: "B4",
          targetFrequency: 494,
          predictedFrequency: 490,
          deviationCents: calcCents(494, 490),
          fingering: { openHole: [] },
        },
        {
          name: "C5",
          targetFrequency: 523,
          predictedFrequency: 523,
          deviationCents: 0,
          fingering: { openHole: [] },
        },
      ];

      const stats = calcTuningStats(results);

      expect(stats.validCount).toBe(3);
      expect(stats.rmsCents).toBeGreaterThan(0);
      expect(stats.maxAbsCents).toBeGreaterThan(0);
    });

    test("handles empty results", () => {
      const stats = calcTuningStats([]);

      expect(stats.validCount).toBe(0);
      expect(stats.meanCents).toBe(0);
      expect(stats.stdDevCents).toBe(0);
      expect(stats.rmsCents).toBe(0);
    });

    test("excludes null deviations from statistics", () => {
      const results: TuningResult[] = [
        {
          name: "A4",
          targetFrequency: 440,
          predictedFrequency: 442,
          deviationCents: calcCents(440, 442),
          fingering: { openHole: [] },
        },
        {
          name: "B4",
          targetFrequency: 494,
          predictedFrequency: null,
          deviationCents: null,
          fingering: { openHole: [] },
        },
      ];

      const stats = calcTuningStats(results);

      expect(stats.validCount).toBe(1);
    });
  });

  describe("getter/setter methods", () => {
    test("setInstrument changes instrument", () => {
      const whistle1 = createSimpleWhistle();
      const whistle2 = createSimpleWhistle();
      whistle2.name = "Different Whistle";
      const tuning = createSimpleTuning();
      const tuner = createInstrumentTuner(whistle1, tuning, params);

      tuner.setInstrument(whistle2);
      expect(tuner.getInstrument().name).toBe("Different Whistle");
    });

    test("setTuning changes tuning", () => {
      const whistle = createSimpleWhistle();
      const tuning1 = createSimpleTuning();
      const tuning2 = createSimpleTuning();
      tuning2.name = "Different Tuning";
      const tuner = createInstrumentTuner(whistle, tuning1, params);

      tuner.setTuning(tuning2);
      expect(tuner.getTuning().name).toBe("Different Tuning");
    });
  });
});
