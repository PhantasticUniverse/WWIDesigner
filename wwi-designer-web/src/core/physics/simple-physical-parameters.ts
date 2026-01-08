/**
 * Simplified model of the physical properties of air.
 *
 * Ported from com.wwidesigner.util.SimplePhysicalParameters
 *
 * This simplified version only supports varying temperature and relative
 * humidity (fixed at 45%). It is used exclusively by DefaultFippleMouthpieceCalculator,
 * the calculator used for NAFs.
 *
 * Key differences from full PhysicalParameters:
 * - Uses Yang Yili formula for speed of sound
 * - Fixed 45% relative humidity
 * - Linear approximations for other properties based on temperature delta
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { PhysicalParameters } from "./physical-parameters.ts";

/**
 * Simplified physical parameters used by DefaultFippleMouthpieceCalculator.
 *
 * Uses Yang Yili formula for speed of sound calculation.
 * Fixed 45% relative humidity.
 */
export class SimplePhysicalParameters {
  /** Fixed relative humidity (45%) */
  private static readonly RELATIVE_HUMIDITY = 0.45;

  /** Reference temperature for linear approximations (26.85°C) */
  private static readonly REFERENCE_TEMP = 26.85;

  private mTemperature: number; // Temperature in Celsius
  private mRho: number; // Air density
  private mEta: number; // Thermal conductivity factor
  private mMu: number; // Dynamic viscosity
  private mGamma: number; // Ratio of specific heats
  private mNu: number; // Prandtl number (sqrt)
  private mSpeedOfSound: number; // Speed of sound in m/s
  private mWaveNumber1: number; // Wave number at 1 Hz
  private mAlphaConstant: number; // Alpha constant for wave number correction

  /**
   * Create with default temperature (72°F / 22.22°C)
   */
  constructor();
  /**
   * Create from existing PhysicalParameters (extracts temperature)
   */
  constructor(params: PhysicalParameters);
  /**
   * Create with specified temperature in Celsius
   */
  constructor(temperatureCelsius: number);

  constructor(arg?: PhysicalParameters | number) {
    let tempCelsius: number;

    if (arg === undefined) {
      // Default: 72°F converted to Celsius
      tempCelsius = ((72.0 + 40) * 5) / 9 - 40; // ~22.22°C
    } else if (typeof arg === "number") {
      tempCelsius = arg;
    } else {
      // PhysicalParameters - extract temperature (already in Celsius)
      tempCelsius = arg.getTemperature();
    }

    this.mTemperature = tempCelsius;

    // Calculate speed of sound using Yang Yili formula
    this.mSpeedOfSound = this.calculateSpeedOfSound(
      tempCelsius,
      SimplePhysicalParameters.RELATIVE_HUMIDITY
    );

    const kelvin = tempCelsius + 273.15;
    const deltaT = tempCelsius - SimplePhysicalParameters.REFERENCE_TEMP;

    // Linear approximations from Java SimplePhysicalParameters
    this.mEta = 3.648e-6 * (1.0 + 0.0135003 * kelvin);
    this.mRho = 1.1769 * (1.0 - 0.00335 * deltaT);
    this.mMu = 1.846e-5 * (1.0 + 0.0025 * deltaT);
    this.mGamma = 1.4017 * (1.0 - 0.00002 * deltaT);
    this.mNu = 0.841 * (1.0 - 0.0002 * deltaT);

    this.mWaveNumber1 = (2.0 * Math.PI) / this.mSpeedOfSound;

    this.mAlphaConstant =
      Math.sqrt(this.mMu / (2.0 * this.mRho * this.mSpeedOfSound)) *
      (1.0 + (this.mGamma - 1.0) / this.mNu);
  }

  /**
   * Calculate speed of sound using Yang Yili formula.
   *
   * @param ambientTemp Temperature in Celsius
   * @param relativeHumidity Relative humidity (0-1)
   * @returns Speed of sound in m/s
   */
  private calculateSpeedOfSound(
    ambientTemp: number,
    relativeHumidity: number
  ): number {
    const p = 101000; // Standard pressure in Pa

    // Coefficients from Yang Yili publication
    const a = [
      331.5024, // a[0]
      0.603055, // a[1]
      -0.000528, // a[2]
      51.471935, // a[3]
      0.1495874, // a[4]
      -0.000782, // a[5]
      -1.82e-7, // a[6]
      3.73e-8, // a[7]
      -2.93e-10, // a[8]
      -85.20931, // a[9]
      -0.228525, // a[10]
      5.91e-5, // a[11]
      -2.835149, // a[12]
      -2.15e-13, // a[13]
      29.179762, // a[14]
      0.000486, // a[15]
    ];

    const T = ambientTemp + 273.15;
    const f =
      1.00062 + 0.0000000314 * p + 0.00000056 * ambientTemp * ambientTemp;
    const Psv = Math.exp(
      0.000012811805 * T * T - 0.019509874 * T + 34.04926034 - 6353.6311 / T
    );
    const Xw = (relativeHumidity * f * Psv) / p;

    let c = 331.45 - a[0]! - p * a[6]! - a[13]! * p * p;
    c = Math.sqrt(a[9]! * a[9]! + 4 * a[14]! * c);
    const Xc = (-a[9]! - c) / (2 * a[14]!);

    const speed =
      a[0]! +
      a[1]! * ambientTemp +
      a[2]! * ambientTemp * ambientTemp +
      (a[3]! + a[4]! * ambientTemp + a[5]! * ambientTemp * ambientTemp) * Xw +
      (a[6]! + a[7]! * ambientTemp + a[8]! * ambientTemp * ambientTemp) * p +
      (a[9]! + a[10]! * ambientTemp + a[11]! * ambientTemp * ambientTemp) * Xc +
      a[12]! * Xw * Xw +
      a[13]! * p * p +
      a[14]! * Xc * Xc +
      a[15]! * Xw * p * Xc;

    return speed;
  }

  /**
   * Get the speed of sound in m/s.
   */
  getSpeedOfSound(): number {
    return this.mSpeedOfSound;
  }

  /**
   * Get the air density in kg/m³.
   */
  getRho(): number {
    return this.mRho;
  }

  /**
   * Get the ratio of specific heats (gamma).
   */
  getGamma(): number {
    return this.mGamma;
  }

  /**
   * Get the temperature in Celsius.
   */
  getTemperature(): number {
    return this.mTemperature;
  }

  /**
   * Get the dynamic viscosity.
   */
  getEta(): number {
    return this.mEta;
  }

  /**
   * Get the Prandtl number (sqrt).
   */
  getNu(): number {
    return this.mNu;
  }

  /**
   * Get the alpha constant for wave number correction.
   */
  getAlphaConstant(): number {
    return this.mAlphaConstant;
  }

  /**
   * Calculate the wave impedance of a bore of nominal radius r.
   *
   * @param radius Bore radius in metres
   * @returns Wave impedance Z0
   */
  calcZ0(radius: number): number {
    return (this.mRho * this.mSpeedOfSound) / (Math.PI * radius * radius);
  }

  /**
   * Calculate wave number for a given frequency.
   *
   * @param freq Frequency in Hz
   * @returns Wave number in radians/metre
   */
  calcWaveNumber(freq: number): number {
    return freq * this.mWaveNumber1;
  }

  /**
   * Calculate frequency from wave number.
   *
   * @param waveNumber Wave number in radians/metre
   * @returns Frequency in Hz
   */
  calcFrequency(waveNumber: number): number {
    return waveNumber / this.mWaveNumber1;
  }
}
