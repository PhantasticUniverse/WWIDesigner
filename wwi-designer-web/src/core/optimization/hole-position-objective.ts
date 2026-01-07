/**
 * Objective functions for optimizing bore length and hole positions.
 *
 * Includes:
 * - LengthObjectiveFunction: bore length only
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - HoleObjectiveFunction: combined position and size
 * - MergedObjectiveFunction: abstract class for merging multiple objective functions
 * - HoleGroupPositionObjectiveFunction: holes in groups with equal spacing
 *
 * Ported from com.wwidesigner.optimization.
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
 * Helper class to adjust bore length.
 * Implements the bore length adjustment logic used by multiple objective functions.
 */
class BoreLengthAdjuster {
  private objective: BaseObjectiveFunction;
  private adjustmentType: BoreLengthAdjustmentType;

  constructor(
    objective: BaseObjectiveFunction,
    adjustmentType: BoreLengthAdjustmentType
  ) {
    this.objective = objective;
    this.adjustmentType = adjustmentType;
  }

  /**
   * Adjust the bore based on the new length in point[0].
   */
  setBore(point: number[]): void {
    const newBoreLength = point[0]!;
    const instrument = this.objective.getInstrument();
    const sortedBorePoints = getSortedBorePoints(instrument);

    if (sortedBorePoints.length < 2) return;

    const topPosition = sortedBorePoints[0]!.borePosition;
    const oldBoreLength =
      sortedBorePoints[sortedBorePoints.length - 1]!.borePosition;

    switch (this.adjustmentType) {
      case BoreLengthAdjustmentType.MOVE_BOTTOM:
        // Just move the last bore point
        sortedBorePoints[sortedBorePoints.length - 1]!.borePosition =
          newBoreLength;
        break;

      case BoreLengthAdjustmentType.PRESERVE_TAPER:
        // Scale all bore points proportionally
        if (oldBoreLength - topPosition > 0) {
          const ratio =
            (newBoreLength - topPosition) / (oldBoreLength - topPosition);
          for (let i = 1; i < sortedBorePoints.length; i++) {
            const bp = sortedBorePoints[i]!;
            bp.borePosition =
              topPosition + (bp.borePosition - topPosition) * ratio;
          }
        }
        break;

      case BoreLengthAdjustmentType.PRESERVE_LENGTH:
        // Don't adjust bore - keep original length
        break;
    }
  }
}

/**
 * Simple objective function for optimizing bore length only.
 * Single dimension optimization.
 *
 * Ported from LengthObjectiveFunction.java
 */
