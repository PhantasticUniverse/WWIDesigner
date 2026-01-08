/**
 * Class to manage acoustic state vectors with two elements: pressure and volume flow.
 *
 * A state vector represents the acoustic state at a point in an air column,
 * consisting of pressure (P) and volume flow (U).
 *
 * Ported from com.wwidesigner.math.StateVector
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Complex } from "./complex.ts";
import { TransferMatrix, type IStateVector } from "./transfer-matrix.ts";

/**
 * A 2x1 complex vector representing the acoustic state at a point in the bore.
 * - P (pressure): acoustic pressure
 * - U (volume flow): acoustic volume velocity
 */
export class StateVector implements IStateVector {
  /** Acoustic pressure */
  protected mP: Complex;
  /** Acoustic volume flow */
  protected mU: Complex;

  /**
   * Create a zero state vector.
   */
  constructor();
  /**
   * Create a state vector with specified pressure and volume flow.
   */
  constructor(p: Complex, u: Complex);
  /**
   * Create a copy of another state vector.
   */
  constructor(from: StateVector);
  /**
   * Create a state vector from an impedance value.
   * The resulting state vector satisfies sv.getImpedance().equals(z).
   */
  constructor(z: Complex);

  constructor(pOrFromOrZ?: Complex | StateVector, u?: Complex) {
    if (pOrFromOrZ === undefined) {
      // Default constructor: zero state
      this.mP = Complex.ZERO;
      this.mU = Complex.ZERO;
    } else if (pOrFromOrZ instanceof StateVector) {
      // Copy constructor
      this.mP = TransferMatrix.copyComplex(pOrFromOrZ.mP);
      this.mU = TransferMatrix.copyComplex(pOrFromOrZ.mU);
    } else if (u === undefined) {
      // Construct from impedance Z
      const z = pOrFromOrZ;
      if (z.re === Number.POSITIVE_INFINITY) {
        this.mP = new Complex(1.0, 0.0);
        this.mU = new Complex(0.0, 0.0);
        return;
      }
      if (z.re === Number.NEGATIVE_INFINITY) {
        this.mP = new Complex(-1.0, 0.0);
        this.mU = new Complex(0.0, 0.0);
        return;
      }
      // For greater robustness, divide both P and U by (1+Z),
      // so that both are between 0 and 1, but ratio still works out to Z.
      // From Paul Dickens, 2007.
      const zPlus1 = z.add(1.0);
      this.mP = z.divide(zPlus1);
      this.mU = Complex.ONE.divide(zPlus1);
    } else {
      // Full constructor with P and U
      this.mP = TransferMatrix.copyComplex(pOrFromOrZ);
      this.mU = TransferMatrix.copyComplex(u);
    }
  }

  /**
   * Create a state vector representing an ideal open end.
   * At an open end, pressure is zero.
   */
  static OpenEnd(): StateVector {
    return new StateVector(Complex.ZERO, Complex.ONE);
  }

  /**
   * Create a state vector representing an ideal closed end.
   * At a closed end, acoustic flow is zero.
   */
  static ClosedEnd(): StateVector {
    return new StateVector(Complex.ONE, Complex.ZERO);
  }

  /**
   * Get the pressure component.
   */
  getP(): Complex {
    return this.mP;
  }

  /**
   * Get the volume flow component.
   */
  getU(): Complex {
    return this.mU;
  }

  /**
   * Set the pressure component.
   */
  setP(p: Complex): void {
    this.mP = p;
  }

  /**
   * Set the volume flow component.
   */
  setU(u: Complex): void {
    this.mU = u;
  }

  /**
   * Get the impedance (Z) that a component with this state vector is presenting.
   * Z = P / U
   */
  getImpedance(): Complex {
    return this.mP.divide(this.mU);
  }

  /**
   * Get the admittance (Y) that a component with this state vector is presenting.
   * Y = U / P = 1/Z
   */
  getAdmittance(): Complex {
    return this.mU.divide(this.mP);
  }

  /**
   * Get the reflectance (coefficient of reflection of pressure) that a
   * component with this state vector is presenting.
   *
   * R = (P - U*Z0) / (P + U*Z0)
   *
   * @param z0 Characteristic impedance
   * @returns Reflectance coefficient
   */
  getReflectance(z0: number): Complex {
    const uz0 = this.mU.multiply(z0);
    return this.mP.subtract(uz0).divide(this.mP.add(uz0));
  }

  /**
   * Add another state vector in series with this one.
   * @param other State vector to add in series
   * @returns New state vector satisfying:
   *          sv.getImpedance() = this.getImpedance() + other.getImpedance()
   */
  series(other: StateVector): StateVector {
    const newP = this.mP.multiply(other.mU).add(other.mP.multiply(this.mU));
    const newU = this.mU.multiply(other.mU);
    return new StateVector(newP, newU);
  }

  /**
   * Add another state vector in parallel with this one.
   * @param other State vector to add in parallel
   * @returns New state vector satisfying:
   *          1/sv.getImpedance() = 1/this.getImpedance() + 1/other.getImpedance()
   */
  parallel(other: StateVector): StateVector {
    const newU = this.mP.multiply(other.mU).add(other.mP.multiply(this.mU));
    const newP = this.mP.multiply(other.mP);
    return new StateVector(newP, newU);
  }

  /**
   * Apply a transfer matrix to this state vector.
   * @param tm Transfer matrix to apply
   * @returns New state vector = tm * this
   */
  applyTransferMatrix(tm: TransferMatrix): StateVector {
    const result = tm.multiplyStateVector(this);
    return new StateVector(result.p, result.u);
  }

  /**
   * Check if this state vector equals another within tolerance.
   */
  equals(other: StateVector, tolerance: number = 0): boolean {
    return (
      this.mP.equals(other.mP, tolerance) && this.mU.equals(other.mU, tolerance)
    );
  }

  /**
   * Convert to string representation.
   */
  toString(): string {
    return `StateVector[P=${this.mP}, U=${this.mU}]`;
  }
}
