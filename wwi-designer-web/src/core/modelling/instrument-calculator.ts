/**
 * Calculator for instrument playing characteristics.
 *
 * Ported from com.wwidesigner.modelling.InstrumentCalculator and
 * DefaultInstrumentCalculator.
 *
 * For flow-node mouthpieces (flutes and fipple flutes):
 * - calcZ() returns impedance seen by driving source. Expect resonance when
 *   imaginary part is zero or phase angle is zero.
 * - calcReflectionCoefficient() returns coefficient of pressure reflection seen
 *   by driving source. Expect resonance when coefficient is -1 or phase angle is pi.
 *
 * For pressure-node mouthpieces (cane reeds, lip reeds, brass):
 * - calcZ() returns normalized admittance seen by driving source: Z0/Z. Expect
 *   resonance when imaginary part is zero or phase angle is zero.
 * - calcReflectionCoefficient() returns negative coefficient of pressure
 *   reflection (coefficient of flow reflection) seen by driving source.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Complex } from "../math/complex.ts";
import { TransferMatrix } from "../math/transfer-matrix.ts";
import { StateVector } from "../math/state-vector.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import {
  type IBoreSectionCalculator,
  SimpleBoreSectionCalculator,
} from "../geometry/bore-section-calculator.ts";
import {
  type IHoleCalculator,
  DefaultHoleCalculator,
} from "../geometry/hole-calculator.ts";
import {
  type IMouthpieceCalculator,
  getMouthpieceCalculator,
} from "../geometry/mouthpiece-calculator.ts";
import {
  type ITerminationCalculator,
  getTerminationCalculator,
} from "../geometry/termination-calculator.ts";
import type {
  Instrument,
  BoreSection,
  Hole,
} from "../../models/instrument.ts";
import {
  convertInstrumentToMetres,
  getInterpolatedBoreDiameter,
  getSortedBorePoints,
  getSortedHoles,
  calculateGainFactor,
} from "../../models/instrument.ts";
import type { Fingering } from "../../models/tuning.ts";

/**
 * Component type - either a bore section or a hole
 */
type Component = { type: "bore"; section: BoreSection } | { type: "hole"; hole: Hole };

/**
 * Interface for instrument calculators
 */
export interface IInstrumentCalculator {
  /**
   * Calculate the reflection coefficient at a specified frequency and fingering.
   */
  calcReflectionCoefficient(freq: number, fingering: Fingering): Complex;

  /**
   * Calculate the overall impedance at a specified frequency and fingering.
   */
  calcZ(freq: number, fingering: Fingering): Complex;

  /**
   * Calculate the loop gain at a specified frequency.
   */
  calcGain(freq: number, Z: Complex): number;

  /**
   * Get the instrument being calculated.
   */
  getInstrument(): Instrument;

  /**
   * Get the physical parameters used for calculations.
   */
  getParams(): PhysicalParameters;
}

/**
 * Default instrument calculator implementation.
 * Calculates impedance and reflection coefficient by walking through
 * the instrument components from termination to mouthpiece.
 */
export class DefaultInstrumentCalculator implements IInstrumentCalculator {
  protected instrument: Instrument;
  protected params: PhysicalParameters;
  protected mouthpieceCalculator: IMouthpieceCalculator;
  protected terminationCalculator: ITerminationCalculator;
  protected holeCalculator: IHoleCalculator;
  protected boreSectionCalculator: IBoreSectionCalculator;

  /** Sorted components from mouthpiece to termination */
  protected components: Component[];

  constructor(
    instrument: Instrument,
    params: PhysicalParameters,
    mouthpieceCalculator?: IMouthpieceCalculator,
    terminationCalculator?: ITerminationCalculator,
    holeCalculator?: IHoleCalculator,
    boreSectionCalculator?: IBoreSectionCalculator
  ) {
    // Convert instrument to metres for calculation
    this.instrument = convertInstrumentToMetres(instrument);
    this.params = params;

    // Set up calculators
    this.mouthpieceCalculator =
      mouthpieceCalculator ?? getMouthpieceCalculator(this.instrument.mouthpiece);
    this.terminationCalculator =
      terminationCalculator ?? getTerminationCalculator(this.instrument.termination);
    this.holeCalculator = holeCalculator ?? new DefaultHoleCalculator();
    this.boreSectionCalculator = boreSectionCalculator ?? new SimpleBoreSectionCalculator();

    // Build sorted component list
    this.components = this.buildComponents();
  }