export class LengthObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore length";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;
  static readonly DISPLAY_NAME = "Length optimizer";

  private boreLengthAdjuster: BoreLengthAdjuster;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);
    this.boreLengthAdjuster = new BoreLengthAdjuster(this, lengthAdjustmentMode);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT; // Univariate optimizer
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

  getGeometryPoint(): number[] {
    return [this.getEndOfBore()];
  }

  setGeometryPoint(point: number[]): void {
    this.boreLengthAdjuster.setBore(point);
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        LengthObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        LengthObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      LengthObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("LengthObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentLength = this.getEndOfBore();
    this.lowerBounds = [Math.max(0.05, currentLength * 0.5)];
    this.upperBounds = [currentLength * 2.0];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
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

/**
 * Abstract class for merging multiple ObjectiveFunctions into a single
 * objective function. The number of geometry dimensions is the sum of
 * the dimensions of the individual classes.
 *
 * Ported from MergedObjectiveFunction.java
 */
export abstract class MergedObjectiveFunction extends BaseObjectiveFunction {
  protected components: BaseObjectiveFunction[] = [];

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
  }

  /**
   * Calculate total dimensions from components.
   * Derived classes must call this at the end of their constructor.
   */
  protected sumDimensions(): void {
    this.nrDimensions = 0;
    for (const component of this.components) {
      this.nrDimensions += component.getNrDimensions();
    }

    if (this.nrDimensions === 1 && this.optimizerType === OptimizerType.BOBYQA) {
      this.optimizerType = OptimizerType.CMAES;
    }

    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const point: number[] = [];
    for (const component of this.components) {
      const subPoint = component.getGeometryPoint();
      point.push(...subPoint);
    }
    return point;
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    let i = 0;
    for (const component of this.components) {
      const subPoint = point.slice(i, i + component.getNrDimensions());
      component.setGeometryPoint(subPoint);
      i += component.getNrDimensions();
    }
  }

  setLowerBounds(bounds: number[]): void {
    super.setLowerBounds(bounds);
    // Copy bounds to component ObjectiveFunctions
    let i = 0;
    for (const component of this.components) {
      const subBounds = bounds.slice(i, i + component.getNrDimensions());
      component.setLowerBounds(subBounds);
      i += component.getNrDimensions();
    }
  }

  setUpperBounds(bounds: number[]): void {
    super.setUpperBounds(bounds);
    // Copy bounds to component ObjectiveFunctions
    let i = 0;
    for (const component of this.components) {
      const subBounds = bounds.slice(i, i + component.getNrDimensions());
      component.setUpperBounds(subBounds);
      i += component.getNrDimensions();
    }
  }

  protected setConstraints(): void {
    for (const component of this.components) {
      const componentConstraints = component.getConstraints();
      this.constraints.addConstraints(componentConstraints);
    }
    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
  }
}

/**
 * Objective function for bore length and hole positions, with
 * holes equally spaced within groups.
 *
 * Geometry dimensions:
 * - Position of end bore point
 * - For each group, spacing within group, then spacing to next group
 * - Final spacing from last group to end of bore
 *
 * Ported from HoleGroupPositionObjectiveFunction.java
 */
export class HoleGroupPositionObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Hole position";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;

  private holeGroups: number[][] = [];
  private numberOfHoles: number = 0;
  private numberOfHoleSpaces: number = 0;
  /** For each hole, the geometry dimension that identifies spacing after this hole */
  private dimensionByHole: number[] = [];
  /** For each hole, the number of holes in the hole's dimension (for averaging) */
  private groupSize: number[] = [];
  private boreLengthAdjuster: BoreLengthAdjuster;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);
    this.boreLengthAdjuster = new BoreLengthAdjuster(this, lengthAdjustmentMode);
    this.optimizerType = OptimizerType.BOBYQA;
    this.setHoleGroups(holeGroups);
    this.setConstraints();
  }

  /**
   * Set and validate hole groups.
   */
  setHoleGroups(groups: number[][]): void {
    this.numberOfHoles = this.calculator.getInstrument().hole.length;
    this.numberOfHoleSpaces = 0;

    if (this.numberOfHoles === 0) {
      // No holes - only optimize bore length
      this.nrDimensions = 1;
      this.holeGroups = [];
      this.dimensionByHole = [];
      this.groupSize = [];
      return;
    }

    this.validateHoleGroups(groups, this.numberOfHoles);
    this.computeDimensionByHole(this.numberOfHoles);

    if (this.nrDimensions === 1) {
      this.optimizerType = OptimizerType.CMAES;
    }
  }

  private validateHoleGroups(groups: number[][], nHoles: number): void {
    let currentIdx = 0;
    let first = true;

    for (const group of groups) {
      if (group.length > 1) {
        this.numberOfHoleSpaces++; // One for each group
      }

      let firstInGroup = true;
      for (const holeIdx of group) {
        if (first) {
          if (holeIdx !== 0) {
            throw new Error(
              "Groups must start with the first hole (index 0)"
            );
          }
          first = false;
        }

        if (firstInGroup) {
          firstInGroup = false;
          if (currentIdx !== holeIdx) {
            if (holeIdx !== currentIdx + 1) {
              throw new Error("A hole is missing from groups");
            }
            this.numberOfHoleSpaces++; // Space not in a group
          }
        } else {
          if (currentIdx !== holeIdx && holeIdx !== currentIdx + 1) {
            throw new Error("A hole is missing within a group");
          }
        }
        currentIdx = holeIdx;
      }
    }

    this.holeGroups = groups;
    this.numberOfHoleSpaces++; // Space from last hole to foot

    if (currentIdx + 1 !== nHoles) {
      throw new Error("All holes are not in a group");
    }

    this.nrDimensions = 1 + this.numberOfHoleSpaces;
  }

  private computeDimensionByHole(nHoles: number): void {
    this.dimensionByHole = new Array(nHoles).fill(0);
    this.groupSize = new Array(nHoles).fill(1);

    // Dimension 0 is position of end bore point
    // Dimension 1 is spacing after first hole
    let dimension = 1;

    for (let i = 0; i < this.holeGroups.length; i++) {
      const group = this.holeGroups[i]!;
      if (group.length > 1) {
        // All holes but last use current dimension (inter-hole spacing)
        for (let j = 0; j < group.length - 1; j++) {
          this.dimensionByHole[group[j]!] = dimension;
          this.groupSize[group[j]!] = group.length - 1;
        }
        dimension++;
      }
      if (group.length > 0) {
        // Last hole in group uses spacing after group
        this.dimensionByHole[group[group.length - 1]!] = dimension;
        this.groupSize[group[group.length - 1]!] = 1;
        dimension++;
      }
    }
  }

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

  getGeometryPoint(): number[] {
    const sortedHoles = getSortedHoles(this.calculator.getInstrument());
    const geometry = new Array(this.nrDimensions).fill(0);

    // First dimension is bore length
    geometry[0] = this.getEndOfBore();

    // Calculate spacings from bottom to top, averaging within groups
    let priorHolePosition = geometry[0];
    for (let i = sortedHoles.length - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      const spacing = priorHolePosition - hole.position;
      geometry[this.dimensionByHole[i]!] += spacing / this.groupSize[i]!;
      priorHolePosition = hole.position;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    this.boreLengthAdjuster.setBore(point);

    const sortedHoles = getSortedHoles(this.calculator.getInstrument());

    // Position holes from bottom to top
    let priorHolePosition = this.getEndOfBore();

    for (let i = sortedHoles.length - 1; i >= 0; i--) {
      const hole = sortedHoles[i]!;
      hole.position = priorHolePosition - point[this.dimensionByHole[i]!]!;
      priorHolePosition = hole.position;
    }
  }

  protected setConstraints(): void {
    this.constraints.clearConstraints(
      HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY
    );

    // Bore length constraint
    this.constraints.addConstraint(
      createConstraint(
        HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        HoleGroupPositionObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    const sortedHoles = getSortedHoles(this.calculator.getInstrument());
    const nHoles = sortedHoles.length;

    for (let groupIdx = 0; groupIdx < this.holeGroups.length; groupIdx++) {
      const group = this.holeGroups[groupIdx]!;
      const isGroup = group.length > 1;

      if (isGroup) {
        const groupName = this.getGroupName(groupIdx, sortedHoles);
        this.constraints.addConstraint(
          createConstraint(
            HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
            `${groupName} spacing`,
            HoleGroupPositionObjectiveFunction.CONSTRAINT_TYPE
          )
        );
      }

      const firstHoleName = this.getHoleNameFromGroup(groupIdx, false, sortedHoles);
      const secondHoleName = this.getHoleNameFromGroup(groupIdx + 1, true, sortedHoles);
      this.constraints.addConstraint(
        createConstraint(
          HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
          `${firstHoleName} to ${secondHoleName} distance`,
          HoleGroupPositionObjectiveFunction.CONSTRAINT_TYPE
        )
      );
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Grouped hole-spacing optimizer");
    this.constraints.setObjectiveFunctionName("HoleGroupPositionObjectiveFunction");
    this.constraints.setHoleGroups(this.holeGroups);

    this.setDefaultBounds();
  }

  private getHoleNameFromGroup(
    groupIdx: number,
    firstHole: boolean,
    sortedHoles: Hole[]
  ): string {
    if (groupIdx >= this.holeGroups.length) {
      return "bore end";
    }

    const group = this.holeGroups[groupIdx]!;
    const holeIdx = firstHole ? group[0]! : group[group.length - 1]!;
    const maxHoleIdx = sortedHoles.length;

    return getHoleName(maxHoleIdx - holeIdx, maxHoleIdx);
  }

  private getGroupName(groupIdx: number, sortedHoles: Hole[]): string {
    const group = this.holeGroups[groupIdx]!;
    const isGroup = group.length > 1;
    const maxHoleIdx = sortedHoles.length;

    let name = "";
    if (isGroup) {
      name += `Group ${groupIdx + 1} (`;
    }

    for (let i = 0; i < group.length; i++) {
      if (i > 0) {
        name += ", ";
      }
      const holeIdx = group[i]!;
      name += getHoleName(maxHoleIdx - holeIdx, maxHoleIdx);
    }

    if (isGroup) {
      name += ")";
    }

    return name;
  }

  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();

    this.lowerBounds = currentGeometry.map((v, i) => {
      if (i === 0) {
        return Math.max(0.05, v * 0.5); // Bore length
      }
      return Math.max(0.005, v * 0.5); // Spacings
    });

    this.upperBounds = currentGeometry.map((v) => v * 2.0);

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }

  /**
   * Get the hole groups configuration.
   */
  getHoleGroups(): number[][] {
    return this.holeGroups.map((g) => [...g]);
  }

  /**
   * Set whether to allow bore diameter interpolation when changing hole positions.
   * This is a stub for compatibility with Java API - interpolation is not yet implemented.
   * @returns this for method chaining
   */
  setAllowBoreSizeInterpolation(_allow: boolean): this {
    // Stub: interpolation not yet implemented
    return this;
  }
}

/**
 * Objective function for bore diameters at existing bore points,
 * optimizing from the bottom of the bore.
 *
 * Geometry dimensions:
 * - For each bore point from bottom, ratio of diameter to prior bore point upward
 *
 * Use of diameter ratios allows constraints to control taper direction:
 * - Lower bound 1.0: bore flares out toward bottom
 * - Upper bound 1.0: bore tapers inward toward bottom
 *
 * Ported from BoreDiameterFromBottomObjectiveFunction.java
 */
export class BoreDiameterFromBottomObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore diameter ratios";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Bore Diameter (from bottom) optimizer";

  /** Index of first bore point affected by optimization */
  private unchangedBorePoints: number;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    const nrBorePoints = calculator.getInstrument().borePoint.length;

    // Determine how many bore points to leave unchanged
    if (unchangedBorePoints === undefined) {
      // Default: find top of body
      this.unchangedBorePoints =
        BoreDiameterFromBottomObjectiveFunction.getTopOfBody(
          calculator.getInstrument()
        ) + 1;
    } else if (unchangedBorePoints >= nrBorePoints) {
      this.unchangedBorePoints = nrBorePoints - 1;
    } else if (unchangedBorePoints >= 1) {
      this.unchangedBorePoints = unchangedBorePoints;
    } else {
      this.unchangedBorePoints = 1;
    }

    this.nrDimensions = nrBorePoints - this.unchangedBorePoints;

    if (this.nrDimensions > 1) {
      this.optimizerType = OptimizerType.BOBYQA;
    } else {
      this.optimizerType = OptimizerType.BRENT;
    }

    this.maxEvaluations = 10000;
    this.setConstraints();
  }

  /**
   * Find the index of the bore point at the top of the body.
   * Looks for points named "Body" or "Head", or estimates based on hole position.
   */
  static getTopOfBody(instrument: Instrument): number {
    const borePoints = getSortedBorePoints(instrument);
    if (borePoints.length <= 2) {
      return 0;
    }

    // Look for point by name
    const bodyIdx = borePoints.findIndex(
      (bp) => bp.name?.toLowerCase().includes("body")
    );
    if (bodyIdx >= 0) {
      return bodyIdx;
    }

    const headIdx = borePoints.findIndex(
      (bp) => bp.name?.toLowerCase().includes("head")
    );
    if (headIdx >= 0) {
      return headIdx;
    }

    // Named point not found, estimate based on hole positions
    const sortedHoles = getSortedHoles(instrument);
    let topHolePosition: number;

    if (sortedHoles.length > 0) {
      topHolePosition = sortedHoles[0]!.position;
    } else {
      // No holes, use mid-point of bore
      topHolePosition =
        0.5 *
        (borePoints[0]!.borePosition +
          borePoints[borePoints.length - 1]!.borePosition);
    }

    // Find lowest bore point above the top tonehole
    for (let i = borePoints.length - 2; i > 0; i--) {
      if (borePoints[i]!.borePosition < topHolePosition) {
        return i;
      }
    }

    return 0;
  }

  private borePointIdx(dimensionIdx: number): number {
    return this.unchangedBorePoints + dimensionIdx;
  }

  private referencePointIdx(): number {
    return this.unchangedBorePoints - 1;
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
    let priorBoreDia = sortedPoints[this.referencePointIdx()]!.boreDiameter;

    for (let dim = 0; dim < this.nrDimensions; dim++) {
      if (priorBoreDia < 0.000001) {
        priorBoreDia = 0.000001;
      }
      const borePoint = sortedPoints[this.borePointIdx(dim)]!;
      geometry[dim] = borePoint.boreDiameter / priorBoreDia;
      priorBoreDia = borePoint.boreDiameter;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const instrument = this.calculator.getInstrument();
    const sortedPoints = getSortedBorePoints(instrument);
    let priorBoreDia = sortedPoints[this.referencePointIdx()]!.boreDiameter;
    const oldTerminationDia =
      sortedPoints[sortedPoints.length - 1]!.boreDiameter;

    for (let dim = 0; dim < this.nrDimensions; dim++) {
      const borePoint = sortedPoints[this.borePointIdx(dim)]!;
      borePoint.boreDiameter = point[dim]! * priorBoreDia;
      priorBoreDia = borePoint.boreDiameter;
    }

    // Adjust termination flange diameter to preserve flange width
    const terminationChange = priorBoreDia - oldTerminationDia;
    if (instrument.termination && instrument.termination.flangeDiameter) {
      instrument.termination.flangeDiameter += terminationChange;
    }
  }

  protected setConstraints(): void {
    for (let dim = 0; dim < this.nrDimensions; dim++) {
      const pointNr = this.borePointIdx(dim);
      const name = `Ratio of diameters, bore point ${pointNr + 1} / bore point ${pointNr}`;
      this.constraints.addConstraint(
        createConstraint(
          BoreDiameterFromBottomObjectiveFunction.CONSTRAINT_CATEGORY,
          name,
          BoreDiameterFromBottomObjectiveFunction.CONSTRAINT_TYPE
        )
      );
    }

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BoreDiameterFromBottomObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "BoreDiameterFromBottomObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Default: allow ratios from 0.8 to 1.25 (20% change each way)
    this.lowerBounds = new Array(this.nrDimensions).fill(0.8);
    this.upperBounds = new Array(this.nrDimensions).fill(1.25);
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for bore length and hole positions, with the
 * top hole position expressed as a fraction of bore length.
 *
 * Geometry dimensions:
 * - Position of end bore point
 * - Position of top hole as fraction of bore length (dimensionless)
 * - For each subsequent hole, spacing below to the next hole
 *
 * Ported from HolePositionFromTopObjectiveFunction.java
 */
export class HolePositionFromTopObjectiveFunction extends HolePositionObjectiveFunction {
  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator, lengthAdjustmentMode);
    // Re-set constraints to use the overridden version
    this.setConstraints();
  }

  /**
   * Retrieve geometry values from the instrument.
   * @returns [boreLength, topHoleRatio, spacing2, ..., spacingN]
   */
  override getGeometryPoint(): number[] {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const geometry = new Array(this.nrDimensions);

    // First dimension is bore length
    geometry[0] = this.getEndOfBore();
    let priorHolePosition = 0;

    // Process holes from top to bottom
    for (let i = 0; i < sortedHoles.length; i++) {
      const hole = sortedHoles[i]!;
      geometry[i + 1] = hole.position - priorHolePosition;
      if (i === 0) {
        // Convert top hole position to ratio
        geometry[i + 1] = this.getTopRatio(geometry[0], geometry[1]);
      }
      priorHolePosition = hole.position;
    }

    return geometry;
  }

  /**
   * Set geometry values on the instrument.
   */
  override setGeometryPoint(point: number[]): void {
    // Adjust bore based on new length
    this.setBoreFromPoint(point);

    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);

    let priorHolePosition = 0;

    // Process holes from top to bottom
    for (let i = 0; i < sortedHoles.length; i++) {
      const hole = sortedHoles[i]!;
      let holePosition = priorHolePosition + point[i + 1]!;
      if (i === 0) {
        // Convert ratio back to absolute position
        holePosition = this.getTopPosition(point[0]!, point[i + 1]!);
      }
      hole.position = holePosition;
      priorHolePosition = holePosition;
    }
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
   * Adjust the bore profile based on the new bore length in point[0].
   */
  private setBoreFromPoint(point: number[]): void {
    const newBoreLength = point[0]!;
    const instrument = this.calculator.getInstrument();
    const sortedBorePoints = getSortedBorePoints(instrument);

    if (sortedBorePoints.length < 2) return;

    const topPosition = sortedBorePoints[0]!.borePosition;
    const oldBoreLength =
      sortedBorePoints[sortedBorePoints.length - 1]!.borePosition;

    const lengthAdjustmentMode = this.getLengthAdjustmentMode();

    switch (lengthAdjustmentMode) {
      case BoreLengthAdjustmentType.MOVE_BOTTOM:
        // Just move the last bore point
        sortedBorePoints[sortedBorePoints.length - 1]!.borePosition =
          newBoreLength;
        break;

      case BoreLengthAdjustmentType.PRESERVE_TAPER:
        // Scale all bore points proportionally
        if (oldBoreLength - topPosition > 0) {
          const ratio =
            (newBoreLength - topPosition) / (oldBoreLength - topPosition);
          for (let i = 1; i < sortedBorePoints.length; i++) {
            const bp = sortedBorePoints[i]!;
            bp.borePosition =
              topPosition + (bp.borePosition - topPosition) * ratio;
          }
        }
        break;

      case BoreLengthAdjustmentType.PRESERVE_LENGTH:
        // Don't adjust bore - keep original length
        break;
    }
  }

  /**
   * Calculates the top hole position as a ratio to the bore length.
   * Top hole ratio is measured from the splitting edge (mouthpiece position)
   * for both numerator and denominator.
   */
  private getTopRatio(boreLength: number, topHolePosition: number): number {
    const realOrigin =
      this.calculator.getInstrument().mouthpiece?.position ?? 0;
    return (topHolePosition - realOrigin) / (boreLength - realOrigin);
  }

  /**
   * Convert top hole ratio back to absolute position.
   * @param boreLength - Measured from arbitrary origin
   * @param topHoleRatio - Ratio of top hole position to bore length,
   *                       both measured from splitting edge
   * @returns Top hole position, measured from arbitrary origin
   */
  private getTopPosition(boreLength: number, topHoleRatio: number): number {
    const realOrigin =
      this.calculator.getInstrument().mouthpiece?.position ?? 0;
    const boreLengthFromEdge = boreLength - realOrigin;
    const topHolePosition = topHoleRatio * boreLengthFromEdge + realOrigin;
    return topHolePosition;
  }

  /**
   * Set up constraints for this objective function.
   */
  protected override setConstraints(): void {
    const instrument = this.calculator.getInstrument();
    const sortedHoles = getSortedHoles(instrument);
    const nHoles = sortedHoles.length;

    // First constraint: bore length (dimensional)
    this.constraints.addConstraint(
      createConstraint(
        HolePositionObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        ConstraintType.DIMENSIONAL
      )
    );

    // Constraints for hole positions from top down
    for (let i = nHoles, idx = 0; i > 0; i--, idx++) {
      const holeName = sortedHoles[idx]?.name ?? getHoleName(i, nHoles);

      if (idx === 0) {
        // Top hole: dimensionless ratio
        this.constraints.addConstraint(
          createConstraint(
            HolePositionObjectiveFunction.CONSTRAINT_CATEGORY,
            `Bore top to ${holeName}, bore-length fraction`,
            ConstraintType.DIMENSIONLESS
          )
        );
      } else {
        // Other holes: dimensional distance
        const priorName =
          sortedHoles[idx - 1]?.name ?? getHoleName(i + 1, nHoles);
        this.constraints.addConstraint(
          createConstraint(
            HolePositionObjectiveFunction.CONSTRAINT_CATEGORY,
            `${priorName} to ${holeName} distance`,
            ConstraintType.DIMENSIONAL
          )
        );
      }
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Hole position optimizer");
    this.constraints.setObjectiveFunctionName(
      "HolePositionFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    // Set default bounds
    this.setDefaultBoundsFromTop();
  }

  /**
   * Set default bounds based on current geometry.
   */
  private setDefaultBoundsFromTop(): void {
    const currentGeometry = this.getGeometryPoint();

    // Lower bounds
    this.lowerBounds = currentGeometry.map((v, i) => {
      if (i === 0) {
        return Math.max(0.05, v * 0.5); // Bore length minimum 50mm
      } else if (i === 1) {
        return Math.max(0.1, v * 0.5); // Top hole ratio minimum 0.1
      }
      return Math.max(0.001, v * 0.5); // Spacings minimum 1mm
    });

    // Upper bounds
    this.upperBounds = currentGeometry.map((v, i) => {
      if (i === 1) {
        return Math.min(0.9, v * 2.0); // Top hole ratio maximum 0.9
      }
      return v * 2.0;
    });

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for bore diameters at existing bore points,
 * optimizing from the top of the bore.
 *
 * Geometry dimensions:
 * - For bore points from the top down, ratio of diameter at this bore point
 *   to the next bore point below
 *
 * Use of diameter ratios rather than absolute diameters allows constraints
 * to control the direction of taper:
 * - Lower bound 1.0: bore flares out toward top
 * - Upper bound 1.0: bore tapers inward toward top
 *
 * The bore points to vary can be specified as a number of bore points
 * or with a bore point name. Diameters at bore points below are left unchanged.
 *
 * Ported from BoreDiameterFromTopObjectiveFunction.java
 */
export class BoreDiameterFromTopObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore diameter ratios";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Bore Diameter (from top) optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number | string
  ) {
    super(calculator, tuning, evaluator);

    const nrBorePoints = calculator.getInstrument().borePoint.length;

    // Determine number of dimensions
    if (changedBorePoints === undefined) {
      // Default: find lowest point with "Head" in name
      this.nrDimensions = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        calculator.getInstrument(),
        "Head"
      );
    } else if (typeof changedBorePoints === "string") {
      // Find by point name
      this.nrDimensions = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        calculator.getInstrument(),
        changedBorePoints
      );
    } else {
      // Use explicit count
      this.nrDimensions = changedBorePoints;
    }

    // At least the bottom bore point is left unchanged
    if (this.nrDimensions >= nrBorePoints) {
      this.nrDimensions = nrBorePoints - 1;
    }

    // At least the top bore point is changed
    if (this.nrDimensions < 1) {
      this.nrDimensions = 1;
    }

    if (this.nrDimensions > 1) {
      this.optimizerType = OptimizerType.BOBYQA;
    } else {
      this.optimizerType = OptimizerType.BRENT;
    }

    this.maxEvaluations = 10000;
    this.setConstraints();
  }

  /**
   * Find the index of the lowest bore point containing pointName.
   * If not found, estimates based on hole positions.
   */
  static getLowestPoint(instrument: Instrument, pointName: string): number {
    const borePoints = getSortedBorePoints(instrument);

    if (borePoints.length <= 2) {
      return 0;
    }

    // Look for lowest point by name (search from bottom up)
    for (let i = borePoints.length - 1; i >= 0; i--) {
      if (borePoints[i]!.name?.toLowerCase().includes(pointName.toLowerCase())) {
        return i;
      }
    }

    // Named point not found, estimate based on hole positions
    const sortedHoles = getSortedHoles(instrument);
    let topHolePosition: number;

    if (sortedHoles.length > 0) {
      topHolePosition = sortedHoles[0]!.position;
    } else {
      // No holes, use mid-point of bore
      topHolePosition =
        0.5 *
        (borePoints[0]!.borePosition +
          borePoints[borePoints.length - 1]!.borePosition);
    }

    // Find lowest bore point above the top tonehole
    for (let i = borePoints.length - 2; i > 0; i--) {
      if (borePoints[i]!.borePosition < topHolePosition) {
        return i;
      }
    }

    return 0;
  }

  /**
   * Index of first point with static diameter, used as an initial
   * reference for the remaining points.
   */
  private referencePointIdx(): number {
    return this.nrDimensions;
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
    let nextBoreDia = sortedPoints[this.referencePointIdx()]!.boreDiameter;

    // Process from bottom of affected region up to top
    for (let dim = this.nrDimensions - 1; dim >= 0; dim--) {
      if (nextBoreDia < 0.000001) {
        nextBoreDia = 0.000001;
      }
      const borePoint = sortedPoints[dim]!;
      geometry[dim] = borePoint.boreDiameter / nextBoreDia;
      nextBoreDia = borePoint.boreDiameter;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
    let nextBoreDia = sortedPoints[this.referencePointIdx()]!.boreDiameter;

    // Process from bottom of affected region up to top
    for (let dim = this.nrDimensions - 1; dim >= 0; dim--) {
      const borePoint = sortedPoints[dim]!;
      borePoint.boreDiameter = point[dim]! * nextBoreDia;
      nextBoreDia = borePoint.boreDiameter;
    }
  }

  protected setConstraints(): void {
    for (let dim = 0; dim < this.nrDimensions; dim++) {
      const name = `Ratio of diameters, bore point ${dim + 1} / bore point ${dim + 2}`;
      this.constraints.addConstraint(
        createConstraint(
          BoreDiameterFromTopObjectiveFunction.CONSTRAINT_CATEGORY,
          name,
          BoreDiameterFromTopObjectiveFunction.CONSTRAINT_TYPE
        )
      );
    }

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BoreDiameterFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "BoreDiameterFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Default: allow ratios from 0.8 to 1.25 (20% change each way)
    this.lowerBounds = new Array(this.nrDimensions).fill(0.8);
    this.upperBounds = new Array(this.nrDimensions).fill(1.25);
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for hole positions and diameters, with
 * the top hole position expressed as a fraction of bore length.
 *
 * Combines:
 * - HolePositionFromTopObjectiveFunction: bore length + hole positions from top
 * - HoleSizeObjectiveFunction: hole diameters
 *
 * Ported from HoleFromTopObjectiveFunction.java
 */
export class HoleFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Hole size & position";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    // Create component objective functions
    this.components = [
      new HolePositionFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        lengthAdjustmentMode
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      HoleFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("HoleFromTopObjectiveFunction");
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Objective function for a simple two-section tapered bore.
 * The bore has two sections. The diameter at the head, and diameter between
 * the two sections are left invariant.
 *
 * Geometry dimensions:
 * - Length of head section, as a fraction of total bore length (dimensionless)
 * - Taper ratio: foot diameter / middle diameter (dimensionless)
 *
 * Ported from BasicTaperObjectiveFunction.java
 */
export class BasicTaperObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Simple taper";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Basic Taper optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 2;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());

    // Assume at least two points, taper to be optimized starts on the second,
    // and ends on the last. (bottomPoint and middlePoint may be the same point.)
    const topPoint = sortedPoints[0]!;
    const middlePoint = sortedPoints[1]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;

    // Head length ratio
    geometry[0] =
      (middlePoint.borePosition - topPoint.borePosition) /
      (bottomPoint.borePosition - topPoint.borePosition);

    // Foot diameter ratio
    geometry[1] = bottomPoint.boreDiameter / middlePoint.boreDiameter;

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const instrument = this.calculator.getInstrument();
    const sortedPoints = getSortedBorePoints(instrument);

    const topPoint = sortedPoints[0]!;
    const middlePoint = sortedPoints[1]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;
    const boreLength = bottomPoint.borePosition - topPoint.borePosition;

    // First point doesn't change at all
    // Second point changes position, but not diameter
    middlePoint.borePosition = boreLength * point[0]! + topPoint.borePosition;

    // Bottom point changes diameter, but not position
    // Create new point in case bottomPoint was identical to middlePoint
    const newBottomDiameter = middlePoint.boreDiameter * point[1]!;

    // Replace bore points with exactly 3 points
    instrument.borePoint = [
      { ...topPoint },
      { ...middlePoint },
      {
        borePosition: boreLength + topPoint.borePosition,
        boreDiameter: newBottomDiameter,
        name: bottomPoint.name,
      },
    ];
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        BasicTaperObjectiveFunction.CONSTRAINT_CATEGORY,
        "Head length ratio (to bore length)",
        BasicTaperObjectiveFunction.CONSTRAINT_TYPE
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        BasicTaperObjectiveFunction.CONSTRAINT_CATEGORY,
        "Foot diameter ratio (foot/middle)",
        BasicTaperObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BasicTaperObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("BasicTaperObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Head length ratio: 0.1 to 0.9
    // Foot diameter ratio: 0.8 to 1.25
    this.lowerBounds = [0.1, 0.8];
    this.upperBounds = [0.9, 1.25];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for a simple three-section bore with a single tapered section.
 * The foot diameter remains invariant. The position of the top and bottom bore
 * points remain unchanged.
 *
 * Geometry dimensions:
 * - Taper ratio: head diameter / foot diameter (dimensionless)
 * - Fraction of bore that is tapered (dimensionless)
 * - Fraction of untapered length at head end (dimensionless)
 *
 * Ported from SingleTaperRatioObjectiveFunction.java
 */
export class SingleTaperRatioObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Single bore taper";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Single taper (dimensionless) optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    setStartingGeometry: boolean = true
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 3;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();

    if (setStartingGeometry) {
      this.setStartingGeometry();
    }
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());

    // Assume at least two points
    const topPoint = sortedPoints[0]!;
    const nextPoint = sortedPoints[1]!;
    const penultimatePoint = sortedPoints[sortedPoints.length - 2]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;
    const boreLength = bottomPoint.borePosition - topPoint.borePosition;

    let taperStart: number;
    let taperEnd: number;

    // Taper ratio: head diameter / foot diameter
    geometry[0] = topPoint.boreDiameter / bottomPoint.boreDiameter;

    if (topPoint.boreDiameter === bottomPoint.boreDiameter) {
      // Bore doesn't really taper
      taperStart = topPoint.borePosition;
      taperEnd = bottomPoint.borePosition;
    } else {
      if (topPoint.boreDiameter === nextPoint.boreDiameter) {
        // Taper starts on second point
        taperStart = nextPoint.borePosition;
      } else {
        // Taper starts on first point
        taperStart = topPoint.borePosition;
      }

      if (bottomPoint.boreDiameter === penultimatePoint.boreDiameter) {
        // Taper ends on second-last point
        taperEnd = penultimatePoint.borePosition;
      } else {
        // Taper ends on bottom point
        taperEnd = bottomPoint.borePosition;
      }
    }

    if (taperEnd - taperStart >= boreLength) {
      geometry[1] = 1.0;
      geometry[2] = 0.0;
    } else {
      geometry[1] = (taperEnd - taperStart) / boreLength;
      geometry[2] =
        (taperStart - topPoint.borePosition) /
        (boreLength - (taperEnd - taperStart));
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const instrument = this.calculator.getInstrument();
    const sortedPoints = getSortedBorePoints(instrument);

    const topPoint = sortedPoints[0]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;
    const footDiameter = bottomPoint.boreDiameter;
    const headDiameter = footDiameter * point[0]!;
    const boreLength = bottomPoint.borePosition - topPoint.borePosition;
    const taperLength = boreLength * point[1]!;
    const taperStart = (boreLength - taperLength) * point[2]!;

    // Replace existing bore points with a new list of up to 4 points
    const newBorePoints: typeof instrument.borePoint = [];

    // First point: head
    newBorePoints.push({
      borePosition: topPoint.borePosition,
      boreDiameter: headDiameter,
      name: topPoint.name,
    });

    if (taperStart > 0) {
      // Taper begins on second point rather than first
      newBorePoints.push({
        borePosition: topPoint.borePosition + taperStart,
        boreDiameter: headDiameter,
      });
    }

    // Add point for end of taper
    newBorePoints.push({
      borePosition: topPoint.borePosition + taperStart + taperLength,
      boreDiameter: footDiameter,
    });

    if (taperStart + taperLength < boreLength) {
      // Taper ends on second-last point rather than last
      newBorePoints.push({
        borePosition: topPoint.borePosition + boreLength,
        boreDiameter: footDiameter,
        name: bottomPoint.name,
      });
    }

    instrument.borePoint = newBorePoints;
  }

  /**
   * Reset the instrument borePoints to a reasonable starting geometry.
   * Creates 4 bore points with a slight taper in the middle third.
   */
  setStartingGeometry(): void {
    const instrument = this.calculator.getInstrument();
    const sortedPoints = getSortedBorePoints(instrument);

    const head = sortedPoints[0]!;
    const tail = sortedPoints[sortedPoints.length - 1]!;

    const startPosition = head.borePosition;
    const boreLength = tail.borePosition - startPosition;
    const tailDiameter = tail.boreDiameter;
    const headDiameter = tailDiameter * 1.05;

    instrument.borePoint = [
      {
        borePosition: startPosition,
        boreDiameter: headDiameter,
        name: head.name,
      },
      {
        borePosition: boreLength / 3 + startPosition,
        boreDiameter: headDiameter,
      },
      {
        borePosition: (2 * boreLength) / 3 + startPosition,
        boreDiameter: tailDiameter,
      },
      {
        borePosition: tail.borePosition,
        boreDiameter: tailDiameter,
        name: tail.name,
      },
    ];
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore diameter ratio (top/bottom)",
        SingleTaperRatioObjectiveFunction.CONSTRAINT_TYPE
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Taper length ratio to bore length",
        SingleTaperRatioObjectiveFunction.CONSTRAINT_TYPE
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Untapered top length ratio to total untapered length",
        SingleTaperRatioObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      SingleTaperRatioObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperRatioObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Taper ratio (head/foot): 0.9 to 1.2
    // Taper length ratio: 0.1 to 1.0
    // Untapered top ratio: 0.0 to 1.0
    this.lowerBounds = [0.9, 0.1, 0.0];
    this.upperBounds = [1.2, 1.0, 1.0];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Get a tuning containing only the lowest frequency note from the original tuning.
 * Used by FippleFactorObjectiveFunction to calibrate the fipple using the fundamental.
 */
function getLowestNoteTuning(tuning: Tuning): Tuning {
  let lowestFingering: typeof tuning.fingering[0] | null = null;
  let lowestFrequency = Number.POSITIVE_INFINITY;

  for (const fingering of tuning.fingering) {
    const note = fingering.note;
    if (note?.frequency !== undefined && note.frequency < lowestFrequency) {
      lowestFrequency = note.frequency;
      lowestFingering = fingering;
    }
  }

  return {
    name: tuning.name,
    comment: tuning.comment,
    numberOfHoles: tuning.numberOfHoles,
    fingering: lowestFingering ? [lowestFingering] : [],
  };
}

/**
 * Objective function for calibrating an instrument's fipple factor.
 * If the Tuning has more than one note, only the one with the lowest
 * frequency is used to determine the fipple factor.
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from FippleFactorObjectiveFunction.java
 */
export class FippleFactorObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece fipple";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Fipple factor";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    // Use only the lowest note from the tuning
    super(calculator, getLowestNoteTuning(tuning), evaluator);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const fipple = this.calculator.getInstrument().mouthpiece?.fipple;
    const fippleFactor = fipple?.fippleFactor ?? 1.0;
    return [fippleFactor];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    if (instrument.mouthpiece?.fipple) {
      instrument.mouthpiece.fipple.fippleFactor = point[0]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        FippleFactorObjectiveFunction.CONSTRAINT_CATEGORY,
        "Fipple factor",
        FippleFactorObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      FippleFactorObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("FippleFactorObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Fipple factor typically ranges from 0.5 to 2.0
    this.lowerBounds = [0.5];
    this.upperBounds = [2.0];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Objective function for calibrating the height of a fipple flute's window
 * or a transverse flute's embouchure hole.
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from WindowHeightObjectiveFunction.java
 */
export class WindowHeightObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece window";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;
  static readonly DISPLAY_NAME = "Window Height calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;

    if (mouthpiece?.fipple) {
      return [mouthpiece.fipple.windowHeight ?? 0];
    } else if (mouthpiece?.embouchureHole) {
      return [mouthpiece.embouchureHole.height];
    }

    return [0];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;

    if (mouthpiece?.fipple) {
      mouthpiece.fipple.windowHeight = point[0]!;
    } else if (mouthpiece?.embouchureHole) {
      mouthpiece.embouchureHole.height = point[0]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        WindowHeightObjectiveFunction.CONSTRAINT_CATEGORY,
        "Window height",
        WindowHeightObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      WindowHeightObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("WindowHeightObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentHeight = this.getGeometryPoint()[0]!;

    // Window height typically ranges from 1mm to 10mm (0.001m to 0.01m)
    this.lowerBounds = [Math.max(0.001, currentHeight * 0.5)];
    this.upperBounds = [Math.min(0.02, currentHeight * 2.0)];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for hole positions and diameters,
 * and a two-section bore with taper.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BasicTaperObjectiveFunction: head length ratio + foot diameter ratio
 *
 * Ported from HoleAndTaperObjectiveFunction.java
 */
export class HoleAndTaperObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Hole and taper optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    // Create component objective functions
    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BasicTaperObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 20000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndTaperObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("HoleAndTaperObjectiveFunction");
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Objective function for optimizing an instrument's beta factor.
 * Beta is the jet amplification factor in the mouthpiece model.
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from BetaObjectiveFunction.java
 */
export class BetaObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece beta";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Beta calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const beta = this.calculator.getInstrument().mouthpiece?.beta ?? 0.35;
    return [beta];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    if (instrument.mouthpiece) {
      instrument.mouthpiece.beta = point[0]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        BetaObjectiveFunction.CONSTRAINT_CATEGORY,
        "Beta",
        BetaObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BetaObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("BetaObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Beta typically ranges from 0.2 to 0.6
    this.lowerBounds = [0.2];
    this.upperBounds = [0.6];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for the length of the airstream
 * in a fipple or transverse flute.
 *
 * For fipple mouthpiece: optimizes windowLength
 * For embouchure hole: optimizes airstreamLength
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from AirstreamLengthObjectiveFunction.java
 */
export class AirstreamLengthObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece window";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;
  static readonly DISPLAY_NAME = "Airstream Length calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;

    if (mouthpiece?.fipple) {
      return [mouthpiece.fipple.windowLength];
    } else if (mouthpiece?.embouchureHole) {
      return [mouthpiece.embouchureHole.airstreamLength];
    }

    return [0];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;

    if (mouthpiece?.fipple) {
      mouthpiece.fipple.windowLength = point[0]!;
    } else if (mouthpiece?.embouchureHole) {
      mouthpiece.embouchureHole.airstreamLength = point[0]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        AirstreamLengthObjectiveFunction.CONSTRAINT_CATEGORY,
        "Airstream length",
        AirstreamLengthObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      AirstreamLengthObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "AirstreamLengthObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentLength = this.getGeometryPoint()[0]!;

    // Airstream length typically ranges from 3mm to 15mm (0.003m to 0.015m)
    this.lowerBounds = [Math.max(0.003, currentLength * 0.5)];
    this.upperBounds = [Math.min(0.02, currentLength * 2.0)];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for NAF (Native American Flute) hole sizes.
 * Extends HoleSizeObjectiveFunction with custom trust region parameters.
 *
 * Ported from NafHoleSizeObjectiveFunction.java
 */
export class NafHoleSizeObjectiveFunction extends HoleSizeObjectiveFunction {
  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.constraints.setObjectiveFunctionName("NafHoleSizeObjectiveFunction");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Objective function for bore length and hole positions, with
 * holes equally spaced within groups and top hole position as a
 * fraction of bore length.
 *
 * Extends HoleGroupPositionObjectiveFunction with top-hole ratio logic.
 *
 * Ported from HoleGroupPositionFromTopObjectiveFunction.java
 */
export class HoleGroupPositionFromTopObjectiveFunction extends HoleGroupPositionObjectiveFunction {
  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator, holeGroups, lengthAdjustmentMode);
    // Re-set constraints to use the overridden version
    this.setConstraintsFromTop();
  }

  /**
   * Get the position of the farthest bore point (end of bore).
   */
  private getEndOfBorePosition(): number {
    const borePoints = this.calculator.getInstrument().borePoint;
    let endPosition = borePoints[0]?.borePosition ?? 0;
    for (const bp of borePoints) {
      if (bp.borePosition > endPosition) {
        endPosition = bp.borePosition;
      }
    }
    return endPosition;
  }

  override getGeometryPoint(): number[] {
    const sortedHoles = getSortedHoles(this.calculator.getInstrument());
    const holeGroups = this.getHoleGroups();
    const nrDims = this.getNrDimensions();

    const geometry = new Array(nrDims).fill(0);

    // First dimension is bore length
    geometry[0] = this.getEndOfBorePosition();

    if (nrDims > 1 && sortedHoles.length > 0) {
      // Second dimension is top hole ratio
      geometry[1] = this.getTopRatio(geometry[0], sortedHoles[0]!.position);

      // Remaining dimensions are spacings, averaged within groups
      let priorPosition = sortedHoles[0]!.position;
      const dimensionByHole = this.getDimensionByHole();
      const groupSize = this.getGroupSize();

      for (let i = 1; i < sortedHoles.length; i++) {
        const hole = sortedHoles[i]!;
        // dimensionByHole[i-1] gives the dimension for spacing after hole i-1
        // We add 1 because dimensions 0 and 1 are bore length and top ratio
        geometry[dimensionByHole[i - 1]! + 1] +=
          (hole.position - priorPosition) / groupSize[i - 1]!;
        priorPosition = hole.position;
      }
    }

    return geometry;
  }

  override setGeometryPoint(point: number[]): void {
    // First, set bore length via parent
    const sortedHoles = getSortedHoles(this.calculator.getInstrument());

    if (sortedHoles.length === 0) {
      return;
    }

    // Convert geometry to hole positions
    const dimensionByHole = this.getDimensionByHole();

    // First hole position from top ratio
    const topHolePosition = this.getTopPosition(point[0]!, point[1]!);
    sortedHoles[0]!.position = topHolePosition;

    // Remaining holes from spacings
    let priorPosition = topHolePosition;
    for (let i = 1; i < sortedHoles.length; i++) {
      const spacing = point[dimensionByHole[i - 1]! + 1]!;
      sortedHoles[i]!.position = priorPosition + spacing;
      priorPosition = sortedHoles[i]!.position;
    }
  }

  /**
   * Calculate top hole position as a ratio to bore length.
   * Both measured from mouthpiece position.
   */
  private getTopRatio(boreLength: number, topHolePosition: number): number {
    const realOrigin =
      this.calculator.getInstrument().mouthpiece?.position ?? 0;
    return (topHolePosition - realOrigin) / (boreLength - realOrigin);
  }

  /**
   * Convert top hole ratio back to absolute position.
   */
  private getTopPosition(boreLength: number, topHoleRatio: number): number {
    const realOrigin =
      this.calculator.getInstrument().mouthpiece?.position ?? 0;
    const boreLengthFromEdge = boreLength - realOrigin;
    return topHoleRatio * boreLengthFromEdge + realOrigin;
  }

  /**
   * Get the dimension-by-hole mapping from parent.
   */
  private getDimensionByHole(): number[] {
    // This mirrors the parent's dimensionByHole computation
    const holeGroups = this.getHoleGroups();
    const numberOfHoles = this.calculator.getInstrument().hole.length;
    const dimensionByHole = new Array(numberOfHoles).fill(0);

    let dimension = 1; // Start at 1 because 0 is bore length, 1 is top ratio

    for (const group of holeGroups) {
      if (group.length > 1) {
        for (let j = 0; j < group.length - 1; j++) {
          dimensionByHole[group[j]!] = dimension;
        }
        dimension++;
      }
      if (group.length > 0) {
        dimensionByHole[group[group.length - 1]!] = dimension;
        dimension++;
      }
    }

    return dimensionByHole;
  }

  /**
   * Get the group size mapping from parent.
   */
  private getGroupSize(): number[] {
    const holeGroups = this.getHoleGroups();
    const numberOfHoles = this.calculator.getInstrument().hole.length;
    const groupSize = new Array(numberOfHoles).fill(1);

    for (const group of holeGroups) {
      if (group.length > 1) {
        for (let j = 0; j < group.length - 1; j++) {
          groupSize[group[j]!] = group.length - 1;
        }
      }
    }

    return groupSize;
  }

  /**
   * Set up constraints with top-hole ratio as dimensionless.
   */
  private setConstraintsFromTop(): void {
    const sortedHoles = getSortedHoles(this.calculator.getInstrument());
    const nHoles = sortedHoles.length;
    const holeGroups = this.getHoleGroups();

    // Clear and rebuild constraints
    this.constraints.clearConstraints(
      HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY
    );

    // Bore length constraint
    this.constraints.addConstraint(
      createConstraint(
        HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore length",
        ConstraintType.DIMENSIONAL
      )
    );

    if (holeGroups.length > 0) {
      // Top hole ratio (dimensionless)
      this.constraints.addConstraint(
        createConstraint(
          HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
          "Ratio, from splitting edge, of top-hole position to bore length",
          ConstraintType.DIMENSIONLESS
        )
      );

      // Group spacings and between-group spacings
      for (let groupIdx = 0; groupIdx < holeGroups.length; groupIdx++) {
        const group = holeGroups[groupIdx]!;
        const isGroup = group.length > 1;

        if (isGroup) {
          this.constraints.addConstraint(
            createConstraint(
              HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
              `Group ${groupIdx + 1} spacing`,
              ConstraintType.DIMENSIONAL
            )
          );
        }

        if (groupIdx + 1 < holeGroups.length) {
          this.constraints.addConstraint(
            createConstraint(
              HoleGroupPositionObjectiveFunction.CONSTRAINT_CATEGORY,
              `Group ${groupIdx + 1} to Group ${groupIdx + 2} distance`,
              ConstraintType.DIMENSIONAL
            )
          );
        }
      }
    }

    this.constraints.setNumberOfHoles(nHoles);
    this.constraints.setObjectiveDisplayName("Grouped hole-spacing optimizer");
    this.constraints.setObjectiveFunctionName(
      "HoleGroupPositionFromTopObjectiveFunction"
    );
    this.constraints.setHoleGroups(holeGroups);
  }
}

/**
 * Objective function for grouped-hole position and size optimization.
 *
 * Combines:
 * - HoleGroupPositionFromTopObjectiveFunction: grouped hole positions from top
 * - HoleSizeObjectiveFunction: hole diameters
 *
 * Ported from HoleGroupFromTopObjectiveFunction.java
 */
export class HoleGroupFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Grouped-hole position & size";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HoleGroupPositionFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        holeGroups,
        lengthAdjustmentMode
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      HoleGroupFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleGroupFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Objective function for hole positions and diameters, plus
 * bore point diameters from the top.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BoreDiameterFromTopObjectiveFunction: bore diameter ratios from top
 *
 * Ported from HoleAndBoreDiameterFromTopObjectiveFunction.java
 */
export class HoleAndBoreDiameterFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Hole, plus bore-point diameter from top, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number | string
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_TAPER
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BoreDiameterFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        changedBorePoints
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 50000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndBoreDiameterFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndBoreDiameterFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Objective function for bore length, hole positions (in groups), and hole diameters.
 *
 * Combines:
 * - HoleGroupPositionObjectiveFunction: grouped hole positions
 * - HoleSizeObjectiveFunction: hole diameters
 *
 * Ported from HoleGroupObjectiveFunction.java
 */
export class HoleGroupObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Grouped hole-position and hole size optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HoleGroupPositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        holeGroups,
        lengthAdjustmentMode
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      HoleGroupObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("HoleGroupObjectiveFunction");
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Objective function for hole positions and diameters, plus bore diameters
 * at existing bore points from the bottom.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BoreDiameterFromBottomObjectiveFunction: bore diameter ratios from bottom
 *
 * Ported from HoleAndBoreDiameterFromBottomObjectiveFunction.java
 */
export class HoleAndBoreDiameterFromBottomObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Hole, plus bore diameter from bottom, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BoreDiameterFromBottomObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        unchangedBorePoints
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 50000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndBoreDiameterFromBottomObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndBoreDiameterFromBottomObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Objective function for optimization of reed instrument mouthpiece parameters.
 * Optimizes both alpha (reed resonance) and beta (jet amplification) factors.
 *
 * Two dimension optimization.
 *
 * Ported from ReedCalibratorObjectiveFunction.java
 */
export class ReedCalibratorObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece parameters";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONLESS;
  static readonly DISPLAY_NAME = "Reed calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 2;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;
    let alpha = 0.0;
    let beta = mouthpiece?.beta ?? 0.0;

    // Get alpha from whichever reed type is present
    if (mouthpiece?.singleReed) {
      alpha = mouthpiece.singleReed.alpha ?? 0.0;
    } else if (mouthpiece?.doubleReed) {
      alpha = mouthpiece.doubleReed.alpha ?? 0.0;
    } else if (mouthpiece?.lipReed) {
      alpha = mouthpiece.lipReed.alpha ?? 0.0;
    }

    return [alpha, beta];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;

    if (mouthpiece) {
      // Set alpha on whichever reed type is present
      if (mouthpiece.singleReed) {
        mouthpiece.singleReed.alpha = point[0]!;
      } else if (mouthpiece.doubleReed) {
        mouthpiece.doubleReed.alpha = point[0]!;
      } else if (mouthpiece.lipReed) {
        mouthpiece.lipReed.alpha = point[0]!;
      }

      mouthpiece.beta = point[1]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        ReedCalibratorObjectiveFunction.CONSTRAINT_CATEGORY,
        "Alpha",
        ReedCalibratorObjectiveFunction.CONSTRAINT_TYPE
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        ReedCalibratorObjectiveFunction.CONSTRAINT_CATEGORY,
        "Beta",
        ReedCalibratorObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      ReedCalibratorObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("ReedCalibratorObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Alpha and beta typically range from 0 to 1
    this.lowerBounds = [0.0, 0.0];
    this.upperBounds = [1.0, 1.0];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for position of the flute stopper (headjoint length).
 * Distance from topmost bore point to upper end of embouchure hole.
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from StopperPositionObjectiveFunction.java
 */
export class StopperPositionObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Stopper distance";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;
  static readonly DISPLAY_NAME = "Stopper position optimizer";
  private static readonly MINIMUM_BORE_POINT_SPACING = 0.00001;

  private preserveTaper: boolean;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    preserveTaper: boolean = false
  ) {
    super(calculator, tuning, evaluator);
    this.preserveTaper = preserveTaper;
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  /**
   * Get the position of the topmost bore point.
   */
  private getTopOfBore(): number {
    const borePoints = this.calculator.getInstrument().borePoint;
    let topPosition = borePoints[0]?.borePosition ?? 0;

    for (const bp of borePoints) {
      if (bp.borePosition < topPosition) {
        topPosition = bp.borePosition;
      }
    }
    return topPosition;
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;
    const mouthpiecePosition = mouthpiece?.position ?? 0;

    let distance = mouthpiecePosition - this.getTopOfBore();

    // Subtract half the embouchure hole length if present
    if (mouthpiece?.embouchureHole) {
      distance -= 0.5 * mouthpiece.embouchureHole.length;
    }

    return [distance];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;
    const mouthpiecePosition = mouthpiece?.position ?? 0;

    // Sort bore points by position
    const sortedBorePoints = [...instrument.borePoint].sort(
      (a, b) => a.borePosition - b.borePosition
    );

    let newTopPosition = mouthpiecePosition - point[0]!;
    if (mouthpiece?.embouchureHole) {
      newTopPosition -= 0.5 * mouthpiece.embouchureHole.length;
    }

    if (this.preserveTaper && sortedBorePoints.length >= 2) {
      // Interpolate bore diameter at new position
      const topDiameter = this.getInterpolatedBoreDiameter(
        sortedBorePoints,
        newTopPosition
      );
      sortedBorePoints[0]!.boreDiameter = topDiameter;
    }
    sortedBorePoints[0]!.borePosition = newTopPosition;

    // Move any bore points that would be above the new top position
    for (let i = 1; i < sortedBorePoints.length; i++) {
      const bp = sortedBorePoints[i]!;
      if (bp.borePosition <= newTopPosition) {
        newTopPosition +=
          StopperPositionObjectiveFunction.MINIMUM_BORE_POINT_SPACING;
        if (this.preserveTaper) {
          const diameter = this.getInterpolatedBoreDiameter(
            sortedBorePoints,
            newTopPosition
          );
          bp.boreDiameter = diameter;
        }
        bp.borePosition = newTopPosition;
      } else {
        break;
      }
    }
  }

  /**
   * Interpolate or extrapolate bore diameter at a given position.
   */
  private getInterpolatedBoreDiameter(
    sortedBorePoints: typeof this.calculator.getInstrument.prototype.borePoint,
    position: number
  ): number {
    if (sortedBorePoints.length < 2) {
      return sortedBorePoints[0]?.boreDiameter ?? 0;
    }

    // Find bracketing points
    for (let i = 0; i < sortedBorePoints.length - 1; i++) {
      const lower = sortedBorePoints[i]!;
      const upper = sortedBorePoints[i + 1]!;

      if (position >= lower.borePosition && position <= upper.borePosition) {
        // Interpolate
        const t =
          (position - lower.borePosition) /
          (upper.borePosition - lower.borePosition);
        return lower.boreDiameter + t * (upper.boreDiameter - lower.boreDiameter);
      }
    }

    // Extrapolate using first or last two points
    if (position < sortedBorePoints[0]!.borePosition) {
      const p0 = sortedBorePoints[0]!;
      const p1 = sortedBorePoints[1]!;
      const slope =
        (p1.boreDiameter - p0.boreDiameter) /
        (p1.borePosition - p0.borePosition);
      return p0.boreDiameter + slope * (position - p0.borePosition);
    } else {
      const p0 = sortedBorePoints[sortedBorePoints.length - 2]!;
      const p1 = sortedBorePoints[sortedBorePoints.length - 1]!;
      const slope =
        (p1.boreDiameter - p0.boreDiameter) /
        (p1.borePosition - p0.borePosition);
      return p1.boreDiameter + slope * (position - p1.borePosition);
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        StopperPositionObjectiveFunction.CONSTRAINT_CATEGORY,
        "Stopper Distance",
        StopperPositionObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      StopperPositionObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "StopperPositionObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentDistance = this.getGeometryPoint()[0]!;
    // Stopper distance typically ranges from 10mm to 50mm (0.01m to 0.05m)
    this.lowerBounds = [Math.max(0.01, currentDistance * 0.5)];
    this.upperBounds = [Math.min(0.1, currentDistance * 2.0)];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Objective function for a simple conical bore.
 * Optimizes the diameter at the foot, scaling interior bore points
 * in the bottom half proportionally.
 *
 * Single dimension optimization using Brent optimizer.
 *
 * Ported from ConicalBoreObjectiveFunction.java
 */
export class ConicalBoreObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore size";
  static readonly CONSTRAINT_TYPE = ConstraintType.DIMENSIONAL;
  static readonly DISPLAY_NAME = "Conical bore optimizer";
  static readonly AFFECTED_BORE_FRACTION = 0.5;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 1;
    this.optimizerType = OptimizerType.BRENT;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const sortedBorePoints = getSortedBorePoints(
      this.calculator.getInstrument()
    );
    const bottomPoint = sortedBorePoints[sortedBorePoints.length - 1]!;
    return [bottomPoint.boreDiameter];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const sortedBorePoints = getSortedBorePoints(instrument);
    const bottomPoint = sortedBorePoints[sortedBorePoints.length - 1]!;
    const topPosition = sortedBorePoints[0]!.borePosition;
    const totalLength = bottomPoint.borePosition - topPosition;

    const terminationChange = point[0]! - bottomPoint.boreDiameter;

    // Change termination flange diameter to preserve flange width
    if (instrument.termination) {
      instrument.termination.flangeDiameter += terminationChange;
    }

    // Change diameter of the lower half of the bore proportionally
    const fractionalChange = point[0]! / bottomPoint.boreDiameter;
    for (const bp of sortedBorePoints) {
      const fractionalPosition =
        (bp.borePosition - topPosition) / totalLength;
      if (
        fractionalPosition >= ConicalBoreObjectiveFunction.AFFECTED_BORE_FRACTION
      ) {
        bp.boreDiameter *= fractionalChange;
      }
    }
    bottomPoint.boreDiameter = point[0]!;
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        ConicalBoreObjectiveFunction.CONSTRAINT_CATEGORY,
        "Foot diameter",
        ConicalBoreObjectiveFunction.CONSTRAINT_TYPE
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      ConicalBoreObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("ConicalBoreObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentDiameter = this.getGeometryPoint()[0]!;
    // Foot diameter typically ranges from 5mm to 30mm (0.005m to 0.03m)
    this.lowerBounds = [Math.max(0.005, currentDiameter * 0.7)];
    this.upperBounds = [Math.min(0.05, currentDiameter * 1.5)];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Minimum cone length constant used in taper calculations.
 */
const MINIMUM_CONE_LENGTH = 0.0001;

/**
 * Objective function for a three-section bore with a single tapered section.
 * Uses simple ratio parameters for taper start and length.
 *
 * Optimization dimensions:
 * - Taper ratio (head/foot diameter)
 * - Taper start as fraction of bore length
 * - Taper length as fraction of remaining bore
 *
 * Three dimension optimization using BOBYQA optimizer.
 *
 * Ported from SingleTaperSimpleRatioObjectiveFunction.java
 */
export class SingleTaperSimpleRatioObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Single bore taper";
  static readonly DISPLAY_NAME = "Single taper (simple ratios) optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 3;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const sortedBorePoints = getSortedBorePoints(
      this.calculator.getInstrument()
    );

    if (sortedBorePoints.length < 2) {
      return [1.0, 0.0, 1.0];
    }

    const topPoint = sortedBorePoints[0]!;
    const nextPoint = sortedBorePoints[1]!;
    const penultimatePoint = sortedBorePoints[sortedBorePoints.length - 2]!;
    const bottomPoint = sortedBorePoints[sortedBorePoints.length - 1]!;

    const boreLength = bottomPoint.borePosition - topPoint.borePosition;

    // Taper ratio
    const taperRatio = topPoint.boreDiameter / bottomPoint.boreDiameter;

    let taperStart: number;
    let taperEnd: number;

    if (Math.abs(topPoint.boreDiameter - bottomPoint.boreDiameter) < 0.0001) {
      // Bore doesn't really taper
      taperStart = topPoint.borePosition;
      taperEnd = bottomPoint.borePosition;
    } else {
      // Determine taper start
      if (Math.abs(topPoint.boreDiameter - nextPoint.boreDiameter) < 0.0001) {
        taperStart = nextPoint.borePosition;
      } else {
        taperStart = topPoint.borePosition;
      }

      // Determine taper end
      if (
        Math.abs(bottomPoint.boreDiameter - penultimatePoint.boreDiameter) <
        0.0001
      ) {
        taperEnd = penultimatePoint.borePosition;
      } else {
        taperEnd = bottomPoint.borePosition;
      }
    }

    const taperStartRatio =
      (taperStart - topPoint.borePosition) / boreLength;
    const taperLengthRatio =
      (taperEnd - taperStart) /
      (boreLength - taperStart + topPoint.borePosition);

    return [taperRatio, taperStartRatio, taperLengthRatio];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const sortedBorePoints = getSortedBorePoints(instrument);

    if (sortedBorePoints.length < 2) {
      return;
    }

    const topPoint = sortedBorePoints[0]!;
    const bottomPoint = sortedBorePoints[sortedBorePoints.length - 1]!;

    const footDiameter = bottomPoint.boreDiameter;
    const headDiameter = footDiameter * point[0]!;
    const boreLength = bottomPoint.borePosition - topPoint.borePosition;
    const taperStart = point[1]! * boreLength;
    const taperLength = Math.max(
      point[2]! * (boreLength - taperStart),
      MINIMUM_CONE_LENGTH
    );

    // Create new bore points
    const newBorePoints: typeof instrument.borePoint = [];

    // Head point
    newBorePoints.push({
      borePosition: topPoint.borePosition,
      boreDiameter: headDiameter,
    });

    // Taper start point (if taper doesn't start at head)
    if (taperStart > 0) {
      const taperStartPos = Math.min(
        topPoint.borePosition + taperStart,
        topPoint.borePosition + boreLength
      );
      newBorePoints.push({
        borePosition: taperStartPos,
        boreDiameter: headDiameter,
      });
    }

    // Taper end point
    const taperEnd = Math.min(
      taperStart + taperLength,
      boreLength
    );
    newBorePoints.push({
      borePosition: topPoint.borePosition + taperEnd,
      boreDiameter: footDiameter,
    });

    // Foot point (if taper doesn't end at foot)
    if (taperStart + taperLength < boreLength) {
      newBorePoints.push({
        borePosition: topPoint.borePosition + boreLength,
        boreDiameter: footDiameter,
      });
    }

    instrument.borePoint = newBorePoints;
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore diameter ratio (top/bottom)",
        ConstraintType.DIMENSIONLESS
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Taper start (from top), fraction of bore length",
        ConstraintType.DIMENSIONLESS
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Taper length, fraction of bore below start",
        ConstraintType.DIMENSIONLESS
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      SingleTaperSimpleRatioObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperSimpleRatioObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    // Taper ratio: 0.8 to 1.3
    // Taper start ratio: 0.0 to 0.5
    // Taper length ratio: 0.2 to 1.0
    this.lowerBounds = [0.8, 0.0, 0.2];
    this.upperBounds = [1.3, 0.5, 1.0];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

// ============================================================================
// Global Optimizer Variants
// These use DIRECT global optimizer instead of BOBYQA/Brent for more
// thorough exploration of the search space.
// ============================================================================

/**
 * Global optimization variant of HolePositionObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHolePositionObjectiveFunction.java
 */
export class GlobalHolePositionObjectiveFunction extends HolePositionObjectiveFunction {
  static override readonly DISPLAY_NAME = "Hole position global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator, lengthAdjustmentMode);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 30000;
    this.constraints.setObjectiveDisplayName(
      GlobalHolePositionObjectiveFunction.DISPLAY_NAME
    );
  }
}

/**
 * Global optimization variant of HoleObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHoleObjectiveFunction.java
 */
export class GlobalHoleObjectiveFunction extends HoleObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Hole position and diameter global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator, lengthAdjustmentMode);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 40000;
    this.constraints.setObjectiveDisplayName(
      GlobalHoleObjectiveFunction.DISPLAY_NAME
    );
  }
}

/**
 * Global optimization variant of HoleAndTaperObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHoleAndTaperObjectiveFunction.java
 */
export class GlobalHoleAndTaperObjectiveFunction extends HoleAndTaperObjectiveFunction {
  static override readonly DISPLAY_NAME = "Hole and taper global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 30000;
    this.constraints.setObjectiveDisplayName(
      GlobalHoleAndTaperObjectiveFunction.DISPLAY_NAME
    );
  }
}

/**
 * Global optimization variant of HoleAndBoreDiameterFromBottomObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHoleAndBoreDiameterFromBottomObjectiveFunction.java
 */
export class GlobalHoleAndBoreDiameterFromBottomObjectiveFunction extends HoleAndBoreDiameterFromBottomObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Hole, plus bore diameter from bottom, global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator, unchangedBorePoints);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 60000;
    this.constraints.setObjectiveDisplayName(
      GlobalHoleAndBoreDiameterFromBottomObjectiveFunction.DISPLAY_NAME
    );
  }
}

/**
 * Global optimization variant of HoleAndBoreDiameterFromTopObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHoleAndBoreDiameterFromTopObjectiveFunction.java
 */
export class GlobalHoleAndBoreDiameterFromTopObjectiveFunction extends HoleAndBoreDiameterFromTopObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Hole, plus bore diameter from top, global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator, changedBorePoints);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 60000;
    this.constraints.setObjectiveDisplayName(
      GlobalHoleAndBoreDiameterFromTopObjectiveFunction.DISPLAY_NAME
    );
  }
}

// ============================================================================
// Single Taper Merged Objective Functions
// Combine hole optimization with single-taper bore profile
// ============================================================================

/**
 * Optimization objective function for bore length, hole positions without
 * groups, hole diameters, and a simple one-section taper.
 * The foot diameter remains invariant.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperRatioObjectiveFunction: taper profile
 *
 * Ported from SingleTaperNoHoleGroupingObjectiveFunction.java
 */
export class SingleTaperNoHoleGroupingObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, no-hole-grouping optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperRatioObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperNoHoleGroupingObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperNoHoleGroupingObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Optimization objective function for bore length, hole positions without
 * groups (from top), hole diameters, and a simple one-section taper.
 * The foot diameter remains invariant. This version constrains the top hole position.
 *
 * Combines:
 * - HolePositionFromTopObjectiveFunction: bore length + hole spacings from top
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperSimpleRatioObjectiveFunction: taper profile
 *
 * Ported from SingleTaperNoHoleGroupingFromTopObjectiveFunction.java
 */
export class SingleTaperNoHoleGroupingFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, no hole grouping";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HolePositionFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperSimpleRatioObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperNoHoleGroupingFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperNoHoleGroupingFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Optimization objective function for bore length, hole positions in groups,
 * hole diameters, and a simple one-section taper.
 * The foot diameter remains invariant.
 *
 * Combines:
 * - HoleGroupPositionObjectiveFunction: grouped hole positions
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperSimpleRatioObjectiveFunction: taper profile
 *
 * Ported from SingleTaperHoleGroupObjectiveFunction.java
 */
export class SingleTaperHoleGroupObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, grouped-hole optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    const holeGroupPos = new HoleGroupPositionObjectiveFunction(
      calculator,
      tuning,
      evaluator,
      holeGroups,
      lengthAdjustmentMode
    );
    holeGroupPos.setAllowBoreSizeInterpolation(false);

    this.components = [
      holeGroupPos,
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperSimpleRatioObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperHoleGroupObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperHoleGroupObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Optimization objective function for bore length, constrained position of top
 * hole relative to bore length, hole positions in groups, with holes equally
 * spaced within groups, hole diameters, and a simple one-section taper.
 * The foot diameter remains invariant.
 *
 * Combines:
 * - HoleGroupPositionFromTopObjectiveFunction: grouped hole positions from top
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperSimpleRatioObjectiveFunction: taper profile
 *
 * Ported from SingleTaperHoleGroupFromTopObjectiveFunction.java
 */
export class SingleTaperHoleGroupFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, grouped hole";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    const holeGroupPos = new HoleGroupPositionFromTopObjectiveFunction(
      calculator,
      tuning,
      evaluator,
      holeGroups,
      lengthAdjustmentMode
    );
    holeGroupPos.setAllowBoreSizeInterpolation(false);

    this.components = [
      holeGroupPos,
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperSimpleRatioObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperHoleGroupFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperHoleGroupFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

// ============================================================================
// Combined Bore Objective Functions
// ============================================================================

/**
 * Optimization objective function for hole positions and diameters,
 * and a conical bore.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - ConicalBoreObjectiveFunction: foot diameter of conical bore
 *
 * Bore points below the lowest hole are kept the same distance
 * from the bottom of the bore.
 * All interior bore points in the bottom half of the bore are scaled
 * proportionally to the change in the diameter at the foot.
 *
 * Ported from HoleAndConicalBoreObjectiveFunction.java
 */
export class HoleAndConicalBoreObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Hole and conical bore optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    // Note: Uses PRESERVE_BELL (which we map to PRESERVE_LENGTH for now)
    // to keep bore points below the lowest hole unchanged
    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_LENGTH
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new ConicalBoreObjectiveFunction(calculator, tuning, evaluator),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 30000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndConicalBoreObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndConicalBoreObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

/**
 * Optimization objective function for headjoint length and bore diameters
 * at existing bore points at top of bore.
 *
 * Combines:
 * - StopperPositionObjectiveFunction: headjoint length
 * - BoreDiameterFromTopObjectiveFunction: bore diameters from top
 *
 * Ported from HeadjointObjectiveFunction.java
 */
export class HeadjointObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Headjoint length and profile optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    // Default: use bore points with "Head" in name
    const nrPoints =
      changedBorePoints ??
      HeadjointObjectiveFunction.getLowestHeadPoint(calculator.getInstrument());

    this.components = [
      new StopperPositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        false // preserveTaper = false
      ),
      new BoreDiameterFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrPoints
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 40000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HeadjointObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("HeadjointObjectiveFunction");
    this.constraints.setConstraintsName("Default");
  }

  /**
   * Find the number of bore points from the top that are part of the "Head"
   * section (based on bore point names containing "Head").
   */
  static getLowestHeadPoint(instrument: Instrument): number {
    const sortedBorePoints = getSortedBorePoints(instrument);
    let headPointCount = 1; // At minimum, include top bore point

    for (let i = 0; i < sortedBorePoints.length; i++) {
      const bp = sortedBorePoints[i]!;
      const name = (bp as { name?: string }).name;
      if (name && name.toLowerCase().includes("head")) {
        headPointCount = i + 1;
      }
    }

    return headPointCount;
  }
}

/**
 * Optimization objective function for hole positions and diameters,
 * plus headjoint length and bore diameters.
 *
 * Combines:
 * - HoleObjectiveFunction: hole positions and diameters
 * - StopperPositionObjectiveFunction: headjoint length
 * - BoreDiameterFromTopObjectiveFunction: bore diameters from top
 *
 * Ported from HoleAndHeadjointObjectiveFunction.java
 */
export class HoleAndHeadjointObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Hole and headjoint optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    const nrPoints =
      changedBorePoints ??
      HeadjointObjectiveFunction.getLowestHeadPoint(calculator.getInstrument());

    this.components = [
      new HoleObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_LENGTH
      ),
      new StopperPositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        false // preserveTaper = false
      ),
      new BoreDiameterFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrPoints
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 50000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndHeadjointObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndHeadjointObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }
}

// ============================================================================
// Bore Position and Spacing Objective Functions
// ============================================================================

/**
 * Optimization objective function for relative position of existing bore points.
 *
 * Geometry dimensions:
 * - Absolute position of bottom bore point (if bottomPointUnchanged is false)
 * - For interior bore points down to the bottom, distance from prior bore point
 *   to this bore point, as a fraction of the distance from the prior bore point
 *   to the bottom
 *
 * The bore points to vary can be specified as a number of bore points or with a
 * bore point name. The positions of bore points above these are left unchanged.
 * Bore point diameters are invariant.
 *
 * Do not use with other optimizers that might change the number of bore points.
 * Specify bottomPointUnchanged = true to use with optimizers that might change
 * the bottom bore position.
 *
 * Ported from BorePositionObjectiveFunction.java
 */
export class BorePositionObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore point positions";
  static readonly DISPLAY_NAME = "Bore Position optimizer";

  // Number of invariant bore points at the top of the instrument.
  protected readonly unchangedBorePoints: number;
  // Set to 1 if bottom bore point is left unchanged
  protected readonly unchangedBottomPoint: number;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number,
    bottomPointUnchanged: boolean = false
  ) {
    super(calculator, tuning, evaluator);

    const nrBorePoints = calculator.getInstrument().borePoint.length;

    this.unchangedBottomPoint = bottomPointUnchanged ? 1 : 0;

    if (unchangedBorePoints === undefined) {
      // Default: find top of body
      this.unchangedBorePoints =
        BoreDiameterFromBottomObjectiveFunction.getTopOfBody(
          calculator.getInstrument()
        ) + 1;
    } else if (unchangedBorePoints >= 1) {
      this.unchangedBorePoints = unchangedBorePoints;
    } else {
      // At a minimum, top bore point is unchanged
      this.unchangedBorePoints = 1;
    }

    this.nrDimensions =
      nrBorePoints - this.unchangedBorePoints - this.unchangedBottomPoint;

    if (this.nrDimensions > 1) {
      this.optimizerType = OptimizerType.BOBYQA;
    } else {
      this.optimizerType = OptimizerType.BRENT;
    }

    this.maxEvaluations = 10000;
    this.setConstraints();
  }

  /**
   * Convert a dimension number in 0 .. nrDimensions-1
   * to a bore point number in unchangedBorePoints+1 .. nrBorePoints.
   */
  protected borePointNr(dimensionIdx: number): number {
    const nrBorePoints =
      this.nrDimensions + this.unchangedBorePoints + this.unchangedBottomPoint;

    if (dimensionIdx === 0 && this.unchangedBottomPoint === 0) {
      // First dimension is bottom bore point
      return nrBorePoints;
    }
    // Process remaining bore points in order, from top to bottom
    return (
      this.unchangedBorePoints + dimensionIdx + this.unchangedBottomPoint
    );
  }

  /**
   * Point number used as an initial reference for the first changed point.
   */
  protected referencePointNr(): number {
    return this.unchangedBorePoints;
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    let dimension = 0;

    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
    let borePoint = sortedPoints[sortedPoints.length - 1]!;
    const lastBorePosition = borePoint.borePosition;

    if (this.unchangedBottomPoint === 0) {
      geometry[0] = borePoint.borePosition;
      dimension = 1;
    }

    borePoint = sortedPoints[this.referencePointNr() - 1]!;
    let priorBorePosition = borePoint.borePosition;

    for (; dimension < this.nrDimensions; dimension++) {
      const pointNr = this.borePointNr(dimension);
      borePoint = sortedPoints[pointNr - 1]!;
      geometry[dimension] =
        (borePoint.borePosition - priorBorePosition) /
        (lastBorePosition - priorBorePosition);
      priorBorePosition = borePoint.borePosition;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    let dimension = 0;

    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
    let borePoint = sortedPoints[sortedPoints.length - 1]!;

    if (this.unchangedBottomPoint === 0) {
      borePoint.borePosition = point[0]!;
      dimension = 1;
    }
    const lastBorePosition = borePoint.borePosition;

    borePoint = sortedPoints[this.referencePointNr() - 1]!;
    let priorBorePosition = borePoint.borePosition;

    for (; dimension < this.nrDimensions; dimension++) {
      const pointNr = this.borePointNr(dimension);
      borePoint = sortedPoints[pointNr - 1]!;
      borePoint.borePosition =
        priorBorePosition +
        point[dimension]! * (lastBorePosition - priorBorePosition);
      priorBorePosition = borePoint.borePosition;
    }
  }

  override setLowerBounds(aLowerBounds: number[]): void {
    if (this.unchangedBottomPoint === 0) {
      // Adjust first lower bound to keep bottom bore point below the bottom hole
      const sortedHoles = getSortedHoles(this.calculator.getInstrument());
      let bottomHolePosition: number;

      if (sortedHoles.length > 0) {
        bottomHolePosition = sortedHoles[sortedHoles.length - 1]!.position;
      } else {
        // No holes. Use mid-point of bore.
        const sortedPoints = getSortedBorePoints(
          this.calculator.getInstrument()
        );
        bottomHolePosition =
          0.5 *
          (sortedPoints[0]!.borePosition +
            sortedPoints[sortedPoints.length - 1]!.borePosition);
      }

      if (aLowerBounds[0]! < bottomHolePosition + 0.012) {
        // Raise the lower bound to restrict bottom bore position
        aLowerBounds[0] = bottomHolePosition + 0.012;
      }
    }
    super.setLowerBounds(aLowerBounds);
  }

  protected setConstraints(): void {
    const nrBorePoints =
      this.nrDimensions + this.unchangedBorePoints + this.unchangedBottomPoint;
    let dimension = 0;

    if (this.unchangedBottomPoint === 0) {
      const pointNr = this.borePointNr(0);
      const name = `Position of bore point ${pointNr} (bottom)`;
      this.constraints.addConstraint(
        createConstraint(
          BorePositionObjectiveFunction.CONSTRAINT_CATEGORY,
          name,
          ConstraintType.DIMENSIONAL
        )
      );
      dimension = 1;
    }

    for (; dimension < this.nrDimensions; dimension++) {
      const pointNr = this.borePointNr(dimension);
      const name = `Relative position of bore point ${pointNr} between points ${pointNr - 1} and ${nrBorePoints}`;
      this.constraints.addConstraint(
        createConstraint(
          BorePositionObjectiveFunction.CONSTRAINT_CATEGORY,
          name,
          ConstraintType.DIMENSIONLESS
        )
      );
    }

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BorePositionObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName("BorePositionObjectiveFunction");
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();

    this.lowerBounds = currentGeometry.map((v, i) => {
      if (i === 0 && this.unchangedBottomPoint === 0) {
        // Bottom bore position: reasonable minimum
        return Math.max(0.1, v * 0.8);
      }
      // Relative positions: 0 to 1
      return Math.max(0.0, v * 0.5);
    });

    this.upperBounds = currentGeometry.map((v, i) => {
      if (i === 0 && this.unchangedBottomPoint === 0) {
        return v * 1.2;
      }
      return Math.min(1.0, v * 2.0);
    });

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Optimization objective function for positioning existing bore points at
 * top of bore using absolute spacing.
 *
 * Geometry dimensions:
 * - For bore points from the top down, spacing from this bore point to next
 *   bore point
 *
 * The bore points to vary can be specified as a number of bore points or with a
 * bore point name. The positions of bore points below these are left unchanged.
 * Bore point diameters are unchanged.
 *
 * Do not use with other optimizers that might change the number of bore points.
 *
 * Ported from BoreSpacingFromTopObjectiveFunction.java
 */
export class BoreSpacingFromTopObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Bore point positions";
  static readonly DISPLAY_NAME = "Bore Spacing (from top) optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number | string
  ) {
    super(calculator, tuning, evaluator);

    const nrBorePoints = calculator.getInstrument().borePoint.length;

    if (changedBorePoints === undefined) {
      // Default: find lowest point with "Head" in name
      this.nrDimensions = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        calculator.getInstrument(),
        "Head"
      );
    } else if (typeof changedBorePoints === "string") {
      this.nrDimensions = BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        calculator.getInstrument(),
        changedBorePoints
      );
    } else {
      this.nrDimensions = changedBorePoints;
    }

    // At least the top bore point is left unchanged
    if (this.nrDimensions >= nrBorePoints) {
      this.nrDimensions = nrBorePoints - 1;
    }

    // At least one bore point is changed
    if (this.nrDimensions < 1) {
      this.nrDimensions = 1;
    }

    if (this.nrDimensions > 1) {
      this.optimizerType = OptimizerType.BOBYQA;
    } else {
      this.optimizerType = OptimizerType.BRENT;
    }

    this.maxEvaluations = 10000;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());

    let borePoint = sortedPoints[0]!;
    let priorBorePosition = borePoint.borePosition;

    for (let dimension = 0; dimension < this.nrDimensions; dimension++) {
      borePoint = sortedPoints[dimension + 1]!;
      geometry[dimension] = borePoint.borePosition - priorBorePosition;
      priorBorePosition = borePoint.borePosition;
    }

    return geometry;
  }

  setGeometryPoint(point: number[]): void {
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());

    let borePoint = sortedPoints[0]!;
    let priorBorePosition = borePoint.borePosition;

    for (let dimension = 0; dimension < this.nrDimensions; dimension++) {
      borePoint = sortedPoints[dimension + 1]!;
      borePoint.borePosition = priorBorePosition + point[dimension]!;
      priorBorePosition = borePoint.borePosition;
    }
  }

  override setUpperBounds(aUpperBounds: number[]): void {
    // If necessary, adjust upper bounds to prevent changing order of bore points
    if (
      this.nrDimensions + 1 <
      this.calculator.getInstrument().borePoint.length
    ) {
      const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());
      const topPosition = sortedPoints[0]!.borePosition;
      const unchangedPosition =
        sortedPoints[this.nrDimensions + 1]!.borePosition;
      const availableSpace = unchangedPosition - topPosition;

      let upperBound = 0.0;
      for (let dimension = 0; dimension < this.nrDimensions; dimension++) {
        upperBound += aUpperBounds[dimension]!;
      }

      if (upperBound + 0.0001 > availableSpace) {
        const reduction = availableSpace / (upperBound + 0.0001);
        for (let dimension = 0; dimension < this.nrDimensions; dimension++) {
          aUpperBounds[dimension] = aUpperBounds[dimension]! * reduction;
        }
      }
    }
    super.setUpperBounds(aUpperBounds);
  }

  protected setConstraints(): void {
    for (let dimension = 0; dimension < this.nrDimensions; dimension++) {
      const name = `Distance from bore point ${dimension + 1} to point ${dimension + 2}`;
      this.constraints.addConstraint(
        createConstraint(
          BoreSpacingFromTopObjectiveFunction.CONSTRAINT_CATEGORY,
          name,
          ConstraintType.DIMENSIONAL
        )
      );
    }

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      BoreSpacingFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "BoreSpacingFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();

    // Spacing: reasonable range around current values
    this.lowerBounds = currentGeometry.map((v) => Math.max(0.001, v * 0.5));
    this.upperBounds = currentGeometry.map((v) => v * 2.0);

    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Optimization objective function for diameter and relative position
 * of existing bore points at bottom of bore.
 *
 * Combines:
 * - BorePositionObjectiveFunction: relative bore point positions
 * - BoreDiameterFromBottomObjectiveFunction: bore diameters from bottom
 *
 * Use of diameter ratios rather than absolute diameters allows constraints
 * to control the direction of taper. If lower bound is 1.0, bore flares out
 * toward bottom; if upper bound is 1.0, bore tapers inward toward bottom.
 *
 * Ported from BoreFromBottomObjectiveFunction.java
 */
export class BoreFromBottomObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Bore point position and diameter, from bottom, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    const nrUnchanged =
      unchangedBorePoints ??
      BoreDiameterFromBottomObjectiveFunction.getTopOfBody(
        calculator.getInstrument()
      ) + 1;

    this.components = [
      new BorePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrUnchanged,
        false // bottomPointUnchanged = false
      ),
      new BoreDiameterFromBottomObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrUnchanged
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 40000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      BoreFromBottomObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "BoreFromBottomObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getStoppingTrustRegionRadius(): number {
    return 0.8e-6;
  }
}

