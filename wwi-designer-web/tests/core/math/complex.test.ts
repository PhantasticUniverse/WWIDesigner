/**
 * Tests for Complex number class
 *
 * These tests verify the accuracy of complex number operations
 * which are critical for acoustic transfer matrix calculations.
 */

import { describe, test, expect } from "bun:test";
import { Complex } from "../../../src/core/math/complex.ts";

describe("Complex", () => {
  describe("construction and basic properties", () => {
    test("creates complex number with real and imaginary parts", () => {
      const z = new Complex(3, 4);
      expect(z.re).toBe(3);
      expect(z.im).toBe(4);
    });

    test("creates complex number with only real part", () => {
      const z = new Complex(5);
      expect(z.re).toBe(5);
      expect(z.im).toBe(0);
    });

    test("static constants are correct", () => {
      expect(Complex.ZERO.re).toBe(0);
      expect(Complex.ZERO.im).toBe(0);
      expect(Complex.ONE.re).toBe(1);
      expect(Complex.ONE.im).toBe(0);
      expect(Complex.I.re).toBe(0);
      expect(Complex.I.im).toBe(1);
    });

    test("getReal and getImaginary methods work", () => {
      const z = new Complex(2, 7);
      expect(z.getReal()).toBe(2);
      expect(z.getImaginary()).toBe(7);
    });
  });

  describe("absolute value and argument", () => {
    test("abs returns correct magnitude", () => {
      const z = new Complex(3, 4);
      expect(z.abs()).toBe(5);
    });

    test("abs of real number", () => {
      expect(new Complex(5, 0).abs()).toBe(5);
      expect(new Complex(-5, 0).abs()).toBe(5);
    });

    test("abs of pure imaginary", () => {
      expect(new Complex(0, 3).abs()).toBe(3);
    });

    test("arg returns correct angle", () => {
      const z = new Complex(1, 1);
      expect(z.arg()).toBeCloseTo(Math.PI / 4, 10);
    });

    test("arg of positive real is 0", () => {
      expect(new Complex(5, 0).arg()).toBe(0);
    });

    test("arg of positive imaginary is π/2", () => {
      expect(new Complex(0, 5).arg()).toBeCloseTo(Math.PI / 2, 10);
    });

    test("arg of negative real is π", () => {
      expect(new Complex(-5, 0).arg()).toBeCloseTo(Math.PI, 10);
    });
  });

  describe("conjugate and negate", () => {
    test("conjugate flips imaginary sign", () => {
      const z = new Complex(3, 4);
      const conj = z.conjugate();
      expect(conj.re).toBe(3);
      expect(conj.im).toBe(-4);
    });

    test("negate flips both signs", () => {
      const z = new Complex(3, 4);
      const neg = z.negate();
      expect(neg.re).toBe(-3);
      expect(neg.im).toBe(-4);
    });
  });

  describe("arithmetic operations", () => {
    test("add two complex numbers", () => {
      const a = new Complex(1, 2);
      const b = new Complex(3, 4);
      const sum = a.add(b);
      expect(sum.re).toBe(4);
      expect(sum.im).toBe(6);
    });

    test("add complex and real", () => {
      const z = new Complex(1, 2);
      const sum = z.add(5);
      expect(sum.re).toBe(6);
      expect(sum.im).toBe(2);
    });

    test("subtract two complex numbers", () => {
      const a = new Complex(5, 7);
      const b = new Complex(2, 3);
      const diff = a.subtract(b);
      expect(diff.re).toBe(3);
      expect(diff.im).toBe(4);
    });

    test("subtract real from complex", () => {
      const z = new Complex(5, 3);
      const diff = z.subtract(2);
      expect(diff.re).toBe(3);
      expect(diff.im).toBe(3);
    });

    test("multiply two complex numbers", () => {
      // (1 + 2i)(3 + 4i) = 3 + 4i + 6i + 8i² = 3 + 10i - 8 = -5 + 10i
      const a = new Complex(1, 2);
      const b = new Complex(3, 4);
      const product = a.multiply(b);
      expect(product.re).toBe(-5);
      expect(product.im).toBe(10);
    });

    test("multiply complex by real", () => {
      const z = new Complex(2, 3);
      const product = z.multiply(4);
      expect(product.re).toBe(8);
      expect(product.im).toBe(12);
    });

    test("multiply by i rotates 90 degrees", () => {
      const z = new Complex(1, 0);
      const rotated = z.multiply(Complex.I);
      expect(rotated.re).toBeCloseTo(0, 10);
      expect(rotated.im).toBeCloseTo(1, 10);
    });

    test("divide two complex numbers", () => {
      // (1 + 2i) / (3 + 4i)
      // = (1 + 2i)(3 - 4i) / (9 + 16)
      // = (3 - 4i + 6i - 8i²) / 25
      // = (3 + 2i + 8) / 25
      // = (11 + 2i) / 25
      // = 0.44 + 0.08i
      const a = new Complex(1, 2);
      const b = new Complex(3, 4);
      const quotient = a.divide(b);
      expect(quotient.re).toBeCloseTo(0.44, 10);
      expect(quotient.im).toBeCloseTo(0.08, 10);
    });

    test("divide complex by real", () => {
      const z = new Complex(6, 8);
      const quotient = z.divide(2);
      expect(quotient.re).toBe(3);
      expect(quotient.im).toBe(4);
    });

    test("reciprocal is correct", () => {
      const z = new Complex(3, 4);
      const recip = z.reciprocal();
      // 1/(3+4i) = (3-4i)/25 = 0.12 - 0.16i
      expect(recip.re).toBeCloseTo(0.12, 10);
      expect(recip.im).toBeCloseTo(-0.16, 10);
    });
  });

  describe("transcendental functions", () => {
    test("exp of zero is one", () => {
      const result = Complex.ZERO.exp();
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("exp of pure imaginary gives rotation", () => {
      // e^(iπ) = -1
      const z = new Complex(0, Math.PI);
      const result = z.exp();
      expect(result.re).toBeCloseTo(-1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("exp of 1 is e", () => {
      const z = new Complex(1, 0);
      const result = z.exp();
      expect(result.re).toBeCloseTo(Math.E, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("log of e is 1", () => {
      const z = new Complex(Math.E, 0);
      const result = z.log();
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("log of -1 is iπ", () => {
      const z = new Complex(-1, 0);
      const result = z.log();
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(Math.PI, 10);
    });

    test("sqrt of 4 is 2", () => {
      const z = new Complex(4, 0);
      const result = z.sqrt();
      expect(result.re).toBeCloseTo(2, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("sqrt of -1 is i", () => {
      const z = new Complex(-1, 0);
      const result = z.sqrt();
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(1, 10);
    });

    test("sqrt of i", () => {
      // sqrt(i) = (1 + i) / sqrt(2)
      const result = Complex.I.sqrt();
      const expected = 1 / Math.sqrt(2);
      expect(result.re).toBeCloseTo(expected, 10);
      expect(result.im).toBeCloseTo(expected, 10);
    });
  });

  describe("trigonometric functions", () => {
    test("sin of zero is zero", () => {
      const result = Complex.ZERO.sin();
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("cos of zero is one", () => {
      const result = Complex.ZERO.cos();
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("sin of π/2 is 1", () => {
      const z = new Complex(Math.PI / 2, 0);
      const result = z.sin();
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("cos of π is -1", () => {
      const z = new Complex(Math.PI, 0);
      const result = z.cos();
      expect(result.re).toBeCloseTo(-1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("sinh of zero is zero", () => {
      const result = Complex.ZERO.sinh();
      expect(result.re).toBeCloseTo(0, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("cosh of zero is one", () => {
      const result = Complex.ZERO.cosh();
      expect(result.re).toBeCloseTo(1, 10);
      expect(result.im).toBeCloseTo(0, 10);
    });

    test("sinh and cosh satisfy identity", () => {
      // cosh²(z) - sinh²(z) = 1
      const z = new Complex(1.5, 0.7);
      const sinhZ = z.sinh();
      const coshZ = z.cosh();
      const sinh2 = sinhZ.multiply(sinhZ);
      const cosh2 = coshZ.multiply(coshZ);
      const diff = cosh2.subtract(sinh2);
      expect(diff.re).toBeCloseTo(1, 10);
      expect(diff.im).toBeCloseTo(0, 10);
    });
  });

  describe("equality and utility", () => {
    test("equals with same values", () => {
      const a = new Complex(3, 4);
      const b = new Complex(3, 4);
      expect(a.equals(b)).toBe(true);
    });

    test("equals with different values", () => {
      const a = new Complex(3, 4);
      const b = new Complex(3, 5);
      expect(a.equals(b)).toBe(false);
    });

    test("equals with tolerance", () => {
      const a = new Complex(1.0000001, 2.0000001);
      const b = new Complex(1, 2);
      expect(a.equals(b, 0.0001)).toBe(true);
      expect(a.equals(b, 0.0000001)).toBe(false);
    });

    test("copy creates independent copy", () => {
      const original = new Complex(3, 4);
      const copy = Complex.copy(original);
      expect(copy.re).toBe(original.re);
      expect(copy.im).toBe(original.im);
    });

    test("fromPolar creates correct complex number", () => {
      const z = Complex.fromPolar(5, Math.PI / 4);
      expect(z.abs()).toBeCloseTo(5, 10);
      expect(z.arg()).toBeCloseTo(Math.PI / 4, 10);
    });

    test("toString formats correctly", () => {
      expect(new Complex(3, 4).toString()).toBe("3 + 4i");
      expect(new Complex(3, -4).toString()).toBe("3 - 4i");
      expect(new Complex(3, 0).toString()).toBe("3");
      expect(new Complex(0, 4).toString()).toBe("4i");
    });
  });

  describe("special cases and edge values", () => {
    test("isNaN detects NaN", () => {
      expect(new Complex(NaN, 0).isNaN()).toBe(true);
      expect(new Complex(0, NaN).isNaN()).toBe(true);
      expect(new Complex(1, 2).isNaN()).toBe(false);
    });

    test("isInfinite detects infinity", () => {
      expect(new Complex(Infinity, 0).isInfinite()).toBe(true);
      expect(new Complex(0, Infinity).isInfinite()).toBe(true);
      expect(new Complex(1, 2).isInfinite()).toBe(false);
    });
  });
});
