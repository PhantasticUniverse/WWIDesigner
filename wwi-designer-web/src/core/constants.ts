/**
 * Global constants used across the project.
 *
 * Ported from Java: com.wwidesigner.util.Constants
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Temperature unit types
 */
export type TemperatureType = "C" | "F";

/**
 * Length unit types
 */
export type LengthType = "MM" | "CM" | "M" | "IN" | "FT";

/**
 * Get multiplier to convert from a length type to metres
 */
export function getMultiplierToMetres(lengthType: LengthType): number {
  switch (lengthType) {
    case "MM":
      return 0.001;
    case "CM":
      return 0.01;
    case "IN":
      return 0.0254;
    case "FT":
      return 0.3048;
    case "M":
    default:
      return 1.0;
  }
}

/**
 * Get multiplier to convert from metres to a length type
 */
export function getMultiplierFromMetres(lengthType: LengthType): number {
  switch (lengthType) {
    case "MM":
      return 1000.0;
    case "CM":
      return 100.0;
    case "IN":
      return 39.370078740157484;
    case "FT":
      return 3.2808398950131233;
    case "M":
    default:
      return 1.0;
  }
}

/**
 * Get decimal precision for display of a length type
 */
export function getDecimalPrecision(lengthType: LengthType): number {
  switch (lengthType) {
    case "MM":
      return 2;
    case "CM":
      return 3;
    case "IN":
      return 3;
    case "FT":
      return 4;
    case "M":
    default:
      return 5;
  }
}

/**
 * Physical constants for acoustic calculations
 */
export const PhysicalConstants = {
  /** Dry air pressure in Pascals */
  P_AIR: 101325.0,

  /** Vapour pressure in Pascals */
  P_V: 0.0,

  /** Gas constant for air */
  R_AIR: 287.05,

  /** Gas constant for water vapour */
  R_V: 461.495,

  /** The ratio of specific heats of air (gamma) */
  GAMMA: 1.4017,

  /** The thermal conductivity of air */
  KAPPA: 2.6118e-2,

  /** The specific heat of air at constant pressure */
  C_P: 1.0063e3,

  /** Prandtl number */
  NU: 0.8418,
} as const;

/**
 * Musical constants
 */
export const MusicalConstants = {
  /** Multiply frequency by CENT_FACTOR^r to raise by r cents */
  CENT_FACTOR: 1.00057778951,

  /** Number of cents in a semitone */
  CENTS_IN_SEMITONE: 100,

  /** Number of cents in an octave */
  CENTS_IN_OCTAVE: 1200,

  /** A is the 9th semitone (0-indexed from C) */
  A_SEMITONE: 9,

  /** Standard A440 reference frequency */
  A440: 440.0,
} as const;

/**
 * Mathematical constants
 */
export const MathConstants = {
  /** Natural log of 2 */
  LOG2: Math.log(2.0),

  /** Large double value for boundary conditions */
  BIG_DBL: 1e10,
} as const;

/**
 * Calculate cents difference between two frequencies
 * @param f1 First frequency
 * @param f2 Second frequency
 * @returns Difference in cents (positive if f2 > f1)
 */
export function cents(f1: number, f2: number): number {
  return (Math.log(f2 / f1) / MathConstants.LOG2) * MusicalConstants.CENTS_IN_OCTAVE;
}

/**
 * Calculate frequency from cents offset relative to a reference
 * @param referenceFreq Reference frequency
 * @param centsOffset Offset in cents
 * @returns New frequency
 */
export function frequencyFromCents(referenceFreq: number, centsOffset: number): number {
  return referenceFreq * Math.pow(MusicalConstants.CENT_FACTOR, centsOffset);
}

/**
 * Calculate speed of sound in air at a given temperature
 * @param temperatureC Temperature in Celsius
 * @returns Speed of sound in m/s
 */
export function speedOfSound(temperatureC: number): number {
  // Speed of sound at 0°C is approximately 331.3 m/s
  // It increases by about 0.6 m/s per degree C
  return 331.3 + 0.6 * temperatureC;
}

/**
 * Calculate air density at a given temperature
 * @param temperatureC Temperature in Celsius
 * @returns Air density in kg/m³
 */
export function airDensity(temperatureC: number): number {
  // Using ideal gas law: rho = P / (R * T)
  const temperatureK = temperatureC + 273.15;
  return PhysicalConstants.P_AIR / (PhysicalConstants.R_AIR * temperatureK);
}

/**
 * Calculate dynamic viscosity of air at a given temperature
 * Uses Sutherland's formula
 * @param temperatureC Temperature in Celsius
 * @returns Dynamic viscosity in Pa·s
 */
export function dynamicViscosity(temperatureC: number): number {
  const temperatureK = temperatureC + 273.15;
  const T0 = 291.15; // Reference temperature (18°C in Kelvin)
  const mu0 = 1.827e-5; // Reference viscosity at T0
  const S = 120.0; // Sutherland's constant for air

  return mu0 * Math.pow(temperatureK / T0, 1.5) * ((T0 + S) / (temperatureK + S));
}

/**
 * Calculate wave number for a given frequency and temperature
 * @param frequency Frequency in Hz
 * @param temperatureC Temperature in Celsius
 * @returns Wave number in rad/m
 */
export function waveNumber(frequency: number, temperatureC: number): number {
  const c = speedOfSound(temperatureC);
  return (2 * Math.PI * frequency) / c;
}

/**
 * Calculate characteristic impedance of air at a given temperature
 * @param temperatureC Temperature in Celsius
 * @returns Characteristic impedance in Pa·s/m
 */
export function characteristicImpedance(temperatureC: number): number {
  return airDensity(temperatureC) * speedOfSound(temperatureC);
}
