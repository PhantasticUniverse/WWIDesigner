/**
 * Unit tests for headspace-related functions in instrument.ts.
 */

import { describe, test, expect } from "bun:test";
import {
  buildHeadspace,
  getBoreSectionVolume,
  type Instrument,
  type BorePoint,
  type Mouthpiece,
  type BoreSection,
} from "../../src/models/instrument.ts";

// Helper to create test instrument
function createTestInstrument(
  borePoints: BorePoint[],
  mouthpiecePosition: number
): Instrument {
  return {
    name: "Test",
    lengthType: "M",
    mouthpiece: {
      position: mouthpiecePosition,
      fipple: {
        windowLength: 0.01,
        windowWidth: 0.02,
      },
    } as Mouthpiece,
    borePoint: borePoints,
    hole: [],
    termination: { flangeDiameter: 0.03 },
  };
}

describe("buildHeadspace", () => {
  test("returns empty array when less than 2 bore points", () => {
    const instrument = createTestInstrument([{ borePosition: 0, boreDiameter: 0.02 }], 0.01);
    const headspace = buildHeadspace(instrument);
    expect(headspace).toHaveLength(0);
  });

  test("creates one section when mouthpiece is between first two bore points", () => {
    const instrument = createTestInstrument(
      [
        { borePosition: 0, boreDiameter: 0.02 },
        { borePosition: 0.1, boreDiameter: 0.02 },
      ],
      0.05
    );
    const headspace = buildHeadspace(instrument);

    expect(headspace).toHaveLength(1);
    expect(headspace[0]!.length).toBeCloseTo(0.05, 6);
    expect(headspace[0]!.leftRadius).toBeCloseTo(0.01, 6);
    expect(headspace[0]!.rightRadius).toBeCloseTo(0.01, 6);
  });

  test("creates multiple sections when bore points are above mouthpiece", () => {
    const instrument = createTestInstrument(
      [
        { borePosition: 0, boreDiameter: 0.02 },
        { borePosition: 0.03, boreDiameter: 0.022 },
        { borePosition: 0.1, boreDiameter: 0.024 },
      ],
      0.05
    );
    const headspace = buildHeadspace(instrument);

    // Should have 2 sections: 0->0.03 and 0.03->0.05 (partial)
    expect(headspace).toHaveLength(2);
    expect(headspace[0]!.length).toBeCloseTo(0.03, 6);
    expect(headspace[1]!.length).toBeCloseTo(0.02, 6);
  });

  test("handles negative bore point positions", () => {
    // This simulates NAF instruments where first bore point is before position 0
    const instrument = createTestInstrument(
      [
        { borePosition: -0.01, boreDiameter: 0.02 },
        { borePosition: 0.1, boreDiameter: 0.02 },
      ],
      0.05
    );
    const headspace = buildHeadspace(instrument);

    expect(headspace).toHaveLength(1);
    // Length should be from -0.01 to 0.05 = 0.06
    expect(headspace[0]!.length).toBeCloseTo(0.06, 6);
  });

  test("interpolates diameter for partial section", () => {
    const instrument = createTestInstrument(
      [
        { borePosition: 0, boreDiameter: 0.02 },
        { borePosition: 0.1, boreDiameter: 0.03 },
      ],
      0.05
    );
    const headspace = buildHeadspace(instrument);

    expect(headspace).toHaveLength(1);
    // At 50% of the way, diameter should be 0.025
    expect(headspace[0]!.rightRadius).toBeCloseTo(0.0125, 6);
  });

  test("returns empty array when all bore points are below mouthpiece", () => {
    const instrument = createTestInstrument(
      [
        { borePosition: 0.1, boreDiameter: 0.02 },
        { borePosition: 0.2, boreDiameter: 0.02 },
      ],
      0.05
    );
    const headspace = buildHeadspace(instrument);

    expect(headspace).toHaveLength(0);
  });
});

describe("getBoreSectionVolume", () => {
  test("calculates cylinder volume correctly", () => {
    const section: BoreSection = {
      length: 0.1,
      leftRadius: 0.01,
      rightRadius: 0.01,
      rightBorePosition: 0.1,
    };

    const volume = getBoreSectionVolume(section);
    // Cylinder volume: π * r² * h
    const expected = Math.PI * 0.01 * 0.01 * 0.1;
    expect(volume).toBeCloseTo(expected, 10);
  });

  test("calculates cone frustum volume correctly", () => {
    const section: BoreSection = {
      length: 0.1,
      leftRadius: 0.01,
      rightRadius: 0.02,
      rightBorePosition: 0.1,
    };

    const volume = getBoreSectionVolume(section);
    // Frustum volume: (π * h / 3) * (r1² + r1*r2 + r2²)
    const r1 = 0.01,
      r2 = 0.02,
      h = 0.1;
    const expected = ((Math.PI * h) / 3) * (r1 * r1 + r1 * r2 + r2 * r2);
    expect(volume).toBeCloseTo(expected, 10);
  });

  test("returns 0 for zero-length section", () => {
    const section: BoreSection = {
      length: 0,
      leftRadius: 0.01,
      rightRadius: 0.01,
      rightBorePosition: 0,
    };

    expect(getBoreSectionVolume(section)).toBe(0);
  });
});
