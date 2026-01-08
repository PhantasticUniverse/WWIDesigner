/**
 * Tests for HoleCalculator classes
 *
 * These tests verify that tone hole transfer matrices are
 * calculated correctly using Lefebvre-Scavone 2012 formulas.
 */

import { describe, test, expect } from "bun:test";
import {
  DefaultHoleCalculator,
  defaultHoleCalculator,
  DEFAULT_FINGER_ADJ,
  NO_FINGER_ADJ,
} from "../../../src/core/geometry/hole-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import type { Hole } from "../../../src/models/instrument.ts";

describe("DefaultHoleCalculator", () => {
  const params = new PhysicalParameters(20, "C");
  const freq = 440; // A4
  const waveNumber = params.calcWaveNumber(freq);

  // Create a typical tone hole
  const createHole = (diameter: number, height: number, boreDiameter: number): Hole => ({
    position: 0.1,
    diameter,
    height,
    boreDiameter,
  });

  describe("construction", () => {
    test("default constructor uses standard parameters", () => {
      const calc = new DefaultHoleCalculator();
      expect(calc.getFingerAdjustment()).toBe(DEFAULT_FINGER_ADJ);
      expect(calc.getHoleSizeMult()).toBe(1.0);
      expect(calc.getIsPlugged()).toBe(false);
    });

    test("can set custom finger adjustment", () => {
      const calc = new DefaultHoleCalculator(1.0, false, NO_FINGER_ADJ);
      expect(calc.getFingerAdjustment()).toBe(0);
    });

    test("can set plugged state", () => {
      const calc = new DefaultHoleCalculator(1.0, true);
      expect(calc.getIsPlugged()).toBe(true);
    });
  });

  describe("open hole transfer matrix", () => {
    test("returns valid transfer matrix for open hole", () => {
      const hole = createHole(0.008, 0.004, 0.016); // 8mm diameter, 4mm height, 16mm bore
      const tm = defaultHoleCalculator.calcTransferMatrix(hole, true, waveNumber, params);

      // Transfer matrix should be valid
      expect(tm).toBeDefined();

      // A element should be close to 1 for small holes
      const A = tm.getPP();
      expect(A.re).toBeGreaterThan(0.9);
      expect(A.re).toBeLessThan(1.1);
    });

    test("open hole has non-zero shunt admittance (C element)", () => {
      const hole = createHole(0.008, 0.004, 0.016);
      const tm = defaultHoleCalculator.calcTransferMatrix(hole, true, waveNumber, params);

      // C element (shunt admittance) should be non-zero for open hole
      const C = tm.getUP();
      expect(C.abs()).toBeGreaterThan(0);
    });

    test("larger hole has higher admittance", () => {
      const smallHole = createHole(0.006, 0.004, 0.016);
      const largeHole = createHole(0.010, 0.004, 0.016);

      const tmSmall = defaultHoleCalculator.calcTransferMatrix(smallHole, true, waveNumber, params);
      const tmLarge = defaultHoleCalculator.calcTransferMatrix(largeHole, true, waveNumber, params);

      // Larger hole should have higher admittance magnitude
      expect(tmLarge.getUP().abs()).toBeGreaterThan(tmSmall.getUP().abs());
    });
  });

  describe("closed hole transfer matrix", () => {
    test("returns valid transfer matrix for closed hole", () => {
      const hole = createHole(0.008, 0.004, 0.016);
      const tm = defaultHoleCalculator.calcTransferMatrix(hole, false, waveNumber, params);

      expect(tm).toBeDefined();
    });

    test("closed hole has lower admittance than open", () => {
      const hole = createHole(0.008, 0.004, 0.016);

      const tmOpen = defaultHoleCalculator.calcTransferMatrix(hole, true, waveNumber, params);
      const tmClosed = defaultHoleCalculator.calcTransferMatrix(hole, false, waveNumber, params);

      // Closed hole should have lower admittance magnitude
      expect(tmClosed.getUP().abs()).toBeLessThan(tmOpen.getUP().abs());
    });

    test("finger adjustment affects closed hole", () => {
      const hole = createHole(0.008, 0.004, 0.016);

      const calcWithAdj = new DefaultHoleCalculator(1.0, false, DEFAULT_FINGER_ADJ);
      const calcNoAdj = new DefaultHoleCalculator(1.0, false, NO_FINGER_ADJ);

      const tmWithAdj = calcWithAdj.calcTransferMatrix(hole, false, waveNumber, params);
      const tmNoAdj = calcNoAdj.calcTransferMatrix(hole, false, waveNumber, params);

      // Results should be different due to finger adjustment
      // Both are small values, so check relative difference is significant
      const ratio = tmWithAdj.getUP().im / tmNoAdj.getUP().im;
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.1); // At least 10% difference
    });
  });

  describe("plugged hole", () => {
    test("plugged hole has zero admittance", () => {
      const hole = createHole(0.008, 0.004, 0.016);
      const calc = new DefaultHoleCalculator(1.0, true);

      const tm = calc.calcTransferMatrix(hole, false, waveNumber, params);

      // Plugged hole should have zero admittance
      expect(tm.getUP().abs()).toBe(0);
    });
  });

  describe("hole with key", () => {
    test("keyed hole uses different formula than finger-closed", () => {
      const fingerHole: Hole = {
        position: 0.1,
        diameter: 0.008,
        height: 0.004,
        boreDiameter: 0.016,
      };

      const keyedHole: Hole = {
        position: 0.1,
        diameter: 0.008,
        height: 0.004,
        boreDiameter: 0.016,
        key: {
          diameter: 0.012,
          holeDiameter: 0.008,
          height: 0.002,
          thickness: 0.001,
          wallThickness: 0.002,
          chimneyHeight: 0.003,
        },
      };

      const tmFinger = defaultHoleCalculator.calcTransferMatrix(fingerHole, false, waveNumber, params);
      const tmKeyed = defaultHoleCalculator.calcTransferMatrix(keyedHole, false, waveNumber, params);

      // Results should be different - keyed hole uses different ta formula
      // Both are small values, so check relative difference is significant
      const ratio = tmFinger.getUP().im / tmKeyed.getUP().im;
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.1); // At least 10% difference
    });
  });

  describe("frequency dependence", () => {
    test("transfer matrix varies with frequency", () => {
      const hole = createHole(0.008, 0.004, 0.016);

      const k440 = params.calcWaveNumber(440);
      const k880 = params.calcWaveNumber(880);

      const tm440 = defaultHoleCalculator.calcTransferMatrix(hole, true, k440, params);
      const tm880 = defaultHoleCalculator.calcTransferMatrix(hole, true, k880, params);

      // Results should be different at different frequencies
      expect(tm440.getUP().abs()).not.toBeCloseTo(tm880.getUP().abs(), 6);
    });
  });

  describe("hole size multiplier", () => {
    test("hole size multiplier scales effective hole diameter", () => {
      const hole = createHole(0.008, 0.004, 0.016);

      const calc1 = new DefaultHoleCalculator(1.0);
      const calc2 = new DefaultHoleCalculator(1.2);

      const tm1 = calc1.calcTransferMatrix(hole, true, waveNumber, params);
      const tm2 = calc2.calcTransferMatrix(hole, true, waveNumber, params);

      // Larger effective hole should have higher admittance
      expect(tm2.getUP().abs()).toBeGreaterThan(tm1.getUP().abs());
    });
  });
});
