/**
 * Class to calculate transmission matrices for tubular waveguides.
 *
 * Provides transfer matrices for cylindrical and conical bore segments,
 * including viscous and thermal losses.
 *
 * Ported from com.wwidesigner.geometry.calculation.Tube
 *
 * References:
 *   Antoine Lefebvre and Jean Kergomard - Cone transfer matrix formulas
 *   F. Silva, Ph. Guillemain, J. Kergomard, B. Mallaroni, A. N. Norris,
 *       "Approximation formulae for the acoustic radiation impedance
 *       of a cylindrical pipe," arXiv:0811.3625v1, Nov 2008.
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

/** Minimum cone length to avoid numerical issues */
export const MINIMUM_CONE_LENGTH = 0.00001;

/**
 * Static methods for calculating transfer matrices of tubular waveguides.
 */
export class Tube {
  /**
   * Calculate the impedance of an unflanged open end of a real pipe.
   * From Silva et al., 2008.
   *
   * @param freq Fundamental frequency of the waveform
   * @param radius Radius of pipe, in metres
   * @param params Physical parameters
   * @returns Impedance as seen by pipe
   */
  static calcZload(
    freq: number,
    radius: number,
    params: PhysicalParameters
  ): Complex {
    const ka = params.calcWaveNumber(freq) * radius;
    const ka2 = ka * ka;
    const z0_denominator =
      params.calcZ0(radius) / (1.0 + ka2 * (0.1514 + 0.05221 * ka2));
    return new Complex(
      ka2 * (0.2499 + 0.05221 * ka2) * z0_denominator,
      ka * (0.6133 + 0.0381 * ka2) * z0_denominator
    );
  }

  /**
   * Calculate the radiation resistance at the open end of a real pipe,
   * assuming an infinite flange. From Silva et al., 2008.
   *
   * @param freq Fundamental frequency of the waveform
   * @param radius Radius of pipe, in metres
   * @param params Physical parameters
   * @returns Radiation resistance
   */
  static calcR(
    freq: number,
    radius: number,
    params: PhysicalParameters
  ): number {
    const ka = params.calcWaveNumber(freq) * radius;
    const ka2 = ka * ka;
    return (
      (params.calcZ0(radius) * ka2 * (0.5 + 0.1053 * ka2)) /
      (1.0 + ka2 * (0.358 + 0.1053 * ka2))
    );
  }

  /**
   * Calculate the impedance of an open end of a real pipe,
   * assuming an infinite flange. From Silva et al., 2008.
   *
   * @param freq Fundamental frequency of the waveform
   * @param radius Radius of pipe, in metres
   * @param params Physical parameters
   * @returns Impedance as seen by pipe
   */
  static calcZflanged(
    freq: number,
    radius: number,
    params: PhysicalParameters
  ): Complex {
    const ka = params.calcWaveNumber(freq) * radius;
    const ka2 = ka * ka;
    const z0_denominator =
      params.calcZ0(radius) / (1.0 + ka2 * (0.358 + 0.1053 * ka2));
    return new Complex(
      ka2 * (0.5 + 0.1053 * ka2) * z0_denominator,
      ka * (0.82159 + 0.059 * ka2) * z0_denominator
    );
  }

  /**
   * Calculate the impedance of an open end of a real pipe,
   * assuming an infinite flange. From Kergomard, Lefebvre, Scavone, 2015.
   *
   * @param freq Fundamental frequency of the waveform
   * @param radius Radius of pipe, in metres
   * @param params Physical parameters
   * @returns Impedance as seen by pipe
   */
  static calcZflangedKergomard(
    freq: number,
    radius: number,
    params: PhysicalParameters
  ): Complex {
    const ka = params.calcWaveNumber(freq) * radius;
    const ka2 = ka * ka;
    const numerator = new Complex(0.3216 * ka2, (0.82159 - 0.0368 * ka2) * ka);
    const denominator = new Complex(
      1 + 0.3701 * ka2,
      (1.0 - 0.0368 * ka2) * ka
    );
    return numerator.divide(denominator).multiply(params.calcZ0(radius));
  }

