/**
 * Tests for PlayingRange class
 *
 * These tests verify that the PlayingRange class correctly finds
 * resonance frequencies where impedance reactance crosses zero.
 */

import { describe, test, expect } from "bun:test";
import {
  PlayingRange,
  NoPlayingRange,
} from "../../../src/core/modelling/playing-range.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Fingering } from "../../../src/models/tuning.ts";

describe("PlayingRange", () => {
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

  const allClosed: Fingering = {
    openHole: [false, false, false, false, false, false],
  };

  const allOpen: Fingering = {
    openHole: [true, true, true, true, true, true],
  };

  describe("construction", () => {
    test("creates PlayingRange from calculator and fingering", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      expect(range).toBeInstanceOf(PlayingRange);
      expect(range.getFingering()).toBe(allClosed);
    });
  });

  describe("findXZero", () => {
    test("finds frequency where Im(Z) = 0", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // For all closed, expect a low frequency resonance
      const freq = range.findXZero(300);

      expect(freq).toBeGreaterThan(200);
      expect(freq).toBeLessThan(600);

      // Verify that Im(Z) is near zero at the found frequency
      const Z = calc.calcZ(freq, allClosed);
      expect(Math.abs(Z.im)).toBeLessThan(Math.abs(Z.re) * 0.1);
    });

    test("finds different resonances for different fingerings", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const rangeClosed = new PlayingRange(calc, allClosed);
      const rangeOpen = new PlayingRange(calc, allOpen);

      const freqClosed = rangeClosed.findXZero(300);
      const freqOpen = rangeOpen.findXZero(600);

      // Open holes should give higher frequency
      expect(freqOpen).toBeGreaterThan(freqClosed);
    });

    test("finds resonance near target frequency", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // Search near a specific target
      const target = 350;
      const freq = range.findXZero(target);

      // Should be within an octave (factor of 2)
      expect(freq).toBeGreaterThan(target / 2);
      expect(freq).toBeLessThan(target * 2);
    });

    test("throws NoPlayingRange for unreachable frequency", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // Searching for very high frequency with all closed may fail
      expect(() => range.findXZero(10000)).toThrow(NoPlayingRange);
    });
  });

  describe("findBracket", () => {
    test("finds bracket for reactance zero", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // Access the internal bracket finding
      const reactanceFunc = {
        value: (f: number) => calc.calcZ(f, allClosed).im,
        valueFromZ: (z: { im: number }) => z.im,
      };

      const bracket = range.findBracket(300, reactanceFunc);

      expect(bracket[0]).toBeLessThan(bracket[1]);
      expect(bracket[0]).toBeGreaterThan(0);

      // Check that function values have opposite signs at bracket ends
      const f0 = calc.calcZ(bracket[0], allClosed).im;
      const f1 = calc.calcZ(bracket[1], allClosed).im;
      expect(f0 * f1).toBeLessThan(0);
    });
  });

  describe("fingering management", () => {
    test("setFingering changes the fingering", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      expect(range.getFingering()).toBe(allClosed);

      range.setFingering(allOpen);
      expect(range.getFingering()).toBe(allOpen);
    });

    test("different fingering gives different resonance", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      const freq1 = range.findXZero(300);

      range.setFingering(allOpen);
      const freq2 = range.findXZero(600);

      expect(freq1).not.toBeCloseTo(freq2, 0);
    });
  });

  describe("NoPlayingRange exception", () => {
    test("contains frequency information", () => {
      const error = new NoPlayingRange(440);

      expect(error.freq).toBe(440);
      expect(error.message).toContain("440");
      expect(error.name).toBe("NoPlayingRange");
    });
  });

  describe("findX with target reactance", () => {
    test("finds frequency with specific reactance", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // Find a frequency with small positive reactance
      const targetX = 100;
      const freq = range.findX(300, targetX);

      // Verify the reactance is close to target
      const Z = calc.calcZ(freq, allClosed);
      expect(Math.abs(Z.im - targetX)).toBeLessThan(1);
    });
  });

  describe("findZRatio", () => {
    test("finds frequency with specific Im(Z)/Re(Z) ratio", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);
      const range = new PlayingRange(calc, allClosed);

      // Find frequency where Im(Z)/Re(Z) = 0 (same as findXZero when Re(Z) != 0)
      const freq = range.findZRatio(300, 0);

      expect(freq).toBeGreaterThan(200);
      expect(freq).toBeLessThan(600);
    });
  });
});
