/**
 * Abstract class for generating instrument tuning predictions.
 *
 * Ported from com.wwidesigner.modelling.InstrumentTuner and
 * SimpleInstrumentTuner.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { PhysicalParameters } from "../physics/physical-parameters.ts";
import {
  type IInstrumentCalculator,
  DefaultInstrumentCalculator,
} from "./instrument-calculator.ts";
import { PlayingRange, NoPlayingRange } from "./playing-range.ts";
import type { Instrument } from "../../models/instrument.ts";
import type {
  Tuning,
  Fingering,
  Note,
} from "../../models/tuning.ts";
import { getTargetFrequency, copyFingering } from "../../models/tuning.ts";

/**
 * Interface for instrument tuners.
 */
export interface IInstrumentTuner {
  /**
   * Predict the nominal playing frequency that the instrument will produce
   * for a given target note.
   * @param fingering Target note and fingering
   * @returns Predicted nominal playing frequency, or null if not available
   */
  predictedFrequency(fingering: Fingering): number | null;

  /**
   * Predict the played note that the instrument will produce
   * for a given target note.
   * @param fingering Target note and fingering
   * @returns Note object with predicted frequencies
   */
  predictedNote(fingering: Fingering): Note;

  /**
   * Construct a predicted tuning for the instrument,
   * with a predicted note for each note in the target tuning.
   * @returns Predicted tuning
   */
  getPredictedTuning(): Tuning;
}

/**
 * Base class for instrument tuners.
 */
export abstract class InstrumentTuner implements IInstrumentTuner {
  protected instrument: Instrument;
  protected tuning: Tuning;
  protected calculator: IInstrumentCalculator;
  protected params: PhysicalParameters;

  constructor(
    instrument: Instrument,
    tuning: Tuning,
    calculator: IInstrumentCalculator,
    params: PhysicalParameters
  ) {
    this.instrument = instrument;
    this.tuning = tuning;
    this.calculator = calculator;
    this.params = params;
  }

  /**
   * For a given target note, extract a frequency to use as a target frequency.
   * If no frequency available, return 0.
   */
  protected getFrequencyTarget(note: Note | undefined): number {
    if (!note) return 0;

    if (note.frequency !== undefined) {
      return note.frequency;
    }
    if (note.frequencyMax !== undefined) {
      return note.frequencyMax;
    }
    if (note.frequencyMin !== undefined) {
      return note.frequencyMin;
    }
    return 0;
  }

  /**
   * Predict the nominal playing frequency that the instrument will produce
   * for a given target note.
   * @param fingering Target note and fingering
   * @returns Predicted nominal playing frequency, or null if not available
   */
  abstract predictedFrequency(fingering: Fingering): number | null;

  /**
   * Predict the played note that the instrument will produce
   * for a given target note.
   * @param fingering Target note and fingering
   * @returns Note object with predicted frequencies
   */
  predictedNote(fingering: Fingering): Note {
    const predNote: Note = {
      name: fingering.note?.name,
    };

    const predicted = this.predictedFrequency(fingering);
    if (predicted !== null) {
      predNote.frequency = predicted;
    }

    return predNote;
  }

  /**
   * Construct a predicted tuning for the instrument,
   * with a predicted note for each note in the target tuning.
   * @returns Predicted tuning
   */
  getPredictedTuning(): Tuning {
    const predicted: Tuning = {
      name: this.tuning.name,
      comment: this.tuning.comment,
      numberOfHoles: this.tuning.numberOfHoles,
      fingering: [],
    };

    for (const fingering of this.tuning.fingering) {
      const predFingering: Fingering = {
        openHole: [...fingering.openHole],
        openEnd: fingering.openEnd,
        note: this.predictedNote(fingering),
      };
      predicted.fingering.push(predFingering);
    }

    return predicted;
  }

  getInstrument(): Instrument {
    return this.instrument;
  }

  setInstrument(instrument: Instrument): void {
    this.instrument = instrument;
  }

  getTuning(): Tuning {
    return this.tuning;
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
  }

  getCalculator(): IInstrumentCalculator {
    return this.calculator;
  }

  setCalculator(calculator: IInstrumentCalculator): void {
    this.calculator = calculator;
  }

  getParams(): PhysicalParameters {
    return this.params;
  }

  setParams(params: PhysicalParameters): void {
    this.params = params;
  }
}

/**
 * InstrumentTuner for use with calculators that predict zero reactance
 * at the nominal playing frequency, rather than predicting minimum and
 * maximum frequencies of a playing range.
 */
