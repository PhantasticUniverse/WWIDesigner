/**
 * Calculator to compute the transfer matrix of a soundhole in a round tube.
 *
 * Ported from com.wwidesigner.geometry.calculation.DefaultHoleCalculator
 *
 * Reference: Antoine Lefebvre and Gary P. Scavone, Characterization of woodwind
 * instrument toneholes with the finite element method, J. Acoust. Soc. Am. V.
 * 131 (n. 4), April 2012.
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
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import type { Hole } from "../../models/instrument.ts";

/**
 * Adjustment factor constants for finger intrusion on closed toneholes.
 */
export const NO_FINGER_ADJ = 0.0;
export const CAP_VOLUME_FINGER_ADJ = 0.02;
export const CAP_HEIGHT_FINGER_ADJ = 0.011;
export const DEFAULT_FINGER_ADJ = 0.01;
export const DEFAULT_HOLE_SIZE_MULT = 1.0;

/**
 * Interface for hole calculators.
 * Different calculators may use different acoustic models.
 */
export interface IHoleCalculator {
  /**
   * Calculate the transfer matrix for a tone hole.
   * @param hole The hole geometry
   * @param isOpen Whether the hole is open or closed
   * @param waveNumber Wave number in radians/meter
   * @param params Physical parameters of the air
   * @returns Transfer matrix for the hole
   */
  calcTransferMatrix(
    hole: Hole,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix;
}

/**
 * Default hole calculator using Lefebvre-Scavone 2012 formulas.
 *
 * From Antoine Lefebvre and Gary P. Scavone, Characterization of woodwind
 * instrument toneholes with the finite element method, J. Acoust. Soc. Am. V.
 * 131 (n. 4), April 2012.
 */
export class DefaultHoleCalculator implements IHoleCalculator {
  /**
   * Adjustment factor in meters for finger intrusion on a closed tonehole.
   * Use zero for no intrusion, or for specific approximations:
   * - 0.025 for effect of volume reduction from cap of 15 mm sphere
   * - 0.020 for effect of volume reduction from cap of 13 mm dia sphere
   * - 0.011 for height of cap of 13 mm dia sphere
   * - 0.010 for adjustment that Paul Dickens used in his 2007 thesis
   */
  protected fingerAdjustment: number;

  /** Whether the hole is plugged (completely blocked) */
  protected isPlugged: boolean;

  /** Hole size multiplier for scaling */
  protected holeSizeMult: number;

  /**
   * Create a hole calculator.
   *
   * Note: Java has multiple constructor overloads with different defaults:
   * - DefaultHoleCalculator() uses DEFAULT_FINGER_ADJ (0.01)
   * - DefaultHoleCalculator(holeSizeMult) uses NO_FINGER_ADJ (0.0)
   * - DefaultHoleCalculator(isPlugged, fingerAdj) uses DEFAULT_HOLE_SIZE_MULT
   *
   * When holeSizeMult is provided (non-default), fingerAdjustment defaults to 0.0
   * to match Java's behavior for NAFCalculator.
   */
  constructor(
    holeSizeMult: number = DEFAULT_HOLE_SIZE_MULT,
    isPlugged: boolean = false,
    fingerAdjustment?: number
  ) {
    this.holeSizeMult = holeSizeMult;
    this.isPlugged = isPlugged;
    // Match Java: when holeSizeMult is explicitly provided, use NO_FINGER_ADJ
    // When using defaults, use DEFAULT_FINGER_ADJ
    if (fingerAdjustment !== undefined) {
      this.fingerAdjustment = fingerAdjustment;
    } else if (holeSizeMult !== DEFAULT_HOLE_SIZE_MULT) {
      this.fingerAdjustment = NO_FINGER_ADJ;
    } else {
      this.fingerAdjustment = DEFAULT_FINGER_ADJ;
    }
  }

  getFingerAdjustment(): number {
    return this.fingerAdjustment;
  }

  setFingerAdjustment(fingerAdj: number): void {
    this.fingerAdjustment = fingerAdj;
  }

  getHoleSizeMult(): number {
    return this.holeSizeMult;
  }

  setHoleSizeMult(holeSizeMult: number): void {
    this.holeSizeMult = holeSizeMult;
  }

  getIsPlugged(): boolean {
    return this.isPlugged;
  }

  setIsPlugged(plugged: boolean): void {
    this.isPlugged = plugged;
  }

