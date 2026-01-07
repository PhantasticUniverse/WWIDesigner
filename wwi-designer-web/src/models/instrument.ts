/**
 * Data models for woodwind instrument geometry.
 *
 * Ported from Java: com.wwidesigner.geometry.*
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
  type LengthType,
  getMultiplierToMetres,
  getMultiplierFromMetres,
} from "../core/constants.ts";

// Re-export LengthType for consumers
export type { LengthType };

// ============================================================================
// Key - represents a mechanical key mechanism on a hole
// ============================================================================

export interface Key {
  /** Diameter of the key pad */
  diameter: number;
  /** Diameter of the hole under the key */
  holeDiameter: number;
  /** Height of the key above the hole when open */
  height: number;
  /** Thickness of the key pad */
  thickness: number;
  /** Wall thickness around the hole */
  wallThickness: number;
  /** Height of the chimney */
  chimneyHeight: number;
}

export function createKey(partial: Partial<Key> = {}): Key {
  return {
    diameter: partial.diameter ?? 0,
    holeDiameter: partial.holeDiameter ?? 0,
    height: partial.height ?? 0,
    thickness: partial.thickness ?? 0,
    wallThickness: partial.wallThickness ?? 0,
    chimneyHeight: partial.chimneyHeight ?? 0,
  };
}

export function convertKeyDimensions(key: Key, multiplier: number): Key {
  return {
    diameter: key.diameter * multiplier,
    holeDiameter: key.holeDiameter * multiplier,
    height: key.height * multiplier,
    thickness: key.thickness * multiplier,
    wallThickness: key.wallThickness * multiplier,
    chimneyHeight: key.chimneyHeight * multiplier,
  };
}

// ============================================================================
// BorePoint - a single measurement point on the bore
// ============================================================================

export interface BorePoint {
  /** Optional name for this bore point */
  name?: string;
  /** Position along the bore (from top) */
  borePosition: number;
  /** Diameter of the bore at this position */
  boreDiameter: number;
}

export function createBorePoint(position: number, diameter: number, name?: string): BorePoint {
  return {
    name,
    borePosition: position,
    boreDiameter: diameter,
  };
}

export function convertBorePointDimensions(point: BorePoint, multiplier: number): BorePoint {
  return {
    ...point,
    borePosition: point.borePosition * multiplier,
    boreDiameter: point.boreDiameter * multiplier,
  };
}

/**
 * Get interpolated/extrapolated bore diameter at a given position
 */
export function getInterpolatedBoreDiameter(
  borePoints: BorePoint[],
  position: number
): number {
  if (borePoints.length === 0) {
    throw new Error("No bore points provided");
  }

  // Sort bore points by position
  const sorted = [...borePoints].sort((a, b) => a.borePosition - b.borePosition);

  let beforePoint: BorePoint | null = null;
  let afterPoint: BorePoint | null = null;

  for (const point of sorted) {
    if (point.borePosition < position) {
      beforePoint = point;
    } else if (point.borePosition > position) {
      afterPoint = point;
      break;
    } else {
      // Exact match
      return point.boreDiameter;
    }
  }

  // Handle extrapolation at top
  if (beforePoint === null && sorted.length >= 2) {
    const first = sorted[0]!;
    const second = sorted[1]!;
    const positionRatio =
      (second.borePosition - position) / (second.borePosition - first.borePosition);
    return second.boreDiameter - (second.boreDiameter - first.boreDiameter) * positionRatio;
  }

  // Handle extrapolation at bottom
  if (afterPoint === null && sorted.length >= 2) {
    const secondLast = sorted[sorted.length - 2]!;
    const last = sorted[sorted.length - 1]!;
    const positionRatio =
      (position - secondLast.borePosition) / (last.borePosition - secondLast.borePosition);
    return (
      secondLast.boreDiameter -
      (secondLast.boreDiameter - last.boreDiameter) * positionRatio
    );
  }

  // Interpolation
  if (beforePoint && afterPoint) {
    const positionFraction =
      (afterPoint.borePosition - position) /
      (afterPoint.borePosition - beforePoint.borePosition);
    return (
      afterPoint.boreDiameter * (1 - positionFraction) +
      beforePoint.boreDiameter * positionFraction
    );
  }

  // Fallback - return first point diameter
  return sorted[0]!.boreDiameter;
}

