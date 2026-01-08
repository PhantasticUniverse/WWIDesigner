/**
 * Calculators for instrument terminations (open/closed ends).
 *
 * Ported from com.wwidesigner.geometry.calculation.TerminationCalculator,
 * FlangedEndCalculator, and UnflangedEndCalculator.
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
import { StateVector } from "../math/state-vector.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import { Tube } from "./tube.ts";
import type { Termination } from "../../models/instrument.ts";

/**
 * Interface for termination calculators.
 * Different calculators implement different acoustic models for
 * flanged and unflanged pipe ends.
 */
export interface ITerminationCalculator {
  /**
   * Return a state vector describing the specified termination.
   *
   * @param termination Termination description
   * @param isOpen True if the bore end is open, false if it is closed
   * @param waveNumber k = 2*pi*f/c
   * @param params Physical parameters
   * @returns [P, U] state vector
   */
  calcStateVector(
    termination: Termination,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector;
}

/**
 * Base termination calculator.
 * Provides open-end calculation defaulting to open state.
 */
export abstract class TerminationCalculator implements ITerminationCalculator {
  /**
   * Return a state vector describing the specified termination,
   * assuming the bore end is open.
   *
   * @param termination Termination description
   * @param waveNumber k = 2*pi*f/c
   * @param params Physical parameters
   * @returns [P, U] state vector
   */
  calcStateVectorOpen(
    termination: Termination,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    return this.calcStateVector(termination, true, waveNumber, params);
  }

  /**
   * Return a state vector describing the specified termination.
   *
   * @param termination Termination description
   * @param isOpen True if the bore end is open, false if it is closed
   * @param waveNumber k = 2*pi*f/c
   * @param params Physical parameters
   * @returns [P, U] state vector
   */
  abstract calcStateVector(
    termination: Termination,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector;
}

/**
 * Termination calculator for unflanged (bare) pipe ends.
 * Uses Silva et al. 2008 formula for radiation impedance.
 */
export class UnflangedEndCalculator extends TerminationCalculator {
  /**
   * Calculate state vector for unflanged termination.
   */
  calcStateVector(
    termination: Termination,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    if (!isOpen) {
      return StateVector.ClosedEnd();
    }

    const freq = params.calcFrequency(waveNumber);
    const radius = 0.5 * (termination.boreDiameter ?? 0.01);
    const Zend = Tube.calcZload(freq, radius, params);

    return new StateVector(Zend);
  }
}

/**
 * Termination calculator for flanged pipe ends.
 * Uses Silva et al. 2008 formula for radiation impedance with infinite flange.
 */
export class FlangedEndCalculator extends TerminationCalculator {
  /**
   * Calculate state vector for flanged termination.
   */
  calcStateVector(
    termination: Termination,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    if (!isOpen) {
      return StateVector.ClosedEnd();
    }

    const freq = params.calcFrequency(waveNumber);
    const radius = 0.5 * (termination.boreDiameter ?? 0.01);
    const Zend = Tube.calcZflanged(freq, radius, params);

    return new StateVector(Zend);
  }
}

/**
 * Termination calculator for thick flanged open ends.
 *
 * Ported from com.wwidesigner.geometry.calculation.ThickFlangedOpenEndCalculator
 *
 * This calculator uses a more sophisticated model that accounts for:
 * - The ratio of bore diameter to flange diameter
 * - Frequency-dependent reflection coefficient
 *
 * This is the termination calculator used by NAFCalculator in Java.
 */
export class ThickFlangedOpenEndCalculator extends TerminationCalculator {
  /**
   * Delta infinity constant for infinite flange.
   */
  private static readonly DELTA_INF = 0.8216;

  /**
   * Delta zero constant for zero flange (unflanged).
   */
  private static readonly DELTA_0 = 0.6133;

  /**
   * Calculate state vector for thick flanged termination.
   */
  calcStateVector(
    termination: Termination,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    if (!isOpen) {
      return StateVector.ClosedEnd();
    }

    const Z = this.calcZ(termination, waveNumber, params).multiply(
      params.calcZ0((termination.boreDiameter ?? 0.01) / 2)
    );

    return new StateVector(Z);
  }

  /**
   * Calculate normalized impedance using reflection coefficient model.
   *
   * @param termination Termination parameters
   * @param waveNumber Wave number k = 2*pi*f/c
   * @param params Physical parameters
   * @returns Normalized impedance Z/Z0
   */
  private calcZ(
    termination: Termination,
    waveNumber: number,
    params: PhysicalParameters
  ): Complex {
    const a = (termination.boreDiameter ?? 0.01) / 2; // Bore radius
    const b = termination.flangeDiameter / 2; // Flange radius

    const a_b = a / b;
    const ka = waveNumber * a;

    // Calculate delta_circ interpolation between unflanged and infinite flange
    const delta_circ =
      ThickFlangedOpenEndCalculator.DELTA_INF +
      a_b * (ThickFlangedOpenEndCalculator.DELTA_0 - ThickFlangedOpenEndCalculator.DELTA_INF) +
      0.057 * a_b * (1 - Math.pow(a_b, 5));

    // Calculate frequency-dependent reflection coefficient magnitude
    const R0 =
      (1 + 0.2 * ka - 0.084 * ka * ka) /
      (1 + 0.2 * ka + (0.5 - 0.084) * ka * ka);

    // Calculate complex reflection coefficient
    // R = -R0 * exp(-2j * delta_circ * ka)
    const phaseAngle = -2 * delta_circ * ka;
    const R = new Complex(0, phaseAngle).exp().multiply(-R0);

    // Convert reflection coefficient to impedance: Z = (1 + R) / (1 - R)
    return R.add(1).divide(R.negate().add(1));
  }
}

/**
 * Default termination calculator instances.
 */
export const unflangedEndCalculator = new UnflangedEndCalculator();
export const flangedEndCalculator = new FlangedEndCalculator();
export const thickFlangedEndCalculator = new ThickFlangedOpenEndCalculator();

/**
 * Get appropriate termination calculator based on flange diameter.
 * If flange diameter is larger than bore diameter, use flanged calculator.
 *
 * @param termination Termination description
 * @returns Appropriate termination calculator
 */
export function getTerminationCalculator(
  termination: Termination
): ITerminationCalculator {
  const boreDiameter = termination.boreDiameter ?? 0.01;

  // If flange diameter is significantly larger than bore, it's flanged
  if (termination.flangeDiameter > boreDiameter * 1.1) {
    return flangedEndCalculator;
  }

  return unflangedEndCalculator;
}
