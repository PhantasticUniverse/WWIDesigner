/**
 * Tests for BoreSectionCalculator
 *
 * These tests verify the bore section transfer matrix calculations
 * and utility functions.
 */

import { describe, test, expect } from "bun:test";
import {
  SimpleBoreSectionCalculator,
  defaultBoreSectionCalculator,
  createBoreSectionsFromPoints,
  calcBoreTransferMatrix,
} from "../../../src/core/geometry/bore-section-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { TransferMatrix } from "../../../src/core/math/transfer-matrix.ts";
import type { BoreSection } from "../../../src/models/instrument.ts";

describe("BoreSectionCalculator", () => {
  const params = new PhysicalParameters(20, "C");

  describe("SimpleBoreSectionCalculator", () => {
    test("can be instantiated", () => {
      const calc = new SimpleBoreSectionCalculator();
      expect(calc).toBeDefined();
    });

    test("calcTransferMatrix returns TransferMatrix", () => {
      const calc = new SimpleBoreSectionCalculator();
      const section: BoreSection = {
        length: 0.1,
        leftRadius: 0.01,
        rightRadius: 0.01,
        rightBorePosition: 0.1,
      };
      const k = params.calcWaveNumber(440);
      const tm = calc.calcTransferMatrix(section, k, params);

      expect(tm).toBeInstanceOf(TransferMatrix);
    });

    test("cylindrical section has PP = UU", () => {
      const calc = new SimpleBoreSectionCalculator();
      const section: BoreSection = {
        length: 0.1,
        leftRadius: 0.01,
        rightRadius: 0.01,
        rightBorePosition: 0.1,
      };
      const k = params.calcWaveNumber(440);
      const tm = calc.calcTransferMatrix(section, k, params);

      expect(tm.getPP().re).toBeCloseTo(tm.getUU().re, 6);
      expect(tm.getPP().im).toBeCloseTo(tm.getUU().im, 6);
    });

    test("conical section has PP ≠ UU", () => {
      const calc = new SimpleBoreSectionCalculator();
      const section: BoreSection = {
        length: 0.1,
        leftRadius: 0.01,
        rightRadius: 0.015,
        rightBorePosition: 0.1,
      };
      const k = params.calcWaveNumber(440);
      const tm = calc.calcTransferMatrix(section, k, params);

      const diff =
        Math.abs(tm.getPP().re - tm.getUU().re) +
        Math.abs(tm.getPP().im - tm.getUU().im);
      expect(diff).toBeGreaterThan(0.01);
    });
  });

  describe("defaultBoreSectionCalculator", () => {
    test("is a SimpleBoreSectionCalculator", () => {
      expect(defaultBoreSectionCalculator).toBeInstanceOf(
        SimpleBoreSectionCalculator
      );
    });

    test("can calculate transfer matrix", () => {
      const section: BoreSection = {
        length: 0.1,
        leftRadius: 0.01,
        rightRadius: 0.01,
        rightBorePosition: 0.1,
      };
      const k = params.calcWaveNumber(440);
      const tm = defaultBoreSectionCalculator.calcTransferMatrix(
        section,
        k,
        params
      );

      expect(tm).toBeInstanceOf(TransferMatrix);
    });
  });

  describe("createBoreSectionsFromPoints", () => {
    test("returns empty array for less than 2 points", () => {
      const result = createBoreSectionsFromPoints([]);
      expect(result).toEqual([]);

      const result1 = createBoreSectionsFromPoints([
        { borePosition: 0, boreDiameter: 20 },
      ]);
      expect(result1).toEqual([]);
    });

    test("creates one section from two points", () => {
      const points = [
        { borePosition: 0, boreDiameter: 20 },
        { borePosition: 100, boreDiameter: 20 },
      ];
      const sections = createBoreSectionsFromPoints(points);

      expect(sections.length).toBe(1);
      expect(sections[0]!.length).toBe(100);
      expect(sections[0]!.leftRadius).toBe(10);
      expect(sections[0]!.rightRadius).toBe(10);
    });

    test("creates multiple sections from multiple points", () => {
      const points = [
        { borePosition: 0, boreDiameter: 20 },
        { borePosition: 50, boreDiameter: 22 },
        { borePosition: 100, boreDiameter: 24 },
      ];
      const sections = createBoreSectionsFromPoints(points);

      expect(sections.length).toBe(2);

      // First section
      expect(sections[0]!.length).toBe(50);
      expect(sections[0]!.leftRadius).toBe(10);
      expect(sections[0]!.rightRadius).toBe(11);

      // Second section
      expect(sections[1]!.length).toBe(50);
      expect(sections[1]!.leftRadius).toBe(11);
      expect(sections[1]!.rightRadius).toBe(12);
    });

    test("sorts points by position", () => {
      const points = [
        { borePosition: 100, boreDiameter: 24 },
        { borePosition: 0, boreDiameter: 20 },
        { borePosition: 50, boreDiameter: 22 },
      ];
      const sections = createBoreSectionsFromPoints(points);

      expect(sections.length).toBe(2);
      expect(sections[0]!.leftRadius).toBe(10);
      expect(sections[0]!.rightRadius).toBe(11);
    });

    test("handles conical bore", () => {
      const points = [
        { borePosition: 0, boreDiameter: 16 },
        { borePosition: 200, boreDiameter: 24 },
      ];
      const sections = createBoreSectionsFromPoints(points);

      expect(sections.length).toBe(1);
      expect(sections[0]!.leftRadius).toBe(8);
      expect(sections[0]!.rightRadius).toBe(12);
    });
  });

  describe("calcBoreTransferMatrix", () => {
    test("returns identity for empty sections", () => {
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix([], k, params);

      expect(tm.getPP().re).toBeCloseTo(1, 10);
      expect(tm.getPP().im).toBeCloseTo(0, 10);
      expect(tm.getPU().re).toBeCloseTo(0, 10);
      expect(tm.getUP().re).toBeCloseTo(0, 10);
      expect(tm.getUU().re).toBeCloseTo(1, 10);
    });

    test("calculates transfer matrix for single section", () => {
      const sections: BoreSection[] = [
        { length: 0.1, leftRadius: 0.01, rightRadius: 0.01, rightBorePosition: 0.1 },
      ];
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params);

      expect(tm).toBeInstanceOf(TransferMatrix);
      expect(tm.determinant().abs()).toBeCloseTo(1, 1);
    });

    test("calculates transfer matrix for multiple sections", () => {
      const sections: BoreSection[] = [
        { length: 0.05, leftRadius: 0.01, rightRadius: 0.011, rightBorePosition: 0.05 },
        { length: 0.05, leftRadius: 0.011, rightRadius: 0.012, rightBorePosition: 0.1 },
        { length: 0.05, leftRadius: 0.012, rightRadius: 0.012, rightBorePosition: 0.15 },
      ];
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params);

      expect(tm).toBeInstanceOf(TransferMatrix);
      // Determinant should still be close to 1
      expect(tm.determinant().abs()).toBeCloseTo(1, 0);
    });

    test("uses custom calculator when provided", () => {
      const customCalc = new SimpleBoreSectionCalculator();
      const sections: BoreSection[] = [
        { length: 0.1, leftRadius: 0.01, rightRadius: 0.01, rightBorePosition: 0.1 },
      ];
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params, customCalc);

      expect(tm).toBeInstanceOf(TransferMatrix);
    });

    test("chaining is associative", () => {
      const sections: BoreSection[] = [
        { length: 0.05, leftRadius: 0.01, rightRadius: 0.01, rightBorePosition: 0.05 },
        { length: 0.05, leftRadius: 0.01, rightRadius: 0.01, rightBorePosition: 0.1 },
      ];
      const k = params.calcWaveNumber(440);

      // Combined
      const combined = calcBoreTransferMatrix(sections, k, params);

      // Separate
      const first = calcBoreTransferMatrix([sections[0]!], k, params);
      const second = calcBoreTransferMatrix([sections[1]!], k, params);
      const chained = first.multiply(second);

      expect(combined.getPP().re).toBeCloseTo(chained.getPP().re, 8);
      expect(combined.getPP().im).toBeCloseTo(chained.getPP().im, 8);
    });
  });

  describe("integration tests", () => {
    test("cylindrical bore from points to transfer matrix", () => {
      // Create a simple cylindrical bore
      const points = [
        { borePosition: 0, boreDiameter: 0.02 }, // 20mm diameter
        { borePosition: 0.3, boreDiameter: 0.02 }, // 300mm long
      ];

      const sections = createBoreSectionsFromPoints(points);
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params);

      // Should be a valid transfer matrix with determinant close to 1
      expect(tm.determinant().abs()).toBeCloseTo(1, 1);
      // PP should equal UU for cylindrical bore
      expect(tm.getPP().re).toBeCloseTo(tm.getUU().re, 4);
    });

    test("conical bore from points to transfer matrix", () => {
      // Create a conical bore (flaring from 16mm to 24mm)
      const points = [
        { borePosition: 0, boreDiameter: 0.016 },
        { borePosition: 0.2, boreDiameter: 0.024 },
      ];

      const sections = createBoreSectionsFromPoints(points);
      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params);

      // Should be a valid transfer matrix
      expect(tm.determinant().abs()).toBeCloseTo(1, 1);
      // PP should NOT equal UU for conical bore
      const diff =
        Math.abs(tm.getPP().re - tm.getUU().re) +
        Math.abs(tm.getPP().im - tm.getUU().im);
      expect(diff).toBeGreaterThan(0.001);
    });

    test("stepped bore from points to transfer matrix", () => {
      // Create a stepped bore with multiple sections
      const points = [
        { borePosition: 0, boreDiameter: 0.02 },
        { borePosition: 0.1, boreDiameter: 0.02 },
        { borePosition: 0.1001, boreDiameter: 0.018 }, // Step down
        { borePosition: 0.2, boreDiameter: 0.018 },
      ];

      const sections = createBoreSectionsFromPoints(points);
      expect(sections.length).toBe(3);

      const k = params.calcWaveNumber(440);
      const tm = calcBoreTransferMatrix(sections, k, params);

      // Should produce valid transfer matrix
      expect(Number.isNaN(tm.getPP().re)).toBe(false);
      expect(Number.isFinite(tm.getPP().re)).toBe(true);
    });
  });
});
