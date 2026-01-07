/**
 * Class to model the physical properties of air.
 *
 * Calculates temperature-dependent properties needed for acoustic modeling:
 * - Air density (rho)
 * - Dynamic viscosity (eta)
 * - Speed of sound
 * - Specific heat ratio (gamma)
 * - Thermal conductivity (kappa)
 * - Alpha constant for losses
 *
 * Ported from com.wwidesigner.util.PhysicalParameters
 *
 * References:
 *   P.T. Tsilingiris, "Thermophysical and transport properties of humid air
 *       at temperature range between 0 and 100 C",
 *       Energy Conversion and Management 49 (2008) p.1098-1110.
 *
 *   A. Picard, R.S. Davis, M. Glaser and K. Fujii,
 *       "Revised formula for the density of moist air (CIPM-2007)",
 *       Metrologia 45 (2008) p.149-155.
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

export type TemperatureType = "C" | "F";

// Physical constants
const R = 8.314472; // Universal gas constant J/mol K
const Ma0 = 28.960745; // Standard molar mass of CO2-free dry air, kg/kmol
const Mco2 = 44.01; // Standard molar mass of CO2
const Mo2 = 31.9988; // Standard molar mass of O2
const Mv = 18.01527; // Molar mass of water vapour, kg/kmol

/**
 * Physical parameters of air for acoustic calculations.
 */
export class PhysicalParameters {
  // Input properties
  private mTemperature: number; // Temperature, in Celsius
  private mPressure: number; // Air pressure, in kPa
  private m_xv: number; // Molar fraction of water vapour, in mol/mol
  private m_xCO2: number; // Molar fraction of CO2, in mol/mol
  private mHumidity: number; // Relative humidity, as % of saturation humidity

  // Calculated properties
  private mRho: number; // Air density, in kg/m^3
  private mEta: number; // Dynamic viscosity, in kg/(m.s)
  private mSpecificHeat: number; // Isobaric specific heat, in J/(kg.K)
  private mGamma: number; // Ratio of specific heats, cp/cv
  private mKappa: number; // Thermal conductivity, in W/(m.K)
  private mPrandtl: number; // Prandtl number
  private mSpeedOfSound: number; // c, in m/s
  private mAlphaConstant: number; // For loss calculations
  private mWaveNumber1: number; // Wave number at 1 Hz

  /**
   * Create physical parameters with default values (72°F, standard pressure).
   */
  constructor();
  /**
   * Create physical parameters with specified temperature.
   */
  constructor(temperature: number, tempType: TemperatureType);
  /**
   * Create physical parameters with full specification.
   */
  constructor(
    temperature: number,
    tempType: TemperatureType,
    pressure: number,
    relHumidity: number,
    xCO2: number
  );

  constructor(
    temperature?: number,
    tempType?: TemperatureType,
    pressure?: number,
    relHumidity?: number,
    xCO2?: number
  ) {
    // Initialize with zeros - will be set by setProperties
    this.mTemperature = 0;
    this.mPressure = 0;
    this.m_xv = 0;
    this.m_xCO2 = 0;
    this.mHumidity = 0;
    this.mRho = 0;
    this.mEta = 0;
    this.mSpecificHeat = 0;
    this.mGamma = 0;
    this.mKappa = 0;
    this.mPrandtl = 0;
    this.mSpeedOfSound = 0;
    this.mAlphaConstant = 0;
    this.mWaveNumber1 = 0;

    if (temperature === undefined) {
      // Default: 72°F, standard pressure, 45% humidity
      this.initFromTemperature(72.0, "F", 101.325, 45.0, 0.00039);
    } else if (pressure === undefined) {
      // Temperature only: use standard pressure, 45% humidity
      this.initFromTemperature(temperature, tempType!, 101.325, 45.0, 0.00039);
    } else {
      // Full specification
      this.initFromTemperature(
        temperature,
        tempType!,
        pressure,
        relHumidity!,
        xCO2!
      );
    }
  }

  private initFromTemperature(
    temperature: number,
    tempType: TemperatureType,
    pressure: number,
    relHumidity: number,
    xCO2: number
  ): void {
    let celsius: number;
    if (tempType === "F") {
      celsius = ((temperature + 40) * 5) / 9 - 40;
    } else {
      celsius = temperature;
    }
    this.setProperties(celsius, pressure, relHumidity, xCO2);
  }