// ============================================================================
// Hole - a tone hole in the instrument
// ============================================================================

export interface Hole {
  /** Optional name for this hole */
  name?: string;
  /** Position of the hole along the bore */
  position: number;
  /** Diameter of the hole */
  diameter: number;
  /** Height/depth of the hole (wall thickness) */
  height: number;
  /** Optional inner curvature radius for undercut holes */
  innerCurvatureRadius?: number;
  /** Optional key mechanism */
  key?: Key;
  /** Bore diameter at this hole position (derived) */
  boreDiameter?: number;
}

export function createHole(position: number, diameter: number, height: number): Hole {
  return {
    position,
    diameter,
    height,
  };
}

export function convertHoleDimensions(hole: Hole, multiplier: number): Hole {
  return {
    ...hole,
    position: hole.position * multiplier,
    diameter: hole.diameter * multiplier,
    height: hole.height * multiplier,
    boreDiameter: hole.boreDiameter ? hole.boreDiameter * multiplier : undefined,
    innerCurvatureRadius: hole.innerCurvatureRadius
      ? hole.innerCurvatureRadius * multiplier
      : undefined,
    key: hole.key ? convertKeyDimensions(hole.key, multiplier) : undefined,
  };
}

/**
 * Get the hole-to-bore diameter ratio
 */
export function getHoleRatio(hole: Hole): number {
  if (!hole.boreDiameter || hole.boreDiameter === 0) {
    throw new Error("Bore diameter not set for hole");
  }
  return hole.diameter / hole.boreDiameter;
}

// ============================================================================
// BoreSection - a section of the bore between two points (derived)
// ============================================================================

export interface BoreSection {
  /** Length of this bore section */
  length: number;
  /** Radius at the left (top) end */
  leftRadius: number;
  /** Radius at the right (bottom) end */
  rightRadius: number;
  /** Position of the right end */
  rightBorePosition: number;
}

export function createBoreSection(
  length: number,
  leftRadius: number,
  rightRadius: number
): BoreSection {
  return {
    length,
    leftRadius,
    rightRadius,
    rightBorePosition: 0,
  };
}

// ============================================================================
// Mouthpiece types - various sound generation mechanisms
// ============================================================================

/** Embouchure hole for transverse flutes */
export interface EmbouchureHole {
  /** Size in longitudinal direction */
  length: number;
  /** Size in transverse direction (direction of air stream) */
  width: number;
  /** Height of the embouchure hole */
  height: number;
  /** Length of air stream from lips to edge */
  airstreamLength: number;
  /** Height of air stream from lips */
  airstreamHeight: number;
}

/** Fipple for recorders, whistles, NAF */
export interface Fipple {
  /** Width of the window/TSH */
  windowWidth: number;
  /** Length of the window/TSH */
  windowLength: number;
  /** Optional fipple factor for tuning adjustment */
  fippleFactor?: number;
  /** Optional window height */
  windowHeight?: number;
  /** Optional windway length */
  windwayLength?: number;
  /** Optional windway height (flue depth) */
  windwayHeight?: number;
}

/** Single reed mouthpiece (clarinet, saxophone) */
export interface SingleReed {
  /** Alpha factor */
  alpha: number;
}

/** Double reed mouthpiece (oboe, bassoon) */
export interface DoubleReed {
  /** Alpha factor */
  alpha: number;
  /** Crow frequency of the reed */
  crowFreq: number;
}

/** Lip reed mouthpiece (brass instruments) */
export interface LipReed {
  /** Alpha factor */
  alpha: number;
}

