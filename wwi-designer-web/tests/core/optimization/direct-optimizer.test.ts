/**
 * Tests for DIRECT optimizer
 *
 * These tests verify that the DIRECT algorithm correctly finds
 * global optima of test functions.
 */

import { describe, test, expect } from "bun:test";
import { DIRECTOptimizer } from "../../../src/core/optimization/direct-optimizer.ts";

describe("DIRECTOptimizer", () => {
  describe("construction", () => {
    test("creates optimizer with default options", () => {
      const optimizer = new DIRECTOptimizer();
      expect(optimizer).toBeInstanceOf(DIRECTOptimizer);
    });

    test("creates optimizer with custom options", () => {
      const optimizer = new DIRECTOptimizer({
        convergenceThreshold: 1e-6,
        maxEvaluations: 5000,
        targetValue: 0.001,
      });
      expect(optimizer).toBeInstanceOf(DIRECTOptimizer);
    });
  });

  describe("optimization of simple functions", () => {
    test("finds minimum of quadratic function", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 1000,
      });

      // f(x) = (x - 3)^2, minimum at x = 3
      const result = optimizer.optimize(
        ([x]) => (x! - 3) ** 2,
        [0], // lower bounds
        [10] // upper bounds
      );

      expect(result.point[0]).toBeCloseTo(3, 1);
      expect(result.value).toBeLessThan(0.1);
      expect(result.converged).toBe(true);
    });

    test("finds minimum of 2D quadratic function", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 2000,
      });

      // f(x,y) = (x - 2)^2 + (y - 3)^2, minimum at (2, 3)
      const result = optimizer.optimize(
        ([x, y]) => (x! - 2) ** 2 + (y! - 3) ** 2,
        [0, 0],
        [5, 5]
      );

      expect(result.point[0]).toBeCloseTo(2, 0);
      expect(result.point[1]).toBeCloseTo(3, 0);
      expect(result.value).toBeLessThan(1);
    });

    test("finds minimum of Rosenbrock function in small region", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 5000,
        convergenceThreshold: 1e-4,
      });

      // Rosenbrock: f(x,y) = (1-x)^2 + 100*(y-x^2)^2
      // Minimum at (1, 1)
      const result = optimizer.optimize(
        ([x, y]) => (1 - x!) ** 2 + 100 * (y! - x! * x!) ** 2,
        [0, 0],
        [2, 2]
      );

      expect(result.point[0]).toBeCloseTo(1, 0);
      expect(result.point[1]).toBeCloseTo(1, 0);
    });
  });

  describe("convergence criteria", () => {
    test("stops when target value reached", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 10000,
        targetValue: 0.1,
      });

      const result = optimizer.optimize(
        ([x]) => (x! - 5) ** 2,
        [0],
        [10]
      );

      expect(result.value).toBeLessThanOrEqual(0.1);
    });

    test("stops when max evaluations reached", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 50,
      });

      const result = optimizer.optimize(
        ([x]) => Math.sin(x!) * x!,
        [-10],
        [10]
      );

      expect(result.evaluations).toBeLessThanOrEqual(100); // Some overhead allowed
    });
  });

  describe("multi-dimensional optimization", () => {
    test("optimizes 3D function", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 3000,
      });

      // Sphere function: sum of squares, minimum at origin
      const result = optimizer.optimize(
        (point) => point.reduce((sum, x) => sum + x * x, 0),
        [-2, -2, -2],
        [2, 2, 2]
      );

      for (const x of result.point) {
        expect(Math.abs(x)).toBeLessThan(1);
      }
    });

    test("handles different bound ranges", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 2000,
      });

      // Minimum at (1, 100)
      const result = optimizer.optimize(
        ([x, y]) => (x! - 1) ** 2 + ((y! - 100) / 100) ** 2,
        [0, 0],
        [5, 200]
      );

      expect(result.point[0]).toBeCloseTo(1, 0);
      expect(result.point[1]).toBeCloseTo(100, 0);
    });
  });

  describe("edge cases", () => {
    test("handles single dimension", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 500,
      });

      const result = optimizer.optimize(
        ([x]) => x! * x!,
        [-5],
        [5]
      );

      expect(Math.abs(result.point[0]!)).toBeLessThan(1);
    });

    test("handles very small search space", () => {
      const optimizer = new DIRECTOptimizer({
        maxEvaluations: 100,
      });

      const result = optimizer.optimize(
        ([x]) => (x! - 0.5) ** 2,
        [0],
        [1]
      );

      expect(result.point[0]).toBeCloseTo(0.5, 1);
    });

    test("throws on invalid dimension", () => {
      const optimizer = new DIRECTOptimizer();

      expect(() =>
        optimizer.optimize(
          () => 0,
          [],
          []
        )
      ).toThrow();
    });
  });
});