/**
 * Optimization objective function for hole positions and diameters, and
 * diameters and relative positions of existing bore points at the bottom
 * of the bore.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BorePositionObjectiveFunction: relative bore point positions (bottomPointUnchanged=true)
 * - BoreDiameterFromBottomObjectiveFunction: bore diameters from bottom
 *
 * Ported from HoleAndBoreFromBottomObjectiveFunction.java
 */
export class HoleAndBoreFromBottomObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Hole and bore (from bottom) optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    const nrUnchanged =
      unchangedBorePoints ??
      BoreDiameterFromBottomObjectiveFunction.getTopOfBody(
        calculator.getInstrument()
      ) + 1;

    // Since BorePositionObjectiveFunction uses ratios from the bottom
    // (intra-bell ratios), PRESERVE_BELL may have less impact on those
    // geometry dimensions than MOVE_BOTTOM.
    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_LENGTH // PRESERVE_BELL equivalent
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BorePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrUnchanged,
        true // bottomPointUnchanged = true
      ),
      new BoreDiameterFromBottomObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrUnchanged
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 60000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndBoreFromBottomObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndBoreFromBottomObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getStoppingTrustRegionRadius(): number {
    return 0.9e-6;
  }
}

/**
 * Optimization objective function for hole positions and diameters, and
 * relative positions of existing bore points at the bottom of the bore.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BorePositionObjectiveFunction: relative bore point positions
 *
 * Bore point diameters are invariant.
 *
 * Ported from HoleAndBorePositionObjectiveFunction.java
 */