/** Mouthpiece - the sound generation element */
export interface Mouthpiece {
  /** Position of the mouthpiece/splitting edge */
  position: number;
  /** Beta (jet amplification factor) */
  beta?: number;
  /** Embouchure hole (transverse flute) */
  embouchureHole?: EmbouchureHole;
  /** Fipple (recorder, NAF) */
  fipple?: Fipple;
  /** Single reed (clarinet, sax) */
  singleReed?: SingleReed;
  /** Double reed (oboe, bassoon) */
  doubleReed?: DoubleReed;
  /** Lip reed (brass) */
  lipReed?: LipReed;
  /** Bore diameter at mouthpiece (derived) */
  boreDiameter?: number;
}

/**
 * Get the mouthpiece type
 */
export type MouthpieceType =
  | "embouchureHole"
  | "fipple"
  | "singleReed"
  | "doubleReed"
  | "lipReed"
  | "unknown";

export function getMouthpieceType(mouthpiece: Mouthpiece): MouthpieceType {
  if (mouthpiece.embouchureHole) return "embouchureHole";
  if (mouthpiece.fipple) return "fipple";
  if (mouthpiece.singleReed) return "singleReed";
  if (mouthpiece.doubleReed) return "doubleReed";
  if (mouthpiece.lipReed) return "lipReed";
  return "unknown";
}

/**
 * Test if mouthpiece acts as a pressure node (reeds) vs velocity node (air reeds)
 */
export function isPressureNode(mouthpiece: Mouthpiece): boolean {
  return !!(mouthpiece.singleReed || mouthpiece.doubleReed || mouthpiece.lipReed);
}

/**
 * Calculate gain factor for the mouthpiece (after Auvray, 2012)
 */
export function calculateGainFactor(mouthpiece: Mouthpiece): number | null {
  const nominalBeta = mouthpiece.beta ?? 0.35;

  if (mouthpiece.fipple) {
    const f = mouthpiece.fipple;
    const wh = f.windwayHeight;
    if (wh !== undefined && wh > 0) {
      return (
        (8.0 *
          wh *
          Math.sqrt((2.0 * wh) / f.windowLength) *
          Math.exp((nominalBeta * f.windowLength) / wh)) /
        (f.windowLength * f.windowWidth)
      );
    }
  }

  if (mouthpiece.embouchureHole) {
    const e = mouthpiece.embouchureHole;
    return (
      (8.0 *
        e.airstreamHeight *
        Math.sqrt((2.0 * e.airstreamHeight) / e.airstreamLength) *
        Math.exp((nominalBeta * e.airstreamLength) / e.airstreamHeight)) /
      (e.length * e.airstreamLength)
    );
  }

  return null;
}

/**
 * Get the airstream length for the mouthpiece
 */
export function getAirstreamLength(mouthpiece: Mouthpiece): number {
  if (mouthpiece.fipple) {
    return mouthpiece.fipple.windowLength;
  }
  if (mouthpiece.embouchureHole) {
    return mouthpiece.embouchureHole.airstreamLength;
  }
  // Return an arbitrary length of plausible magnitude
  return 0.5 * (mouthpiece.boreDiameter ?? 0.01);
}

