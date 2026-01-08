/**
 * Unit tests for SimplePhysicalParameters.
 *
 * Tests the Yang Yili speed of sound formula and linear approximations
 * for air properties at various temperatures.
 */

import { describe, test, expect } from "bun:test";
import { SimplePhysicalParameters } from "../../../src/core/physics/simple-physical-parameters.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";

describe("SimplePhysicalParameters", () => {
  describe("constructor", () => {
    test("default constructor creates parameters at 72°F (~22.2°C)", () => {
      const params = new SimplePhysicalParameters();
      // 72°F = (72 + 40) * 5/9 - 40 = 22.22°C
      expect(params.getTemperature()).toBeCloseTo(22.22, 1);
    });

    test("constructs from temperature in Celsius", () => {
      const params = new SimplePhysicalParameters(25);
      expect(params.getTemperature()).toBe(25);
    });

    test("constructs from PhysicalParameters", () => {
      const fullParams = new PhysicalParameters(20, "C");
      const simpleParams = new SimplePhysicalParameters(fullParams);
      expect(simpleParams.getTemperature()).toBeCloseTo(20, 1);
    });
  });

  describe("speed of sound (Yang Yili formula)", () => {
    test("at 20°C, speed is approximately 343 m/s", () => {
      const params = new SimplePhysicalParameters(20);
      // At 20°C, 45% humidity, speed should be around 343-344 m/s
      expect(params.getSpeedOfSound()).toBeGreaterThan(343);
      expect(params.getSpeedOfSound()).toBeLessThan(345);
    });

    test("at 0°C, speed is approximately 331 m/s", () => {
      const params = new SimplePhysicalParameters(0);
      expect(params.getSpeedOfSound()).toBeGreaterThan(330);
      expect(params.getSpeedOfSound()).toBeLessThan(333);
    });

    test("speed increases with temperature", () => {
      const params10 = new SimplePhysicalParameters(10);
      const params20 = new SimplePhysicalParameters(20);
      const params30 = new SimplePhysicalParameters(30);

      expect(params20.getSpeedOfSound()).toBeGreaterThan(params10.getSpeedOfSound());
      expect(params30.getSpeedOfSound()).toBeGreaterThan(params20.getSpeedOfSound());
    });
  });

  describe("air density (linear approximation)", () => {
    test("at reference temp (26.85°C), density is 1.1769 kg/m³", () => {
      const params = new SimplePhysicalParameters(26.85);
      expect(params.getRho()).toBeCloseTo(1.1769, 3);
    });

    test("density decreases with temperature", () => {
      const params10 = new SimplePhysicalParameters(10);
      const params30 = new SimplePhysicalParameters(30);

      expect(params10.getRho()).toBeGreaterThan(params30.getRho());
    });
  });

  describe("gamma (ratio of specific heats)", () => {
    test("at reference temp, gamma is 1.4017", () => {
      const params = new SimplePhysicalParameters(26.85);
      expect(params.getGamma()).toBeCloseTo(1.4017, 4);
    });
  });

  describe("calcZ0", () => {
    test("calculates wave impedance correctly", () => {
      const params = new SimplePhysicalParameters(20);
      const radius = 0.01; // 10mm radius

      const Z0 = params.calcZ0(radius);
      // Z0 = rho * c / (pi * r^2)
      const expected =
        (params.getRho() * params.getSpeedOfSound()) /
        (Math.PI * radius * radius);
      expect(Z0).toBeCloseTo(expected, 0);
    });
  });

  describe("wave number calculations", () => {
    test("calcWaveNumber returns 2*pi*f/c", () => {
      const params = new SimplePhysicalParameters(20);
      const freq = 440;
      const k = params.calcWaveNumber(freq);
      const expected = (2 * Math.PI * freq) / params.getSpeedOfSound();
      expect(k).toBeCloseTo(expected, 6);
    });

    test("calcFrequency is inverse of calcWaveNumber", () => {
      const params = new SimplePhysicalParameters(20);
      const freq = 440;
      const k = params.calcWaveNumber(freq);
      const recoveredFreq = params.calcFrequency(k);
      expect(recoveredFreq).toBeCloseTo(freq, 6);
    });
  });

  describe("comparison with full PhysicalParameters", () => {
    test("speed of sound differs by less than 1%", () => {
      const fullParams = new PhysicalParameters(72, "F");
      const simpleParams = new SimplePhysicalParameters(fullParams);

      const diff = Math.abs(
        fullParams.getSpeedOfSound() - simpleParams.getSpeedOfSound()
      );
      const percentDiff = (diff / fullParams.getSpeedOfSound()) * 100;

      expect(percentDiff).toBeLessThan(1);
    });

    test("density differs by less than 1%", () => {
      const fullParams = new PhysicalParameters(72, "F");
      const simpleParams = new SimplePhysicalParameters(fullParams);

      const diff = Math.abs(fullParams.getRho() - simpleParams.getRho());
      const percentDiff = (diff / fullParams.getRho()) * 100;

      expect(percentDiff).toBeLessThan(1);
    });
  });
});
