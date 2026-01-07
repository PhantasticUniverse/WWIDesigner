/**
 * Objective function for optimizing bore length and hole positions.
 *
 * Optimization variables:
 * - Position of end bore point (bore length)
 * - For each hole, spacing below to the next hole or end of bore
 *
 * Ported from com.wwidesigner.optimization.HolePositionObjectiveFunction.java
 *
 * Copyright (C) 2016, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Tuning } from "../../models/tuning.ts";
import type { Hole, Instrument } from "../../models/instrument.ts";
import { getSortedHoles, getSortedBorePoints } from "../../models/instrument.ts";
import type { IInstrumentCalculator } from "../modelling/instrument-calculator.ts";
import type { IEvaluator } from "./evaluator.ts";
import {
  BaseObjectiveFunction,
  OptimizerType,
} from "./base-objective-function.ts";
import {
  Constraints,
  ConstraintType,
  createConstraint,
  getHoleName,
} from "./constraints.ts";

/**
 * Types of bore length adjustment.
 */
export enum BoreLengthAdjustmentType {
  /** Adjust position of last bore point only */
  MOVE_BOTTOM = "MOVE_BOTTOM",
  /** Scale the entire bore proportionally */
  PRESERVE_TAPER = "PRESERVE_TAPER",
  /** Keep bore length fixed */
  PRESERVE_LENGTH = "PRESERVE_LENGTH",
}

/**
 * Objective function for optimizing hole positions.
 */