  /**
   * Build the sorted list of components (bore sections and holes).
   * Components are sorted from mouthpiece (top) to termination (bottom).
   */
  protected buildComponents(): Component[] {
    const components: Component[] = [];
    const sortedBorePoints = getSortedBorePoints(this.instrument);
    const sortedHoles = getSortedHoles(this.instrument);

    // Set bore diameter on termination
    if (sortedBorePoints.length > 0) {
      const lastPoint = sortedBorePoints[sortedBorePoints.length - 1]!;
      this.instrument.termination.boreDiameter = lastPoint.boreDiameter;
      this.instrument.termination.borePosition = lastPoint.borePosition;
    }

    // Set bore diameter on mouthpiece
    if (sortedBorePoints.length > 0) {
      this.instrument.mouthpiece.boreDiameter = getInterpolatedBoreDiameter(
        sortedBorePoints,
        this.instrument.mouthpiece.position
      );
    }

    // Process bore points into sections, interleaving holes
    let holeIndex = 0;
    for (let i = 0; i < sortedBorePoints.length - 1; i++) {
      const leftPoint = sortedBorePoints[i]!;
      const rightPoint = sortedBorePoints[i + 1]!;

      // Add any holes between leftPoint and rightPoint
      while (
        holeIndex < sortedHoles.length &&
        sortedHoles[holeIndex]!.position <= rightPoint.borePosition
      ) {
        const hole = sortedHoles[holeIndex]!;
        if (hole.position >= leftPoint.borePosition) {
          // Set bore diameter at hole position
          hole.boreDiameter = getInterpolatedBoreDiameter(
            sortedBorePoints,
            hole.position
          );

          // Add bore section from current position to hole
          const sectionToHole: BoreSection = {
            length: hole.position - leftPoint.borePosition,
            leftRadius: leftPoint.boreDiameter / 2,
            rightRadius: hole.boreDiameter / 2,
            rightBorePosition: hole.position,
          };

          if (sectionToHole.length > 0) {
            components.push({ type: "bore", section: sectionToHole });
          }

          // Add the hole
          components.push({ type: "hole", hole });

          // Update left point position for next section
          // (we continue with rightPoint as the final target)
        }
        holeIndex++;
      }

      // Add remaining bore section (from last hole or leftPoint to rightPoint)
      // This simplified version creates sections between consecutive bore points
      // A more complete implementation would split at hole positions
    }

    // Rebuild using a cleaner approach: interleave based on position
    return this.buildComponentsInterleaved();
  }

  /**
   * Build components interleaved by position.
   */
  protected buildComponentsInterleaved(): Component[] {
    const components: Component[] = [];
    const sortedBorePoints = getSortedBorePoints(this.instrument);
    const sortedHoles = [...getSortedHoles(this.instrument)];

    // Set bore diameters on termination, mouthpiece, and holes
    if (sortedBorePoints.length > 0) {
      const lastPoint = sortedBorePoints[sortedBorePoints.length - 1]!;
      this.instrument.termination.boreDiameter = lastPoint.boreDiameter;
      this.instrument.termination.borePosition = lastPoint.borePosition;

      this.instrument.mouthpiece.boreDiameter = getInterpolatedBoreDiameter(
        sortedBorePoints,
        this.instrument.mouthpiece.position
      );

      // Set bore diameter for each hole
      for (const hole of sortedHoles) {
        hole.boreDiameter = getInterpolatedBoreDiameter(
          sortedBorePoints,
          hole.position
        );
      }
    }

    // Build a combined list of positions with types
    interface PositionItem {
      position: number;
      type: "borePoint" | "hole";
      index: number;
    }

    const positions: PositionItem[] = [];

    for (let i = 0; i < sortedBorePoints.length; i++) {
      positions.push({
        position: sortedBorePoints[i]!.borePosition,
        type: "borePoint",
        index: i,
      });
    }

    for (let i = 0; i < sortedHoles.length; i++) {
      positions.push({
        position: sortedHoles[i]!.position,
        type: "hole",
        index: i,
      });
    }

    // Sort by position
    positions.sort((a, b) => a.position - b.position);

    // Walk through positions creating sections and inserting holes
    let currentPosition = positions.length > 0 ? positions[0]!.position : 0;
    let currentDiameter =
      sortedBorePoints.length > 0 ? sortedBorePoints[0]!.boreDiameter : 0.01;

    for (const item of positions) {
      if (item.type === "hole") {
        // Create bore section from current position to hole
        const hole = sortedHoles[item.index]!;
        const nextDiameter = hole.boreDiameter ?? currentDiameter;

        if (item.position > currentPosition) {
          const section: BoreSection = {
            length: item.position - currentPosition,
            leftRadius: currentDiameter / 2,
            rightRadius: nextDiameter / 2,
            rightBorePosition: item.position,
          };
          components.push({ type: "bore", section });
        }

        // Add the hole
        components.push({ type: "hole", hole });

        currentPosition = item.position;
        currentDiameter = nextDiameter;
      } else {
        // Bore point
        const borePoint = sortedBorePoints[item.index]!;

        if (item.position > currentPosition) {
          const section: BoreSection = {
            length: item.position - currentPosition,
            leftRadius: currentDiameter / 2,
            rightRadius: borePoint.boreDiameter / 2,
            rightBorePosition: item.position,
          };
          components.push({ type: "bore", section });
        }

        currentPosition = item.position;
        currentDiameter = borePoint.boreDiameter;
      }
    }

    return components;
  }

