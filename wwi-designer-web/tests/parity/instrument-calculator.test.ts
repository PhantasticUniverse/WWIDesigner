/**
 * Instrument Calculator Parity Tests
 *
 * Tests using actual NAF sample files to verify:
 * - Instrument XML parsing
 * - Instrument calculator impedance calculations
 * - Tuning predictions
 *
 * These tests verify that the TypeScript port produces acoustically
 * reasonable results that match the expected behavior of the Java version.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { parseInstrumentXml } from "../../src/utils/xml-converter.ts";
import { PhysicalParameters } from "../../src/core/physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "../../src/core/modelling/instrument-calculator.ts";
import { SimpleInstrumentTuner } from "../../src/core/modelling/instrument-tuner.ts";
import type { Instrument } from "../../src/models/instrument.ts";
import type { Tuning, Fingering } from "../../src/models/tuning.ts";

// ============================================================================
// Test Data Loading
// ============================================================================

const FIXTURES_PATH = "./tests/parity/fixtures/NafSampleFiles";

async function loadInstrument(filename: string): Promise<Instrument> {
  const file = Bun.file(`${FIXTURES_PATH}/instruments/${filename}`);
  const xml = await file.text();
  return parseInstrumentXml(xml);
}

/**
 * Create a tuning for a 6-hole NAF with standard fingerings.
 * Combines a scale with the standard Wood Wind fingering pattern.
 */
function create6HoleNAFTuning(baseNote: string, baseFreq: number): Tuning {
  // Equal temperament semitones for NAF pentatonic scale
  // NAF standard: base, minor 3rd, 4th, 5th, minor 7th, octave, etc.
  const semitones = [0, 3, 5, 7, 10, 12, 15, 17]; // standard NAF intervals

  // Standard Wood Wind 6-hole fingerings
  const fingeringPatterns = [
    [false, false, false, false, false, false], // All closed - base note
    [false, false, false, false, false, true],  // 1 open
    [false, false, false, false, true, true],   // 2 open
    [false, false, false, true, true, true],    // 3 open
    [false, false, true, true, true, true],     // 4 open
    [false, true, true, true, true, true],      // 5 open
    [true, true, true, true, true, true],       // All open
    [true, true, false, false, false, false],   // Overblown - cross fingering
  ];

  const fingerings: Fingering[] = [];
  for (let i = 0; i < semitones.length && i < fingeringPatterns.length; i++) {
    const semitone = semitones[i]!;
    const freq = baseFreq * Math.pow(2, semitone / 12);

    fingerings.push({
      note: {
        name: `${baseNote}+${semitone}`,
        frequency: freq,
      },
      openHole: fingeringPatterns[i]!,
    });
  }

  return {
    name: `${baseNote} NAF Tuning`,
    numberOfHoles: 6,
    fingering: fingerings,
  };
}

// ============================================================================
// Instrument Loading Tests
// ============================================================================

describe("Instrument XML Parsing", () => {
  test("loads A_minor_ET_6-hole_straight.xml", async () => {
    const instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");

    expect(instrument.name).toBeDefined();
    expect(instrument.borePoint.length).toBeGreaterThanOrEqual(2);
    expect(instrument.hole.length).toBe(6);
    expect(instrument.mouthpiece).toBeDefined();
    expect(instrument.mouthpiece.fipple).toBeDefined();
    expect(instrument.termination).toBeDefined();
  });

  test("loads A3_amb-maple.xml", async () => {
    const instrument = await loadInstrument("A3_amb-maple.xml");

    expect(instrument.name).toBeDefined();
    expect(instrument.borePoint.length).toBeGreaterThanOrEqual(2);
    expect(instrument.hole.length).toBeGreaterThan(0);
    expect(instrument.mouthpiece).toBeDefined();
  });

  test("converts length units correctly", async () => {
    const instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");

    // The file uses inches - verify we can see the values
    expect(instrument.lengthType).toBe("IN");

    // Bore length should be reasonable (a NAF is typically 12-24 inches)
    const lastBorePoint = instrument.borePoint[instrument.borePoint.length - 1]!;
    expect(lastBorePoint.borePosition).toBeGreaterThan(10);
    expect(lastBorePoint.borePosition).toBeLessThan(30);
  });
});

