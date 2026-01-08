/**
 * Tests for calculator factory.
 *
 * Verifies that the factory creates correctly-configured calculators
 * for different instrument types.
 */

import { describe, test, expect } from "bun:test";
import {
  createCalculator,
  createNAFCalculator,
  createWhistleCalculator,
  createFluteCalculator,
  detectCalculatorType,
  isCompatible,
  type CalculatorType,
} from "../../src/core/modelling/calculator-factory.ts";
import { PhysicalParameters } from "../../src/core/physics/physical-parameters.ts";
import { parseInstrumentXml } from "../../src/utils/xml-converter.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";
const OPTIMIZATION_PATH = "tests/parity/fixtures/java-examples/optimization";

async function loadInstrument(path: string) {
  const file = Bun.file(path);
  return parseInstrumentXml(await file.text());
}

describe("Calculator Factory", () => {
  describe("detectCalculatorType", () => {
    test("detects NAF from instrument name", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      expect(detectCalculatorType(instrument)).toBe("naf");
    });

    test("detects whistle from instrument name", async () => {
      const instrument = await loadInstrument(
        `${OPTIMIZATION_PATH}/BP7.xml`
      );
      // BP7 has "Whistle" in its name
      expect(detectCalculatorType(instrument)).toBe("whistle");
    });

    test("defaults fipple without specific name to naf", async () => {
      // Create a generic fipple instrument
      const instrument = {
        name: "Generic Fipple Instrument",
        mouthpiece: {
          position: 0,
          fipple: {
            windowLength: 10,
            windowWidth: 8,
          },
        },
        borePoint: [{ borePosition: 0, boreDiameter: 10 }],
        hole: [],
        termination: {},
      };
      expect(detectCalculatorType(instrument)).toBe("naf");
    });
  });

  describe("isCompatible", () => {
    test("NAF is compatible with fipple instrument", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      expect(isCompatible(instrument, "naf")).toBe(true);
      expect(isCompatible(instrument, "whistle")).toBe(true);
      expect(isCompatible(instrument, "flute")).toBe(false);
    });

    test("auto is always compatible", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      expect(isCompatible(instrument, "auto")).toBe(true);
    });
  });

  describe("createCalculator", () => {
    test("creates NAF calculator with correct settings", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      const params = new PhysicalParameters(72, "F");

      const calc = createNAFCalculator(instrument, params);

      expect(calc).toBeDefined();
      expect(calc.getInstrument()).toBeDefined();
      expect(calc.getParams()).toBe(params);
    });

    test("creates Whistle calculator with correct settings", async () => {
      const instrument = await loadInstrument(
        `${OPTIMIZATION_PATH}/BP7.xml`
      );
      const params = new PhysicalParameters(27, "C");

      const calc = createWhistleCalculator(instrument, params);

      expect(calc).toBeDefined();
      expect(calc.getInstrument()).toBeDefined();
    });

    test("auto-detection uses correct calculator for NAF", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      const params = new PhysicalParameters(72, "F");

      // Auto should detect NAF
      const autoCalc = createCalculator(instrument, params, "auto");
      const nafCalc = createNAFCalculator(instrument, params);

      // Both should produce the same impedance at a test frequency
      const fingering = { openHole: [false, false, false, false, false, false] };
      const testFreq = 289.42;

      const autoZ = autoCalc.calcZ(testFreq, fingering);
      const nafZ = nafCalc.calcZ(testFreq, fingering);

      // Should be identical since auto should detect NAF
      expect(autoZ.re).toBeCloseTo(nafZ.re, 10);
      expect(autoZ.im).toBeCloseTo(nafZ.im, 10);
    });

    test("auto-detection uses correct calculator for Whistle", async () => {
      const instrument = await loadInstrument(
        `${OPTIMIZATION_PATH}/BP7.xml`
      );
      const params = new PhysicalParameters(27, "C");

      // Auto should detect Whistle
      const autoCalc = createCalculator(instrument, params, "auto");
      const whistleCalc = createWhistleCalculator(instrument, params);

      // Both should produce the same impedance at a test frequency
      const fingering = { openHole: [true, true, true, true, true, true] };
      const testFreq = 589;

      const autoZ = autoCalc.calcZ(testFreq, fingering);
      const whistleZ = whistleCalc.calcZ(testFreq, fingering);

      // Should be identical since auto should detect Whistle
      expect(autoZ.re).toBeCloseTo(whistleZ.re, 10);
      expect(autoZ.im).toBeCloseTo(whistleZ.im, 10);
    });

    test("explicit type overrides auto-detection", async () => {
      const instrument = await loadInstrument(
        `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
      );
      const params = new PhysicalParameters(72, "F");

      // Force whistle calculator on NAF instrument (not recommended, but should work)
      const whistleCalc = createCalculator(instrument, params, "whistle");
      const nafCalc = createCalculator(instrument, params, "naf");

      // They should give DIFFERENT results (different sub-calculators)
      const fingering = { openHole: [false, false, false, false, false, false] };
      const testFreq = 289.42;

      const whistleZ = whistleCalc.calcZ(testFreq, fingering);
      const nafZ = nafCalc.calcZ(testFreq, fingering);

      // Results should be different due to different calculators
      // (SimpleFipple vs DefaultFipple, Unflanged vs ThickFlanged)
      expect(whistleZ.re).not.toBeCloseTo(nafZ.re, 5);
    });
  });
});