  /**
   * Calculate the input state vector at a given frequency and fingering.
   * Walks from termination up to mouthpiece.
   */
  protected calcInputStateVector(freq: number, fingering: Fingering): StateVector {
    const waveNumber = this.params.calcWaveNumber(freq);

    // Start with the state vector of the termination
    const isOpenEnd = fingering.openEnd !== false; // Default to open
    let sv = this.terminationCalculator.calcStateVector(
      this.instrument.termination,
      isOpenEnd,
      waveNumber,
      this.params
    );

    // Walk through components from termination to mouthpiece (reverse order)
    // openHole is indexed from top to bottom, so we need to track hole index
    let holeIndex = fingering.openHole.length - 1;

    for (let i = this.components.length - 1; i >= 0; i--) {
      const component = this.components[i]!;
      let tm: TransferMatrix;

      if (component.type === "bore") {
        tm = this.boreSectionCalculator.calcTransferMatrix(
          component.section,
          waveNumber,
          this.params
        );
      } else {
        // Hole
        const isOpen = fingering.openHole[holeIndex] ?? true;
        tm = this.holeCalculator.calcTransferMatrix(
          component.hole,
          isOpen,
          waveNumber,
          this.params
        );
        holeIndex--;
      }

      sv = sv.applyTransferMatrix(tm);
    }

    // Apply mouthpiece effect
    sv = this.mouthpieceCalculator.calcStateVector(
      sv,
      this.instrument.mouthpiece,
      waveNumber,
      this.params
    );

    return sv;
  }

  /**
   * Calculate the reflection coefficient at a specified frequency and fingering.
   */
  calcReflectionCoefficient(freq: number, fingering: Fingering): Complex {
    const sv = this.calcInputStateVector(freq, fingering);
    const headRadius = (this.instrument.mouthpiece.boreDiameter ?? 0.01) / 2;
    return sv.getReflectance(this.params.calcZ0(headRadius));
  }

  /**
   * Calculate the overall impedance at a specified frequency and fingering.
   */
  calcZ(freq: number, fingering: Fingering): Complex {
    return this.calcInputStateVector(freq, fingering).getImpedance();
  }

  /**
   * Calculate the loop gain at a specified frequency given the impedance.
   * Magnitude of loop gain for a given note, after Auvray, 2012.
   * Loop gain G = gainFactor * freq * rho / abs(Z).
   */
  calcGain(freq: number, Z: Complex): number {
    const G0 = calculateGainFactor(this.instrument.mouthpiece);
    if (G0 === null) {
      return 1.0;
    }
    return (G0 * freq * this.params.getRho()) / Z.abs();
  }

  /**
   * Calculate gain at a specified frequency and fingering.
   */
  calcGainWithFingering(freq: number, fingering: Fingering): number {
    return this.calcGain(freq, this.calcZ(freq, fingering));
  }

  /**
   * Get the instrument being modeled.
   */
  getInstrument(): Instrument {
    return this.instrument;
  }

  /**
   * Get the physical parameters.
   */
  getPhysicalParameters(): PhysicalParameters {
    return this.params;
  }

  /**
   * Get the physical parameters (alias for interface compatibility).
   */
  getParams(): PhysicalParameters {
    return this.params;
  }
}

/**
 * Create an instrument calculator with default settings.
 */
export function createInstrumentCalculator(
  instrument: Instrument,
  params?: PhysicalParameters
): DefaultInstrumentCalculator {
  const physicalParams = params ?? new PhysicalParameters();
  return new DefaultInstrumentCalculator(instrument, physicalParams);
}