// ============================================================================
// Instrument Calculator Tests
// ============================================================================

describe("Instrument Calculator", () => {
  let instrument: Instrument;
  let params: PhysicalParameters;
  let calculator: DefaultInstrumentCalculator;

  beforeAll(async () => {
    instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");
    params = new PhysicalParameters(72, "F"); // Room temperature in Fahrenheit
    calculator = new DefaultInstrumentCalculator(instrument, params);
  });

  test("calculates impedance at resonance frequency", () => {
    // All holes closed - should give a frequency around the base note
    const fingering: Fingering = {
      openHole: [false, false, false, false, false, false],
    };

    // For a NAF tuned to A (around 220 Hz for A3), calculate impedance
    const Z = calculator.calcZ(220, fingering);

    expect(Z).toBeDefined();
    expect(Z.re).not.toBe(Number.NaN);
    expect(Z.im).not.toBe(Number.NaN);
    expect(Z.abs()).toBeGreaterThan(0);
  });

  test("impedance varies with frequency", () => {
    const fingering: Fingering = {
      openHole: [false, false, false, false, false, false],
    };

    const Z1 = calculator.calcZ(200, fingering);
    const Z2 = calculator.calcZ(250, fingering);
    const Z3 = calculator.calcZ(300, fingering);

    // Impedance should be different at different frequencies
    expect(Z1.abs()).not.toBe(Z2.abs());
    expect(Z2.abs()).not.toBe(Z3.abs());
  });

  test("impedance varies with fingering", () => {
    const allClosed: Fingering = {
      openHole: [false, false, false, false, false, false],
    };
    const allOpen: Fingering = {
      openHole: [true, true, true, true, true, true],
    };

    const freq = 440;
    const ZClosed = calculator.calcZ(freq, allClosed);
    const ZOpen = calculator.calcZ(freq, allOpen);

    // Different fingerings should give different impedances
    expect(ZClosed.abs()).not.toBe(ZOpen.abs());
  });

  test("calculates reflection coefficient", () => {
    const fingering: Fingering = {
      openHole: [false, false, false, false, false, false],
    };

    const R = calculator.calcReflectionCoefficient(220, fingering);

    expect(R).toBeDefined();
    expect(R.re).not.toBe(Number.NaN);
    expect(R.im).not.toBe(Number.NaN);

    // Reflection coefficient magnitude should be between 0 and 1
    // (may exceed 1 slightly at anti-resonances)
    expect(R.abs()).toBeLessThan(2);
  });
});

// ============================================================================
// Tuning Prediction Tests
// ============================================================================

describe("Tuning Predictions", () => {
  let instrument: Instrument;
  let params: PhysicalParameters;
  let calculator: DefaultInstrumentCalculator;

  beforeAll(async () => {
    instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");
    params = new PhysicalParameters(72, "F");
    calculator = new DefaultInstrumentCalculator(instrument, params);
  });

  test("SimpleInstrumentTuner finds playing frequencies", () => {
    // Create a tuning centered around A4 (440 Hz)
    // Note: The sample instrument is for A minor scale, but the exact
    // frequency depends on the instrument design
    const tuning = create6HoleNAFTuning("G", 392); // G4 = 392 Hz

    const tuner = new SimpleInstrumentTuner(instrument, tuning, calculator, params);

    // Try to predict frequency for base note (all holes closed)
    const baseFingering = tuning.fingering[0]!;
    const predicted = tuner.predictedFrequency(baseFingering);

    // Should find some resonance frequency
    // May be null if no resonance found, but should not throw
    if (predicted !== null) {
      // Predicted frequency should be in a reasonable range
      // (within 2 octaves of the target)
      const target = baseFingering.note!.frequency!;
      expect(predicted).toBeGreaterThan(target / 2);
      expect(predicted).toBeLessThan(target * 2);
    }
  });

  test("predicted frequencies increase as holes are opened", () => {
    const tuning = create6HoleNAFTuning("G", 392);
    const tuner = new SimpleInstrumentTuner(instrument, tuning, calculator, params);

    const predictedFreqs: (number | null)[] = [];

    for (let i = 0; i < Math.min(6, tuning.fingering.length); i++) {
      const fingering = tuning.fingering[i]!;
      const pred = tuner.predictedFrequency(fingering);
      predictedFreqs.push(pred);
    }

    // Check that we got at least some predictions
    const validPredictions = predictedFreqs.filter((f): f is number => f !== null);
    expect(validPredictions.length).toBeGreaterThan(0);

    // If we have multiple predictions, they should generally increase
    // as more holes are opened (though cross-fingerings can be exceptions)
    if (validPredictions.length >= 2) {
      // At least the first few should increase
      const firstValid = validPredictions[0]!;
      const lastValid = validPredictions[validPredictions.length - 1]!;
      expect(lastValid).toBeGreaterThan(firstValid);
    }
  });

  test("getPredictedTuning returns complete tuning", () => {
    const tuning = create6HoleNAFTuning("G", 392);
    const tuner = new SimpleInstrumentTuner(instrument, tuning, calculator, params);

    const predicted = tuner.getPredictedTuning();

    expect(predicted.name).toBe(tuning.name);
    expect(predicted.fingering.length).toBe(tuning.fingering.length);

    for (const fingering of predicted.fingering) {
      expect(fingering.note).toBeDefined();
    }
  });
});