  /**
   * Calculate the transfer matrix for a tone hole.
   *
   * Reference: Antoine Lefebvre and Gary P. Scavone, Characterization of
   * woodwind instrument toneholes with the finite element method, J. Acoust.
   * Soc. Am. V. 131 (n. 4), April 2012.
   *
   * @param hole The hole geometry
   * @param isOpen Whether the hole is open or closed
   * @param waveNumber Wave number in radians/meter
   * @param params Physical parameters of the air
   * @returns Transfer matrix for the hole
   */
  calcTransferMatrix(
    hole: Hole,
    isOpen: boolean,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    const radius = this.holeSizeMult * hole.diameter / 2.0;
    const boreRadius = (hole.boreDiameter ?? hole.diameter * 2) / 2.0;

    let Ys = Complex.ZERO; // Shunt admittance == 1/Zs
    let Za = Complex.ZERO; // Series impedance

    // Characteristic impedance of hole
    const Z0h = params.calcZ0(radius);
    const delta = radius / boreRadius;
    const delta2 = delta * delta;

    // Equation 8: matching length correction
    const tm = 0.125 * radius * delta * (1.0 + 0.207 * delta * delta2);
    const te = hole.height + tm;

    // Equation 31: inner length correction (base form)
    const ti_base =
      radius *
      (0.822 +
        delta *
          (-0.095 +
            delta * (-1.566 + delta * (2.138 + delta * (-1.64 + delta * 0.502)))));

    let ta = 0.0;

    if (isOpen) {
      const kb = waveNumber * radius;
      const ka = waveNumber * boreRadius;

      // Equation 33: series impedance length correction
      ta =
        (-0.35 + 0.06 * Math.tanh((2.7 * hole.height) / radius)) *
        radius *
        delta2;

      // Equation 31 times equation 32: inner length correction with frequency dependence
      const ti =
        ti_base *
        (1.0 +
          (1.0 - 4.56 * delta + 6.55 * delta2) *
            ka *
            (0.17 + ka * (0.92 + ka * (0.16 - 0.29 * ka))));

      // Normalized radiation resistance, real part of Zs, per equation 3
      const Rr = 0.25 * kb * kb;

      // Radiation length correction (equation 10 with Zr/Z0h = jk*tr without real part)
      // Equation 11 times radius
      const tr =
        radius *
        (0.822 - 0.47 * Math.pow(radius / (boreRadius + hole.height), 0.8));

      // Equation 3 and 7, inverted
      const kttotal = waveNumber * ti + Math.tan(waveNumber * (te + tr));
      Ys = Complex.ONE.divide(
        Complex.I.multiply(kttotal).add(new Complex(Rr, 0)).multiply(Z0h)
      );
    } else if (this.isPlugged) {
      // Tonehole is fully plugged. Ignore the hole entirely.
      ta = 0.0;
      Ys = Complex.ZERO;
    } else if (hole.key === undefined) {
      // Tonehole closed by player's finger
      // Equation 34, revised constants to better fit figure 13
      ta =
        (-0.2 - 0.1 * Math.tanh((2.4 * hole.height) / radius)) *
        radius *
        delta2;

      let tf = 0.0;
      if (this.fingerAdjustment > 0.0) {
        // Approximate curve fit
        tf = (radius * radius) / this.fingerAdjustment;
      }

      // Equation 16, inverted
      const tankt = Math.tan(waveNumber * (te - tf));
      Ys = new Complex(0.0, tankt / (Z0h * (1.0 - waveNumber * ti_base * tankt)));
    } else {
      // Tonehole closed by key
      ta =
        (-0.12 - 0.17 * Math.tanh((2.4 * hole.height) / radius)) *
        radius *
        delta2;

      const tankt = Math.tan(waveNumber * te);
      Ys = new Complex(0.0, tankt / (Z0h * (1.0 - waveNumber * ti_base * tankt)));
    }

    // Equation 4, 6: Series impedance
    // Z0 == Z0h * delta*delta
    Za = Complex.I.multiply(Z0h * delta2 * waveNumber * ta);
    const Za_Zs = Za.multiply(Ys);

    // Transfer matrix (equation 2)
    const A = Za_Zs.divide(2.0).add(Complex.ONE);
    const B = Za.multiply(Za_Zs.divide(4.0).add(Complex.ONE));
    const C = Ys;

    return new TransferMatrix(A, B, C, A);
  }
}

/**
 * Default hole calculator instance with standard parameters.
 */
export const defaultHoleCalculator = new DefaultHoleCalculator();