export class SimpleInstrumentTuner extends InstrumentTuner {
  /**
   * Predict the nominal playing frequency that the instrument will produce
   * for a given target note.
   * @param fingering Target note and fingering
   * @returns Predicted nominal playing frequency, or null if not available
   */
  predictedFrequency(fingering: Fingering): number | null {
    const targetFreq = this.getFrequencyTarget(fingering.note);
    if (targetFreq === 0) {
      return null;
    }

    const range = new PlayingRange(this.calculator, fingering);
    try {
      return range.findXZero(targetFreq);
    } catch (e) {
      if (e instanceof NoPlayingRange) {
        return null;
      }
      throw e;
    }
  }
}

/**
 * Result of tuning comparison for a single fingering.
 */
export interface TuningResult {
  /** Note name */
  name: string;
  /** Target frequency in Hz */
  targetFrequency: number | null;
  /** Predicted frequency in Hz */
  predictedFrequency: number | null;
  /** Deviation in cents (positive = sharp, negative = flat) */
  deviationCents: number | null;
  /** Fingering pattern */
  fingering: Fingering;
}

/**
 * Calculate the deviation in cents between two frequencies.
 * @param target Target frequency
 * @param actual Actual frequency
 * @returns Deviation in cents (positive if actual > target)
 */
export function calcCents(target: number, actual: number): number {
  return 1200 * Math.log2(actual / target);
}

/**
 * Compare target tuning with predicted tuning.
 * @param target Target tuning
 * @param predicted Predicted tuning
 * @returns Array of tuning results
 */
export function compareTunings(target: Tuning, predicted: Tuning): TuningResult[] {
  const results: TuningResult[] = [];

  for (let i = 0; i < target.fingering.length; i++) {
    const targetFingering = target.fingering[i]!;
    const predictedFingering = predicted.fingering[i];

    const targetFreq = targetFingering.note
      ? getTargetFrequency(targetFingering.note)
      : null;
    const predictedFreq = predictedFingering?.note?.frequency ?? null;

    let deviationCents: number | null = null;
    if (targetFreq !== null && predictedFreq !== null) {
      deviationCents = calcCents(targetFreq, predictedFreq);
    }

    results.push({
      name: targetFingering.note?.name ?? `Note ${i + 1}`,
      targetFrequency: targetFreq,
      predictedFrequency: predictedFreq,
      deviationCents,
      fingering: copyFingering(targetFingering),
    });
  }

  return results;
}

/**
 * Calculate tuning statistics from comparison results.
 */
export interface TuningStats {
  /** Number of notes with valid predictions */
  validCount: number;
  /** Mean deviation in cents */
  meanCents: number;
  /** Standard deviation in cents */
  stdDevCents: number;
  /** Maximum deviation in cents (absolute value) */
  maxAbsCents: number;
  /** RMS error in cents */
  rmsCents: number;
}

/**
 * Calculate statistics from tuning results.
 */
export function calcTuningStats(results: TuningResult[]): TuningStats {
  const validResults = results.filter((r) => r.deviationCents !== null);
  const validCount = validResults.length;

  if (validCount === 0) {
    return {
      validCount: 0,
      meanCents: 0,
      stdDevCents: 0,
      maxAbsCents: 0,
      rmsCents: 0,
    };
  }

  const cents = validResults.map((r) => r.deviationCents!);
  const meanCents = cents.reduce((a, b) => a + b, 0) / validCount;

  const variance =
    cents.reduce((sum, c) => sum + (c - meanCents) ** 2, 0) / validCount;
  const stdDevCents = Math.sqrt(variance);

  const maxAbsCents = Math.max(...cents.map(Math.abs));

  const rmsCents = Math.sqrt(
    cents.reduce((sum, c) => sum + c * c, 0) / validCount
  );

  return {
    validCount,
    meanCents,
    stdDevCents,
    maxAbsCents,
    rmsCents,
  };
}

/**
 * Create an instrument tuner with default settings.
 */
export function createInstrumentTuner(
  instrument: Instrument,
  tuning: Tuning,
  params?: PhysicalParameters
): SimpleInstrumentTuner {
  const physicalParams = params ?? new PhysicalParameters();
  const calculator = new DefaultInstrumentCalculator(instrument, physicalParams);
  return new SimpleInstrumentTuner(instrument, tuning, calculator, physicalParams);
}

/**
 * InstrumentTuner for calculators that predict minimum and maximum
 * frequencies of a playing range. Predicts nominal frequency from
 * a nominal playing pattern of an instrument (how the player would
 * expect to play each note).
 *
 * For the nominal playing pattern, we use a linear change in blowing
 * velocity from just below fmax for the lowest note, to somewhat above
 * fmin for the highest note.
 *
 * cf. Fletcher and Rossing, The physics of musical instruments, 2nd ed.,
 * New York: Springer, 2010, section 16.10 and figure 16.23.
 *
 * Ported from com.wwidesigner.modelling.LinearVInstrumentTuner
 */
