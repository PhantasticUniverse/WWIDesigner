/**
 * Spectrum analysis classes for impedance and reflectance.
 *
 * Ported from com.wwidesigner.modelling.ImpedanceSpectrum and ReflectanceSpectrum.
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
import type { IInstrumentCalculator } from "./instrument-calculator.ts";
import type { Fingering } from "../../models/tuning.ts";

/**
 * A point in a spectrum - frequency and complex value.
 */
export interface SpectrumPoint {
  frequency: number;
  value: Complex;
}

/**
 * Representation of an impedance spectrum, along with information about
 * its extreme points.
 *
 * Ported from com.wwidesigner.modelling.ImpedanceSpectrum
 */
export class ImpedanceSpectrum {
  /** Holds impedance spectrum data */
  private spectrum: Map<number, Complex> = new Map();

  /** Holds frequencies of impedance minima */
  private minima: number[] = [];

  /** Holds frequencies of impedance maxima */
  private maxima: number[] = [];

  /**
   * Add or replace a point in the spectrum.
   */
  setDataPoint(frequency: number, impedance: Complex): void {
    this.spectrum.set(frequency, impedance);
  }

  /**
   * Calculate impedance over a frequency range and find minima/maxima.
   *
   * @param calculator The instrument calculator
   * @param freqStart Starting frequency in Hz
   * @param freqEnd Ending frequency in Hz
   * @param nfreq Number of frequency points
   * @param fingering The fingering to use
   */
  calcImpedance(
    calculator: IInstrumentCalculator,
    freqStart: number,
    freqEnd: number,
    nfreq: number,
    fingering: Fingering
  ): void {
    this.spectrum = new Map();
    this.minima = [];
    this.maxima = [];

    let prevZ = Complex.ZERO;
    let absPrevPrevZ = 0;
    let prevFreq = 0;
    const freqStep = (freqEnd - freqStart) / (nfreq - 1);

    for (let i = 0; i < nfreq; i++) {
      const freq = freqStart + i * freqStep;
      const zAc = calculator.calcZ(freq, fingering);
      const absZAc = Math.abs(zAc.im); // Using imaginary part, matching Java

      this.setDataPoint(freq, zAc);

      const absPrevZ = Math.abs(prevZ.im);

      if (i >= 2 && absPrevZ < absZAc && absPrevZ < absPrevPrevZ) {
        // We have found an impedance minimum
        this.minima.push(prevFreq);
      }

      if (i >= 2 && absPrevZ > absZAc && absPrevZ > absPrevPrevZ) {
        // We have found an impedance maximum
        this.maxima.push(prevFreq);
      }

      absPrevPrevZ = absPrevZ;
      prevZ = zAc;
      prevFreq = freq;
    }
  }

  /**
   * Get the frequencies of impedance minima.
   */
  getMinima(): number[] {
    return this.minima;
  }

  /**
   * Get the frequencies of impedance maxima.
   */
  getMaxima(): number[] {
    return this.maxima;
  }

  /**
   * Get the spectrum data.
   */
  getSpectrum(): Map<number, Complex> {
    return this.spectrum;
  }

  /**
   * Get spectrum as array of points sorted by frequency.
   */
  getSpectrumPoints(): SpectrumPoint[] {
    const points: SpectrumPoint[] = [];
    for (const [frequency, value] of this.spectrum) {
      points.push({ frequency, value });
    }
    return points.sort((a, b) => a.frequency - b.frequency);
  }

  /**
   * Find the minimum frequency closest to a target frequency.
   * @param frequency Target frequency
   * @returns Closest minimum frequency, or null if no minima
   */
  getClosestMinimumFrequency(frequency: number): number | null {
    let closestFreq: number | null = null;
    let deviation = Number.MAX_VALUE;

    for (const minVal of this.minima) {
      const thisDeviation = Math.abs(frequency - minVal);
      if (thisDeviation < deviation) {
        closestFreq = minVal;
        deviation = thisDeviation;
      }
    }

    return closestFreq;
  }

  /**
   * Find the maximum frequency closest to a target frequency.
   * @param frequency Target frequency
   * @returns Closest maximum frequency, or null if no maxima
   */
  getClosestMaximumFrequency(frequency: number): number | null {
    let closestFreq: number | null = null;
    let deviation = Number.MAX_VALUE;

    for (const maxVal of this.maxima) {
      const thisDeviation = Math.abs(frequency - maxVal);
      if (thisDeviation < deviation) {
        closestFreq = maxVal;
        deviation = thisDeviation;
      }
    }

    return closestFreq;
  }
}

/**
 * Plot types for reflectance spectrum.
 */
export enum ReflectancePlotType {
  PLOT_SQ_REFL_ANGLE_AND_MAGNITUDE = 0,
  PLOT_SQ_REFL_ANGLE_ONLY = 1,
  PLOT_REFL_MAGNITUDE_ONLY = 2,
}

