/**
 * Tests for Tube class
 *
 * These tests verify the transfer matrix calculations for
 * cylindrical and conical tube segments.
 */

import { describe, test, expect } from "bun:test";
import { Tube, MINIMUM_CONE_LENGTH } from "../../../src/core/geometry/tube.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { Complex } from "../../../src/core/math/complex.ts";

describe("Tube", () => {
  const params = new PhysicalParameters(20, "C");

  describe("MINIMUM_CONE_LENGTH", () => {
    test("minimum cone length is very small positive number", () => {
      expect(MINIMUM_CONE_LENGTH).toBeGreaterThan(0);
      expect(MINIMUM_CONE_LENGTH).toBeLessThan(0.001);
    });
  });

  describe("calcZload (unflanged open end)", () => {
    test("returns complex impedance", () => {
      const z = Tube.calcZload(440, 0.01, params);
      expect(z).toBeInstanceOf(Complex);
    });

    test("real part is positive (radiation resistance)", () => {
      const z = Tube.calcZload(440, 0.01, params);
      expect(z.re).toBeGreaterThan(0);
    });

    test("imaginary part is positive (radiation reactance)", () => {
      const z = Tube.calcZload(440, 0.01, params);
      expect(z.im).toBeGreaterThan(0);
    });

    test("impedance increases with frequency", () => {
      const z_low = Tube.calcZload(220, 0.01, params);
      const z_high = Tube.calcZload(880, 0.01, params);
      expect(z_high.abs()).toBeGreaterThan(z_low.abs());
    });

    test("impedance decreases with larger radius", () => {
      const z_small = Tube.calcZload(440, 0.005, params);
      const z_large = Tube.calcZload(440, 0.02, params);
      expect(z_small.abs()).toBeGreaterThan(z_large.abs());
    });
  });

  describe("calcZflanged (infinite flange)", () => {
    test("returns complex impedance", () => {
      const z = Tube.calcZflanged(440, 0.01, params);
      expect(z).toBeInstanceOf(Complex);
    });

    test("flanged impedance is larger than unflanged", () => {
      const z_unflanged = Tube.calcZload(440, 0.01, params);
      const z_flanged = Tube.calcZflanged(440, 0.01, params);
      // Flanged radiation is more efficient, so impedance is larger
      expect(z_flanged.abs()).toBeGreaterThan(z_unflanged.abs());
    });
  });

  describe("calcZflangedKergomard", () => {
    test("returns complex impedance", () => {
      const z = Tube.calcZflangedKergomard(440, 0.01, params);
      expect(z).toBeInstanceOf(Complex);
    });

    test("similar to calcZflanged at low frequencies", () => {
      const z1 = Tube.calcZflanged(220, 0.01, params);
      const z2 = Tube.calcZflangedKergomard(220, 0.01, params);
      // Should be similar (within factor of 2)
      expect(z2.abs() / z1.abs()).toBeGreaterThan(0.5);
      expect(z2.abs() / z1.abs()).toBeLessThan(2);
    });
  });

  describe("calcR (radiation resistance)", () => {
    test("returns positive resistance", () => {
      const R = Tube.calcR(440, 0.01, params);
      expect(R).toBeGreaterThan(0);
    });

    test("resistance increases with frequency", () => {
      const R_low = Tube.calcR(220, 0.01, params);
      const R_high = Tube.calcR(880, 0.01, params);
      expect(R_high).toBeGreaterThan(R_low);
    });
  });

  describe("calcCylinderMatrix", () => {
    test("returns identity-like matrix for zero length", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcCylinderMatrix(k, 0.0001, 0.01, params);

      // For very short length, should be close to identity
      expect(tm.getPP().re).toBeCloseTo(1, 2);
      expect(tm.getUU().re).toBeCloseTo(1, 2);
    });

    test("determinant is approximately 1 (reciprocity)", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcCylinderMatrix(k, 0.1, 0.01, params);
      const det = tm.determinant();

      // For a passive reciprocal network, det should be close to 1
      // (not exactly 1 due to losses)
      expect(det.abs()).toBeCloseTo(1, 1);
    });

    test("PP and UU are cosh terms (equal)", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcCylinderMatrix(k, 0.1, 0.01, params);

      // In cylinder matrix, PP = UU = cosh(γL)
      expect(tm.getPP().re).toBeCloseTo(tm.getUU().re, 6);
      expect(tm.getPP().im).toBeCloseTo(tm.getUU().im, 6);
    });

    test("quarter wavelength gives specific impedance transformation", () => {
      const freq = 440;
      const k = params.calcWaveNumber(freq);
      const wavelength = (2 * Math.PI) / k;
      const quarterWave = wavelength / 4;
      const radius = 0.01;

      const tm = Tube.calcCylinderMatrix(k, quarterWave, radius, params);

      // At quarter wavelength, cos(kL) ≈ 0, sin(kL) ≈ 1
      // So PP ≈ cosh(εkL) ≈ 1, PU ≈ jZ0*sinh(...), etc.
      // The diagonal terms should be small compared to off-diagonal
      expect(tm.getPU().abs()).toBeGreaterThan(tm.getPP().abs() * 0.1);
    });
  });

  describe("calcConeMatrix", () => {
    test("reduces to cylinder for equal radii", () => {
      const k = params.calcWaveNumber(440);
      const length = 0.1;
      const radius = 0.01;

      const cylinderTm = Tube.calcCylinderMatrix(k, length, radius, params);
      const coneTm = Tube.calcConeMatrix(k, length, radius, radius, params);

      // Should be identical
      expect(coneTm.getPP().re).toBeCloseTo(cylinderTm.getPP().re, 8);
      expect(coneTm.getPP().im).toBeCloseTo(cylinderTm.getPP().im, 8);
      expect(coneTm.getPU().re).toBeCloseTo(cylinderTm.getPU().re, 8);
      expect(coneTm.getUU().re).toBeCloseTo(cylinderTm.getUU().re, 8);
    });

    test("determinant is approximately 1", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcConeMatrix(k, 0.1, 0.01, 0.015, params);
      const det = tm.determinant();

      expect(det.abs()).toBeCloseTo(1, 1);
    });

    test("handles expanding cone", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcConeMatrix(k, 0.1, 0.008, 0.012, params);

      // Should produce valid transfer matrix
      expect(tm.getPP()).toBeInstanceOf(Complex);
      expect(tm.getPU()).toBeInstanceOf(Complex);
      expect(tm.getUP()).toBeInstanceOf(Complex);
      expect(tm.getUU()).toBeInstanceOf(Complex);
    });

    test("handles contracting cone", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcConeMatrix(k, 0.1, 0.012, 0.008, params);

      // Should produce valid transfer matrix
      expect(tm.getPP()).toBeInstanceOf(Complex);
      expect(Number.isNaN(tm.getPP().re)).toBe(false);
    });

    test("handles very short cone", () => {
      const k = params.calcWaveNumber(440);
      // Length less than MINIMUM_CONE_LENGTH
      const tm = Tube.calcConeMatrix(k, 0.000001, 0.01, 0.012, params);

      // Should still produce valid matrix
      expect(Number.isNaN(tm.getPP().re)).toBe(false);
      expect(Number.isFinite(tm.getPP().re)).toBe(true);
    });

    test("asymmetric when radii differ", () => {
      const k = params.calcWaveNumber(440);
      const tm = Tube.calcConeMatrix(k, 0.1, 0.01, 0.015, params);

      // PP and UU should be different for a cone
      // (unlike cylinder where PP = UU)
      const ppEqualsUu =
        Math.abs(tm.getPP().re - tm.getUU().re) < 0.001 &&
        Math.abs(tm.getPP().im - tm.getUU().im) < 0.001;
      expect(ppEqualsUu).toBe(false);
    });
  });

  describe("physical consistency", () => {
    test("chained cylinders equal single cylinder", () => {
      const k = params.calcWaveNumber(440);
      const radius = 0.01;
      const totalLength = 0.2;

      // Single cylinder
      const single = Tube.calcCylinderMatrix(k, totalLength, radius, params);

      // Two chained cylinders
      const half1 = Tube.calcCylinderMatrix(k, totalLength / 2, radius, params);
      const half2 = Tube.calcCylinderMatrix(k, totalLength / 2, radius, params);
      const chained = half1.multiply(half2);

      // Should be very close
      expect(chained.getPP().re).toBeCloseTo(single.getPP().re, 4);
      expect(chained.getPP().im).toBeCloseTo(single.getPP().im, 4);
    });

    test("chained cones preserve impedance transformation", () => {
      const k = params.calcWaveNumber(440);
      const r1 = 0.008;
      const r2 = 0.012;
      const r3 = 0.016;
      const len = 0.05;

      // Chain: r1->r2->r3
      const cone1 = Tube.calcConeMatrix(k, len, r1, r2, params);
      const cone2 = Tube.calcConeMatrix(k, len, r2, r3, params);
      const chained = cone1.multiply(cone2);

      // Should produce valid result
      expect(Number.isNaN(chained.getPP().re)).toBe(false);
      expect(chained.determinant().abs()).toBeCloseTo(1, 0);
    });
  });
});