  /**
   * Set the physical parameters of the air from specified properties.
   * @param temperature Air temperature, in Celsius
   * @param pressure Air pressure, in kPa
   * @param relHumidity Relative humidity, in percent of saturation humidity
   * @param xCO2 Molar fraction of CO2, in mol/mol
   */
  setProperties(
    temperature: number,
    pressure: number,
    relHumidity: number,
    xCO2: number
  ): void {
    this.mTemperature = temperature;
    this.mPressure = pressure;
    this.mHumidity = relHumidity;
    this.m_xCO2 = xCO2;

    const kelvin = 273.15 + this.mTemperature;
    const pascal = 1000.0 * pressure;

    // Enhancement factor, from CIPM 2007
    const enhancement =
      1.00062 + 3.14e-5 * pressure + 5.6e-7 * this.mTemperature * this.mTemperature;

    // Saturated vapour pressure, in kPa, from CIPM-2007
    const Psv =
      0.001 *
      Math.exp(
        1.2378847e-5 * kelvin * kelvin -
          1.9121316e-2 * kelvin +
          33.93711047 -
          6.3431645e3 / kelvin
      );

    // Molar fraction of water vapour, n_v/n_total, in mol/mol, using CIPM-2007
    this.m_xv = (0.01 * relHumidity * enhancement * Psv) / pressure;

    // Compressibility factor, from CIPM-2007
    const compressibility =
      1.0 -
      (pascal / kelvin) *
        (1.58123e-6 -
          2.9331e-8 * this.mTemperature +
          1.1043e-10 * this.mTemperature * this.mTemperature +
          (5.707e-6 - 2.051e-8 * this.mTemperature) * this.m_xv +
          (1.9898e-4 - 2.376e-6 * this.mTemperature) * this.m_xv * this.m_xv) +
      (pascal / kelvin) *
        (pascal / kelvin) *
        (1.83e-11 - 0.765e-8 * this.m_xv * this.m_xv);

    // Standard molar mass of dry air, in kg/kmol
    const Ma = Ma0 + (Mco2 - Mo2) * xCO2;

    // Standard molar mass of moist air, in kg/kmol
    const M = (1.0 - this.m_xv) * Ma + this.m_xv * Mv;

    // Specific gas constant of humid air, in J/(kg*K)
    const Ra = R / (0.001 * M);

    // Specific humidity, or mass fraction of water vapour, in kg(water)/kg(total)
    const qv = (this.m_xv * Mv) / M;

    // Mass fraction of CO2, in kg(CO2)/kg(total)
    const qco2 = (xCO2 * Mco2) / M;

    this.mRho = (pressure * 1e3) / (compressibility * Ra * kelvin);

    // Dynamic viscosity, in kg/(m.s) or Pa.s

    // Dynamic viscosity of dry air, using Sutherland's formula
    const etaAir = (1.4592e-6 * Math.pow(kelvin, 1.5)) / (kelvin + 109.1);

    // Dynamic viscosity of water vapour in air
    const etaVapour = 8.058131868e-6 + this.mTemperature * 4.000549451e-8;
    const etaRatio = Math.sqrt(etaAir / etaVapour);
    const humidityRatio = this.m_xv / (1.0 - this.m_xv);

    const phiAV =
      (0.5 * Math.pow(1.0 + etaRatio * Math.pow(Mv / Ma, 0.25), 2.0)) /
      Math.sqrt(2.0 * (1.0 + Ma / Mv));
    const phiVA =
      (0.5 * Math.pow(1.0 + Math.pow(Ma / Mv, 0.25) / etaRatio, 2.0)) /
      Math.sqrt(2.0 * (1.0 + Mv / Ma));

    this.mEta =
      etaAir / (1.0 + phiAV * humidityRatio) +
      (humidityRatio * etaVapour) / (humidityRatio + phiVA);

    // Isobaric specific heat, cp, in J/(kg.K)
    const cpAir =
      1032.0 +
      kelvin *
        (-0.284887 +
          kelvin *
            (0.7816818e-3 +
              kelvin * (-0.4970786e-6 + kelvin * 0.1077024e-9)));
    const cpVapour =
      1869.10989 +
      this.mTemperature * (-0.2578421578 + this.mTemperature * 1.941058941e-2);
    const cpCO2 =
      817.02 + this.mTemperature * (1.0562 - this.mTemperature * 6.67e-4);
    this.mSpecificHeat =
      cpAir * (1 - qv - qco2) + cpVapour * qv + cpCO2 * qco2;

    // Ratio of specific heats cp/cv
    this.mGamma = this.mSpecificHeat / (this.mSpecificHeat - Ra);

    // Thermal conductivity, in W/(m.K)
    const kappaAir = (2.334e-3 * Math.pow(kelvin, 1.5)) / (kelvin + 164.54);
    const kappaVapour =
      0.01761758242 +
      this.mTemperature *
        (5.558941059e-5 + this.mTemperature * 1.663336663e-7);
    this.mKappa =
      kappaAir / (1.0 + phiAV * humidityRatio) +
      (humidityRatio * kappaVapour) / (humidityRatio + phiVA);

    // Prandtl number
    this.mPrandtl = (this.mEta * this.mSpecificHeat) / this.mKappa;

    this.mSpeedOfSound = Math.sqrt(this.mGamma * compressibility * Ra * kelvin);

    this.mAlphaConstant =
      Math.sqrt(this.mEta / (2.0 * this.mRho * this.mSpeedOfSound)) *
      (1.0 + (this.mGamma - 1.0) / Math.sqrt(this.mPrandtl));

    this.mWaveNumber1 = (2.0 * Math.PI) / this.mSpeedOfSound;
  }