  /**
   * Calculate the transfer matrix of a cylinder.
   *
   * @param waveNumber 2*pi*f/c, in radians per metre
   * @param length Length of the cylinder, in metres
   * @param radius Radius of the cylinder, in metres
   * @param params Physical parameters
   * @returns Transfer matrix
   */
  static calcCylinderMatrix(
    waveNumber: number,
    length: number,
    radius: number,
    params: PhysicalParameters
  ): TransferMatrix {
    const Zc = params.calcZ0(radius);
    const epsilon =
      params.getAlphaConstant() / (radius * Math.sqrt(waveNumber));
    const gammaL = new Complex(epsilon, 1.0 + epsilon).multiply(
      waveNumber * length
    );
    const coshL = gammaL.cosh();
    const sinhL = gammaL.sinh();

    return new TransferMatrix(
      coshL,
      sinhL.multiply(Zc),
      sinhL.divide(Zc),
      coshL
    );
  }

  /**
   * Calculate the transfer matrix of a conical tube.
   * From Antoine Lefebvre and Jean Kergomard.
   *
   * @param waveNumber 2*pi*f/c, in radians per metre
   * @param length Length of the tube, in metres
   * @param sourceRadius Radius of source end of the tube, in metres
   * @param loadRadius Radius of load end of the tube, in metres
   * @param params Physical parameters
   * @returns Transfer matrix
   */
  static calcConeMatrix(
    waveNumber: number,
    length: number,
    sourceRadius: number,
    loadRadius: number,
    params: PhysicalParameters
  ): TransferMatrix {
    // If radii are equal, use cylinder formula
    if (sourceRadius === loadRadius) {
      return Tube.calcCylinderMatrix(waveNumber, length, sourceRadius, params);
    }

    // Mean complex wave vector along the whole cone, from Lefebvre and Kergomard
    const alpha_0 = params.getAlphaConstant() / Math.sqrt(waveNumber);
    let epsilon: number;

    if (Math.abs(loadRadius - sourceRadius) <= 0.00001 * sourceRadius) {
      // Use limiting value as loadRadius approaches sourceRadius
      epsilon = alpha_0 / loadRadius;
    } else {
      epsilon =
        (alpha_0 / (loadRadius - sourceRadius)) *
        Math.log(loadRadius / sourceRadius);
    }

    const mean = new Complex(1.0 + epsilon, -epsilon);
    let kMeanL: Complex;

    if (length >= MINIMUM_CONE_LENGTH) {
      kMeanL = mean.multiply(waveNumber * length);
    } else {
      // Limit how short the cone can be to avoid divide-by-zero
      kMeanL = mean.multiply(waveNumber * MINIMUM_CONE_LENGTH);
    }

    // Cotangents of theta_in and theta_out
    const cot_in = new Complex(
      (loadRadius - sourceRadius) / sourceRadius
    ).divide(kMeanL);
    const cot_out = new Complex(
      (loadRadius - sourceRadius) / loadRadius
    ).divide(kMeanL);

    // Sine and cosine of kMean * L
    const sin_kL = kMeanL.sin();
    const cos_kL = kMeanL.cos();

    const A = cos_kL
      .multiply(loadRadius / sourceRadius)
      .subtract(sin_kL.multiply(cot_in));

    const B = Complex.I.multiply(sin_kL).multiply(
      params.calcZ0(loadRadius) * (loadRadius / sourceRadius)
    );

    const C = Complex.I.multiply(
      loadRadius / (sourceRadius * params.calcZ0(sourceRadius))
    ).multiply(
      sin_kL
        .multiply(cot_out.multiply(cot_in).add(1.0))
        .add(cos_kL.multiply(cot_out.subtract(cot_in)))
    );

    const D = cos_kL
      .multiply(sourceRadius / loadRadius)
      .add(sin_kL.multiply(cot_out));

    return new TransferMatrix(A, B, C, D);
  }
}
