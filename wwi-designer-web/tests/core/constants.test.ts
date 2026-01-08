/**
 * Tests for physical constants and calculations
 */

import { describe, test, expect } from "bun:test";
import {
  PhysicalConstants,
  MusicalConstants,
  MathConstants,
  cents,
  frequencyFromCents,
  speedOfSound,
  airDensity,
  waveNumber,
  getMultiplierToMetres,
  getMultiplierFromMetres,
} from "../../src/core/constants.ts";

describe("Physical Constants", () => {
  test("P_AIR is standard atmospheric pressure", () => {
    expect(PhysicalConstants.P_AIR).toBe(101325.0);
  });

  test("GAMMA is ratio of specific heats", () => {
    expect(PhysicalConstants.GAMMA).toBeCloseTo(1.4, 1);
  });
});

describe("Musical Constants", () => {
  test("CENTS_IN_OCTAVE is 1200", () => {
    expect(MusicalConstants.CENTS_IN_OCTAVE).toBe(1200);
  });

  test("CENTS_IN_SEMITONE is 100", () => {
    expect(MusicalConstants.CENTS_IN_SEMITONE).toBe(100);
  });

  test("A440 is 440 Hz", () => {
    expect(MusicalConstants.A440).toBe(440.0);
  });

  test("CENT_FACTOR raises pitch by 1 cent", () => {
    const raised = 440 * MusicalConstants.CENT_FACTOR;
    expect(cents(440, raised)).toBeCloseTo(1, 5);
  });
});

describe("Math Constants", () => {
  test("LOG2 is natural log of 2", () => {
    expect(MathConstants.LOG2).toBeCloseTo(Math.log(2), 10);
  });
});

describe("cents function", () => {
  test("octave is 1200 cents", () => {
    expect(cents(440, 880)).toBeCloseTo(1200, 5);
  });

  test("same frequency is 0 cents", () => {
    expect(cents(440, 440)).toBe(0);
  });

  test("semitone is 100 cents (equal temperament)", () => {
    const semitoneRatio = Math.pow(2, 1 / 12);
    expect(cents(440, 440 * semitoneRatio)).toBeCloseTo(100, 5);
  });

  test("negative cents for lower frequency", () => {
    expect(cents(880, 440)).toBeCloseTo(-1200, 5);
  });
});

describe("frequencyFromCents", () => {
  test("100 cents raises by semitone", () => {
    const raised = frequencyFromCents(440, 100);
    const semitoneRatio = Math.pow(2, 1 / 12);
    expect(raised).toBeCloseTo(440 * semitoneRatio, 2);
  });

  test("1200 cents doubles frequency", () => {
    const raised = frequencyFromCents(440, 1200);
    expect(raised).toBeCloseTo(880, 1);
  });

  test("0 cents returns same frequency", () => {
    expect(frequencyFromCents(440, 0)).toBe(440);
  });
});

describe("speedOfSound", () => {
  test("speed at 0°C is approximately 331 m/s", () => {
    expect(speedOfSound(0)).toBeCloseTo(331.3, 1);
  });

  test("speed at 20°C is approximately 343 m/s", () => {
    expect(speedOfSound(20)).toBeCloseTo(343.3, 1);
  });

  test("speed increases with temperature", () => {
    expect(speedOfSound(30)).toBeGreaterThan(speedOfSound(20));
  });
});

describe("airDensity", () => {
  test("density at 20°C is approximately 1.2 kg/m³", () => {
    expect(airDensity(20)).toBeCloseTo(1.2, 1);
  });

  test("density decreases with temperature", () => {
    expect(airDensity(30)).toBeLessThan(airDensity(20));
  });
});

describe("waveNumber", () => {
  test("wave number is 2πf/c", () => {
    const freq = 440;
    const temp = 20;
    const c = speedOfSound(temp);
    const expected = (2 * Math.PI * freq) / c;
    expect(waveNumber(freq, temp)).toBeCloseTo(expected, 10);
  });
});

describe("Length unit conversion", () => {
  test("MM to metres", () => {
    expect(getMultiplierToMetres("MM")).toBe(0.001);
  });

  test("CM to metres", () => {
    expect(getMultiplierToMetres("CM")).toBe(0.01);
  });

  test("IN to metres", () => {
    expect(getMultiplierToMetres("IN")).toBe(0.0254);
  });

  test("M to metres", () => {
    expect(getMultiplierToMetres("M")).toBe(1.0);
  });

  test("metres to MM", () => {
    expect(getMultiplierFromMetres("MM")).toBe(1000);
  });

  test("round trip conversion", () => {
    const value = 100; // mm
    const inMetres = value * getMultiplierToMetres("MM");
    const backToMm = inMetres * getMultiplierFromMetres("MM");
    expect(backToMm).toBeCloseTo(value, 10);
  });
});
