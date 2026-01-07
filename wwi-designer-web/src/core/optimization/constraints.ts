/**
 * Constraints for optimization objective functions.
 *
 * Defines bounds and descriptions for optimization variables.
 *
 * Ported from com.wwidesigner.optimization.Constraints.java
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { LengthType } from "../../models/instrument.ts";

/**
 * Type of constraint value.
 */
export enum ConstraintType {
  /** Dimensional value (length in mm or inches) */
  DIMENSIONAL = "DIMENSIONAL",
  /** Dimensionless ratio or multiplier */
  DIMENSIONLESS = "DIMENSIONLESS",
}

/**
 * A single constraint defining a bound on an optimization variable.
 */
export interface Constraint {
  /** Category of the constraint (e.g., "Hole position", "Bore") */
  category: string;
  /** Name of the constraint */
  name: string;
  /** Type of constraint value */
  type: ConstraintType;
  /** Lower bound */
  lowerBound?: number;
  /** Upper bound */
  upperBound?: number;
}

/**
 * Create a constraint with the given properties.
 */
export function createConstraint(
  category: string,
  name: string,
  type: ConstraintType,
  lowerBound?: number,
  upperBound?: number
): Constraint {
  return { category, name, type, lowerBound, upperBound };
}

/**
 * Get a display name for a hole based on its index.
 * @param holeIndex 1-based index of the hole from bottom
 * @param totalHoles Total number of holes
 * @returns Human-readable hole name
 */
export function getHoleName(
  holeIndex: number,
  totalHoles: number
): string {
  if (totalHoles === 1) {
    return "Hole";
  }
  if (holeIndex === 1) {
    return "Bottom hole";
  }
  if (holeIndex === totalHoles) {
    return "Top hole";
  }
  return `Hole ${holeIndex}`;
}

/**
 * Collection of constraints for an objective function.
 */
export class Constraints {
  private lengthType: LengthType;
  private constraints: Constraint[] = [];
  private lowerBounds: number[] = [];
  private upperBounds: number[] = [];
  private numberOfHoles: number = 0;
  private objectiveDisplayName: string = "";
  private objectiveFunctionName: string = "";
  private constraintsName: string = "Default";

  constructor(lengthType: LengthType = "MM") {
    this.lengthType = lengthType;
  }

  /**
   * Add a constraint to the collection.
   */
  addConstraint(constraint: Constraint): void {
    this.constraints.push(constraint);
  }

  /**
   * Get all constraints.
   */
  getConstraints(): Constraint[] {
    return this.constraints;
  }

  /**
   * Get a constraint by index.
   */
  getConstraint(index: number): Constraint | undefined {
    return this.constraints[index];
  }

  /**
   * Get the number of constraints.
   */
  getNumberOfConstraints(): number {
    return this.constraints.length;
  }

  /**
   * Set lower bounds for all dimensions.
   */
  setLowerBounds(bounds: number[]): void {
    this.lowerBounds = [...bounds];
    // Update individual constraint lower bounds
    for (let i = 0; i < bounds.length && i < this.constraints.length; i++) {
      this.constraints[i]!.lowerBound = bounds[i];
    }
  }

  /**
   * Get lower bounds for all dimensions.
   */
  getLowerBounds(): number[] {
    return [...this.lowerBounds];
  }

  /**
   * Set upper bounds for all dimensions.
   */
  setUpperBounds(bounds: number[]): void {
    this.upperBounds = [...bounds];
    // Update individual constraint upper bounds
    for (let i = 0; i < bounds.length && i < this.constraints.length; i++) {
      this.constraints[i]!.upperBound = bounds[i];
    }
  }

  /**
   * Get upper bounds for all dimensions.
   */
  getUpperBounds(): number[] {
    return [...this.upperBounds];
  }

  /**
   * Set the number of holes in the instrument.
   */
  setNumberOfHoles(nHoles: number): void {
    this.numberOfHoles = nHoles;
  }

  /**
   * Get the number of holes in the instrument.
   */
  getNumberOfHoles(): number {
    return this.numberOfHoles;
  }

  /**
   * Set the display name for the objective function.
   */
  setObjectiveDisplayName(name: string): void {
    this.objectiveDisplayName = name;
  }

  /**
   * Get the display name for the objective function.
   */
  getObjectiveDisplayName(): string {
    return this.objectiveDisplayName;
  }

  /**
   * Set the class name of the objective function.
   */
  setObjectiveFunctionName(name: string): void {
    this.objectiveFunctionName = name;
  }

  /**
   * Get the class name of the objective function.
   */
  getObjectiveFunctionName(): string {
    return this.objectiveFunctionName;
  }

  /**
   * Set the name of this constraints set.
   */
  setConstraintsName(name: string): void {
    this.constraintsName = name;
  }

  /**
   * Get the name of this constraints set.
   */
  getConstraintsName(): string {
    return this.constraintsName;
  }

  /**
   * Get the length type (units).
   */
  getLengthType(): LengthType {
    return this.lengthType;
  }

  /**
   * Set the length type (units).
   */
  setLengthType(lengthType: LengthType): void {
    this.lengthType = lengthType;
  }

  /**
   * Add all constraints from another Constraints object.
   */
  addConstraints(other: Constraints): void {
    for (const constraint of other.getConstraints()) {
      this.constraints.push({ ...constraint });
    }
    // Merge bounds
    const otherLower = other.getLowerBounds();
    const otherUpper = other.getUpperBounds();
    this.lowerBounds.push(...otherLower);
    this.upperBounds.push(...otherUpper);
  }

  /**
   * Clear constraints in a specific category.
   */
  clearConstraints(category: string): void {
    this.constraints = this.constraints.filter(
      (c) => c.category !== category
    );
  }

  /**
   * Set hole groups for grouped hole optimization.
   */
  setHoleGroups(groups: number[][]): void {
    // Store hole groups (used by UI for constraint display)
    (this as any).holeGroups = groups;
  }

  /**
   * Get hole groups for grouped hole optimization.
   */
  getHoleGroups(): number[][] | undefined {
    return (this as any).holeGroups;
  }

  /**
   * Clone this constraints object.
   */
  clone(): Constraints {
    const copy = new Constraints(this.lengthType);
    copy.constraints = this.constraints.map((c) => ({ ...c }));
    copy.lowerBounds = [...this.lowerBounds];
    copy.upperBounds = [...this.upperBounds];
    copy.numberOfHoles = this.numberOfHoles;
    copy.objectiveDisplayName = this.objectiveDisplayName;
    copy.objectiveFunctionName = this.objectiveFunctionName;
    copy.constraintsName = this.constraintsName;
    const groups = this.getHoleGroups();
    if (groups) {
      copy.setHoleGroups(groups.map(g => [...g]));
    }
    return copy;
  }
}