export class HoleAndBorePositionObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Hole, plus bore-point position from bottom, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator);

    const nrUnchanged =
      unchangedBorePoints ??
      BoreDiameterFromBottomObjectiveFunction.getTopOfBody(
        calculator.getInstrument()
      ) + 1;

    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_LENGTH // PRESERVE_BELL equivalent
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BorePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        nrUnchanged,
        true // bottomPointUnchanged = true
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 50000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndBorePositionObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndBorePositionObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getStoppingTrustRegionRadius(): number {
    return 0.9e-6;
  }
}

/**
 * Optimization objective function for hole positions and diameters, and
 * positions of existing bore points from the top of the bore.
 *
 * Combines:
 * - HolePositionObjectiveFunction: bore length + hole spacings
 * - HoleSizeObjectiveFunction: hole diameters
 * - BoreSpacingFromTopObjectiveFunction: bore point spacing from top
 *
 * Bore point diameters are unchanged.
 *
 * Ported from HoleAndBoreSpacingFromTopObjectiveFunction.java
 */
export class HoleAndBoreSpacingFromTopObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME =
    "Hole, plus bore-point spacing from top, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    changedBorePoints?: number | string
  ) {
    super(calculator, tuning, evaluator);

    const nrChanged =
      changedBorePoints ??
      BoreDiameterFromTopObjectiveFunction.getLowestPoint(
        calculator.getInstrument(),
        "Head"
      );

    this.components = [
      new HolePositionObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.PRESERVE_TAPER
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new BoreSpacingFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        typeof nrChanged === "number" ? nrChanged : undefined
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.maxEvaluations = 50000;
    this.sumDimensions();
    this.constraints.setObjectiveDisplayName(
      HoleAndBoreSpacingFromTopObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "HoleAndBoreSpacingFromTopObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getStoppingTrustRegionRadius(): number {
    return 0.9e-6;
  }
}

/**
 * Global optimization variant of BoreFromBottomObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalBoreFromBottomObjectiveFunction.java
 */
export class GlobalBoreFromBottomObjectiveFunction extends BoreFromBottomObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Bore point, from bottom, global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator, unchangedBorePoints);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 40000;
    this.constraints.setObjectiveDisplayName(
      GlobalBoreFromBottomObjectiveFunction.DISPLAY_NAME
    );
  }
}