/**
 * Representation of a reflectance spectrum, along with information about
 * its extreme points.
 *
 * Ported from com.wwidesigner.modelling.ReflectanceSpectrum
 */
export class ReflectanceSpectrum {
  /** Holds reflectance spectrum data */
  private spectrum: Map<number, Complex> = new Map();

  /** Holds frequencies of squared reflectance angle minima */
  private minima: number[] = [];

  /** Holds frequencies of squared reflectance angle maxima */
  private maxima: number[] = [];

  /** Holds frequencies of reflectance magnitude minima */
  private magnitudeMinima: number[] = [];

  /** Current fingering used for calculation */
  private currentFingering: Fingering | null = null;

  /**
   * Add or replace a point in the spectrum.
   */
  setDataPoint(frequency: number, value: Complex): void {
    this.spectrum.set(frequency, value);
  }

  /**
   * Calculate reflectance over a frequency range and find extrema.
   *
   * @param calculator The instrument calculator
   * @param freqStart Starting frequency in Hz
   * @param freqEnd Ending frequency in Hz
   * @param nfreq Number of frequency points
   * @param fingering The fingering to use
   */
  calcReflectance(
    calculator: IInstrumentCalculator,
    freqStart: number,
    freqEnd: number,
    nfreq: number,
    fingering: Fingering
  ): void {
    this.currentFingering = fingering;
    this.spectrum = new Map();
    this.minima = [];
    this.maxima = [];
    this.magnitudeMinima = [];

    let prevReflAngle = 0;
    let prevPrevReflAngle = 0;
    let prevFreq = 0;
    let prevRefMag = 0;
    let prevPrevRefMag = 0;
    const freqStep = (freqEnd - freqStart) / (nfreq - 1);

    for (let i = 0; i < nfreq; i++) {
      const freq = freqStart + i * freqStep;
      const reflectance = calculator.calcReflectionCoefficient(freq, fingering);

      this.setDataPoint(freq, reflectance);

      // Calculate squared reflectance angle
      let reflectAngle = reflectance.arg();
      reflectAngle *= reflectAngle;

      if (i >= 2 && prevReflAngle < reflectAngle && prevReflAngle < prevPrevReflAngle) {
        // We have found a squared angle minimum
        this.minima.push(prevFreq);
      }

      if (i >= 2 && prevReflAngle > reflectAngle && prevReflAngle > prevPrevReflAngle) {
        // We have found a squared angle maximum
        this.maxima.push(prevFreq);
      }

      // Collect reflectance magnitude minimum values
      const refMagnitude = reflectance.abs();
      if (i >= 2 && prevRefMag < refMagnitude && prevRefMag < prevPrevRefMag) {
        this.magnitudeMinima.push(prevFreq);
      }

      prevPrevRefMag = prevRefMag;
      prevRefMag = refMagnitude;
      prevPrevReflAngle = prevReflAngle;
      prevReflAngle = reflectAngle;
      prevFreq = freq;
    }
  }

  /**
   * Get the frequencies of squared angle minima.
   */
  getMinima(): number[] {
    return this.minima;
  }

  /**
   * Get the frequencies of squared angle maxima.
   */
  getMaxima(): number[] {
    return this.maxima;
  }

  /**
   * Get the frequencies of reflectance magnitude minima.
   */
  getMagnitudeMinima(): number[] {
    return this.magnitudeMinima;
  }

  /**
   * Get the spectrum data.
   */
  getSpectrum(): Map<number, Complex> {
    return this.spectrum;
  }

  /**
   * Get spectrum as array of points sorted by frequency.
   */
  getSpectrumPoints(): SpectrumPoint[] {
    const points: SpectrumPoint[] = [];
    for (const [frequency, value] of this.spectrum) {
      points.push({ frequency, value });
    }
    return points.sort((a, b) => a.frequency - b.frequency);
  }

  /**
   * Get the current fingering.
   */
  getCurrentFingering(): Fingering | null {
    return this.currentFingering;
  }

  /**
   * Find the minimum frequency closest to a target frequency.
   */
  getClosestMinimumFrequency(frequency: number): number | null {
    let closestFreq: number | null = null;
    let deviation = Number.MAX_VALUE;

    for (const minVal of this.minima) {
      const thisDeviation = Math.abs(frequency - minVal);
      if (thisDeviation < deviation) {
        closestFreq = minVal;
        deviation = thisDeviation;
      }
    }

    return closestFreq;
  }

  /**
   * Find the maximum frequency closest to a target frequency.
   */
  getClosestMaximumFrequency(frequency: number): number | null {
    let closestFreq: number | null = null;
    let deviation = Number.MAX_VALUE;

    for (const maxVal of this.maxima) {
      const thisDeviation = Math.abs(frequency - maxVal);
      if (thisDeviation < deviation) {
        closestFreq = maxVal;
        deviation = thisDeviation;
      }
    }

    return closestFreq;
  }
}