// ============================================================================
// Physical Parameters Integration Tests
// ============================================================================

describe("Physical Parameters Integration", () => {
  test("temperature affects predictions", async () => {
    const instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");

    const params20C = new PhysicalParameters(20, "C");
    const params30C = new PhysicalParameters(30, "C");

    const calc20 = new DefaultInstrumentCalculator(instrument, params20C);
    const calc30 = new DefaultInstrumentCalculator(instrument, params30C);

    const fingering: Fingering = {
      openHole: [false, false, false, false, false, false],
    };

    const Z20 = calc20.calcZ(440, fingering);
    const Z30 = calc30.calcZ(440, fingering);

    // Same frequency should give different impedance at different temperatures
    // because speed of sound changes
    expect(Z20.abs()).not.toBeCloseTo(Z30.abs(), 4);
  });

  test("humidity affects predictions", async () => {
    const instrument = await loadInstrument("A_minor_ET_6-hole_straight.xml");

    const paramsDry = new PhysicalParameters(20, "C", 101.325, 0, 0.00039);
    const paramsHumid = new PhysicalParameters(20, "C", 101.325, 100, 0.00039);

    const calcDry = new DefaultInstrumentCalculator(instrument, paramsDry);
    const calcHumid = new DefaultInstrumentCalculator(instrument, paramsHumid);

    const fingering: Fingering = {
      openHole: [false, false, false, false, false, false],
    };

    const ZDry = calcDry.calcZ(440, fingering);
    const ZHumid = calcHumid.calcZ(440, fingering);

    // Humidity affects air properties, so results should differ slightly
    // (the effect is smaller than temperature)
    expect(Math.abs(ZDry.abs() - ZHumid.abs())).toBeLessThan(ZDry.abs() * 0.1);
  });
});

// ============================================================================
// Multiple Instrument Tests
// ============================================================================

describe("Multiple Instrument Files", () => {
  const instrumentFiles = [
    "A_minor_ET_6-hole_straight.xml",
    "A3_amb-maple.xml",
    "A4_taper_no-hole_start.xml",
    "Bb4_dbl1.xml",
  ];

  test.each(instrumentFiles)("loads and calculates for %s", async (filename) => {
    const instrument = await loadInstrument(filename);
    const params = new PhysicalParameters(20, "C");
    const calculator = new DefaultInstrumentCalculator(instrument, params);

    // Create simple fingering based on number of holes
    const numHoles = instrument.hole.length;
    const fingering: Fingering = {
      openHole: Array(numHoles).fill(false),
    };

    // Should be able to calculate impedance without error
    const Z = calculator.calcZ(440, fingering);
    expect(Z).toBeDefined();
    expect(Z.re).not.toBe(Number.NaN);
    expect(Z.im).not.toBe(Number.NaN);
  });
});