/**
 * Global optimization variant of HoleAndBoreFromBottomObjectiveFunction.
 * Uses DIRECT global optimizer for more thorough exploration.
 *
 * Ported from GlobalHoleAndBoreFromBottomObjectiveFunction.java
 */
export class GlobalHoleAndBoreFromBottomObjectiveFunction extends HoleAndBoreFromBottomObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Hole and bore point global optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    unchangedBorePoints?: number
  ) {
    super(calculator, tuning, evaluator, unchangedBorePoints);
    this.optimizerType = OptimizerType.DIRECT;
    this.maxEvaluations = 60000;
    this.constraints.setObjectiveDisplayName(
      GlobalHoleAndBoreFromBottomObjectiveFunction.DISPLAY_NAME
    );
  }
}

// ============================================================================
// Hemispherical Bore Head Utilities and Objective Functions
// ============================================================================

/**
 * Hemispherical bore head utility functions.
 * Creates bore profiles with a hemispherical top section.
 * Used primarily for Native American flute designs.
 *
 * Ported from HemisphericalBoreHead.java
 */
export class HemisphericalBoreHead {
  private static readonly NUM_HEMI_POINTS = 10;

  /**
   * Adds a set of BorePoints that define the hemispherical head of the bore.
   *
   * @param origin The position of the top of the bore
   * @param headDiameter The diameter at the equator of the hemisphere
   * @param borePoints An array to hold the new BorePoints (modified in place)
   */
  static addHemiHead(
    origin: number,
    headDiameter: number,
    borePoints: Array<{ borePosition: number; boreDiameter: number }>
  ): void {
    // Make top point with near-zero diameter
    borePoints.push({
      borePosition: origin,
      boreDiameter: 0.00001, // Bore diameter must be non-zero
    });

    for (let i = 1; i <= HemisphericalBoreHead.NUM_HEMI_POINTS; i++) {
      const heightInterval = i / HemisphericalBoreHead.NUM_HEMI_POINTS;
      const boreDiameter = headDiameter * heightInterval;
      const position =
        (headDiameter -
          Math.sqrt(headDiameter * headDiameter - boreDiameter * boreDiameter)) /
          2 +
        origin;

      borePoints.push({
        borePosition: position,
        boreDiameter,
      });
    }
  }