export class HolePositionObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Hole position";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;

  private lengthAdjustmentMode: BoreLengthAdjustmentType;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);
    this.lengthAdjustmentMode = lengthAdjustmentMode;

    const nHoles = calculator.getInstrument().hole.length;
    this.nrDimensions = 1 + nHoles; // bore length + spacing for each hole

    this.optimizerType = OptimizerType.BOBYQA;
    if (this.nrDimensions === 1) {
      // BOBYQA doesn't support single dimension
      this.optimizerType = OptimizerType.CMAES;
    }

    this.setConstraints();
  }

  /**
   * Get the position of the farthest bore point (end of bore).
   */
  private getEndOfBore(): number {
    const borePoints = this.calculator.getInstrument().borePoint;
    let endPosition = borePoints[0]?.borePosition ?? 0;

    for (const bp of borePoints) {
      if (bp.borePosition > endPosition) {
        endPosition = bp.borePosition;
      }
    }
    return endPosition;
  }

  /**
   * Retrieve geometry values from the instrument.
   * @returns [boreLength, spacing1, spacing2, ..., spacingN]
   */
  getGeometryPoint(): number[] {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const geometry = new Array(this.nrDimensions);

    // First dimension is bore length
    geometry[0] = this.getEndOfBore();
    let priorHolePosition = geometry[0];

    // Remaining dimensions are spacings from bottom to top
    for (let i = sortedHoles.length - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      geometry[sortedHoles.length - i] = priorHolePosition - hole.position;
      priorHolePosition = hole.position;
    }

    return geometry;
  }

  /**
   * Set geometry values on the instrument.
   */
  setGeometryPoint(point: number[]): void {
    // Adjust bore based on new length
    this.setBore(point);

    // Position holes from bottom to top
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    let priorHolePosition = point[0]!; // End of bore

    for (let i = sortedHoles.length - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      hole.position = priorHolePosition - point[sortedHoles.length - i]!;
      priorHolePosition = hole.position;
    }

    // Trigger any necessary updates
    this.updateInstrumentComponents();
  }

  /**
   * Adjust the bore profile based on the new bore length.
   */
  private setBore(point: number[]): void {
    const newBoreLength = point[0]!;
    const instrument = this.calculator.getInstrument();
    const sortedBorePoints = getSortedBorePoints(instrument);

    if (sortedBorePoints.length < 2) return;

    const topPosition = sortedBorePoints[0]!.borePosition;
    const oldBoreLength = sortedBorePoints[sortedBorePoints.length - 1]!.borePosition;

    switch (this.lengthAdjustmentMode) {
      case BoreLengthAdjustmentType.MOVE_BOTTOM:
        // Just move the last bore point
        sortedBorePoints[sortedBorePoints.length - 1]!.borePosition = newBoreLength;
        break;

      case BoreLengthAdjustmentType.PRESERVE_TAPER:
        // Scale all bore points proportionally
        if (oldBoreLength - topPosition > 0) {
          const ratio = (newBoreLength - topPosition) / (oldBoreLength - topPosition);
          for (let i = 1; i < sortedBorePoints.length; i++) {
            const bp = sortedBorePoints[i]!;
            bp.borePosition = topPosition + (bp.borePosition - topPosition) * ratio;
          }
        }
        break;

      case BoreLengthAdjustmentType.PRESERVE_LENGTH:
        // Don't adjust bore - keep original length
        break;
    }
  }

  /**
   * Trigger instrument component updates after geometry changes.
   */
  private updateInstrumentComponents(): void {
    // The instrument calculator will recalculate derived properties
    // when calcZ is called. For now, we don't need explicit updates.
  }

  /**
   * Set up constraints for this objective function.
   */
  protected setConstraints(): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const nHoles = sortedHoles.length;

    // First constraint: bore length
    this.constraints.addConstraint(
      createConstraint(
        HolePositionObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        HolePositionObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    // Spacing constraints for each hole
    for (let i = nHoles; i > 0; i--) {
      const holeIdx = nHoles - i;
      const holeName = sortedHoles[holeIdx]?.name ?? getHoleName(i, nHoles);

      let nextName: string;
      if (i === 1) {
        nextName = "bore end";
      } else {
        nextName = sortedHoles[holeIdx + 1]?.name ?? getHoleName(i - 1, nHoles);
      }

      this.constraints.addConstraint(
        createConstraint(
          HolePositionObjectiveFunction.CONSTRAINT_CATEGORY,
          `${holeName} to ${nextName} distance`,
          HolePositionObjectiveFunction.CONSTRAINT_TYPE
        )
      );
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Hole position optimizer");
    this.constraints.setObjectiveFunctionName("HolePositionObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    // Set default bounds
    this.setDefaultBounds();
  }

  /**
   * Set default bounds based on current geometry.
   * Note: Geometry is in metres (converted by instrument calculator).
   */
  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();

    // Lower bounds: 50% of current values (minimum 1mm = 0.001m)
    this.lowerBounds = currentGeometry.map((v) => Math.max(0.001, v * 0.5));

    // Upper bounds: 200% of current values
    this.upperBounds = currentGeometry.map((v) => v * 2.0);

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }

  /**
   * Get the bore length adjustment mode.
   */
  getLengthAdjustmentMode(): BoreLengthAdjustmentType {
    return this.lengthAdjustmentMode;
  }
}

/**
 * Objective function for optimizing hole sizes (diameters).
 */
export class HoleSizeObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Hole size";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    const nHoles = calculator.getInstrument().hole.length;
    this.nrDimensions = nHoles;

    this.optimizerType = OptimizerType.BOBYQA;
    if (this.nrDimensions === 1) {
      this.optimizerType = OptimizerType.CMAES;
    }

    this.setConstraints();
  }

  /**
   * Retrieve hole diameters from the instrument.
   */
  getGeometryPoint(): number[] {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    return sortedHoles.map((h) => h.diameter);
  }

  /**
   * Set hole diameters on the instrument.
   */
  setGeometryPoint(point: number[]): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);

    for (let i = 0; i < sortedHoles.length && i < point.length; i++) {
      sortedHoles[i]!.diameter = point[i]!;
    }
  }

  protected setConstraints(): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const nHoles = sortedHoles.length;

    for (let i = 0; i < nHoles; i++) {
      const holeName = sortedHoles[i]?.name ?? getHoleName(i + 1, nHoles);
      this.constraints.addConstraint(
        createConstraint(
          HoleSizeObjectiveFunction.CONSTRAINT_CATEGORY,
          `${holeName} diameter`,
          HoleSizeObjectiveFunction.CONSTRAINT_TYPE
        )
      );
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Hole size optimizer");
    this.constraints.setObjectiveFunctionName("HoleSizeObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  /**
   * Set default bounds based on current geometry.
   * Note: Geometry is in metres (converted by instrument calculator).
   */
  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();

    // Hole diameters typically range from 2mm to 20mm (0.002m to 0.02m)
    this.lowerBounds = currentGeometry.map((v) => Math.max(0.002, v * 0.5));
    this.upperBounds = currentGeometry.map((v) => Math.min(0.02, v * 2.0));

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Combined objective function for both hole positions and sizes.
 */
export class HoleObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Hole geometry";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;

  private lengthAdjustmentMode: BoreLengthAdjustmentType;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);
    this.lengthAdjustmentMode = lengthAdjustmentMode;

    const nHoles = calculator.getInstrument().hole.length;
    // bore length + spacing for each hole + diameter for each hole
    this.nrDimensions = 1 + 2 * nHoles;

    this.optimizerType = OptimizerType.BOBYQA;
    if (this.nrDimensions === 1) {
      this.optimizerType = OptimizerType.CMAES;
    }

    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const sortedBorePoints = getSortedBorePoints(instrument);
    const nHoles = sortedHoles.length;
    const geometry = new Array(this.nrDimensions);

    // Bore length
    geometry[0] = sortedBorePoints[sortedBorePoints.length - 1]?.borePosition ?? 0;

    // Hole spacings (from bottom)
    let priorPosition = geometry[0];
    for (let i = nHoles - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      geometry[nHoles - i] = priorPosition - hole.position;
      priorPosition = hole.position;
    }

    // Hole diameters
    for (let i = 0; i < nHoles; i++) {
      geometry[nHoles + 1 + i] = sortedHoles[i]!.diameter;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const sortedBorePoints = getSortedBorePoints(instrument);
    const nHoles = sortedHoles.length;

    // Adjust bore
    if (sortedBorePoints.length > 0) {
      sortedBorePoints[sortedBorePoints.length - 1]!.borePosition = point[0]!;
    }

    // Set hole positions (from bottom)
    let priorPosition = point[0]!;
    for (let i = nHoles - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      hole.position = priorPosition - point[nHoles - i]!;
      priorPosition = hole.position;
    }

    // Set hole diameters
    for (let i = 0; i < nHoles; i++) {
      sortedHoles[i]!.diameter = point[nHoles + 1 + i]!;
    }
  }

  protected setConstraints(): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const nHoles = sortedHoles.length;

    // Bore length
    this.constraints.addConstraint(
      createConstraint(
        HoleObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        ConstraintType.DIMENSIONAL
      )
    );

    // Hole spacings
    for (let i = nHoles; i > 0; i--) {
      const holeIdx = nHoles - i;
      const holeName = sortedHoles[holeIdx]?.name ?? getHoleName(i, nHoles);
      const nextName = i === 1 ? "bore end" : getHoleName(i - 1, nHoles);

      this.constraints.addConstraint(
        createConstraint(
          HoleObjectiveFunction.CONSTRAINT_CATEGORY,
          `${holeName} to ${nextName} distance`,
          ConstraintType.DIMENSIONAL
        )
      );
    }

    // Hole diameters
    for (let i = 0; i < nHoles; i++) {
      const holeName = sortedHoles[i]?.name ?? getHoleName(i + 1, nHoles);
      this.constraints.addConstraint(
        createConstraint(
          HoleObjectiveFunction.CONSTRAINT_CATEGORY,
          `${holeName} diameter`,
          ConstraintType.DIMENSIONAL
        )
      );
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Hole geometry optimizer");
    this.constraints.setObjectiveFunctionName("HoleObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  /**
   * Set default bounds based on current geometry.
   * Note: Geometry is in metres (converted by instrument calculator).
   */
  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();
    const nHoles = (this.nrDimensions - 1) / 2;

    this.lowerBounds = new Array(this.nrDimensions);
    this.upperBounds = new Array(this.nrDimensions);

    // Bore length bounds (minimum 50mm = 0.05m)
    this.lowerBounds[0] = Math.max(0.05, currentGeometry[0]! * 0.5);
    this.upperBounds[0] = currentGeometry[0]! * 2.0;

    // Spacing bounds (minimum 5mm = 0.005m)
    for (let i = 1; i <= nHoles; i++) {
      this.lowerBounds[i] = Math.max(0.005, currentGeometry[i]! * 0.5);
      this.upperBounds[i] = currentGeometry[i]! * 2.0;
    }

    // Diameter bounds (2mm-20mm = 0.002m-0.02m)
    for (let i = 0; i < nHoles; i++) {
      const idx = nHoles + 1 + i;
      this.lowerBounds[idx] = Math.max(0.002, currentGeometry[idx]! * 0.5);
      this.upperBounds[idx] = Math.min(0.02, currentGeometry[idx]! * 2.0);
    }

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}
