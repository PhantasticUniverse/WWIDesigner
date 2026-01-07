/**
 * Mouthpiece calculators for woodwind instruments.
 *
 * Ported from com.wwidesigner.geometry.calculation.MouthpieceCalculator,
 * SimpleFippleMouthpieceCalculator, and FluteMouthpieceCalculator.
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
import { Tube } from "./tube.ts";
import type { Mouthpiece, BoreSection } from "../../models/instrument.ts";
import { isPressureNode } from "../../models/instrument.ts";

/**
 * Interface for mouthpiece calculators.
 * Different calculators implement different acoustic models for various
 * mouthpiece types (fipple, embouchure, reed, etc.).
 */
export interface IMouthpieceCalculator {
  /**
   * Calculate state vector as seen by driving source.
   *
   * For flow-node mouthpiece (fipple, embouchure), returns [P, U] as seen by driver.
   * For pressure-node mouthpiece (reeds), returns [Z0*U, P] as seen by driver.
   *
   * @param boreState [P, U] of bore as seen by mouthpiece
   * @param mouthpiece Instrument mouthpiece description
   * @param waveNumber k = 2*pi*f/c
   * @param params Physical parameters
   * @returns State vector seen by driving source
   */
  calcStateVector(
    boreState: StateVector,
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector;

  /**
   * Calculate transfer matrix representing effect of mouthpiece in series with bore.
   *
   * @param mouthpiece Instrument mouthpiece description
   * @param waveNumber k = 2*pi*f/c
   * @param params Physical parameters
   * @returns Transfer matrix for effect of mouthpiece
   */
  calcTransferMatrix(
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix;
}

/**
 * Base mouthpiece calculator.
 * Default mouthpiece is a pure open end for flow-node mouthpiece,
 * and a pure closed end for a pressure-node mouthpiece.
 */
export class MouthpieceCalculator implements IMouthpieceCalculator {
  /**
   * Calculate transfer matrix for the mouthpiece.
   */
  calcTransferMatrix(
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    // Default mouthpiece is a pure open end for flow-node mouthpiece,
    // and a pure closed end for a pressure-node mouthpiece.
    if (isPressureNode(mouthpiece)) {
      const headRadius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
      const z0 = params.calcZ0(headRadius);
      return new TransferMatrix(
        Complex.ZERO,
        new Complex(z0, 0),
        Complex.ONE,
        Complex.ZERO
      );
    }
    return TransferMatrix.makeIdentity();
  }

  /**
   * Calculate state vector as seen by driving source.
   */
  calcStateVector(
    boreState: StateVector,
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    // Default state vector calculation assumes the transfer matrix includes
    // the effect of any headspace.
    const tm = this.calcTransferMatrix(mouthpiece, waveNumber, params);
    return boreState.applyTransferMatrix(tm);
  }
}

/**
 * Mouthpiece calculation for a fipple mouthpiece (recorders, whistles, NAF).
 * Models the window as a (short) tube with area equal to the window area
 * and flanged open end.
 */
export class SimpleFippleMouthpieceCalculator extends MouthpieceCalculator {
  /**
   * Calculate transfer matrix for fipple mouthpiece.
   */
  override calcTransferMatrix(
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    if (isPressureNode(mouthpiece)) {
      // Resort to default if this is not a flow-node mouthpiece.
      return super.calcTransferMatrix(mouthpiece, waveNumber, params);
    }

    const freq = params.calcFrequency(waveNumber);
    const Zwindow = this.calcZ(mouthpiece, freq, params);

    return new TransferMatrix(Complex.ONE, Zwindow, Complex.ZERO, Complex.ONE);
  }

  /**
   * Calculate state vector for fipple mouthpiece.
   */
  override calcStateVector(
    boreState: StateVector,
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    let sv = new StateVector(boreState.getP(), boreState.getU());

    const headspace = this.getHeadspace(mouthpiece);
    if (headspace.length > 0) {
      const headspaceState = this.calcHeadspaceTransmission(
        headspace,
        waveNumber,
        params
      );

      // Assume the mouthpiece sees the bore impedance in parallel with
      // the headspace impedance.
      sv = sv.parallel(headspaceState);
    }

    const tm = this.calcTransferMatrix(mouthpiece, waveNumber, params);
    return sv.applyTransferMatrix(tm);
  }

  /**
   * Calculate the impedance of the whistle window at specified frequency.
   * Reactance modeled from measurements of real whistles.
   *
   * @param mouthpiece Mouthpiece description
   * @param freq Frequency in Hz
   * @param params Physical parameters
   * @returns Complex impedance of whistle window
   */
  calcZ(
    mouthpiece: Mouthpiece,
    freq: number,
    params: PhysicalParameters
  ): Complex {
    if (!mouthpiece.fipple) {
      throw new Error("Fipple not defined for mouthpiece");
    }

    const fipple = mouthpiece.fipple;
    const effSize = Math.sqrt(fipple.windowLength * fipple.windowWidth);

    // Model for use in absence of blade height measurement
    let windowHeight: number;
    if (fipple.windowHeight !== undefined) {
      windowHeight = fipple.windowHeight;
    } else if (fipple.windwayHeight !== undefined) {
      windowHeight = fipple.windwayHeight;
    } else {
      windowHeight = 0.001; // Default to 1 mm
    }

    const Xw =
      (params.getRho() * freq) / effSize * (4.3 + (2.87 * windowHeight) / effSize);

    // Resistance modeled as radiation resistance from end of bore,
    // plus short cylindrical tube with same area as window.
    const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
    const Rw =
      Tube.calcR(freq, radius, params) +
      (params.getRho() * 0.0184 * Math.sqrt(freq) * windowHeight) /
        (effSize * effSize * effSize);

    return new Complex(Rw, Xw);
  }

  /**
   * Get headspace sections from mouthpiece (if any).
   * For now, returns empty array - headspace would need to be added to model.
   */
  protected getHeadspace(mouthpiece: Mouthpiece): BoreSection[] {
    // Headspace is not currently modeled in the instrument interface.
    // Would be bore sections above the splitting edge.
    return [];
  }

  /**
   * Calculate a state vector for the headspace, assuming it is long enough
   * to act as a duct with a closed upper end.
   */
  protected calcHeadspaceTransmission(
    headspace: BoreSection[],
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    // Start with closed end
    let headspaceState = StateVector.ClosedEnd();

    for (const section of headspace) {
      const tm = Tube.calcConeMatrix(
        waveNumber,
        section.length,
        section.rightRadius,
        section.leftRadius,
        params
      );
      headspaceState = headspaceState.applyTransferMatrix(tm);
    }

    return headspaceState;
  }

  /**
   * Calculate a state vector for the headspace, assuming it is small enough
   * to act only as an acoustic compliance.
   */
  protected calcHeadspaceCompliance(
    headspace: BoreSection[],
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    const freq = params.calcFrequency(waveNumber);
    const compliance =
      this.calcHeadspaceVolume(headspace) /
      (params.getGamma() * params.getPressure() * 1.0e3);
    return new StateVector(Complex.ONE, new Complex(0.0, 2.0 * Math.PI * freq * compliance));
  }

  /**
   * Calculate total volume of headspace sections.
   */
  protected calcHeadspaceVolume(headspace: BoreSection[]): number {
    let volume = 0;
    for (const section of headspace) {
      volume += this.getSectionVolume(section);
    }
    return volume;
  }

  /**
   * Calculate volume of a conical section.
   */
  protected getSectionVolume(section: BoreSection): number {
    const leftRadius = section.leftRadius;
    const rightRadius = section.rightRadius;
    return (
      (Math.PI / 3.0) *
      section.length *
      (leftRadius * leftRadius +
        leftRadius * rightRadius +
        rightRadius * rightRadius)
    );
  }
}

/**
 * Mouthpiece calculation for a transverse flute embouchure hole.
 * Models the embouchure hole as a (short) tube with area equal to the
 * window area and flanged open end.
 */
export class FluteMouthpieceCalculator extends MouthpieceCalculator {
  /**
   * Calculate transfer matrix for embouchure hole.
   */
  override calcTransferMatrix(
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    if (isPressureNode(mouthpiece)) {
      // Resort to default if this is not a flow-node mouthpiece.
      return super.calcTransferMatrix(mouthpiece, waveNumber, params);
    }

    const freq = params.calcFrequency(waveNumber);
    const Zwindow = this.calcZ(mouthpiece, freq, params);

    return new TransferMatrix(Complex.ONE, Zwindow, Complex.ZERO, Complex.ONE);
  }

  /**
   * Calculate state vector for flute embouchure.
   */
  override calcStateVector(
    boreState: StateVector,
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    let sv = new StateVector(boreState.getP(), boreState.getU());

    const headspace = this.getHeadspace(mouthpiece);
    if (headspace.length > 0) {
      const headspaceState = this.calcHeadspaceTransmission(
        headspace,
        waveNumber,
        params
      );

      // Assume the mouthpiece sees the bore impedance in parallel with
      // the headspace impedance.
      sv = sv.parallel(headspaceState);
    }

    const tm = this.calcTransferMatrix(mouthpiece, waveNumber, params);
    return sv.applyTransferMatrix(tm);
  }

  /**
   * Calculate the impedance of the embouchure hole at specified frequency.
   * Prototype reactance model taken from empirical whistle model.
   *
   * @param mouthpiece Mouthpiece description
   * @param freq Frequency in Hz
   * @param params Physical parameters
   * @returns Complex impedance of embouchure hole
   */
  calcZ(
    mouthpiece: Mouthpiece,
    freq: number,
    params: PhysicalParameters
  ): Complex {
    if (!mouthpiece.embouchureHole) {
      throw new Error("Embouchure hole not defined for mouthpiece");
    }

    const emb = mouthpiece.embouchureHole;
    let holeWidth = emb.width;
    if (emb.airstreamLength < holeWidth) {
      holeWidth = emb.airstreamLength;
    }

    const effSize = Math.sqrt(holeWidth * emb.length);
    const windowHeight = emb.height;

    const Xw =
      (params.getRho() * freq) / effSize * (4.3 + (2.87 * windowHeight) / effSize);

    // Resistance modeled as radiation resistance from end of bore,
    // plus short cylindrical tube with same area as window.
    const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
    const Rw =
      Tube.calcR(freq, radius, params) +
      (params.getRho() * 0.0184 * Math.sqrt(freq) * windowHeight) /
        (effSize * effSize * effSize);

    return new Complex(Rw, Xw);
  }

  /**
   * Get headspace sections from mouthpiece (if any).
   */
  protected getHeadspace(mouthpiece: Mouthpiece): BoreSection[] {
    return [];
  }

  /**
   * Calculate a state vector for the headspace, assuming it is long enough
   * to act as a duct with a closed upper end.
   */
  protected calcHeadspaceTransmission(
    headspace: BoreSection[],
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    let headspaceState = StateVector.ClosedEnd();

    for (const section of headspace) {
      const tm = Tube.calcConeMatrix(
        waveNumber,
        section.length,
        section.rightRadius,
        section.leftRadius,
        params
      );
      headspaceState = headspaceState.applyTransferMatrix(tm);
    }

    return headspaceState;
  }

  /**
   * Calculate a state vector for the headspace as acoustic compliance.
   */
  protected calcHeadspaceCompliance(
    headspace: BoreSection[],
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector {
    const freq = params.calcFrequency(waveNumber);
    const compliance =
      this.calcHeadspaceVolume(headspace) /
      (params.getGamma() * params.getPressure() * 1.0e3);
    return new StateVector(Complex.ONE, new Complex(0.0, 2.0 * Math.PI * freq * compliance));
  }

  /**
   * Calculate total volume of headspace sections.
   */
  protected calcHeadspaceVolume(headspace: BoreSection[]): number {
    let volume = 0;
    for (const section of headspace) {
      volume += this.getSectionVolume(section);
    }
    return volume;
  }

  /**
   * Calculate volume of a conical section.
   */
  protected getSectionVolume(section: BoreSection): number {
    const leftRadius = section.leftRadius;
    const rightRadius = section.rightRadius;
    return (
      (Math.PI / 3.0) *
      section.length *
      (leftRadius * leftRadius +
        leftRadius * rightRadius +
        rightRadius * rightRadius)
    );
  }
}

/**
 * Default mouthpiece calculator instances.
 */
export const defaultMouthpieceCalculator = new MouthpieceCalculator();
export const defaultFippleCalculator = new SimpleFippleMouthpieceCalculator();
export const defaultFluteCalculator = new FluteMouthpieceCalculator();

/**
 * Get appropriate mouthpiece calculator for a mouthpiece type.
 */
export function getMouthpieceCalculator(mouthpiece: Mouthpiece): IMouthpieceCalculator {
  if (mouthpiece.fipple) {
    return defaultFippleCalculator;
  }
  if (mouthpiece.embouchureHole) {
    return defaultFluteCalculator;
  }
  return defaultMouthpieceCalculator;
}