  /**
   * Determine the BorePoint representing the equator of the hemisphere.
   * This method makes no assumptions on the regularity of the bore profile.
   * If the initial bore point diameter is non-zero, it is used as the hemiTop diameter.
   *
   * @param sortedPoints Array of BorePoints sorted by position
   * @returns A new BorePoint representing the equator
   */
  static getHemiTopPoint(
    sortedPoints: Array<{ borePosition: number; boreDiameter: number }>
  ): { borePosition: number; boreDiameter: number } {
    const topPoint = sortedPoints[0]!;
    const topPosition = topPoint.borePosition;
    const topDiameter = topPoint.boreDiameter;
    let diameter = 0;

    if (topDiameter > 0.00002) {
      diameter = topDiameter;
    } else {
      for (let i = 1; i < sortedPoints.length; i++) {
        const point = sortedPoints[i]!;
        const position = point.borePosition;
        diameter = point.boreDiameter;
        if (position - topPosition >= diameter / 2) {
          break;
        }
      }
    }

    return {
      borePosition: diameter / 2 + topPosition,
      boreDiameter: diameter,
    };
  }
}

/**
 * Minimum cone length constant used in taper calculations.
 */
const MINIMUM_CONE_LENGTH_HEMI = 0.0001;

/**
 * Objective function for a three-section bore with a single tapered section
 * and a hemispherical head. The foot diameter remains invariant.
 *
 * Geometry dimensions:
 * - Taper ratio: head diameter (at hemisphere equator) / foot diameter
 * - Taper start as fraction of bore length (from hemisphere top)
 * - Taper length as fraction of remaining bore
 *
 * Ported from SingleTaperSimpleRatioHemiHeadObjectiveFunction.java
 */