export function convertMouthpieceDimensions(mp: Mouthpiece, multiplier: number): Mouthpiece {
  const result: Mouthpiece = {
    position: mp.position * multiplier,
    beta: mp.beta,
    boreDiameter: mp.boreDiameter ? mp.boreDiameter * multiplier : undefined,
  };

  if (mp.embouchureHole) {
    result.embouchureHole = {
      length: mp.embouchureHole.length * multiplier,
      width: mp.embouchureHole.width * multiplier,
      height: mp.embouchureHole.height * multiplier,
      airstreamLength: mp.embouchureHole.airstreamLength * multiplier,
      airstreamHeight: mp.embouchureHole.airstreamHeight * multiplier,
    };
  }

  if (mp.fipple) {
    result.fipple = {
      windowWidth: mp.fipple.windowWidth * multiplier,
      windowLength: mp.fipple.windowLength * multiplier,
      fippleFactor: mp.fipple.fippleFactor,
      windowHeight: mp.fipple.windowHeight
        ? mp.fipple.windowHeight * multiplier
        : undefined,
      windwayLength: mp.fipple.windwayLength
        ? mp.fipple.windwayLength * multiplier
        : undefined,
      windwayHeight: mp.fipple.windwayHeight
        ? mp.fipple.windwayHeight * multiplier
        : undefined,
    };
  }

  if (mp.singleReed) {
    result.singleReed = { alpha: mp.singleReed.alpha };
  }

  if (mp.doubleReed) {
    result.doubleReed = { alpha: mp.doubleReed.alpha, crowFreq: mp.doubleReed.crowFreq };
  }

  if (mp.lipReed) {
    result.lipReed = { alpha: mp.lipReed.alpha };
  }

  return result;
}

// ============================================================================
// Termination - the end of the instrument
// ============================================================================

export interface Termination {
  /** Optional name */
  name?: string;
  /** Position (derived from last bore point) */
  borePosition?: number;
  /** Bore diameter at termination (derived) */
  boreDiameter?: number;
  /** Flange diameter (0 for unflanged, > bore diameter for flanged) */
  flangeDiameter: number;
}

export function createTermination(flangeDiameter: number = 0): Termination {
  return {
    flangeDiameter,
  };
}

export function convertTerminationDimensions(term: Termination, multiplier: number): Termination {
  return {
    ...term,
    borePosition: term.borePosition ? term.borePosition * multiplier : undefined,
    boreDiameter: term.boreDiameter ? term.boreDiameter * multiplier : undefined,
    flangeDiameter: term.flangeDiameter * multiplier,
  };
}

// ============================================================================
// Instrument - the complete instrument definition
// ============================================================================

export interface Instrument {
  /** Name of the instrument */
  name: string;
  /** Optional description */
  description?: string;
  /** Length unit type */
  lengthType: LengthType;
  /** The mouthpiece */
  mouthpiece: Mouthpiece;
  /** Bore profile points (at least 2 required) */
  borePoint: BorePoint[];
  /** Tone holes */
  hole: Hole[];
  /** Termination */
  termination: Termination;
}

/**
 * Create a new empty instrument
 */
export function createInstrument(name: string, lengthType: LengthType = "MM"): Instrument {
  return {
    name,
    lengthType,
    mouthpiece: { position: 0 },
    borePoint: [
      { borePosition: 0, boreDiameter: 10 },
      { borePosition: 100, boreDiameter: 10 },
    ],
    hole: [],
    termination: { flangeDiameter: 0 },
  };
}

/**
 * Convert all dimensions of an instrument to metres
 */
export function convertInstrumentToMetres(instrument: Instrument): Instrument {
  const multiplier = getMultiplierToMetres(instrument.lengthType);

  return {
    ...instrument,
    lengthType: "M",
    mouthpiece: convertMouthpieceDimensions(instrument.mouthpiece, multiplier),
    borePoint: instrument.borePoint.map((bp) => convertBorePointDimensions(bp, multiplier)),
    hole: instrument.hole.map((h) => convertHoleDimensions(h, multiplier)),
    termination: convertTerminationDimensions(instrument.termination, multiplier),
  };
}

/**
 * Convert all dimensions of an instrument from metres to a specified length type
 */
