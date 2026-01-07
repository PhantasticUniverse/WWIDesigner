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