  /**
   * Compute the actual air pressure, in kPa, at specified elevation,
   * from the barometric formula.
   * @param barometricPressure Pressure shown on barometer, adjusted to sea-level
   * @param elevation Elevation in meters
   * @returns Absolute air pressure, in kPa
   */
  static pressureAt(barometricPressure: number, elevation: number): number {
    const xCO2 = 0.00039;
    const Ma = Ma0 + (Mco2 - Mo2) * xCO2;
    const g = 9.80665; // m/s^2
    return (
      barometricPressure * Math.exp((-g * Ma * 0.001 * elevation) / (R * 288.15))
    );
  }

  /**
   * Compute the standard air pressure, in kPa, at specified elevation.
   * @param elevation Elevation in meters
   * @returns Standard air pressure, in kPa
   */
  static standardPressureAt(elevation: number): number {
    return PhysicalParameters.pressureAt(101.325, elevation);
  }

  /**
   * Calculate the wave impedance, in kg/(m^4.s), of a bore of nominal radius r.
   * @param radius Bore radius in meters
   */
  calcZ0(radius: number): number {
    return (this.mRho * this.mSpeedOfSound) / (Math.PI * radius * radius);
  }

  /**
   * Convert frequency to wave number.
   * @param freq Frequency in Hz
   * @returns Wave number in radians/meter
   */
  calcWaveNumber(freq: number): number {
    return freq * this.mWaveNumber1;
  }

  /**
   * Convert wave number to frequency.
   * @param waveNumber Wave number in radians/meter
   * @returns Frequency in Hz
   */
  calcFrequency(waveNumber: number): number {
    return waveNumber / this.mWaveNumber1;
  }

  /**
   * Compute epsilon, the adjustment factor for losses in a tube.
   * @param waveNumber Non-lossy wave number, in radians/meter
   * @param radius Tube radius, in m
   * @returns Dimensionless adjustment for calculating complex wave number
   */
  getEpsilon(waveNumber: number, radius: number): number {
    return this.mAlphaConstant / (radius * Math.sqrt(waveNumber));
  }

  /**
   * Compute the complex wave vector, allowing for losses.
   * @param waveNumber Non-lossy wave number, in radians/meter
   * @param radius Tube radius, in m
   * @returns Complex wave number: omega/v - j * alpha
   */
  getComplexWaveNumber(waveNumber: number, radius: number): Complex {
    const alpha = (1 / radius) * Math.sqrt(waveNumber) * this.mAlphaConstant;
    return Complex.I.multiply(waveNumber).add(new Complex(1, 1).multiply(alpha));
  }

  // Getters

  /** Get temperature in Celsius */
  getTemperature(): number {
    return this.mTemperature;
  }

  /** Get air pressure in kPa */
  getPressure(): number {
    return this.mPressure;
  }

  /** Get molar fraction of CO2 in mol/mol */
  get_xCO2(): number {
    return this.m_xCO2;
  }

  /** Get molar fraction of water vapour in mol/mol */
  get_xv(): number {
    return this.m_xv;
  }

  /** Get speed of sound in m/s */
  getSpeedOfSound(): number {
    return this.mSpeedOfSound;
  }

  /** Get alpha constant for loss calculations */
  getAlphaConstant(): number {
    return this.mAlphaConstant;
  }

  /** Get specific heat at constant pressure in J/(kg.K) */
  getSpecificHeat(): number {
    return this.mSpecificHeat;
  }

  /** Get specific heat at constant pressure (alias) */
  getC_p(): number {
    return this.mSpecificHeat;
  }

  /** Get specific heat ratio cp/cv */
  getSpecificHeatRatio(): number {
    return this.mGamma;
  }

  /** Get specific heat ratio (alias) */
  getGamma(): number {
    return this.mGamma;
  }

  /** Get dynamic viscosity in kg/(m.s) */
  getDynamicViscosity(): number {
    return this.mEta;
  }

  /** Get dynamic viscosity (alias) */
  getEta(): number {
    return this.mEta;
  }

  /** Get air density in kg/m^3 */
  getDensity(): number {
    return this.mRho;
  }

  /** Get air density (alias) */
  getRho(): number {
    return this.mRho;
  }

  /** Get thermal conductivity in W/(m.K) */
  getThermalConductivity(): number {
    return this.mKappa;
  }

  /** Get thermal conductivity (alias) */
  getKappa(): number {
    return this.mKappa;
  }

  /** Get Prandtl number */
  getPrandtl(): number {
    return this.mPrandtl;
  }

  /** Get relative humidity as percentage */
  getHumidity(): number {
    return this.mHumidity;
  }

  toString(): string {
    return (
      `PhysicalParameters:\n` +
      `  Temperature: ${this.mTemperature.toFixed(2)} °C\n` +
      `  Pressure: ${this.mPressure.toFixed(3)} kPa\n` +
      `  Speed of Sound: ${this.mSpeedOfSound.toFixed(3)} m/s\n` +
      `  Density: ${this.mRho.toFixed(4)} kg/m³\n` +
      `  Gamma: ${this.mGamma.toFixed(4)}\n` +
      `  Alpha Constant: ${this.mAlphaConstant.toExponential(3)}`
    );
  }
}
