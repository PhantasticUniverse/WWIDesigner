/**
 * Data models for optimization constraints.
 *
 * Ported from Java: com.wwidesigner.optimization.Constraints
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

// ============================================================================
// ConstraintType - types of constraints
// ============================================================================

/**
 * Types of constraint values
 * - BOOLEAN: true/false constraint
 * - INTEGER: integer value constraint
 * - DIMENSIONAL: physical dimension (affected by unit conversion)
 * - DIMENSIONLESS: ratio or other non-dimensional value
 */
export type ConstraintType = "BOOLEAN" | "INTEGER" | "DIMENSIONAL" | "DIMENSIONLESS";

// ============================================================================
// Constraint - a single constraint with bounds
// ============================================================================

export interface Constraint {
  /** Display name for this constraint */
  displayName: string;
  /** Category this constraint belongs to */
  category: string;
  /** Type of constraint */
  type: ConstraintType;
  /** Lower bound */
  lowerBound?: number;
  /** Upper bound */
  upperBound?: number;
}

/**
 * Create a new Constraint
 */
export function createConstraint(
  category: string,
  displayName: string,
  type: ConstraintType,
  lowerBound?: number,
  upperBound?: number
): Constraint {
  return {
    category,
    displayName,
    type,
    lowerBound,
    upperBound,
  };
}

/**
 * Validate if a constraint is valid (has category and display name)
 */
export function isValidConstraint(constraint: Constraint | null | undefined): boolean {
  if (!constraint) {
    return false;
  }
  if (!constraint.category || constraint.category.trim().length === 0) {
    return false;
  }
  if (!constraint.displayName || constraint.displayName.trim().length === 0) {
    return false;
  }
  return true;
}

/**
 * Convert constraint bounds based on dimension type
 */
export function convertConstraintBound(
  constraint: Constraint,
  isLowerBound: boolean,
  toMetres: boolean,
  dimensionType: LengthType
): number {
  let bound = isLowerBound ? constraint.lowerBound : constraint.upperBound;

  if (bound === undefined || bound === null) {
    bound = 0;
  }

  let multiplier: number;
  if (constraint.type === "DIMENSIONAL") {
    multiplier = toMetres
      ? getMultiplierToMetres(dimensionType)
      : getMultiplierFromMetres(dimensionType);
  } else {
    multiplier = 1.0;
  }

  return bound * multiplier;
}

/**
 * Get the dimension string for a constraint
 */
export function getConstraintDimension(
  constraint: Constraint,
  dimensionType: LengthType
): string {
  if (constraint.type === "DIMENSIONAL") {
    return dimensionType;
  }
  return constraint.type;
}

/**
 * Get a descriptive name for a hole at a given index
 */
export function getHoleName(
  holeName: string | undefined,
  sortedIdx: number,
  minIdx: number,
  maxIdx: number
): string {
  let name =
    holeName && holeName.trim().length > 0 ? holeName : `Hole ${sortedIdx}`;

  if (sortedIdx === maxIdx) {
    name += " (top)";
  } else if (sortedIdx === minIdx) {
    name += " (bottom)";
  }

  return name;
}

// ============================================================================
// HoleGroup - a group of holes constrained to have equal spacing
// ============================================================================

export interface HoleGroup {
  /** Indices of holes in this group */
  holeIndices: number[];
}

export interface HoleGroups {
  /** Array of hole groups */
  groups: HoleGroup[];
}

/**
 * Create HoleGroups from a 2D array of hole indices
 */
export function createHoleGroups(groups: number[][]): HoleGroups {
  return {
    groups: groups.map((indices) => ({ holeIndices: indices })),
  };
}

/**
 * Get hole groups as a 2D array
 */
export function getHoleGroupsArray(holeGroups: HoleGroups | undefined): number[][] {
  if (!holeGroups) {
    return [];
  }
  return holeGroups.groups.map((g) => [...g.holeIndices]);
}

// ============================================================================
// Constraints - complete set of optimization constraints
// ============================================================================

export interface Constraints {
  /** Name of this constraints set */
  constraintsName?: string;
  /** Number of holes this constraint set applies to */
  numberOfHoles: number;
  /** Display name of the objective function */
  objectiveDisplayName?: string;
  /** Class name of the objective function */
  objectiveFunctionName?: string;
  /** List of individual constraints */
  constraint: Constraint[];
  /** Hole groups for equal spacing constraints */
  holeGroups?: HoleGroups;
}

/**
 * Create a new empty Constraints object
 */
export function createConstraints(
  constraintsName?: string,
  numberOfHoles: number = 0
): Constraints {
  return {
    constraintsName,
    numberOfHoles,
    constraint: [],
  };
}

/**
 * Add a constraint to the constraints set
 */
export function addConstraint(constraints: Constraints, newConstraint: Constraint): Constraints {
  if (!isValidConstraint(newConstraint)) {
    return constraints;
  }
  return {
    ...constraints,
    constraint: [...constraints.constraint, newConstraint],
  };
}

/**
 * Get all unique categories in the constraints
 */
export function getCategories(constraints: Constraints): string[] {
  const categories: string[] = [];
  for (const c of constraints.constraint) {
    if (!categories.includes(c.category)) {
      categories.push(c.category);
    }
  }
  return categories;
}

/**
 * Get all constraints in a specific category
 */
export function getConstraintsByCategory(
  constraints: Constraints,
  category: string
): Constraint[] {
  if (!category || category.trim().length === 0) {
    return [];
  }
  return constraints.constraint.filter((c) => c.category === category);
}