export class LinearVInstrumentTuner extends InstrumentTuner {
  // Target velocity of lowest note is less than velocity at fmax
  // by BottomFraction of the velocity difference between fmax and fmin.
  // Target velocity of highest note is less than velocity at fmax
  // by TopFraction of the velocity difference between fmax and fmin.
  protected bottomFraction: number;
  protected topFraction: number;

  // Blowing level lookup tables (from Java implementation)
  private static readonly BOTTOM_FRACTIONS = [
    0.35, 0.35, 0.30, 0.30, 0.25, 0.25, 0.20, 0.15, 0.10, 0.10, 0.05
  ];
  private static readonly TOP_FRACTIONS = [
    0.80, 0.85, 0.90, 0.95, 0.90, 0.95, 0.95, 0.95, 0.95, 0.99, 0.99
  ];

  protected fLow: number = 100.0;   // Lowest frequency in target range
  protected fHigh: number = 100.0;  // Highest frequency in target range
  // Linear equation parameters for calculating nominal velocity:
  // Vnom = slope * f + intercept
  protected slope: number = 0.0;
  protected intercept: number = 0.0;

  constructor(
    instrument: Instrument,
    tuning: Tuning,
    calculator: IInstrumentCalculator,
    params: PhysicalParameters,
    blowingLevel: number = 5
  ) {
    super(instrument, tuning, calculator, params);
    this.bottomFraction = LinearVInstrumentTuner.calcBottomFraction(blowingLevel);
    this.topFraction = LinearVInstrumentTuner.calcTopFraction(blowingLevel);

    if (tuning.fingering.length > 0) {
      this.setFingering(tuning.fingering);
    }
  }

  private static calcBottomFraction(blowingLevel: number): number {
    if (blowingLevel < 0) return 0.20; // BottomLo
    if (blowingLevel > 10) return 0.05; // BottomHi
    return LinearVInstrumentTuner.BOTTOM_FRACTIONS[blowingLevel] ?? 0.125;
  }

  private static calcTopFraction(blowingLevel: number): number {
    if (blowingLevel < 0) return 0.99; // TopLo
    if (blowingLevel > 10) return 0.30; // TopHi
    return LinearVInstrumentTuner.TOP_FRACTIONS[blowingLevel] ?? 0.65;
  }

  /**
   * Estimate the average velocity of air leaving the windway.
   * @param f Actual playing frequency, in Hz
   * @param windowLength Length of window, in meters
   * @param z Total impedance of whistle
   * @returns Estimated average air velocity leaving windway, in m/s
   */
  public static velocity(f: number, windowLength: number, zRatio: number): number {
    let strouhal = 0.26 - 0.037 * zRatio;
    // Within a playing range, z.imag should be negative,
    // so strouhal > 0.26, and generally strouhal < 0.5.
    // Clamp if we go too far outside limits of reasonableness.
    if (strouhal < 0.13) strouhal = 0.13;
    else if (strouhal > 0.75) strouhal = 0.75;

    return f * windowLength / strouhal;
  }

  /**
   * Estimate the expected ratio Im(z)/Re(z) for a given air velocity.
   * @param f Playing frequency, in Hz
   * @param windowLength Length of window, in meters
   * @param velocity Average air velocity leaving windway, in m/s
   * @returns Predicted ratio Im(z)/Re(z)
   */
  public static zRatio(f: number, windowLength: number, velocity: number): number {
    return (0.26 - f * windowLength / velocity) / 0.037;
  }