export function convertInstrumentFromMetres(
  instrument: Instrument,
  targetLengthType: LengthType
): Instrument {
  if (instrument.lengthType !== "M") {
    throw new Error("Instrument must be in metres before converting to another unit");
  }

  const multiplier = getMultiplierFromMetres(targetLengthType);

  return {
    ...instrument,
    lengthType: targetLengthType,
    mouthpiece: convertMouthpieceDimensions(instrument.mouthpiece, multiplier),
    borePoint: instrument.borePoint.map((bp) => convertBorePointDimensions(bp, multiplier)),
    hole: instrument.hole.map((h) => convertHoleDimensions(h, multiplier)),
    termination: convertTerminationDimensions(instrument.termination, multiplier),
  };
}

/**
 * Validate an instrument and return any errors
 */
export function validateInstrument(instrument: Instrument): string[] {
  const errors: string[] = [];

  if (!instrument.name || instrument.name.trim() === "") {
    errors.push("Enter a name for the instrument.");
  }

  if (instrument.borePoint.length < 2) {
    errors.push("Instrument must have at least two bore points.");
  }

  // Find min/max bore positions
  let minPosition: number | null = null;
  let maxPosition: number | null = null;

  for (const bp of instrument.borePoint) {
    if (Number.isNaN(bp.borePosition)) {
      errors.push("Bore point position must be specified.");
    }
    if (Number.isNaN(bp.boreDiameter)) {
      errors.push("Bore point diameter must be specified.");
    } else if (bp.boreDiameter <= 0) {
      errors.push("Bore point must have a positive diameter.");
    }

    if (minPosition === null || bp.borePosition < minPosition) {
      minPosition = bp.borePosition;
    }
    if (maxPosition === null || bp.borePosition > maxPosition) {
      maxPosition = bp.borePosition;
    }
  }

  if (minPosition !== null && maxPosition !== null && minPosition >= maxPosition) {
    errors.push("Bore length must not be zero.");
  }

  // Validate mouthpiece
  const mp = instrument.mouthpiece;
  if (Number.isNaN(mp.position)) {
    errors.push("The mouthpiece/splitting-edge position must be specified.");
  }

  const mpType = getMouthpieceType(mp);
  if (mpType === "unknown") {
    errors.push("The type of mouthpiece is not specified.");
  }

  // Validate holes
  for (let i = 0; i < instrument.hole.length; i++) {
    const hole = instrument.hole[i]!;
    const holeName = hole.name ? `Hole ${hole.name}` : `Hole ${i + 1}`;

    if (Number.isNaN(hole.position)) {
      errors.push(`${holeName} position must be specified.`);
    }
    if (Number.isNaN(hole.diameter)) {
      errors.push(`${holeName} diameter must be specified.`);
    } else if (hole.diameter <= 0) {
      errors.push(`${holeName} diameter must be positive.`);
    }
    if (Number.isNaN(hole.height)) {
      errors.push(`${holeName} height must be specified.`);
    } else if (hole.height <= 0) {
      errors.push(`${holeName} height must be positive.`);
    }
  }

  // Validate termination
  if (Number.isNaN(instrument.termination.flangeDiameter)) {
    errors.push("Termination flange diameter must be specified.");
  } else if (instrument.termination.flangeDiameter < 0) {
    errors.push("Termination flange diameter must be positive.");
  }

  return errors;
}

/**
 * Get sorted bore points by position
 */
export function getSortedBorePoints(instrument: Instrument): BorePoint[] {
  return [...instrument.borePoint].sort((a, b) => a.borePosition - b.borePosition);
}

/**
 * Get sorted holes by position
 */
export function getSortedHoles(instrument: Instrument): Hole[] {
  return [...instrument.hole].sort((a, b) => a.position - b.position);
}

/**
 * Get the lowest (furthest from mouthpiece) bore point
 */
export function getLowestBorePoint(instrument: Instrument): BorePoint {
  const sorted = getSortedBorePoints(instrument);
  return sorted[sorted.length - 1]!;
}

/**
 * Get total bore length
 */
export function getBoreLength(instrument: Instrument): number {
  const sorted = getSortedBorePoints(instrument);
  return sorted[sorted.length - 1]!.borePosition - sorted[0]!.borePosition;
}