/**
 * Get a specific constraint by category and index within that category
 */
export function getConstraint(
  constraints: Constraints,
  category: string,
  index: number
): Constraint | null {
  const categoryConstraints = getConstraintsByCategory(constraints, category);
  if (index >= 0 && index < categoryConstraints.length) {
    return categoryConstraints[index] ?? null;
  }
  return null;
}

/**
 * Get number of constraints in a category
 */
export function getNumberOfConstraints(constraints: Constraints, category: string): number {
  return getConstraintsByCategory(constraints, category).length;
}

/**
 * Get total number of constraints
 */
export function getTotalNumberOfConstraints(constraints: Constraints): number {
  return constraints.constraint.length;
}

/**
 * Clear all constraints in a category
 */
export function clearConstraints(constraints: Constraints, category: string): Constraints {
  return {
    ...constraints,
    constraint: constraints.constraint.filter((c) => c.category !== category),
  };
}

/**
 * Merge another constraints set into this one
 */
export function mergeConstraints(
  base: Constraints,
  additional: Constraints
): Constraints {
  const result = { ...base };

  // Add all constraints from additional
  for (const c of additional.constraint) {
    if (isValidConstraint(c)) {
      result.constraint = [...result.constraint, c];
    }
  }

  // Replace hole groups if present in additional
  if (additional.holeGroups) {
    result.holeGroups = additional.holeGroups;
  }

  return result;
}

/**
 * Extract lower bounds array from constraints (in category order)
 */
export function getLowerBounds(
  constraints: Constraints,
  dimensionType: LengthType = "M"
): number[] {
  const bounds: number[] = [];
  const categories = getCategories(constraints);

  for (const category of categories) {
    const categoryConstraints = getConstraintsByCategory(constraints, category);
    for (const c of categoryConstraints) {
      bounds.push(convertConstraintBound(c, true, true, dimensionType));
    }
  }

  return bounds;
}

/**
 * Extract upper bounds array from constraints (in category order)
 */
export function getUpperBounds(
  constraints: Constraints,
  dimensionType: LengthType = "M"
): number[] {
  const bounds: number[] = [];
  const categories = getCategories(constraints);

  for (const category of categories) {
    const categoryConstraints = getConstraintsByCategory(constraints, category);
    for (const c of categoryConstraints) {
      bounds.push(convertConstraintBound(c, false, true, dimensionType));
    }
  }

  return bounds;
}

/**
 * Set lower bounds from an array (in category order)
 */
export function setLowerBounds(constraints: Constraints, bounds: number[]): Constraints {
  if (bounds.length !== getTotalNumberOfConstraints(constraints)) {
    throw new Error(
      `Dimension mismatch: expected ${getTotalNumberOfConstraints(constraints)} bounds, got ${bounds.length}`
    );
  }

  const newConstraints = { ...constraints, constraint: [...constraints.constraint] };
  const categories = getCategories(constraints);
  let idx = 0;

  for (const category of categories) {
    for (let i = 0; i < newConstraints.constraint.length; i++) {
      if (newConstraints.constraint[i]!.category === category) {
        newConstraints.constraint[i] = {
          ...newConstraints.constraint[i]!,
          lowerBound: bounds[idx++],
        };
      }
    }
  }

  return newConstraints;
}

/**
 * Set upper bounds from an array (in category order)
 */
export function setUpperBounds(constraints: Constraints, bounds: number[]): Constraints {
  if (bounds.length !== getTotalNumberOfConstraints(constraints)) {
    throw new Error(
      `Dimension mismatch: expected ${getTotalNumberOfConstraints(constraints)} bounds, got ${bounds.length}`
    );
  }

  const newConstraints = { ...constraints, constraint: [...constraints.constraint] };
  const categories = getCategories(constraints);
  let idx = 0;

  for (const category of categories) {
    for (let i = 0; i < newConstraints.constraint.length; i++) {
      if (newConstraints.constraint[i]!.category === category) {
        newConstraints.constraint[i] = {
          ...newConstraints.constraint[i]!,
          upperBound: bounds[idx++],
        };
      }
    }
  }

  return newConstraints;
}

/**
 * Validate constraints and return any errors
 */
export function validateConstraints(constraints: Constraints): string[] {
  const errors: string[] = [];

  for (let i = 0; i < constraints.constraint.length; i++) {
    const c = constraints.constraint[i]!;

    if (!c.category || c.category.trim().length === 0) {
      errors.push(`Constraint ${i + 1} must have a category.`);
    }

    if (!c.displayName || c.displayName.trim().length === 0) {
      errors.push(`Constraint ${i + 1} must have a display name.`);
    }

    if (
      c.lowerBound !== undefined &&
      c.upperBound !== undefined &&
      c.lowerBound > c.upperBound
    ) {
      errors.push(
        `Constraint "${c.displayName}": lower bound (${c.lowerBound}) must not exceed upper bound (${c.upperBound}).`
      );
    }
  }

  return errors;
}

// ============================================================================
// Common constraint categories
// ============================================================================

export const ConstraintCategories = {
  HOLE_POSITION: "Hole position",
  HOLE_SIZE: "Hole size",
  HOLE_SPACING: "Hole spacing",
  BORE_POSITION: "Bore position",
  BORE_DIAMETER: "Bore diameter",
  MOUTHPIECE: "Mouthpiece",
  TERMINATION: "Termination",
} as const;

export type ConstraintCategory = (typeof ConstraintCategories)[keyof typeof ConstraintCategories];
