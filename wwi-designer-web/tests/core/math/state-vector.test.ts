/**
 * Tests for StateVector class
 *
 * The state vector represents the acoustic state (pressure and volume flow)
 * at a point in a woodwind instrument bore.
 */

import { describe, test, expect } from "bun:test";
import { Complex } from "../../../src/core/math/complex.ts";
import { TransferMatrix } from "../../../src/core/math/transfer-matrix.ts";
import { StateVector } from "../../../src/core/math/state-vector.ts";

describe("StateVector", () => {
  describe("construction", () => {
    test("default constructor creates zero state", () => {
      const sv = new StateVector();
      expect(sv.getP().equals(Complex.ZERO)).toBe(true);
      expect(sv.getU().equals(Complex.ZERO)).toBe(true);
    });

    test("constructor with P and U", () => {
      const p = new Complex(3, 4);
      const u = new Complex(5, 6);
      const sv = new StateVector(p, u);

      expect(sv.getP().equals(p)).toBe(true);
      expect(sv.getU().equals(u)).toBe(true);
    });

    test("copy constructor creates independent copy", () => {
      const original = new StateVector(new Complex(1, 2), new Complex(3, 4));
      const copy = new StateVector(original);

      expect(copy.equals(original)).toBe(true);
    });

    test("constructor from impedance", () => {
      const z = new Complex(100, 50);
      const sv = new StateVector(z);

      // The resulting impedance should equal the input
      const impedance = sv.getImpedance();
      expect(impedance.re).toBeCloseTo(z.re, 8);
      expect(impedance.im).toBeCloseTo(z.im, 8);
    });

    test("constructor from positive infinite impedance", () => {
      const z = new Complex(Number.POSITIVE_INFINITY, 0);
      const sv = new StateVector(z);

      expect(sv.getP().re).toBe(1);
      expect(sv.getU().re).toBe(0);
    });

    test("constructor from negative infinite impedance", () => {
      const z = new Complex(Number.NEGATIVE_INFINITY, 0);
      const sv = new StateVector(z);

      expect(sv.getP().re).toBe(-1);
      expect(sv.getU().re).toBe(0);
    });
  });

  describe("static constructors", () => {
    test("OpenEnd creates state with zero pressure", () => {
      const sv = StateVector.OpenEnd();
      expect(sv.getP().equals(Complex.ZERO)).toBe(true);
      expect(sv.getU().equals(Complex.ONE)).toBe(true);
    });

    test("ClosedEnd creates state with zero flow", () => {
      const sv = StateVector.ClosedEnd();
      expect(sv.getP().equals(Complex.ONE)).toBe(true);
      expect(sv.getU().equals(Complex.ZERO)).toBe(true);
    });
  });

  describe("getters and setters", () => {
    test("getP returns pressure", () => {
      const sv = new StateVector(new Complex(3, 4), new Complex(5, 6));
      expect(sv.getP().re).toBe(3);
      expect(sv.getP().im).toBe(4);
    });

    test("getU returns volume flow", () => {
      const sv = new StateVector(new Complex(3, 4), new Complex(5, 6));
      expect(sv.getU().re).toBe(5);
      expect(sv.getU().im).toBe(6);
    });

    test("setP sets pressure", () => {
      const sv = new StateVector();
      sv.setP(new Complex(7, 8));
      expect(sv.getP().re).toBe(7);
      expect(sv.getP().im).toBe(8);
    });

    test("setU sets volume flow", () => {
      const sv = new StateVector();
      sv.setU(new Complex(9, 10));
      expect(sv.getU().re).toBe(9);
      expect(sv.getU().im).toBe(10);
    });
  });

  describe("impedance and admittance", () => {
    test("getImpedance returns P/U", () => {
      const sv = new StateVector(new Complex(6, 0), new Complex(2, 0));
      const z = sv.getImpedance();
      expect(z.re).toBeCloseTo(3, 10);
      expect(z.im).toBeCloseTo(0, 10);
    });

    test("getAdmittance returns U/P", () => {
      const sv = new StateVector(new Complex(4, 0), new Complex(8, 0));
      const y = sv.getAdmittance();
      expect(y.re).toBeCloseTo(2, 10);
      expect(y.im).toBeCloseTo(0, 10);
    });

    test("admittance is reciprocal of impedance", () => {
      const sv = new StateVector(new Complex(3, 4), new Complex(5, 6));
      const z = sv.getImpedance();
      const y = sv.getAdmittance();

      const product = z.multiply(y);
      expect(product.re).toBeCloseTo(1, 8);
      expect(product.im).toBeCloseTo(0, 8);
    });

    test("open end has zero impedance", () => {
      const sv = StateVector.OpenEnd();
      const z = sv.getImpedance();
      expect(z.re).toBe(0);
      expect(z.im).toBe(0);
    });
  });

  describe("reflectance", () => {
    test("reflectance calculation is correct", () => {
      // R = (P - U*Z0) / (P + U*Z0)
      const p = new Complex(2, 0);
      const u = new Complex(1, 0);
      const Z0 = 1;
      const sv = new StateVector(p, u);

      const R = sv.getReflectance(Z0);
      // R = (2 - 1*1) / (2 + 1*1) = 1/3
      expect(R.re).toBeCloseTo(1 / 3, 10);
      expect(R.im).toBeCloseTo(0, 10);
    });

    test("reflectance of open end is -1", () => {
      const sv = StateVector.OpenEnd();
      const R = sv.getReflectance(1);
      // R = (0 - 1*1) / (0 + 1*1) = -1
      expect(R.re).toBeCloseTo(-1, 10);
      expect(R.im).toBeCloseTo(0, 10);
    });

    test("reflectance of closed end is 1", () => {
      const sv = StateVector.ClosedEnd();
      const R = sv.getReflectance(1);
      // R = (1 - 0*1) / (1 + 0*1) = 1
      expect(R.re).toBeCloseTo(1, 10);
      expect(R.im).toBeCloseTo(0, 10);
    });

    test("matched load has zero reflectance", () => {
      // When Z = Z0, reflectance is 0
      const Z0 = 100;
      const p = new Complex(Z0, 0);
      const u = new Complex(1, 0);
      const sv = new StateVector(p, u);

      const R = sv.getReflectance(Z0);
      // Z = P/U = Z0, so R = (Z - Z0)/(Z + Z0) = 0
      expect(R.re).toBeCloseTo(0, 10);
      expect(R.im).toBeCloseTo(0, 10);
    });
  });

  describe("series and parallel", () => {
    test("series adds impedances", () => {
      // Create two state vectors with known impedances
      const z1 = new Complex(100, 50);
      const z2 = new Complex(200, -30);

      const sv1 = new StateVector(z1);
      const sv2 = new StateVector(z2);

      const combined = sv1.series(sv2);
      const zCombined = combined.getImpedance();

      // For series: Z_total = Z1 + Z2
      const expected = z1.add(z2);
      expect(zCombined.re).toBeCloseTo(expected.re, 6);
      expect(zCombined.im).toBeCloseTo(expected.im, 6);
    });

    test("parallel adds admittances", () => {
      // Create two state vectors with known impedances
      const z1 = new Complex(100, 0);
      const z2 = new Complex(200, 0);

      const sv1 = new StateVector(z1);
      const sv2 = new StateVector(z2);

      const combined = sv1.parallel(sv2);
      const zCombined = combined.getImpedance();

      // For parallel: 1/Z_total = 1/Z1 + 1/Z2
      // Z_total = 1 / (1/Z1 + 1/Z2) = Z1*Z2 / (Z1 + Z2)
      // = 100*200 / 300 = 66.67
      expect(zCombined.re).toBeCloseTo(200 / 3, 6);
      expect(zCombined.im).toBeCloseTo(0, 6);
    });
  });

  describe("transfer matrix application", () => {
    test("applyTransferMatrix transforms state correctly", () => {
      const tm = new TransferMatrix(
        new Complex(1, 0),
        new Complex(2, 0),
        new Complex(3, 0),
        new Complex(4, 0)
      );
      const sv = new StateVector(new Complex(5, 0), new Complex(6, 0));

      const result = sv.applyTransferMatrix(tm);

      // P' = PP*P + PU*U = 1*5 + 2*6 = 17
      // U' = UP*P + UU*U = 3*5 + 4*6 = 39
      expect(result.getP().re).toBeCloseTo(17, 10);
      expect(result.getU().re).toBeCloseTo(39, 10);
    });

    test("identity matrix preserves state", () => {
      const tm = TransferMatrix.makeIdentity();
      const sv = new StateVector(new Complex(3, 4), new Complex(5, 6));

      const result = sv.applyTransferMatrix(tm);

      expect(result.equals(sv, 1e-10)).toBe(true);
    });

    test("chained transfer matrices", () => {
      // Applying T2 after T1: sv' = T1*sv, sv'' = T2*T1*sv
      // So combined matrix is T2*T1 (note the order)
      const tm1 = new TransferMatrix(
        new Complex(1, 1),
        new Complex(2, 0),
        new Complex(0, 1),
        new Complex(1, -1)
      );
      const tm2 = new TransferMatrix(
        new Complex(2, 0),
        new Complex(1, 1),
        new Complex(1, -1),
        new Complex(2, 0)
      );
      const sv = new StateVector(new Complex(1, 0), new Complex(0, 1));

      // Apply sequentially: first tm1, then tm2
      const intermediate = sv.applyTransferMatrix(tm1);
      const result1 = intermediate.applyTransferMatrix(tm2);

      // Apply combined matrix: T2 * T1 (order matters!)
      const combined = tm2.multiply(tm1);
      const result2 = sv.applyTransferMatrix(combined);

      expect(result1.getP().re).toBeCloseTo(result2.getP().re, 8);
      expect(result1.getP().im).toBeCloseTo(result2.getP().im, 8);
      expect(result1.getU().re).toBeCloseTo(result2.getU().re, 8);
      expect(result1.getU().im).toBeCloseTo(result2.getU().im, 8);
    });
  });

  describe("equality", () => {
    test("equals returns true for same states", () => {
      const sv1 = new StateVector(new Complex(1, 2), new Complex(3, 4));
      const sv2 = new StateVector(new Complex(1, 2), new Complex(3, 4));
      expect(sv1.equals(sv2)).toBe(true);
    });

    test("equals returns false for different states", () => {
      const sv1 = new StateVector(new Complex(1, 2), new Complex(3, 4));
      const sv2 = new StateVector(new Complex(1, 2), new Complex(3, 5));
      expect(sv1.equals(sv2)).toBe(false);
    });

    test("equals with tolerance", () => {
      const sv1 = new StateVector(new Complex(1.0001, 2), new Complex(3, 4));
      const sv2 = new StateVector(new Complex(1, 2), new Complex(3, 4));
      expect(sv1.equals(sv2, 0.001)).toBe(true);
      expect(sv1.equals(sv2, 0.00001)).toBe(false);
    });
  });

  describe("toString", () => {
    test("toString formats correctly", () => {
      const sv = new StateVector(new Complex(1, 2), new Complex(3, 4));
      const str = sv.toString();
      expect(str).toContain("StateVector");
      expect(str).toContain("P=");
      expect(str).toContain("U=");
    });
  });
});