/**
 * Convenience function to calculate impedance spectrum for analysis.
 */
export function calculateImpedanceSpectrum(
  calculator: IInstrumentCalculator,
  fingering: Fingering,
  freqStart: number = 200,
  freqEnd: number = 2000,
  nfreq: number = 1000
): ImpedanceSpectrum {
  const spectrum = new ImpedanceSpectrum();
  spectrum.calcImpedance(calculator, freqStart, freqEnd, nfreq, fingering);
  return spectrum;
}

/**
 * Convenience function to calculate reflectance spectrum for analysis.
 */
export function calculateReflectanceSpectrum(
  calculator: IInstrumentCalculator,
  fingering: Fingering,
  freqStart: number = 200,
  freqEnd: number = 2000,
  nfreq: number = 1000
): ReflectanceSpectrum {
  const spectrum = new ReflectanceSpectrum();
  spectrum.calcReflectance(calculator, freqStart, freqEnd, nfreq, fingering);
  return spectrum;
}

/**
 * A point in a playing range spectrum with impedance and gain.
 */
export interface PlayingRangePoint {
  frequency: number;
  impedance: Complex;
  loopGain: number | null;
}

/**
 * Spectrum for analyzing playing range of an instrument.
 *
 * Includes impedance data (real and imaginary), loop gain estimation,
 * and detection of loop gain maxima. Used for analyzing playability
 * across a frequency range.
 *
 * Ported from com.wwidesigner.modelling.PlayingRangeSpectrum
 */
export class PlayingRangeSpectrum {
  /** Name of the note/fingering being analyzed */
  private name: string = "";

  /** Actual frequencies (min/max if available, nominal otherwise) */
  private actuals: number[] = [];

  /** Whether actuals contains min/max (true) or nominal (false) */
  private hasMinMax: boolean = false;

  /** Harmonics of target or nominal frequency */
  private harmonics: number[] = [];

  /** Holds impedance spectrum data */
  private impedance: Map<number, Complex> = new Map();

  /** Holds loop gain spectrum data */
  private gain: Map<number, number> = new Map();

  /** Holds loop gain maxima */
  private gainMaxima: Map<number, number> = new Map();

  // State for finding loop gain maxima
  private dataPointIndex: number = 0;
  private prevFreq: number = 0;
  private prevLoopGain: number = 0;
  private prevPrevLoopGain: number = 0;

  /**
   * Add or replace a point in the spectrum.
   */
  private setDataPoint(
    frequency: number,
    impedance: Complex,
    loopGain: number | null
  ): void {
    this.impedance.set(frequency, impedance);
    if (loopGain !== null) {
      this.gain.set(frequency, loopGain);
      this.findLoopGainMaximum(frequency, loopGain);
    }
  }

  /**
   * Check for loop gain maximum at current point.
   */
  private findLoopGainMaximum(frequency: number, loopGain: number): void {
    if (
      this.dataPointIndex >= 2 &&
      this.prevLoopGain > loopGain &&
      this.prevLoopGain > this.prevPrevLoopGain
    ) {
      // We have found a loop gain maximum
      this.gainMaxima.set(this.prevFreq, this.prevLoopGain);
    }

    this.dataPointIndex++;
    this.prevPrevLoopGain = this.prevLoopGain;
    this.prevLoopGain = loopGain;
    this.prevFreq = frequency;
  }

