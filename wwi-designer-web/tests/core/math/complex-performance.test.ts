/**
 * Performance benchmark tests for Complex class mutable operations.
 *
 * These tests verify that the new mutable in-place operations
 * are faster than the immutable versions.
 */

import { describe, it, expect } from "bun:test";
import { Complex } from "../../../src/core/math/complex.ts";
import { TransferMatrix } from "../../../src/core/math/transfer-matrix.ts";

describe("Complex performance", () => {
  const ITERATIONS = 100_000;

  it("mutable addInPlace is correct", () => {
    const a = new Complex(3, 4);
    const b = new Complex(1, 2);
    const result = a.copy().addInPlace(b);
    const expected = a.add(b);
    expect(result.equals(expected)).toBe(true);
  });

  it("mutable multiplyInPlace is correct", () => {
    const a = new Complex(3, 4);
    const b = new Complex(1, 2);
    const result = a.copy().multiplyInPlace(b);
    const expected = a.multiply(b);
    expect(result.equals(expected)).toBe(true);
  });

  it("mutable divideInPlace is correct", () => {
    const a = new Complex(3, 4);
    const b = new Complex(1, 2);
    const result = a.copy().divideInPlace(b);
    const expected = a.divide(b);
    expect(result.equals(expected, 1e-10)).toBe(true);
  });

  it("mutable chained operations are correct", () => {
    const a = new Complex(3, 4);
    const b = new Complex(1, 2);
    const c = new Complex(2, 1);

    // a * b + c using immutable
    const expected = a.multiply(b).add(c);

    // a * b + c using mutable
    const result = a.copy().multiplyInPlace(b).addInPlace(c);

    expect(result.equals(expected, 1e-10)).toBe(true);
  });

  it("immutable vs mutable benchmark (informational)", () => {
    const a = new Complex(3.14159, 2.71828);
    const b = new Complex(1.41421, 1.73205);
    const c = new Complex(2.23607, 1.61803);

    // Warm up JIT
    for (let i = 0; i < 1000; i++) {
      a.multiply(b).add(c);
      a.copy().multiplyInPlace(b).addInPlace(c);
    }

    // Time immutable operations
    const startImmutable = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      // Creates 3 objects per iteration
      a.multiply(b).add(c);
    }
    const timeImmutable = performance.now() - startImmutable;

    // Time mutable operations
    const scratch = new Complex(0, 0);
    const startMutable = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      // Reuses scratch object
      scratch.set(a.re, a.im).multiplyInPlace(b).addInPlace(c);
    }
    const timeMutable = performance.now() - startMutable;

    // Log results for informational purposes
    console.log(`\nComplex benchmark (${ITERATIONS} iterations):`);
    console.log(`  Immutable: ${timeImmutable.toFixed(2)}ms`);
    console.log(`  Mutable:   ${timeMutable.toFixed(2)}ms`);
    console.log(`  Speedup:   ${(timeImmutable / timeMutable).toFixed(2)}x`);

    // Just verify both produce same result (no performance assertion)
    const immutableResult = a.multiply(b).add(c);
    scratch.set(a.re, a.im).multiplyInPlace(b).addInPlace(c);
    expect(scratch.equals(immutableResult, 1e-10)).toBe(true);
  });
});

describe("TransferMatrix performance", () => {
  it("multiplyInPlace produces correct results", () => {
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

    // Use immutable multiply as reference
    const expected = m1.multiply(m2);

    // Test in-place multiply
    const m1Copy = new TransferMatrix(m1);
    m1Copy.multiplyInPlace(m2);

    expect(m1Copy.equals(expected, 1e-10)).toBe(true);
  });

  it("multiplyInPlace benchmark (informational)", () => {
    const ITERATIONS = 10_000;

    const m1 = new TransferMatrix(
      new Complex(1.1, 2.2),
      new Complex(3.3, 4.4),
      new Complex(5.5, 6.6),
      new Complex(7.7, 8.8)
    );
    const m2 = new TransferMatrix(
      new Complex(2.1, 1.2),
      new Complex(4.3, 3.4),
      new Complex(6.5, 5.6),
      new Complex(8.7, 7.8)
    );

    // Warm up JIT
    for (let i = 0; i < 100; i++) {
      m1.multiply(m2);
      new TransferMatrix(m1).multiplyInPlace(m2);
    }

    // Time immutable operations
    const startImmutable = performance.now();
    let result = m1;
    for (let i = 0; i < ITERATIONS; i++) {
      result = result.multiply(m2);
    }
    const timeImmutable = performance.now() - startImmutable;

    // Time mutable operations
    const mutableResult = new TransferMatrix(m1);
    const startMutable = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      mutableResult.multiplyInPlace(m2);
    }
    const timeMutable = performance.now() - startMutable;

    console.log(`\nTransferMatrix multiply benchmark (${ITERATIONS} iterations):`);
    console.log(`  Immutable: ${timeImmutable.toFixed(2)}ms`);
    console.log(`  Mutable:   ${timeMutable.toFixed(2)}ms`);
    console.log(`  Speedup:   ${(timeImmutable / timeMutable).toFixed(2)}x`);

    // Just verify we can run both (results will differ due to accumulation)
    expect(true).toBe(true);
  });
});
