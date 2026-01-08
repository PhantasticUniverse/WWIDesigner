/**
 * Calculator for transfer matrices of bore sections.
 *
 * Ported from com.wwidesigner.geometry.calculation.BoreSectionCalculator
 * and com.wwidesigner.geometry.calculation.SimpleBoreSectionCalculator
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { TransferMatrix } from "../math/transfer-matrix.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import { Tube } from "./tube.ts";
import type { BoreSection } from "../../models/instrument.ts";

/**
 * Interface for bore section calculators.
 * Different calculators may use different acoustic models.
 */
export interface IBoreSectionCalculator {
  /**
   * Calculate the transfer matrix for a bore section.
   * @param section The bore section geometry
   * @param waveNumber Wave number in radians/meter
   * @param params Physical parameters of the air
   * @returns Transfer matrix for the section
   */
  calcTransferMatrix(
    section: BoreSection,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix;
}

/**
 * Simple bore section calculator using the Tube class.
 * Uses conical/cylindrical waveguide formulas with loss terms.
 */
export class SimpleBoreSectionCalculator implements IBoreSectionCalculator {
  /**
   * Calculate the transfer matrix for a bore section.
   * Uses conical formula (which reduces to cylindrical when radii are equal).
   *
   * @param section The bore section geometry
   * @param waveNumber Wave number in radians/meter
   * @param params Physical parameters of the air
   * @returns Transfer matrix for the section
   */
  calcTransferMatrix(
    section: BoreSection,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    const leftRadius = section.leftRadius;
    const rightRadius = section.rightRadius;
    const length = section.length;

    return Tube.calcConeMatrix(
      waveNumber,
      length,
      leftRadius,
      rightRadius,
      params
    );
  }
}

/**
 * Default bore section calculator - uses SimpleBoreSectionCalculator.
 */
export const defaultBoreSectionCalculator = new SimpleBoreSectionCalculator();

/**
 * Create bore sections from bore points.
 * Converts a list of (position, diameter) pairs to sections with
 * (length, leftRadius, rightRadius).
 *
 * @param borePoints Array of bore points with borePosition and boreDiameter
 * @returns Array of bore sections
 */
export function createBoreSectionsFromPoints(
  borePoints: Array<{ borePosition: number; boreDiameter: number }>
): BoreSection[] {
  if (borePoints.length < 2) {
    return [];
  }

  // Sort by position
  const sorted = [...borePoints].sort(
    (a, b) => a.borePosition - b.borePosition
  );

  const sections: BoreSection[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]!;
    const right = sorted[i + 1]!;

    sections.push({
      length: right.borePosition - left.borePosition,
      leftRadius: left.boreDiameter / 2,
      rightRadius: right.boreDiameter / 2,
      rightBorePosition: right.borePosition,
    });
  }

  return sections;
}

/**
 * Calculate the total transfer matrix for a series of bore sections.
 *
 * @param sections Array of bore sections
 * @param waveNumber Wave number in radians/meter
 * @param params Physical parameters of the air
 * @param calculator Bore section calculator to use (defaults to simple)
 * @returns Combined transfer matrix for all sections
 */
export function calcBoreTransferMatrix(
  sections: BoreSection[],
  waveNumber: number,
  params: PhysicalParameters,
  calculator: IBoreSectionCalculator = defaultBoreSectionCalculator
): TransferMatrix {
  let result = TransferMatrix.makeIdentity();

  for (const section of sections) {
    const sectionMatrix = calculator.calcTransferMatrix(
      section,
      waveNumber,
      params
    );
    result = result.multiply(sectionMatrix);
  }

  return result;
}