  /**
   * Calculate impedance and loop gain over a frequency range.
   *
   * @param calculator The instrument calculator
   * @param fingering The fingering to use
   * @param freqStart Starting frequency in Hz
   * @param freqEnd Ending frequency in Hz
   * @param nfreq Number of frequency points
   */
  calcSpectrum(
    calculator: IInstrumentCalculator,
    fingering: Fingering,
    freqStart: number,
    freqEnd: number,
    nfreq: number
  ): void {
    // Reset state
    this.dataPointIndex = 0;
    this.prevFreq = 0;
    this.prevLoopGain = 0;
    this.prevPrevLoopGain = 0;

    // Build name for this analysis
    const myNote = fingering.note;
    this.name = "Note";
    const holeString = fingering.openHole
      .map((o, i) => (o ? "O" : "X"))
      .join("");
    if (myNote?.name) {
      this.name += ` ${myNote.name}`;
      if (holeString) {
        this.name += ` (${holeString})`;
      }
    } else {
      this.name += ` ${holeString}`;
    }

    const instrName = calculator.getInstrument().name;
    if (instrName) {
      this.name += ` on ${instrName}`;
    }

    // Collect actual frequencies
    this.actuals = [];
    this.harmonics = [];
    this.hasMinMax = false;

    if (myNote?.frequencyMin !== undefined) {
      this.actuals.push(myNote.frequencyMin);
      this.hasMinMax = true;
    }
    if (myNote?.frequencyMax !== undefined) {
      this.actuals.push(myNote.frequencyMax);
      this.hasMinMax = true;
    }
    if (!this.hasMinMax && myNote?.frequency !== undefined) {
      this.actuals.push(myNote.frequency);
    }

    // Build list of harmonics
    if (myNote?.frequency !== undefined) {
      const freqTarget = myNote.frequency;
      let freqHarmonic = 2.0 * freqTarget;
      while (freqHarmonic <= freqEnd) {
        this.harmonics.push(freqHarmonic);
        freqHarmonic += freqTarget;
      }
    }

    // Reset collections
    this.impedance = new Map();
    this.gain = new Map();
    this.gainMaxima = new Map();

    const freqStep = (freqEnd - freqStart) / (nfreq - 1);
    for (let i = 0; i < nfreq; i++) {
      const freq = freqStart + i * freqStep;
      const zAc = calculator.calcZ(freq, fingering);
      const loopGain = calculator.calcGain(freq, zAc);
      this.setDataPoint(freq, zAc, loopGain);
    }
  }

  /**
   * Get the name of this analysis.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get actual frequencies (min/max or nominal).
   */
  getActuals(): number[] {
    return this.actuals;
  }

  /**
   * Check if actuals contains min/max frequencies.
   */
  hasMinMaxFrequencies(): boolean {
    return this.hasMinMax;
  }

  /**
   * Get harmonics of target frequency.
   */
  getHarmonics(): number[] {
    return this.harmonics;
  }

  /**
   * Get the impedance spectrum data.
   */
  getImpedance(): Map<number, Complex> {
    return this.impedance;
  }

  /**
   * Get the loop gain spectrum data.
   */
  getGain(): Map<number, number> {
    return this.gain;
  }

  /**
   * Get loop gain maxima.
   */
  getGainMaxima(): Map<number, number> {
    return this.gainMaxima;
  }

  /**
   * Get impedance ratio (Im/Re) at each frequency.
   */
  getImpedanceRatio(): Map<number, number> {
    const ratio = new Map<number, number>();
    for (const [freq, z] of this.impedance) {
      ratio.set(freq, z.im / z.re);
    }
    return ratio;
  }

  /**
   * Get all data as an array of points sorted by frequency.
   */
  getSpectrumPoints(): PlayingRangePoint[] {
    const points: PlayingRangePoint[] = [];
    for (const [frequency, impedance] of this.impedance) {
      points.push({
        frequency,
        impedance,
        loopGain: this.gain.get(frequency) ?? null,
      });
    }
    return points.sort((a, b) => a.frequency - b.frequency);
  }

  /**
   * Get data for plotting: frequencies, real impedance, imaginary impedance,
   * impedance ratio (Im/Re), and loop gain.
   */
  getPlotData(): {
    frequencies: number[];
    real: number[];
    imag: number[];
    ratio: number[];
    gain: number[];
    gainHigh: number[];  // gain >= 1
    gainLow: number[];   // gain < 1
  } {
    const points = this.getSpectrumPoints();
    return {
      frequencies: points.map((p) => p.frequency),
      real: points.map((p) => p.impedance.re),
      imag: points.map((p) => p.impedance.im),
      ratio: points.map((p) => p.impedance.im / p.impedance.re),
      gain: points.map((p) => p.loopGain ?? 0),
      gainHigh: points.map((p) => (p.loopGain !== null && p.loopGain >= 1 ? p.loopGain : NaN)),
      gainLow: points.map((p) => (p.loopGain !== null && p.loopGain < 1 ? p.loopGain : NaN)),
    };
  }
}

/**
 * Convenience function to calculate playing range spectrum.
 */
export function calculatePlayingRangeSpectrum(
  calculator: IInstrumentCalculator,
  fingering: Fingering,
  freqRangeBelow: number = 0.5,
  freqRangeAbove: number = 2.0,
  nfreq: number = 2000
): PlayingRangeSpectrum {
  // Determine target frequency
  let targetFreq: number;
  if (fingering.note?.frequency !== undefined) {
    targetFreq = fingering.note.frequency;
  } else if (fingering.note?.frequencyMax !== undefined) {
    targetFreq = fingering.note.frequencyMax;
  } else {
    targetFreq = 1000.0;
  }

  const freqStart = targetFreq * freqRangeBelow;
  const freqEnd = targetFreq * freqRangeAbove;

  const spectrum = new PlayingRangeSpectrum();
  spectrum.calcSpectrum(calculator, fingering, freqStart, freqEnd, nfreq);
  return spectrum;
}
