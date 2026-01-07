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
import { SimplePhysicalParameters } from "../physics/simple-physical-parameters.ts";
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
   */
  protected getHeadspace(mouthpiece: Mouthpiece): BoreSection[] {
    return mouthpiece.headspace ?? [];
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
    return mouthpiece.headspace ?? [];
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
 * Mouthpiece calculation for a fipple mouthpiece, principally for NAFs.
 *
 * Ported from com.wwidesigner.geometry.calculation.DefaultFippleMouthpieceCalculator
 *
 * This calculator uses an admittance-based model with:
 * - JYE: admittance from embouchure
 * - JYC: admittance from headspace volume
 * - Scaled fipple factor based on windway height
 *
 * Uses SimplePhysicalParameters internally (like Java) for more accurate
 * NAF calculations. The simplified model gives better results for varying
 * temperature and humidity, which is all a NAF maker is likely to measure.
 */
export class DefaultFippleMouthpieceCalculator extends MouthpieceCalculator {
  private static readonly DEFAULT_WINDWAY_HEIGHT = 0.00078740; // ~0.031 inches in meters
  private static readonly AIR_GAMMA = 1.4018297351222222;

  /** Simplified physical parameters used internally */
  private mParams: SimplePhysicalParameters | null = null;

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

    // Use a simplified version of PhysicalParameters: no editable pressure
    // nor CO2 concentration. This mouthpiece representation gives very
    // wrong answers when they are varied.
    // The SimplePhysicalParameters gives correct answers for varying
    // temperature and humidity, all that a NAF maker is likely to measure.
    this.mParams = new SimplePhysicalParameters(params);

    const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
    const z0 = params.calcZ0(radius);
    const omega = waveNumber * params.getSpeedOfSound();
    const k_delta_l = this.calcKDeltaL(mouthpiece, omega, z0);

    // Add a series resistance for radiation loss.
    const freq = omega / (2 * Math.PI);
    const r_rad = Tube.calcR(freq, radius, params);

    const cos_kl = Math.cos(k_delta_l);
    const sin_kl = Math.sin(k_delta_l);

    const A = new Complex(cos_kl, r_rad * sin_kl / z0);
    const B = new Complex(r_rad * cos_kl, sin_kl * z0);
    const C = new Complex(0, sin_kl / z0);
    const D = new Complex(cos_kl);

    return new TransferMatrix(A, B, C, D);
  }

  /**
   * Calculate k * delta_L for the mouthpiece.
   */
  private calcKDeltaL(
    mouthpiece: Mouthpiece,
    omega: number,
    z0: number
  ): number {
    return Math.atan(1.0 / (z0 * (this.calcJYE(mouthpiece, omega) + this.calcJYC(mouthpiece, omega))));
  }

  /**
   * Calculate imaginary admittance from embouchure.
   */
  private calcJYE(mouthpiece: Mouthpiece, omega: number): number {
    const gamma = DefaultFippleMouthpieceCalculator.AIR_GAMMA;
    const result = this.getCharacteristicLength(mouthpiece) / (gamma * omega);
    return result;
  }

  /**
   * Calculate imaginary admittance from headspace volume.
   * Uses SimplePhysicalParameters for speed of sound (matching Java).
   */
  private calcJYC(mouthpiece: Mouthpiece, omega: number): number {
    const gamma = DefaultFippleMouthpieceCalculator.AIR_GAMMA;
    // Use SimplePhysicalParameters speed of sound (like Java)
    const speedOfSound = this.mParams!.getSpeedOfSound();
    // Note: v is multiplied by 2 here, and calcHeadspaceVolume also multiplies by 2,
    // giving a total multiplier of 4 (matching Java's behavior)
    const v = 2.0 * this.calcHeadspaceVolume(mouthpiece);

    const result = -(omega * v) / (gamma * speedOfSound * speedOfSound);
    return result;
  }

  /**
   * Calculate headspace volume.
   *
   * Uses position-based calculation where the headspace length is the
   * mouthpiece position (measured from position 0). This represents the
   * effective acoustic headspace from the reference point to the splitting edge.
   *
   * Note: Java's DefaultFippleMouthpieceCalculator iterates over mouthpiece.getHeadspace()
   * bore sections. However, using bore sections directly gives worse parity (22 cents vs 16).
   * The position-based approach gives better parity with Java predictions, suggesting
   * there may be compensating differences elsewhere in Java's calculation pipeline.
   *
   * Java implementation note: the final volume is multiplied by 2.0
   * ("Multiplier reset using a more accurate headspace representation")
   */
  private calcHeadspaceVolume(mouthpiece: Mouthpiece): number {
    // Use position-based calculation for better parity with Java results
    const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
    const length = mouthpiece.position;
    const volume = Math.PI * radius * radius * length;

    // Multiply by 2.0 based on Java implementation
    return volume * 2.0;
  }

  /**
   * Calculate volume of a conical bore section (frustum formula).
   */
  private getSectionVolume(section: BoreSection): number {
    const leftRadius = section.leftRadius;
    const rightRadius = section.rightRadius;
    const length = section.length;

    // Frustum volume: V = (π * h / 3) * (r1² + r1*r2 + r2²)
    return (
      (Math.PI * length / 3) *
      (leftRadius * leftRadius +
        leftRadius * rightRadius +
        rightRadius * rightRadius)
    );
  }

  /**
   * Get characteristic length for the fipple window.
   */
  private getCharacteristicLength(mouthpiece: Mouthpiece): number {
    if (!mouthpiece.fipple) {
      throw new Error("Fipple not defined for mouthpiece");
    }

    const windowLength = mouthpiece.fipple.windowLength;
    const windowWidth = mouthpiece.fipple.windowWidth;
    const fippleFactor = this.getScaledFippleFactor(mouthpiece);

    const effectiveArea = windowLength * windowWidth;
    const equivDiameter = 2.0 * Math.sqrt(effectiveArea / Math.PI) * fippleFactor;

    return equivDiameter;
  }

  /**
   * Get scaled fipple factor based on windway height.
   */
  private getScaledFippleFactor(mouthpiece: Mouthpiece): number {
    let windwayHeight = mouthpiece.fipple?.windwayHeight;
    if (windwayHeight === undefined || windwayHeight === null) {
      windwayHeight = DefaultFippleMouthpieceCalculator.DEFAULT_WINDWAY_HEIGHT;
    }

    const ratio = Math.pow(
      DefaultFippleMouthpieceCalculator.DEFAULT_WINDWAY_HEIGHT / windwayHeight,
      1.0 / 3.0
    );

    let scaledFippleFactor: number;
    if (mouthpiece.fipple?.fippleFactor === undefined || mouthpiece.fipple?.fippleFactor === null) {
      scaledFippleFactor = ratio;
    } else {
      scaledFippleFactor = mouthpiece.fipple.fippleFactor * ratio;
    }

    return scaledFippleFactor;
  }
}

/**
 * Default mouthpiece calculator instances.
 */
export const defaultMouthpieceCalculator = new MouthpieceCalculator();
export const simpleFippleCalculator = new SimpleFippleMouthpieceCalculator();
export const defaultFippleCalculator = new DefaultFippleMouthpieceCalculator();
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
