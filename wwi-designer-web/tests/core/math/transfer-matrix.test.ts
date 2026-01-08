/**
 * Tests for TransferMatrix class
 *
 * The transfer matrix is the core mathematical structure for acoustic
 * transmission line modeling in woodwind instruments.
 */

import { describe, test, expect } from "bun:test";
import { Complex } from "../../../src/core/math/complex.ts";
import { TransferMatrix } from "../../../src/core/math/transfer-matrix.ts";
import { StateVector } from "../../../src/core/math/state-vector.ts";

describe("TransferMatrix", () => {
  describe("construction", () => {
    test("default constructor creates identity matrix", () => {
      const tm = new TransferMatrix();
      expect(tm.getPP().equals(Complex.ONE)).toBe(true);
      expect(tm.getPU().equals(Complex.ZERO)).toBe(true);
      expect(tm.getUP().equals(Complex.ZERO)).toBe(true);
      expect(tm.getUU().equals(Complex.ONE)).toBe(true);
    });

    test("constructor with explicit values", () => {
      const pp = new Complex(1, 2);
      const pu = new Complex(3, 4);
      const up = new Complex(5, 6);
      const uu = new Complex(7, 8);

      const tm = new TransferMatrix(pp, pu, up, uu);

      expect(tm.getPP().equals(pp)).toBe(true);
      expect(tm.getPU().equals(pu)).toBe(true);
      expect(tm.getUP().equals(up)).toBe(true);
      expect(tm.getUU().equals(uu)).toBe(true);
    });

    test("copy constructor creates independent copy", () => {
      const original = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const copy = new TransferMatrix(original);

      expect(copy.equals(original)).toBe(true);
    });

    test("makeIdentity creates identity matrix", () => {
      const tm = TransferMatrix.makeIdentity();
      expect(tm.getPP().equals(Complex.ONE)).toBe(true);
      expect(tm.getPU().equals(Complex.ZERO)).toBe(true);
      expect(tm.getUP().equals(Complex.ZERO)).toBe(true);
      expect(tm.getUU().equals(Complex.ONE)).toBe(true);
    });
  });

  describe("setters", () => {
    test("setPP, setPU, setUP, setUU work correctly", () => {
      const tm = new TransferMatrix();

      tm.setPP(new Complex(2, 3));
      tm.setPU(new Complex(4, 5));
      tm.setUP(new Complex(6, 7));
      tm.setUU(new Complex(8, 9));

      expect(tm.getPP().re).toBe(2);
      expect(tm.getPP().im).toBe(3);
      expect(tm.getPU().re).toBe(4);
      expect(tm.getUP().re).toBe(6);
      expect(tm.getUU().re).toBe(8);
    });
  });

  describe("matrix multiplication", () => {
    test("identity times identity is identity", () => {
      const id1 = new TransferMatrix();
      const id2 = new TransferMatrix();
      const result = id1.multiply(id2);

      expect(result.getPP().equals(Complex.ONE)).toBe(true);
      expect(result.getPU().equals(Complex.ZERO)).toBe(true);
      expect(result.getUP().equals(Complex.ZERO)).toBe(true);
      expect(result.getUU().equals(Complex.ONE)).toBe(true);
    });

    test("identity times any matrix is that matrix", () => {
      const tm = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const id = new TransferMatrix();
      const result = id.multiply(tm);

      expect(result.equals(tm)).toBe(true);
    });

    test("any matrix times identity is that matrix", () => {
      const tm = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const id = new TransferMatrix();
      const result = tm.multiply(id);

      expect(result.equals(tm)).toBe(true);
    });

    test("matrix multiplication is correct", () => {
      // [a b]   [e f]   [ae+bg  af+bh]
      // [c d] * [g h] = [ce+dg  cf+dh]
      const m1 = new TransferMatrix(
        new Complex(1, 0),
        new Complex(2, 0),
        new Complex(3, 0),
        new Complex(4, 0)
      );
      const m2 = new TransferMatrix(
        new Complex(5, 0),
        new Complex(6, 0),
        new Complex(7, 0),
        new Complex(8, 0)
      );

      const result = m1.multiply(m2);

      // PP = 1*5 + 2*7 = 19
      // PU = 1*6 + 2*8 = 22
      // UP = 3*5 + 4*7 = 43
      // UU = 3*6 + 4*8 = 50
      expect(result.getPP().re).toBeCloseTo(19, 10);
      expect(result.getPU().re).toBeCloseTo(22, 10);
      expect(result.getUP().re).toBeCloseTo(43, 10);
      expect(result.getUU().re).toBeCloseTo(50, 10);
    });

    test("static multiply gives same result", () => {
      const m1 = new TransferMatrix(
        new Complex(1, 1),
        new Complex(2, 2),
        new Complex(3, 3),
        new Complex(4, 4)
      );
      const m2 = new TransferMatrix(
        new Complex(5, 5),
        new Complex(6, 6),
        new Complex(7, 7),
        new Complex(8, 8)
      );

      const result1 = m1.multiply(m2);
      const result2 = TransferMatrix.multiply(m1, m2);

      expect(result1.equals(result2)).toBe(true);
    });

    test("multiplication is not commutative", () => {
      const m1 = new TransferMatrix(
        new Complex(1, 0),
        new Complex(2, 0),
        new Complex(3, 0),
        new Complex(4, 0)
      );
      const m2 = new TransferMatrix(
        new Complex(5, 0),
        new Complex(6, 0),
        new Complex(7, 0),
        new Complex(8, 0)
      );

      const ab = m1.multiply(m2);
      const ba = m2.multiply(m1);

      expect(ab.equals(ba)).toBe(false);
    });
  });

  describe("determinant", () => {
    test("determinant of identity is 1", () => {
      const tm = new TransferMatrix();
      const det = tm.determinant();
      expect(det.re).toBeCloseTo(1, 10);
      expect(det.im).toBeCloseTo(0, 10);
    });

    test("determinant calculation is correct", () => {
      // det([a b; c d]) = ad - bc
      const tm = new TransferMatrix(
        new Complex(3, 0),
        new Complex(8, 0),
        new Complex(4, 0),
        new Complex(6, 0)
      );

      const det = tm.determinant();
      // 3*6 - 8*4 = 18 - 32 = -14
      expect(det.re).toBeCloseTo(-14, 10);
      expect(det.im).toBeCloseTo(0, 10);
    });

    test("determinant of product equals product of determinants", () => {
      const m1 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const m2 = new TransferMatrix(
        new Complex(2, 1),
        new Complex(4, 3),
        new Complex(6, 5),
        new Complex(8, 7)
      );

      const det1 = m1.determinant();
      const det2 = m2.determinant();
      const productDet = det1.multiply(det2);

      const product = m1.multiply(m2);
      const detProduct = product.determinant();

      expect(detProduct.re).toBeCloseTo(productDet.re, 8);
      expect(detProduct.im).toBeCloseTo(productDet.im, 8);
    });
  });

  describe("inverse", () => {
    test("inverse of identity is identity", () => {
      const tm = new TransferMatrix();
      const inv = tm.inverse();

      expect(inv.getPP().re).toBeCloseTo(1, 10);
      expect(inv.getPU().re).toBeCloseTo(0, 10);
      expect(inv.getUP().re).toBeCloseTo(0, 10);
      expect(inv.getUU().re).toBeCloseTo(1, 10);
    });

    test("matrix times inverse is identity", () => {
      const tm = new TransferMatrix(
        new Complex(3, 1),
        new Complex(2, 4),
        new Complex(1, 2),
        new Complex(4, 3)
      );
      const inv = tm.inverse();
      const product = tm.multiply(inv);

      expect(product.getPP().re).toBeCloseTo(1, 8);
      expect(product.getPP().im).toBeCloseTo(0, 8);
      expect(product.getPU().re).toBeCloseTo(0, 8);
      expect(product.getPU().im).toBeCloseTo(0, 8);
      expect(product.getUP().re).toBeCloseTo(0, 8);
      expect(product.getUP().im).toBeCloseTo(0, 8);
      expect(product.getUU().re).toBeCloseTo(1, 8);
      expect(product.getUU().im).toBeCloseTo(0, 8);
    });
  });

  describe("state vector multiplication", () => {
    test("identity matrix preserves state vector", () => {
      const tm = new TransferMatrix();
      const sv = new StateVector(new Complex(3, 4), new Complex(5, 6));
      const result = tm.multiplyStateVector(sv);

      expect(result.p.re).toBeCloseTo(3, 10);
      expect(result.p.im).toBeCloseTo(4, 10);
      expect(result.u.re).toBeCloseTo(5, 10);
      expect(result.u.im).toBeCloseTo(6, 10);
    });

    test("state vector multiplication is correct", () => {
      // [PP PU] [P]   [PP*P + PU*U]
      // [UP UU] [U] = [UP*P + UU*U]
      const tm = new TransferMatrix(
        new Complex(1, 0),
        new Complex(2, 0),
        new Complex(3, 0),
        new Complex(4, 0)
      );
      const sv = new StateVector(new Complex(5, 0), new Complex(6, 0));
      const result = tm.multiplyStateVector(sv);

      // P' = 1*5 + 2*6 = 17
      // U' = 3*5 + 4*6 = 39
      expect(result.p.re).toBeCloseTo(17, 10);
      expect(result.u.re).toBeCloseTo(39, 10);
    });

    test("static multiplyStateVectorComponents gives same result", () => {
      const tm = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const sv = new StateVector(new Complex(9, 10), new Complex(11, 12));

      const result1 = tm.multiplyStateVector(sv);
      const result2 = TransferMatrix.multiplyStateVectorComponents(tm, sv);

      expect(result1.p.equals(result2.p)).toBe(true);
      expect(result1.u.equals(result2.u)).toBe(true);
    });
  });

  describe("equality", () => {
    test("equals returns true for same matrices", () => {
      const m1 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const m2 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );

      expect(m1.equals(m2)).toBe(true);
    });

    test("equals returns false for different matrices", () => {
      const m1 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const m2 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 9)
      );

      expect(m1.equals(m2)).toBe(false);
    });

    test("equals with tolerance", () => {
      const m1 = new TransferMatrix(
        new Complex(1.0001, 2.0001),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );
      const m2 = new TransferMatrix(
        new Complex(1, 2),
        new Complex(3, 4),
        new Complex(5, 6),
        new Complex(7, 8)
      );

      expect(m1.equals(m2, 0.001)).toBe(true);
      expect(m1.equals(m2, 0.00001)).toBe(false);
    });
  });

  describe("acoustic properties", () => {
    test("cylindrical tube transfer matrix has determinant of 1", () => {
      // A lossless cylindrical tube has det(T) = 1
      // T = [cos(kL)     jZ₀sin(kL)]
      //     [j/Z₀sin(kL) cos(kL)   ]
      const kL = 1.5; // wavenumber * length
      const Z0 = 1e6; // characteristic impedance

      const cosKL = new Complex(Math.cos(kL), 0);
      const sinKL = new Complex(Math.sin(kL), 0);

      const tm = new TransferMatrix(
        cosKL,
        Complex.I.multiply(Z0).multiply(sinKL),
        Complex.I.divide(Z0).multiply(sinKL),
        cosKL
      );

      const det = tm.determinant();
      expect(det.re).toBeCloseTo(1, 8);
      expect(det.im).toBeCloseTo(0, 8);
    });
  });
});
