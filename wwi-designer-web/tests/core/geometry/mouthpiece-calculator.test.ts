/**
 * Tests for MouthpieceCalculator classes
 *
 * These tests verify that mouthpiece impedance calculations are correct
 * for fipple and embouchure mouthpieces.
 */

import { describe, test, expect } from "bun:test";
import {
  MouthpieceCalculator,
  SimpleFippleMouthpieceCalculator,
  DefaultFippleMouthpieceCalculator,
  FluteMouthpieceCalculator,
  getMouthpieceCalculator,
} from "../../../src/core/geometry/mouthpiece-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { StateVector } from "../../../src/core/math/state-vector.ts";
import { Complex } from "../../../src/core/math/complex.ts";
import type { Mouthpiece } from "../../../src/models/instrument.ts";

describe("MouthpieceCalculator", () => {
  const params = new PhysicalParameters(20, "C");
  const freq = 440;
  const waveNumber = params.calcWaveNumber(freq);

  describe("base MouthpieceCalculator", () => {
    const calc = new MouthpieceCalculator();

    test("flow-node mouthpiece returns identity matrix", () => {
      const mouthpiece: Mouthpiece = {
        position: 0,
        boreDiameter: 0.02,
        fipple: {
          windowWidth: 0.01,
          windowLength: 0.005,
        },
      };

      const tm = calc.calcTransferMatrix(mouthpiece, waveNumber, params);

      // For flow-node, default is identity
      expect(tm.getPP().re).toBeCloseTo(1, 6);
      expect(tm.getPP().im).toBeCloseTo(0, 6);
      expect(tm.getUU().re).toBeCloseTo(1, 6);
      expect(tm.getUU().im).toBeCloseTo(0, 6);
    });

    test("pressure-node mouthpiece returns closed-end matrix", () => {
      const mouthpiece: Mouthpiece = {
        position: 0,
        boreDiameter: 0.02,
        singleReed: { alpha: 0.5 },
      };

      const tm = calc.calcTransferMatrix(mouthpiece, waveNumber, params);

      // For pressure-node, default is closed end: [0, Z0; 1, 0]
      expect(tm.getPP().re).toBeCloseTo(0, 6);
      expect(tm.getUP().re).toBeCloseTo(1, 6);
    });
  });

  describe("SimpleFippleMouthpieceCalculator", () => {
    const calc = new SimpleFippleMouthpieceCalculator();

    const fippleMouthpiece: Mouthpiece = {
      position: 0,
      boreDiameter: 0.02,
      fipple: {
        windowWidth: 0.01,
        windowLength: 0.008,
        windowHeight: 0.003,
      },
    };

    test("calcZ returns complex impedance", () => {
      const Z = calc.calcZ(fippleMouthpiece, freq, params);

      expect(Z).toBeInstanceOf(Complex);
      // Should have positive real part (resistance)
      expect(Z.re).toBeGreaterThan(0);
      // Should have positive imaginary part (reactance)
      expect(Z.im).toBeGreaterThan(0);
    });

    test("calcZ increases with frequency", () => {
      const Z440 = calc.calcZ(fippleMouthpiece, 440, params);
      const Z880 = calc.calcZ(fippleMouthpiece, 880, params);

      // Reactance should increase with frequency
      expect(Z880.im).toBeGreaterThan(Z440.im);
    });

    test("transfer matrix has correct form for flow-node", () => {
      const tm = calc.calcTransferMatrix(fippleMouthpiece, waveNumber, params);

      // A = 1, D = 1, C = 0
      expect(tm.getPP().re).toBeCloseTo(1, 6);
      expect(tm.getUU().re).toBeCloseTo(1, 6);
      expect(tm.getUP().abs()).toBeLessThan(1e-10);

      // B = Zwindow (non-zero)
      expect(tm.getPU().abs()).toBeGreaterThan(0);
    });

    test("calcStateVector applies transfer matrix to bore state", () => {
      const boreState = new StateVector(new Complex(100, 0), Complex.ONE);
      const sv = calc.calcStateVector(boreState, fippleMouthpiece, waveNumber, params);

      expect(sv).toBeInstanceOf(StateVector);
      // State vector should be modified by mouthpiece
      expect(sv.getP().re).not.toBe(boreState.getP().re);
    });

    test("throws if fipple not defined", () => {
      const badMouthpiece: Mouthpiece = {
        position: 0,
        boreDiameter: 0.02,
      };

      expect(() => calc.calcZ(badMouthpiece, freq, params)).toThrow();
    });

    test("uses windwayHeight if windowHeight not specified", () => {
      const mouthpieceWithWindway: Mouthpiece = {
        position: 0,
        boreDiameter: 0.02,
        fipple: {
          windowWidth: 0.01,
          windowLength: 0.008,
          windwayHeight: 0.002,
        },
      };

      const Z = calc.calcZ(mouthpieceWithWindway, freq, params);
      expect(Z.im).toBeGreaterThan(0);
    });
  });

  describe("FluteMouthpieceCalculator", () => {
    const calc = new FluteMouthpieceCalculator();

    const fluteMouthpiece: Mouthpiece = {
      position: 0,
      boreDiameter: 0.019,
      embouchureHole: {
        length: 0.012,
        width: 0.010,
        height: 0.005,
        airstreamLength: 0.008,
        airstreamHeight: 0.003,
      },
    };

    test("calcZ returns complex impedance", () => {
      const Z = calc.calcZ(fluteMouthpiece, freq, params);

      expect(Z).toBeInstanceOf(Complex);
      expect(Z.re).toBeGreaterThan(0);
      expect(Z.im).toBeGreaterThan(0);
    });

    test("transfer matrix has correct form for flow-node", () => {
      const tm = calc.calcTransferMatrix(fluteMouthpiece, waveNumber, params);

      expect(tm.getPP().re).toBeCloseTo(1, 6);
      expect(tm.getUU().re).toBeCloseTo(1, 6);
      expect(tm.getUP().abs()).toBeLessThan(1e-10);
      expect(tm.getPU().abs()).toBeGreaterThan(0);
    });

    test("throws if embouchure hole not defined", () => {
      const badMouthpiece: Mouthpiece = {
        position: 0,
        boreDiameter: 0.02,
      };

      expect(() => calc.calcZ(badMouthpiece, freq, params)).toThrow();
    });

    test("uses minimum of width and airstreamLength for effective size", () => {
      const narrowAirstream: Mouthpiece = {
        position: 0,
        boreDiameter: 0.019,
        embouchureHole: {
          length: 0.012,
          width: 0.010,
          height: 0.005,
          airstreamLength: 0.005, // narrower than width
          airstreamHeight: 0.003,
        },
      };

      const Z = calc.calcZ(narrowAirstream, freq, params);
      expect(Z.im).toBeGreaterThan(0);
    });
  });

  describe("getMouthpieceCalculator", () => {
    test("returns fipple calculator for fipple mouthpiece", () => {
      const mouthpiece: Mouthpiece = {
        position: 0,
        fipple: { windowWidth: 0.01, windowLength: 0.008 },
      };

      const calc = getMouthpieceCalculator(mouthpiece);
      expect(calc).toBeInstanceOf(DefaultFippleMouthpieceCalculator);
    });

    test("returns flute calculator for embouchure mouthpiece", () => {
      const mouthpiece: Mouthpiece = {
        position: 0,
        embouchureHole: {
          length: 0.012,
          width: 0.010,
          height: 0.005,
          airstreamLength: 0.008,
          airstreamHeight: 0.003,
        },
      };

      const calc = getMouthpieceCalculator(mouthpiece);
      expect(calc).toBeInstanceOf(FluteMouthpieceCalculator);
    });

    test("returns base calculator for unknown mouthpiece", () => {
      const mouthpiece: Mouthpiece = {
        position: 0,
      };

      const calc = getMouthpieceCalculator(mouthpiece);
      expect(calc).toBeInstanceOf(MouthpieceCalculator);
    });
  });
});
