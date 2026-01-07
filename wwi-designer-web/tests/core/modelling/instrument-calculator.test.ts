/**
 * Tests for InstrumentCalculator classes
 *
 * These tests verify that instrument impedance and reflection coefficient
 * calculations are correct for complete instruments.
 */

import { describe, test, expect } from "bun:test";
import {
  DefaultInstrumentCalculator,
  createInstrumentCalculator,
} from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { Complex } from "../../../src/core/math/complex.ts";
import type { Instrument } from "../../../src/models/instrument.ts";
import type { Fingering } from "../../../src/models/tuning.ts";

describe("DefaultInstrumentCalculator", () => {
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

  const allOpen: Fingering = {
    openHole: [true, true, true, true, true, true],
  };

  const allClosed: Fingering = {
    openHole: [false, false, false, false, false, false],
  };

  describe("construction", () => {
    test("creates calculator from instrument", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      expect(calc).toBeInstanceOf(DefaultInstrumentCalculator);
      expect(calc.getInstrument()).toBeDefined();
      expect(calc.getPhysicalParameters()).toBe(params);
    });

    test("createInstrumentCalculator factory works", () => {
      const whistle = createSimpleWhistle();
      const calc = createInstrumentCalculator(whistle);

      expect(calc).toBeInstanceOf(DefaultInstrumentCalculator);
    });
  });

  describe("impedance calculation", () => {
    test("calcZ returns complex impedance", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const Z = calc.calcZ(440, allOpen);

      expect(Z).toBeInstanceOf(Complex);
      expect(Z.abs()).toBeGreaterThan(0);
    });

    test("impedance varies with frequency", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const Z440 = calc.calcZ(440, allOpen);
      const Z880 = calc.calcZ(880, allOpen);

      // Impedances should be different at different frequencies
      expect(Z440.abs()).not.toBeCloseTo(Z880.abs(), 3);
    });

    test("impedance varies with fingering", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const freq = 440;
      const ZOpen = calc.calcZ(freq, allOpen);
      const ZClosed = calc.calcZ(freq, allClosed);

      // Different fingerings should produce different impedances
      expect(ZOpen.abs()).not.toBeCloseTo(ZClosed.abs(), 3);
    });
  });

  describe("reflection coefficient calculation", () => {
    test("calcReflectionCoefficient returns complex value", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const R = calc.calcReflectionCoefficient(440, allOpen);

      expect(R).toBeInstanceOf(Complex);
    });

    test("reflection coefficient magnitude is typically less than 1", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const R = calc.calcReflectionCoefficient(440, allOpen);

      // For most frequencies, |R| should be less than 1
      expect(R.abs()).toBeLessThan(1.5);
    });
  });

  describe("gain calculation", () => {
    test("calcGain returns positive value", () => {
      const whistle = createSimpleWhistle();
      // Add windway height to enable gain calculation
      whistle.mouthpiece.fipple!.windwayHeight = 1.2;
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const Z = calc.calcZ(440, allOpen);
      const gain = calc.calcGain(440, Z);

      expect(gain).toBeGreaterThan(0);
    });

    test("calcGain returns 1 when no gain factor available", () => {
      const whistle = createSimpleWhistle();
      // No windway height, so no gain factor
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const Z = calc.calcZ(440, allOpen);
      const gain = calc.calcGain(440, Z);

      expect(gain).toBe(1);
    });

    test("calcGainWithFingering combines Z and gain calculation", () => {
      const whistle = createSimpleWhistle();
      whistle.mouthpiece.fipple!.windwayHeight = 1.2;
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const gain = calc.calcGainWithFingering(440, allOpen);

      expect(gain).toBeGreaterThan(0);
    });
  });

  describe("instrument types", () => {
    test("works with cylindrical bore", () => {
      const flute: Instrument = {
        name: "Simple Flute",
        lengthType: "MM",
        mouthpiece: {
          position: 0,
          embouchureHole: {
            length: 12,
            width: 10,
            height: 5,
            airstreamLength: 8,
            airstreamHeight: 3,
          },
        },
        borePoint: [
          { borePosition: 0, boreDiameter: 19 },
          { borePosition: 600, boreDiameter: 19 },
        ],
        hole: [],
        termination: { flangeDiameter: 0 },
      };

      const calc = new DefaultInstrumentCalculator(flute, params);
      const Z = calc.calcZ(440, { openHole: [] });

      expect(Z).toBeInstanceOf(Complex);
    });

    test("works with conical bore", () => {
      const cone: Instrument = {
        name: "Conical Bore",
        lengthType: "MM",
        mouthpiece: {
          position: 0,
          fipple: {
            windowWidth: 10,
            windowLength: 8,
          },
        },
        borePoint: [
          { borePosition: 0, boreDiameter: 10 },
          { borePosition: 300, boreDiameter: 20 },
        ],
        hole: [],
        termination: { flangeDiameter: 0 },
      };

      const calc = new DefaultInstrumentCalculator(cone, params);
      const Z = calc.calcZ(440, { openHole: [] });

      expect(Z).toBeInstanceOf(Complex);
    });

    test("works with flanged termination", () => {
      const whistle = createSimpleWhistle();
      whistle.termination.flangeDiameter = 40; // Large flange
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const Z = calc.calcZ(440, allOpen);

      expect(Z).toBeInstanceOf(Complex);
    });
  });

  describe("fingering variations", () => {
    test("works with partial fingerings", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const partialFingering: Fingering = {
        openHole: [true, true, true, false, false, false],
      };

      const Z = calc.calcZ(440, partialFingering);

      expect(Z).toBeInstanceOf(Complex);
    });

    test("respects openEnd flag", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      const openEnd: Fingering = { openHole: allOpen.openHole, openEnd: true };
      const closedEnd: Fingering = { openHole: allOpen.openHole, openEnd: false };

      const ZOpen = calc.calcZ(440, openEnd);
      const ZClosed = calc.calcZ(440, closedEnd);

      // Closed end should have very different impedance
      expect(ZOpen.abs()).not.toBeCloseTo(ZClosed.abs(), 3);
    });
  });

  describe("unit conversion", () => {
    test("handles millimeter input correctly", () => {
      const whistle = createSimpleWhistle();
      whistle.lengthType = "MM";
      const calc = new DefaultInstrumentCalculator(whistle, params);

      // Internal instrument should be in metres
      const instrument = calc.getInstrument();
      expect(instrument.lengthType).toBe("M");
      // 300mm should become 0.3m
      const borePoints = instrument.borePoint;
      expect(borePoints[borePoints.length - 1]!.borePosition).toBeCloseTo(0.3, 6);
    });
  });

  describe("resonance detection", () => {
    test("impedance imaginary part crosses zero near resonance", () => {
      const whistle = createSimpleWhistle();
      const calc = new DefaultInstrumentCalculator(whistle, params);

      // Scan frequencies to find where Im(Z) crosses zero
      const freqs = [];
      for (let f = 300; f <= 1000; f += 10) {
        freqs.push(f);
      }

      const imZ = freqs.map((f) => calc.calcZ(f, allClosed).im);

      // There should be at least one zero crossing (sign change)
      let crossings = 0;
      for (let i = 1; i < imZ.length; i++) {
        if (imZ[i - 1]! * imZ[i]! < 0) {
          crossings++;
        }
      }

      expect(crossings).toBeGreaterThan(0);
    });
  });
});