  /**
   * Set interpolation parameters to interpolate velocity for a specified
   * set of fingering targets. Following this call, use getNominalV() to
   * return interpolated velocity.
   */
  protected setFingering(fingeringTargets: Fingering[]): void {
    // Get lowest and highest target notes
    this.fLow = 100000.0;
    this.fHigh = 0.0;
    let vLow = 0.0;
    let vHigh = 0.0;

    const airstreamLength = this.instrument.mouthpiece.fipple?.windowLength ??
      this.instrument.mouthpiece.embouchureHole?.airstreamLength ?? 0.01;

    // Find lowest and highest target notes
    let noteLow: Fingering | null = null;
    let noteHigh: Fingering | null = null;

    for (const target of fingeringTargets) {
      if (target.note && (target.optimizationWeight ?? 1) > 0) {
        const freq = target.note.frequency ?? target.note.frequencyMax;
        if (freq !== undefined) {
          if (freq < this.fLow) {
            this.fLow = freq;
            noteLow = { ...target };
          }
          if (freq > this.fHigh) {
            this.fHigh = freq;
            noteHigh = { ...target };
          }
        }
      }
    }

    if (!noteLow || !noteHigh) {
      // No valid notes found
      return;
    }

    // Locate playing ranges at fLow and fHigh
    const range = new PlayingRange(this.calculator, noteLow);
    try {
      // Find playing range for lowest note
      const fmax = range.findXZero(this.fLow);
      const fmin = range.findFmin(fmax);
      const z_max = this.calculator.calcZ(fmax, noteLow);
      const z_min = this.calculator.calcZ(fmin, noteLow);
      const vMax = LinearVInstrumentTuner.velocity(fmax, airstreamLength, z_max.im / z_max.re);
      const vMin = LinearVInstrumentTuner.velocity(fmin, airstreamLength, z_min.im / z_min.re);
      vLow = vMax - this.bottomFraction * (vMax - vMin);
      // For velocity interpolation, use fmax as the nominal low frequency
      this.fLow = fmax;
    } catch {
      // Use predicted velocity at fLow set to fmax (Im(Z)=0)
      vLow = LinearVInstrumentTuner.velocity(this.fLow, airstreamLength, 0);
    }

    range.setFingering(noteHigh);
    try {
      // Find playing range for highest note
      const fmax = range.findXZero(this.fHigh);
      const fmin = range.findFmin(fmax);
      const z_max = this.calculator.calcZ(fmax, noteHigh);
      const z_min = this.calculator.calcZ(fmin, noteHigh);
      const vMax = LinearVInstrumentTuner.velocity(fmax, airstreamLength, z_max.im / z_max.re);
      const vMin = LinearVInstrumentTuner.velocity(fmin, airstreamLength, z_min.im / z_min.re);
      vHigh = vMax - this.topFraction * (vMax - vMin);
      // For velocity interpolation, use fmin as the nominal high frequency
      this.fHigh = fmin;
    } catch {
      // Use predicted velocity at fHigh set to fmax (Im(Z)=0)
      vHigh = LinearVInstrumentTuner.velocity(this.fHigh, airstreamLength, 0);
    }

    // Nominal velocity is a linear interpolation between (fLow,vLow) and (fHigh,vHigh)
    if (this.fHigh !== this.fLow) {
      this.slope = (vHigh - vLow) / (this.fHigh - this.fLow);
      this.intercept = vLow - this.slope * this.fLow;
    } else {
      this.slope = 0;
      this.intercept = vLow;
    }
  }

  /**
   * Following a call to setFingering(), return interpolated velocity.
   * @param f Frequency
   * @returns Nominal velocity at specified frequency
   */
  public getNominalV(f: number): number {
    return this.slope * f + this.intercept;
  }

  /**
   * Predict the nominal playing frequency.
   */
  predictedFrequency(fingering: Fingering): number | null {
    const targetNote = fingering.note;
    const target = this.getFrequencyTarget(targetNote);
    if (target === 0) return null;

    const range = new PlayingRange(this.calculator, fingering);
    try {
      const airstreamLength = this.instrument.mouthpiece.fipple?.windowLength ??
        this.instrument.mouthpiece.embouchureHole?.airstreamLength ?? 0.01;
      const zRatioTarget = LinearVInstrumentTuner.zRatio(target, airstreamLength, this.getNominalV(target));
      return range.findZRatio(target, zRatioTarget);
    } catch {
      return null;
    }
  }

  /**
   * Predict the played note with fmin, fmax, and nominal frequency.
   */
  predictedNote(fingering: Fingering): Note {
    const targetNote = fingering.note;
    const predNote: Note = {
      name: targetNote?.name,
    };

    const target = this.getFrequencyTarget(targetNote);
    if (target === 0) {
      // No target frequency - return note without prediction
      return predNote;
    }

    // Predict playing range
    const range = new PlayingRange(this.calculator, fingering);
    try {
      const fmax = range.findXZero(target);
      predNote.frequencyMax = fmax;
      const fmin = range.findFmin(fmax);
      predNote.frequencyMin = fmin;
    } catch {
      // Leave fmax and fmin unassigned
    }

    try {
      const airstreamLength = this.instrument.mouthpiece.fipple?.windowLength ??
        this.instrument.mouthpiece.embouchureHole?.airstreamLength ?? 0.01;
      const velocity = this.getNominalV(target);
      const zRatioTarget = LinearVInstrumentTuner.zRatio(target, airstreamLength, velocity);
      const fnom = range.findZRatio(target, zRatioTarget);
      predNote.frequency = fnom;
    } catch {
      // Leave fnom unassigned
    }

    return predNote;
  }

  override setTuning(tuning: Tuning): void {
    super.setTuning(tuning);
    if (tuning && tuning.fingering.length > 0) {
      this.setFingering(tuning.fingering);
    }
  }
}

/**
 * Create a LinearV instrument tuner.
 */
export function createLinearVTuner(
  instrument: Instrument,
  tuning: Tuning,
  params?: PhysicalParameters,
  blowingLevel: number = 5
): LinearVInstrumentTuner {
  const physicalParams = params ?? new PhysicalParameters();
  const calculator = new DefaultInstrumentCalculator(instrument, physicalParams);
  return new LinearVInstrumentTuner(instrument, tuning, calculator, physicalParams, blowingLevel);
}
