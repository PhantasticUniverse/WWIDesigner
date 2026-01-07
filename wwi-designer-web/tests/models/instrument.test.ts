/**
 * Tests for Instrument model
 */

import { describe, test, expect } from "bun:test";
import {
  createInstrument,
  createBorePoint,
  createHole,
  validateInstrument,
  convertInstrumentToMetres,
  getInterpolatedBoreDiameter,
  getSortedBorePoints,
  getBoreLength,
  type Instrument,
  type BorePoint,
} from "../../src/models/instrument.ts";

describe("BorePoint", () => {
  test("createBorePoint creates valid bore point", () => {
    const bp = createBorePoint(100, 10, "Test Point");
    expect(bp.borePosition).toBe(100);
    expect(bp.boreDiameter).toBe(10);
    expect(bp.name).toBe("Test Point");
  });

  test("getInterpolatedBoreDiameter interpolates correctly", () => {
    const borePoints: BorePoint[] = [
      { borePosition: 0, boreDiameter: 10 },
      { borePosition: 100, boreDiameter: 20 },
    ];

    // Exact match at start
    expect(getInterpolatedBoreDiameter(borePoints, 0)).toBe(10);

    // Exact match at end
    expect(getInterpolatedBoreDiameter(borePoints, 100)).toBe(20);

    // Midpoint
    expect(getInterpolatedBoreDiameter(borePoints, 50)).toBe(15);

    // Quarter point
    expect(getInterpolatedBoreDiameter(borePoints, 25)).toBe(12.5);
  });

  test("getInterpolatedBoreDiameter handles cylindrical bore", () => {
    const borePoints: BorePoint[] = [
      { borePosition: 0, boreDiameter: 15 },
      { borePosition: 100, boreDiameter: 15 },
    ];

    expect(getInterpolatedBoreDiameter(borePoints, 50)).toBe(15);
  });
});

describe("Hole", () => {
  test("createHole creates valid hole", () => {
    const hole = createHole(50, 5, 3);
    expect(hole.position).toBe(50);
    expect(hole.diameter).toBe(5);
    expect(hole.height).toBe(3);
  });
});

describe("Instrument", () => {
  test("createInstrument creates valid instrument", () => {
    const inst = createInstrument("Test Flute", "MM");
    expect(inst.name).toBe("Test Flute");
    expect(inst.lengthType).toBe("MM");
    expect(inst.borePoint.length).toBe(2);
    expect(inst.hole.length).toBe(0);
  });

  test("validateInstrument catches missing name", () => {
    const inst = createInstrument("", "MM");
    const errors = validateInstrument(inst);
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  test("validateInstrument passes valid instrument", () => {
    const inst: Instrument = {
      name: "Test Flute",
      lengthType: "MM",
      mouthpiece: {
        position: 5,
        fipple: {
          windowWidth: 10,
          windowLength: 5,
        },
      },
      borePoint: [
        { borePosition: 0, boreDiameter: 20 },
        { borePosition: 300, boreDiameter: 20 },
      ],
      hole: [],
      termination: { flangeDiameter: 20 },
    };

    const errors = validateInstrument(inst);
    expect(errors.length).toBe(0);
  });

  test("convertInstrumentToMetres converts mm to m", () => {
    const inst = createInstrument("Test", "MM");
    inst.borePoint = [
      { borePosition: 0, boreDiameter: 10 },
      { borePosition: 100, boreDiameter: 10 },
    ];

    const converted = convertInstrumentToMetres(inst);

    expect(converted.lengthType).toBe("M");
    expect(converted.borePoint[0]!.borePosition).toBe(0);
    expect(converted.borePoint[0]!.boreDiameter).toBeCloseTo(0.01, 6);
    expect(converted.borePoint[1]!.borePosition).toBeCloseTo(0.1, 6);
  });

  test("getSortedBorePoints returns sorted array", () => {
    const inst = createInstrument("Test", "MM");
    inst.borePoint = [
      { borePosition: 100, boreDiameter: 10 },
      { borePosition: 50, boreDiameter: 10 },
      { borePosition: 0, boreDiameter: 10 },
    ];

    const sorted = getSortedBorePoints(inst);
    expect(sorted[0]!.borePosition).toBe(0);
    expect(sorted[1]!.borePosition).toBe(50);
    expect(sorted[2]!.borePosition).toBe(100);
  });

  test("getBoreLength calculates correctly", () => {
    const inst = createInstrument("Test", "MM");
    inst.borePoint = [
      { borePosition: 10, boreDiameter: 10 },
      { borePosition: 110, boreDiameter: 10 },
    ];

    expect(getBoreLength(inst)).toBe(100);
  });
});