export class SingleTaperSimpleRatioHemiHeadObjectiveFunction extends SingleTaperSimpleRatioObjectiveFunction {
  static override readonly DISPLAY_NAME =
    "Single taper (simple ratios), hemi-head, optimizer";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    // Override constraints set by parent
    this.constraints = new Constraints();
    this.setHemiConstraints();
  }

  private setHemiConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Bore diameter ratio (top/bottom)",
        ConstraintType.DIMENSIONLESS
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Taper start (from hemi top), fraction of bore length",
        ConstraintType.DIMENSIONLESS
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        SingleTaperSimpleRatioObjectiveFunction.CONSTRAINT_CATEGORY,
        "Taper length, fraction of bore below start",
        ConstraintType.DIMENSIONLESS
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      SingleTaperSimpleRatioHemiHeadObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperSimpleRatioHemiHeadObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  /**
   * Finds the next BorePoint below a specified position.
   */
  private getNextPoint(
    borePosition: number,
    sortedPoints: Array<{ borePosition: number; boreDiameter: number }>
  ): { borePosition: number; boreDiameter: number } | null {
    for (const point of sortedPoints) {
      if (point.borePosition > borePosition) {
        return point;
      }
    }
    return null;
  }

  override getGeometryPoint(): number[] {
    const geometry = new Array(this.nrDimensions);
    const sortedPoints = getSortedBorePoints(this.calculator.getInstrument());

    // Get the hemisphere equator point
    const hemiTopPoint = HemisphericalBoreHead.getHemiTopPoint(sortedPoints);
    const nextPoint = this.getNextPoint(hemiTopPoint.borePosition, sortedPoints);
    const penultimatePoint = sortedPoints[sortedPoints.length - 2]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;
    const boreLength = bottomPoint.borePosition - hemiTopPoint.borePosition;

    let taperStart: number;
    let taperEnd: number;

    // Taper ratio
    geometry[0] = hemiTopPoint.boreDiameter / bottomPoint.boreDiameter;

    if (
      Math.abs(hemiTopPoint.boreDiameter - bottomPoint.boreDiameter) < 0.0001
    ) {
      // Bore doesn't really taper
      taperStart = hemiTopPoint.borePosition;
      taperEnd = bottomPoint.borePosition;
    } else {
      // Determine taper start
      if (
        nextPoint &&
        Math.abs(hemiTopPoint.boreDiameter - nextPoint.boreDiameter) < 0.0001
      ) {
        taperStart = nextPoint.borePosition;
      } else {
        taperStart = hemiTopPoint.borePosition;
      }

      // Determine taper end
      if (
        Math.abs(bottomPoint.boreDiameter - penultimatePoint.boreDiameter) <
        0.0001
      ) {
        taperEnd = penultimatePoint.borePosition;
      } else {
        taperEnd = bottomPoint.borePosition;
      }
    }

    geometry[1] = (taperStart - hemiTopPoint.borePosition) / boreLength;
    geometry[2] =
      (taperEnd - taperStart) /
      (boreLength - taperStart + hemiTopPoint.borePosition);

    return geometry;
  }

  override setGeometryPoint(point: number[]): void {
    // Replace existing bore points with hemispherical head plus taper
    const instrument = this.calculator.getInstrument();
    const sortedPoints = getSortedBorePoints(instrument);
    const topPoint = sortedPoints[0]!;
    const bottomPoint = sortedPoints[sortedPoints.length - 1]!;

    const footDiameter = bottomPoint.boreDiameter;
    const headDiameter = footDiameter * point[0]!;
    const topPosition = topPoint.borePosition;

    // Create new bore points starting with hemispherical head
    const newBorePoints: typeof instrument.borePoint = [];
    HemisphericalBoreHead.addHemiHead(topPosition, headDiameter, newBorePoints);

    const hemiTopPosition =
      newBorePoints[newBorePoints.length - 1]!.borePosition;
    const boreLength = bottomPoint.borePosition - hemiTopPosition;
    const taperStart = point[1]! * boreLength;
    const taperLength = Math.max(
      point[2]! * (boreLength - taperStart),
      MINIMUM_CONE_LENGTH_HEMI
    );

    if (taperStart > 0) {
      // Taper begins after hemi section
      const taperStartPos = Math.min(
        hemiTopPosition + taperStart,
        hemiTopPosition + boreLength
      );
      newBorePoints.push({
        borePosition: taperStartPos,
        boreDiameter: headDiameter,
      });
    }

    // Add point for end of taper
    const taperEnd = Math.min(taperStart + taperLength, boreLength);
    newBorePoints.push({
      borePosition: hemiTopPosition + taperEnd,
      boreDiameter: footDiameter,
    });

    if (taperStart + taperLength < boreLength) {
      // Taper ends before bore end
      newBorePoints.push({
        borePosition: hemiTopPosition + boreLength,
        boreDiameter: footDiameter,
      });
    }

    instrument.borePoint = newBorePoints;
  }
}

