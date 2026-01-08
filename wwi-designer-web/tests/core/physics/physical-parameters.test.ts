/**
 * Tests for PhysicalParameters class
 *
 * These tests verify that the physical parameters of air are
 * calculated correctly for acoustic modeling.
 */

import { describe, test, expect } from "bun:test";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";

describe("PhysicalParameters", () => {
  describe("construction", () => {
    test("default constructor creates standard parameters", () => {
      const params = new PhysicalParameters();
      // Default is 72°F = 22.22°C
      expect(params.getTemperature()).toBeCloseTo(22.22, 1);
      expect(params.getPressure()).toBeCloseTo(101.325, 3);
    });

    test("constructor with Fahrenheit temperature", () => {
      const params = new PhysicalParameters(68, "F");
      // 68°F = 20°C
      expect(params.getTemperature()).toBeCloseTo(20, 1);
    });

    test("constructor with Celsius temperature", () => {
      const params = new PhysicalParameters(25, "C");
      expect(params.getTemperature()).toBe(25);
    });

    test("constructor with full specification", () => {
      const params = new PhysicalParameters(20, "C", 101.0, 50.0, 0.0004);
      expect(params.getTemperature()).toBe(20);
      expect(params.getPressure()).toBe(101.0);
      expect(params.getHumidity()).toBe(50.0);
      expect(params.get_xCO2()).toBe(0.0004);
    });
  });

  describe("speed of sound", () => {
    test("speed of sound at 20°C is approximately 343 m/s", () => {
      const params = new PhysicalParameters(20, "C");
      const c = params.getSpeedOfSound();
      // Speed of sound in air at 20°C, 50% humidity is about 343-344 m/s
      expect(c).toBeGreaterThan(342);
      expect(c).toBeLessThan(346);
    });

    test("speed of sound increases with temperature", () => {
      const cold = new PhysicalParameters(10, "C");
      const warm = new PhysicalParameters(30, "C");
      expect(warm.getSpeedOfSound()).toBeGreaterThan(cold.getSpeedOfSound());
    });

    test("speed of sound at 0°C is approximately 331 m/s", () => {
      const params = new PhysicalParameters(0, "C");
      const c = params.getSpeedOfSound();
      // Speed of sound in air at 0°C is about 331 m/s
      expect(c).toBeGreaterThan(330);
      expect(c).toBeLessThan(333);
    });
  });

  describe("air density", () => {
    test("air density at 20°C is approximately 1.2 kg/m³", () => {
      const params = new PhysicalParameters(20, "C");
      const rho = params.getRho();
      expect(rho).toBeGreaterThan(1.15);
      expect(rho).toBeLessThan(1.25);
    });

    test("air density decreases with temperature", () => {
      const cold = new PhysicalParameters(10, "C");
      const warm = new PhysicalParameters(30, "C");
      expect(warm.getRho()).toBeLessThan(cold.getRho());
    });

    test("getDensity returns same as getRho", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getDensity()).toBe(params.getRho());
    });
  });

  describe("specific heat ratio", () => {
    test("gamma is approximately 1.4", () => {
      const params = new PhysicalParameters(20, "C");
      const gamma = params.getGamma();
      expect(gamma).toBeGreaterThan(1.39);
      expect(gamma).toBeLessThan(1.41);
    });

    test("getSpecificHeatRatio returns same as getGamma", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getSpecificHeatRatio()).toBe(params.getGamma());
    });
  });

  describe("wave impedance", () => {
    test("calcZ0 calculates wave impedance", () => {
      const params = new PhysicalParameters(20, "C");
      const radius = 0.01; // 10mm radius
      const z0 = params.calcZ0(radius);
      // Z0 = rho * c / (pi * r^2)
      // At 20°C: ~1.2 * 343 / (pi * 0.0001) ≈ 1.3e6
      expect(z0).toBeGreaterThan(1e6);
      expect(z0).toBeLessThan(2e6);
    });

    test("Z0 increases with smaller radius", () => {
      const params = new PhysicalParameters(20, "C");
      const z0_small = params.calcZ0(0.005);
      const z0_large = params.calcZ0(0.01);
      expect(z0_small).toBeGreaterThan(z0_large);
    });

    test("Z0 scales with 1/r²", () => {
      const params = new PhysicalParameters(20, "C");
      const z0_1 = params.calcZ0(0.01);
      const z0_2 = params.calcZ0(0.02);
      // z0_1 / z0_2 should be (0.02/0.01)² = 4
      expect(z0_1 / z0_2).toBeCloseTo(4, 6);
    });
  });

  describe("wave number", () => {
    test("calcWaveNumber converts frequency to wave number", () => {
      const params = new PhysicalParameters(20, "C");
      const freq = 440; // A4
      const k = params.calcWaveNumber(freq);
      // k = 2*pi*f/c, at 343 m/s: 2*pi*440/343 ≈ 8.06
      expect(k).toBeGreaterThan(7.5);
      expect(k).toBeLessThan(8.5);
    });

    test("calcFrequency inverts calcWaveNumber", () => {
      const params = new PhysicalParameters(20, "C");
      const freq = 440;
      const k = params.calcWaveNumber(freq);
      const freqBack = params.calcFrequency(k);
      expect(freqBack).toBeCloseTo(freq, 10);
    });

    test("wave number is proportional to frequency", () => {
      const params = new PhysicalParameters(20, "C");
      const k1 = params.calcWaveNumber(440);
      const k2 = params.calcWaveNumber(880);
      expect(k2 / k1).toBeCloseTo(2, 10);
    });
  });

  describe("epsilon and alpha constants", () => {
    test("getAlphaConstant returns positive value", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getAlphaConstant()).toBeGreaterThan(0);
    });

    test("getEpsilon calculates loss factor", () => {
      const params = new PhysicalParameters(20, "C");
      const waveNumber = params.calcWaveNumber(440);
      const radius = 0.01;
      const epsilon = params.getEpsilon(waveNumber, radius);
      // Epsilon should be a small positive number
      expect(epsilon).toBeGreaterThan(0);
      expect(epsilon).toBeLessThan(0.1);
    });

    test("epsilon increases with smaller radius", () => {
      const params = new PhysicalParameters(20, "C");
      const k = params.calcWaveNumber(440);
      const eps_small = params.getEpsilon(k, 0.005);
      const eps_large = params.getEpsilon(k, 0.01);
      expect(eps_small).toBeGreaterThan(eps_large);
    });
  });

  describe("complex wave number", () => {
    test("getComplexWaveNumber includes losses", () => {
      const params = new PhysicalParameters(20, "C");
      const k = params.calcWaveNumber(440);
      const radius = 0.01;
      const kComplex = params.getComplexWaveNumber(k, radius);

      // Real part should include loss term
      expect(kComplex.re).toBeGreaterThan(0);
      // Imaginary part should be larger than basic wave number due to losses
      expect(kComplex.im).toBeGreaterThan(k * 0.99);
    });
  });

  describe("pressure calculations", () => {
    test("pressureAt calculates pressure at elevation", () => {
      const seaLevel = PhysicalParameters.pressureAt(101.325, 0);
      expect(seaLevel).toBeCloseTo(101.325, 3);

      const elevated = PhysicalParameters.pressureAt(101.325, 1000);
      // Pressure decreases with altitude
      expect(elevated).toBeLessThan(101.325);
      expect(elevated).toBeGreaterThan(85);
    });

    test("standardPressureAt uses standard sea-level pressure", () => {
      const seaLevel = PhysicalParameters.standardPressureAt(0);
      expect(seaLevel).toBeCloseTo(101.325, 3);
    });
  });

  describe("other properties", () => {
    test("dynamic viscosity is positive", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getEta()).toBeGreaterThan(0);
      expect(params.getDynamicViscosity()).toBe(params.getEta());
    });

    test("thermal conductivity is positive", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getKappa()).toBeGreaterThan(0);
      expect(params.getThermalConductivity()).toBe(params.getKappa());
    });

    test("specific heat is positive", () => {
      const params = new PhysicalParameters(20, "C");
      expect(params.getSpecificHeat()).toBeGreaterThan(0);
      expect(params.getC_p()).toBe(params.getSpecificHeat());
    });

    test("Prandtl number is positive", () => {
      const params = new PhysicalParameters(20, "C");
      const Pr = params.getPrandtl();
      expect(Pr).toBeGreaterThan(0);
      // Prandtl number for air is typically around 0.7-0.8
      expect(Pr).toBeGreaterThan(0.6);
      expect(Pr).toBeLessThan(0.9);
    });
  });

  describe("toString", () => {
    test("toString returns formatted string", () => {
      const params = new PhysicalParameters(20, "C");
      const str = params.toString();
      expect(str).toContain("Temperature");
      expect(str).toContain("Speed of Sound");
      expect(str).toContain("Density");
    });
  });
});
