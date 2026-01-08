/**
 * Tests for TerminationCalculator classes
 *
 * These tests verify that termination state vectors are
 * calculated correctly for flanged and unflanged pipe ends.
 */

import { describe, test, expect } from "bun:test";
import {
  UnflangedEndCalculator,
  FlangedEndCalculator,
  unflangedEndCalculator,
  flangedEndCalculator,
  getTerminationCalculator,
} from "../../../src/core/geometry/termination-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { StateVector } from "../../../src/core/math/state-vector.ts";
import type { Termination } from "../../../src/models/instrument.ts";

describe("TerminationCalculator", () => {
  const params = new PhysicalParameters(20, "C");
  const freq = 440;
  const waveNumber = params.calcWaveNumber(freq);

  const createTermination = (boreDiameter: number, flangeDiameter: number = 0): Termination => ({
    boreDiameter,
    flangeDiameter,
  });

  describe("UnflangedEndCalculator", () => {
    const calc = new UnflangedEndCalculator();

    test("open end returns state vector with radiation impedance", () => {
      const term = createTermination(0.02); // 20mm diameter
      const sv = calc.calcStateVector(term, true, waveNumber, params);

      expect(sv).toBeInstanceOf(StateVector);

      // Impedance should have positive real and imaginary parts
      const Z = sv.getImpedance();
      expect(Z.re).toBeGreaterThan(0);
      expect(Z.im).toBeGreaterThan(0);
    });

    test("closed end returns closed-end state vector", () => {
      const term = createTermination(0.02);
      const sv = calc.calcStateVector(term, false, waveNumber, params);

      // Closed end has P=1, U=0
      expect(sv.getP().re).toBeCloseTo(1, 6);
      expect(sv.getP().im).toBeCloseTo(0, 6);
      expect(sv.getU().abs()).toBeLessThan(1e-10);
    });

    test("radiation impedance increases with frequency", () => {
      const term = createTermination(0.02);

      const k440 = params.calcWaveNumber(440);
      const k880 = params.calcWaveNumber(880);

      const sv440 = calc.calcStateVector(term, true, k440, params);
      const sv880 = calc.calcStateVector(term, true, k880, params);

      // Imaginary part should increase with frequency
      expect(sv880.getImpedance().im).toBeGreaterThan(sv440.getImpedance().im);
    });

    test("calcStateVectorOpen defaults to open", () => {
      const term = createTermination(0.02);

      const svOpen = calc.calcStateVectorOpen(term, waveNumber, params);
      const svExplicit = calc.calcStateVector(term, true, waveNumber, params);

      expect(svOpen.getP().re).toBeCloseTo(svExplicit.getP().re, 10);
      expect(svOpen.getU().re).toBeCloseTo(svExplicit.getU().re, 10);
    });
  });

  describe("FlangedEndCalculator", () => {
    const calc = new FlangedEndCalculator();

    test("open flanged end returns state vector with flanged radiation impedance", () => {
      const term = createTermination(0.02, 0.04); // 20mm bore, 40mm flange
      const sv = calc.calcStateVector(term, true, waveNumber, params);

      expect(sv).toBeInstanceOf(StateVector);

      const Z = sv.getImpedance();
      expect(Z.re).toBeGreaterThan(0);
      expect(Z.im).toBeGreaterThan(0);
    });

    test("closed flanged end returns closed-end state vector", () => {
      const term = createTermination(0.02, 0.04);
      const sv = calc.calcStateVector(term, false, waveNumber, params);

      expect(sv.getP().re).toBeCloseTo(1, 6);
      expect(sv.getU().abs()).toBeLessThan(1e-10);
    });

    test("flanged end has higher radiation impedance than unflanged", () => {
      const term = createTermination(0.02, 0.04);

      const svFlanged = flangedEndCalculator.calcStateVector(term, true, waveNumber, params);
      const svUnflanged = unflangedEndCalculator.calcStateVector(term, true, waveNumber, params);

      // Flanged end has higher impedance (more radiation resistance)
      expect(svFlanged.getImpedance().abs()).toBeGreaterThan(svUnflanged.getImpedance().abs());
    });
  });

  describe("getTerminationCalculator", () => {
    test("returns unflanged calculator for no flange", () => {
      const term = createTermination(0.02, 0);
      const calc = getTerminationCalculator(term);
      expect(calc).toBe(unflangedEndCalculator);
    });

    test("returns unflanged calculator for small flange", () => {
      const term = createTermination(0.02, 0.02); // Same as bore
      const calc = getTerminationCalculator(term);
      expect(calc).toBe(unflangedEndCalculator);
    });

    test("returns flanged calculator for large flange", () => {
      const term = createTermination(0.02, 0.04); // Twice bore diameter
      const calc = getTerminationCalculator(term);
      expect(calc).toBe(flangedEndCalculator);
    });
  });

  describe("default instances", () => {
    test("unflangedEndCalculator is singleton", () => {
      expect(unflangedEndCalculator).toBeInstanceOf(UnflangedEndCalculator);
    });

    test("flangedEndCalculator is singleton", () => {
      expect(flangedEndCalculator).toBeInstanceOf(FlangedEndCalculator);
    });
  });

  describe("bore diameter handling", () => {
    test("uses default bore diameter if not specified", () => {
      const term: Termination = { flangeDiameter: 0 };
      const sv = unflangedEndCalculator.calcStateVector(term, true, waveNumber, params);

      // Should not throw, should return valid state vector
      expect(sv).toBeInstanceOf(StateVector);
      expect(sv.getImpedance().abs()).toBeGreaterThan(0);
    });
  });
});