/**
 * Optimization objective function for bore length, hole positions without
 * groups, hole diameters, and a simple one-section taper with hemispherical head.
 * The foot diameter remains invariant.
 *
 * Combines:
 * - HolePositionFromTopObjectiveFunction: bore length + hole positions from top
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperSimpleRatioHemiHeadObjectiveFunction: taper with hemi-head
 *
 * Ported from SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction.java
 */
export class SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, hemi-head, no hole grouping";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);

    this.components = [
      new HolePositionFromTopObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        BoreLengthAdjustmentType.MOVE_BOTTOM
      ),
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperSimpleRatioHemiHeadObjectiveFunction(
        calculator,
        tuning,
        evaluator
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

/**
 * Optimization objective function for bore length, grouped hole positions,
 * hole diameters, and a simple one-section taper with hemispherical head.
 * The foot diameter remains invariant.
 *
 * Combines:
 * - HoleGroupPositionFromTopObjectiveFunction: grouped hole positions from top
 * - HoleSizeObjectiveFunction: hole diameters
 * - SingleTaperSimpleRatioHemiHeadObjectiveFunction: taper with hemi-head
 *
 * Ported from SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction.java
 */
export class SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction extends MergedObjectiveFunction {
  static readonly DISPLAY_NAME = "Single taper, hemi-head, grouped hole";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator,
    holeGroups: number[][],
    lengthAdjustmentMode: BoreLengthAdjustmentType = BoreLengthAdjustmentType.MOVE_BOTTOM
  ) {
    super(calculator, tuning, evaluator);

    const holeGroupPos = new HoleGroupPositionFromTopObjectiveFunction(
      calculator,
      tuning,
      evaluator,
      holeGroups,
      lengthAdjustmentMode
    );
    holeGroupPos.setAllowBoreSizeInterpolation(false);

    this.components = [
      holeGroupPos,
      new HoleSizeObjectiveFunction(calculator, tuning, evaluator),
      new SingleTaperSimpleRatioHemiHeadObjectiveFunction(
        calculator,
        tuning,
        evaluator
      ),
    ];

    this.optimizerType = OptimizerType.BOBYQA;
    this.sumDimensions();
    this.maxEvaluations = 20000 + (this.nrDimensions - 1) * 5000;
    this.constraints.setObjectiveDisplayName(
      SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");
  }

  override getInitialTrustRegionRadius(): number {
    return 10.0;
  }

  override getStoppingTrustRegionRadius(): number {
    return 1e-8;
  }
}

// ============================================================================
// Calibration Objective Functions
// ============================================================================

/**
 * Optimization objective function for calibrating transverse flute parameters.
 * Optimizes airstream length and beta factor.
 *
 * Geometry dimensions:
 * - Airstream length (dimensional)
 * - Beta factor (dimensionless)
 *
 * Used to calibrate mouthpiece parameters against known instruments.
 *
 * Ported from FluteCalibrationObjectiveFunction.java
 */
export class FluteCalibrationObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece calibration";
  static readonly DISPLAY_NAME = "Flute calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 2;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;
    const airstreamLength = mouthpiece?.embouchureHole?.airstreamLength ?? 0;
    const beta = mouthpiece?.beta ?? 0;
    return [airstreamLength, beta];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;

    if (mouthpiece?.embouchureHole) {
      mouthpiece.embouchureHole.airstreamLength = point[0]!;
    }
    if (mouthpiece) {
      mouthpiece.beta = point[1]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        FluteCalibrationObjectiveFunction.CONSTRAINT_CATEGORY,
        "Airstream length",
        ConstraintType.DIMENSIONAL
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        FluteCalibrationObjectiveFunction.CONSTRAINT_CATEGORY,
        "Beta",
        ConstraintType.DIMENSIONLESS
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      FluteCalibrationObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "FluteCalibrationObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();
    // Airstream length: reasonable range around current value
    // Beta: typically 0 to 1
    this.lowerBounds = [
      Math.max(0.001, currentGeometry[0]! * 0.5),
      0.0,
    ];
    this.upperBounds = [
      currentGeometry[0]! * 2.0,
      1.0,
    ];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}

/**
 * Optimization objective function for calibrating whistle/fipple parameters.
 * Optimizes window height and beta factor.
 *
 * Geometry dimensions:
 * - Window height (dimensional)
 * - Beta factor (dimensionless)
 *
 * Used to calibrate mouthpiece parameters against known instruments.
 *
 * Ported from WhistleCalibrationObjectiveFunction.java
 */
export class WhistleCalibrationObjectiveFunction extends BaseObjectiveFunction {
  static readonly CONSTRAINT_CATEGORY = "Mouthpiece calibration";
  static readonly DISPLAY_NAME = "Whistle calibrator";

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    super(calculator, tuning, evaluator);
    this.nrDimensions = 2;
    this.optimizerType = OptimizerType.BOBYQA;
    this.setConstraints();
  }

  getGeometryPoint(): number[] {
    const mouthpiece = this.calculator.getInstrument().mouthpiece;
    const windowHeight = mouthpiece?.fipple?.windowHeight ?? 0;
    const beta = mouthpiece?.beta ?? 0;
    return [windowHeight, beta];
  }

  setGeometryPoint(point: number[]): void {
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }

    const instrument = this.calculator.getInstrument();
    const mouthpiece = instrument.mouthpiece;

    if (mouthpiece?.fipple) {
      mouthpiece.fipple.windowHeight = point[0]!;
    }
    if (mouthpiece) {
      mouthpiece.beta = point[1]!;
    }
  }

  protected setConstraints(): void {
    this.constraints.addConstraint(
      createConstraint(
        WhistleCalibrationObjectiveFunction.CONSTRAINT_CATEGORY,
        "Window height",
        ConstraintType.DIMENSIONAL
      )
    );
    this.constraints.addConstraint(
      createConstraint(
        WhistleCalibrationObjectiveFunction.CONSTRAINT_CATEGORY,
        "Beta",
        ConstraintType.DIMENSIONLESS
      )
    );

    this.constraints.setNumberOfHoles(
      this.calculator.getInstrument().hole.length
    );
    this.constraints.setObjectiveDisplayName(
      WhistleCalibrationObjectiveFunction.DISPLAY_NAME
    );
    this.constraints.setObjectiveFunctionName(
      "WhistleCalibrationObjectiveFunction"
    );
    this.constraints.setConstraintsName("Default");

    this.setDefaultBounds();
  }

  private setDefaultBounds(): void {
    const currentGeometry = this.getGeometryPoint();
    // Window height: reasonable range around current value
    // Beta: typically 0 to 1
    this.lowerBounds = [
      Math.max(0.0005, currentGeometry[0]! * 0.5),
      0.0,
    ];
    this.upperBounds = [
      currentGeometry[0]! * 2.0,
      1.0,
    ];
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }
}
