/**
 * Class to represent an acoustic transfer matrix in a transmission matrix model.
 *
 * A transfer matrix is a 2x2 complex matrix that relates acoustic state
 * (pressure and volume flow) at one point to another in a waveguide.
 *
 * Ported from com.wwidesigner.math.TransferMatrix
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

/**
 * Interface for state vector operations (to avoid circular dependency).
 * The actual StateVector class implements this interface.
 */
export interface IStateVector {
  getP(): Complex;
  getU(): Complex;
}

/**
 * A 2x2 complex matrix representing acoustic transfer characteristics.
 *
 * The matrix relates input and output state vectors:
 *   [P_out]   [PP  PU] [P_in]
 *   [U_out] = [UP  UU] [U_in]
 *
 * Where:
 * - PP: Pressure-to-pressure transfer coefficient
 * - PU: Volume flow-to-pressure transfer coefficient
 * - UP: Pressure-to-volume flow transfer coefficient
 * - UU: Volume flow-to-volume flow transfer coefficient
 */
export class TransferMatrix {
  /** Pressure-to-pressure coefficient */
  private mPP: Complex;
  /** Volume flow-to-pressure coefficient */
  private mPU: Complex;
  /** Pressure-to-volume flow coefficient */
  private mUP: Complex;
  /** Volume flow-to-volume flow coefficient */
  private mUU: Complex;

  /**
   * Create a transfer matrix. Default is identity matrix.
   */
  constructor();
  /**
   * Create a transfer matrix with specified coefficients.
   */
  constructor(pp: Complex, pu: Complex, up: Complex, uu: Complex);
  /**
   * Create a copy of another transfer matrix.
   */
  constructor(from: TransferMatrix);

  constructor(
    ppOrFrom?: Complex | TransferMatrix,
    pu?: Complex,
    up?: Complex,
    uu?: Complex
  ) {
    if (ppOrFrom === undefined) {
      // Default: identity matrix
      this.mPP = Complex.ONE;
      this.mPU = Complex.ZERO;
      this.mUP = Complex.ZERO;
      this.mUU = Complex.ONE;
    } else if (ppOrFrom instanceof TransferMatrix) {
      // Copy constructor
      this.mPP = Complex.copy(ppOrFrom.mPP);
      this.mPU = Complex.copy(ppOrFrom.mPU);
      this.mUP = Complex.copy(ppOrFrom.mUP);
      this.mUU = Complex.copy(ppOrFrom.mUU);
    } else {
      // Full constructor
      this.mPP = Complex.copy(ppOrFrom);
      this.mPU = Complex.copy(pu!);
      this.mUP = Complex.copy(up!);
      this.mUU = Complex.copy(uu!);
    }
  }

  /**
   * Static multiply of two transfer matrices.
   * Result = lhs * rhs
   */
  static multiply(lhs: TransferMatrix, rhs: TransferMatrix): TransferMatrix {
    return new TransferMatrix(
      lhs.mPP.multiply(rhs.mPP).add(lhs.mPU.multiply(rhs.mUP)),
      lhs.mPP.multiply(rhs.mPU).add(lhs.mPU.multiply(rhs.mUU)),
      lhs.mUP.multiply(rhs.mPP).add(lhs.mUU.multiply(rhs.mUP)),
      lhs.mUP.multiply(rhs.mPU).add(lhs.mUU.multiply(rhs.mUU))
    );
  }

  /**
   * Multiply this matrix by another on the right.
   * @param rhs Right-hand side matrix
   * @returns New matrix = this * rhs
   */
  multiply(rhs: TransferMatrix): TransferMatrix {
    return new TransferMatrix(
      this.mPP.multiply(rhs.mPP).add(this.mPU.multiply(rhs.mUP)),
      this.mPP.multiply(rhs.mPU).add(this.mPU.multiply(rhs.mUU)),
      this.mUP.multiply(rhs.mPP).add(this.mUU.multiply(rhs.mUP)),
      this.mUP.multiply(rhs.mPU).add(this.mUU.multiply(rhs.mUU))
    );
  }

  /**
   * Static multiply of a transfer matrix and state vector.
   * Returns the resulting P and U components.
   * Result = lhs * rhs
   */
  static multiplyStateVectorComponents(
    lhs: TransferMatrix,
    rhs: IStateVector
  ): { p: Complex; u: Complex } {
    return {
      p: lhs.mPP.multiply(rhs.getP()).add(lhs.mPU.multiply(rhs.getU())),
      u: lhs.mUP.multiply(rhs.getP()).add(lhs.mUU.multiply(rhs.getU())),
    };
  }

  /**
   * Multiply this matrix by a state vector.
   * Returns the resulting P and U components.
   * @param rhs State vector
   * @returns Object with p and u components = this * rhs
   */
  multiplyStateVector(rhs: IStateVector): { p: Complex; u: Complex } {
    return {
      p: this.mPP.multiply(rhs.getP()).add(this.mPU.multiply(rhs.getU())),
      u: this.mUP.multiply(rhs.getP()).add(this.mUU.multiply(rhs.getU())),
    };
  }

  /**
   * Calculate the determinant of this matrix.
   * det = PP*UU - PU*UP
   */
  determinant(): Complex {
    return this.mPP.multiply(this.mUU).subtract(this.mPU.multiply(this.mUP));
  }

  /**
   * Get the inverse of this matrix.
   * For a 2x2 matrix [a b; c d], inverse = (1/det) * [d -b; -c a]
   */
  inverse(): TransferMatrix {
    const det = this.determinant();
    return new TransferMatrix(
      this.mUU.divide(det),
      this.mPU.negate().divide(det),
      this.mUP.negate().divide(det),
      this.mPP.divide(det)
    );
  }

  /**
   * Create an identity transfer matrix.
   */
  static makeIdentity(): TransferMatrix {
    return new TransferMatrix(Complex.ONE, Complex.ZERO, Complex.ZERO, Complex.ONE);
  }

  /**
   * Copy a complex number (utility method for compatibility with Java code).
   */
  static copyComplex(z: Complex): Complex {
    return Complex.copy(z);
  }

  // Getters

  /** Get PP coefficient */
  getPP(): Complex {
    return this.mPP;
  }

  /** Get PU coefficient */
  getPU(): Complex {
    return this.mPU;
  }

  /** Get UP coefficient */
  getUP(): Complex {
    return this.mUP;
  }

  /** Get UU coefficient */
  getUU(): Complex {
    return this.mUU;
  }

  // Setters

  /** Set PP coefficient */
  setPP(pp: Complex): void {
    this.mPP = pp;
  }

  /** Set PU coefficient */
  setPU(pu: Complex): void {
    this.mPU = pu;
  }

  /** Set UP coefficient */
  setUP(up: Complex): void {
    this.mUP = up;
  }

  /** Set UU coefficient */
  setUU(uu: Complex): void {
    this.mUU = uu;
  }

  /**
   * Check if this matrix equals another within tolerance.
   */
  equals(other: TransferMatrix, tolerance: number = 0): boolean {
    return (
      this.mPP.equals(other.mPP, tolerance) &&
      this.mPU.equals(other.mPU, tolerance) &&
      this.mUP.equals(other.mUP, tolerance) &&
      this.mUU.equals(other.mUU, tolerance)
    );
  }

  /**
   * Convert to string representation.
   */
  toString(): string {
    return `TransferMatrix[\n  [${this.mPP}, ${this.mPU}]\n  [${this.mUP}, ${this.mUU}]\n]`;
  }
}
