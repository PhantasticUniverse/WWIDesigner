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
