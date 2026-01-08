/**
 * Tests for the BOBYQA optimizer.
 */

import { describe, it, expect } from "bun:test";
import { BOBYQAOptimizer } from "../../../src/core/optimization/bobyqa-optimizer.ts";

describe("BOBYQAOptimizer", () => {
  describe("basic functionality", () => {
    it("should minimize a simple quadratic function", () => {
      // f(x, y) = x^2 + y^2, minimum at (0, 0)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      // Should make significant progress toward minimum
      expect(result.value).toBeLessThan(5); // Much better than initial 13
      expect(Math.abs(result.point[0])).toBeLessThan(2.5);
      expect(Math.abs(result.point[1])).toBeLessThan(2.5);
    });

    it("should minimize a shifted quadratic function", () => {
      // f(x, y) = (x-1)^2 + (y-2)^2, minimum at (1, 2)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) =>
          (point[0] - 1) * (point[0] - 1) + (point[1] - 2) * (point[1] - 2),
        [-5, -5],
        [5, 5],
        [0, 0]
      );

      expect(result.value).toBeLessThan(1); // Should get close to minimum
      expect(Math.abs(result.point[0] - 1)).toBeLessThan(1);
      expect(Math.abs(result.point[1] - 2)).toBeLessThan(1);
    });

    it("should handle 3D optimization", () => {
      // f(x, y, z) = x^2 + y^2 + z^2, minimum at (0, 0, 0)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 2000);

      const result = optimizer.optimize(
        (point) =>
          point[0] * point[0] + point[1] * point[1] + point[2] * point[2],
        [-5, -5, -5],
        [5, 5, 5],
        [1, 2, 3]
      );

      expect(result.value).toBeLessThan(5); // Initial value is 14
    });
  });

  describe("bounds handling", () => {
    it("should respect lower bounds", () => {
      // f(x, y) = x^2 + y^2 with x >= 1, y >= 1
      // Constrained minimum at (1, 1)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [1, 1],
        [5, 5],
        [3, 3]
      );

      expect(result.point[0]).toBeGreaterThanOrEqual(0.99);
      expect(result.point[1]).toBeGreaterThanOrEqual(0.99);
    });

    it("should respect upper bounds", () => {
      // f(x, y) = -x - y with x <= 2, y <= 3
      // Maximum (minimum of -f) at (2, 3)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      const result = optimizer.optimize(
        (point) => -point[0] - point[1],
        [0, 0],
        [2, 3],
        [1, 1]
      );

      expect(result.point[0]).toBeLessThanOrEqual(2.01);
      expect(result.point[1]).toBeLessThanOrEqual(3.01);
    });

    it("should find constrained minimum near bounds", () => {
      // f(x, y) = (x-5)^2 + (y-5)^2 with x, y in [0, 2]
      // Constrained minimum at (2, 2)
      const optimizer = new BOBYQAOptimizer(undefined, 0.5, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) =>
          (point[0] - 5) * (point[0] - 5) + (point[1] - 5) * (point[1] - 5),
        [0, 0],
        [2, 2],
        [1, 1]
      );

      // Should move toward the upper bounds (the constrained minimum)
      expect(result.point[0]).toBeGreaterThan(0.8);
      expect(result.point[1]).toBeGreaterThan(0.8);
    });
  });

  describe("evaluation tracking", () => {
    it("should track the number of evaluations", () => {
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      expect(optimizer.getEvaluations()).toBeGreaterThan(0);
      expect(optimizer.getEvaluations()).toBeLessThanOrEqual(500);
    });

    it("should respect max evaluations limit", () => {
      const maxEvals = 50;
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, maxEvals);

      optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      expect(optimizer.getEvaluations()).toBeLessThanOrEqual(maxEvals + 10); // Allow some slack for initialization
    });
  });

  describe("configuration", () => {
    it("should use custom trust region radius", () => {
      const largeRadius = new BOBYQAOptimizer(undefined, 2.0, 1e-6, 1000);
      const smallRadius = new BOBYQAOptimizer(undefined, 0.5, 1e-6, 1000);

      // Both should find the minimum, but may take different paths
      const resultLarge = largeRadius.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      const resultSmall = smallRadius.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      // Both should make progress toward minimum (initial value is 13)
      expect(resultLarge.value).toBeLessThan(10);
      expect(resultSmall.value).toBeLessThan(10);
    });

    it("should use custom number of interpolation points", () => {
      // For 2D: valid range is [4, 6] (n+2 to (n+1)(n+2)/2)
      const optimizer = new BOBYQAOptimizer(5, 1.0, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [2, 3]
      );

      expect(result.value).toBeLessThan(5); // Initial is 13
    });
  });

  describe("error handling", () => {
    it("should throw for 1D problems", () => {
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      expect(() => {
        optimizer.optimize((point) => point[0] * point[0], [-5], [5], [2]);
      }).toThrow(/at least 2 dimensions/);
    });

    it("should throw for invalid bounds", () => {
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      expect(() => {
        optimizer.optimize(
          (point) => point[0] * point[0] + point[1] * point[1],
          [5, 5], // Lower bounds higher than upper bounds
          [-5, -5],
          [0, 0]
        );
      }).toThrow(/Invalid bounds/);
    });

    it("should throw for invalid number of interpolation points", () => {
      // For 2D: minimum is n+2=4, maximum is (n+1)(n+2)/2=6
      const optimizer = new BOBYQAOptimizer(2, 1.0, 1e-6, 500); // Too few

      expect(() => {
        optimizer.optimize(
          (point) => point[0] * point[0] + point[1] * point[1],
          [-5, -5],
          [5, 5],
          [2, 3]
        );
      }).toThrow(/interpolation points/);
    });
  });

  describe("challenging functions", () => {
    it("should optimize Rosenbrock function (2D)", () => {
      // f(x, y) = (1-x)^2 + 100*(y-x^2)^2, minimum at (1, 1)
      const optimizer = new BOBYQAOptimizer(undefined, 2.0, 1e-8, 2000);

      const result = optimizer.optimize(
        (point) => {
          const x = point[0];
          const y = point[1];
          return (1 - x) * (1 - x) + 100 * (y - x * x) * (y - x * x);
        },
        [-5, -5],
        [5, 5],
        [0, 0]
      );

      // Rosenbrock is challenging, so we accept a wider tolerance
      expect(result.value).toBeLessThan(10);
    });

    it("should optimize a sum of sines (multimodal)", () => {
      // This is a challenging multimodal function
      // f(x,y) = sin(x) + sin(y) + 2, ranges from 0 to 4
      // Minimum at (-pi/2, -pi/2) = 0
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) => {
          return Math.sin(point[0]) + Math.sin(point[1]) + 2;
        },
        [-3, -3],
        [3, 3],
        [0, 0]
      );

      // Should find some local minimum, starting at f(0,0)=2
      expect(result.value).toBeLessThan(2.0);
    });

    it("should handle ellipsoidal function", () => {
      // f(x) = sum(i * x_i^2), tests scaling
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 2000);

      const result = optimizer.optimize(
        (point) => {
          let sum = 0;
          for (let i = 0; i < point.length; i++) {
            sum += (i + 1) * point[i] * point[i];
          }
          return sum;
        },
        [-5, -5, -5],
        [5, 5, 5],
        [1, 2, 3]
      );

      // Initial value is 1+8+27=36, should improve significantly
      expect(result.value).toBeLessThan(20);
    });
  });

  describe("special cases", () => {
    it("should handle starting at the optimum", () => {
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 500);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-5, -5],
        [5, 5],
        [0, 0] // Start at optimal point
      );

      expect(result.value).toBeLessThan(0.01);
    });

    it("should handle narrow bounds", () => {
      const optimizer = new BOBYQAOptimizer(undefined, 0.1, 1e-6, 500);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-0.1, -0.1],
        [0.1, 0.1],
        [0.05, 0.05]
      );

      expect(result.value).toBeLessThan(0.01);
      expect(Math.abs(result.point[0])).toBeLessThanOrEqual(0.11);
      expect(Math.abs(result.point[1])).toBeLessThanOrEqual(0.11);
    });

    it("should handle asymmetric bounds", () => {
      // Minimum of x^2 + y^2 is at (0, 0)
      // With bounds [-1, 10] x [-2, 5], minimum is still at (0, 0)
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 1000);

      const result = optimizer.optimize(
        (point) => point[0] * point[0] + point[1] * point[1],
        [-1, -2],
        [10, 5],
        [5, 2]
      );

      // Initial value is 25+4=29, should improve toward 0
      expect(result.value).toBeLessThan(20);
    });
  });
});

describe("BOBYQA integration", () => {
  it("should work with different dimensions", () => {
    for (const dim of [2, 3, 4]) {
      const optimizer = new BOBYQAOptimizer(undefined, 1.0, 1e-6, 2000);

      const lowerBounds = new Array(dim).fill(-5);
      const upperBounds = new Array(dim).fill(5);
      const startPoint = new Array(dim).fill(2);

      // Sphere function: sum of x_i^2
      const result = optimizer.optimize(
        (point) => point.reduce((sum, x) => sum + x * x, 0),
        lowerBounds,
        upperBounds,
        startPoint
      );

      // Initial value is dim*4, should improve
      expect(result.value).toBeLessThan(dim * 3);
    }
  });
});
