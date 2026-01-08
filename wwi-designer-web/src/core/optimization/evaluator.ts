/**
 * Evaluator interfaces and implementations for instrument optimization.
 *
 * Evaluators calculate the difference between target and predicted
 * instrument performance.
 *
 * Ported from com.wwidesigner.modelling.EvaluatorInterface and related classes.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Fingering } from "../../models/tuning.ts";
import type { IInstrumentCalculator } from "../modelling/instrument-calculator.ts";
import type { IInstrumentTuner } from "../modelling/instrument-tuner.ts";
import { SimpleInstrumentTuner } from "../modelling/instrument-tuner.ts";
import { calcCents } from "../modelling/instrument-tuner.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import type { Instrument } from "../../models/instrument.ts";

/**
 * Interface for evaluators that calculate error between target and predicted.
 */
export interface IEvaluator {
  /**
   * Calculate the difference between target and predicted performance
   * for each fingering.
   * @param fingeringTargets Array of fingerings with target notes
   * @returns Array of error values, one per fingering
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[];
}

/**
 * Base class for evaluators that use an instrument calculator and tuner.
 */
export abstract class BaseEvaluator implements IEvaluator {
  protected calculator: IInstrumentCalculator;
  protected tuner: IInstrumentTuner;

  constructor(
    calculator: IInstrumentCalculator,
    tuner?: IInstrumentTuner
  ) {
    this.calculator = calculator;
    this.tuner = tuner ?? this.createDefaultTuner();
  }

  protected abstract createDefaultTuner(): IInstrumentTuner;

  abstract calculateErrorVector(fingeringTargets: Fingering[]): number[];

  getCalculator(): IInstrumentCalculator {
    return this.calculator;
  }

  setCalculator(calculator: IInstrumentCalculator): void {
    this.calculator = calculator;
    // Update tuner with new calculator
    if (this.tuner) {
      this.tuner.setInstrument(calculator.getInstrument());
    }
  }

  getTuner(): IInstrumentTuner {
    return this.tuner;
  }

  setTuner(tuner: IInstrumentTuner): void {
    this.tuner = tuner;
  }
}

/**
 * Evaluator that calculates deviation from target frequencies in cents.
 *
 * Returns the deviation in cents for each fingering. Positive values
 * indicate the predicted frequency is sharp, negative indicates flat.
 */
export class CentDeviationEvaluator extends BaseEvaluator {
  /** Default error value when no prediction is available */
  private static readonly DEFAULT_ERROR = 1200.0;

  protected createDefaultTuner(): IInstrumentTuner {
    const instrument = this.calculator.getInstrument();
    const params = this.calculator.getParams();
    // Create a minimal tuning just for the tuner initialization
    const tuning = { name: "", numberOfHoles: 0, fingering: [] };
    return new SimpleInstrumentTuner(
      instrument,
      tuning,
      this.calculator,
      params
    );
  }

  /**
   * Calculate cent deviation for each fingering target.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    // Update tuner's tuning with the fingering targets
    this.tuner.setTuning({
      name: "Target",
      numberOfHoles: fingeringTargets[0]?.openHole.length ?? 0,
      fingering: fingeringTargets,
    });

    for (let i = 0; i < fingeringTargets.length; i++) {
      const target = fingeringTargets[i]!;
      let centDeviation = CentDeviationEvaluator.DEFAULT_ERROR;

      if (target.note?.frequency !== undefined) {
        try {
          const predicted = this.tuner.predictedFrequency(target);
          if (predicted !== null) {
            centDeviation = calcCents(target.note.frequency, predicted);
          }
        } catch {
          // Keep default error value
        }
      } else {
        // No target available - don't include in optimization
        centDeviation = 0.0;
      }

      errorValues[i] = centDeviation;
    }

    return errorValues;
  }
}

/**
 * Evaluator that calculates absolute deviation in Hz.
 *
 * Useful for some optimization scenarios where cent deviation
 * may not be the most appropriate metric.
 */
export class FrequencyDeviationEvaluator extends BaseEvaluator {
  protected createDefaultTuner(): IInstrumentTuner {
    const instrument = this.calculator.getInstrument();
    const params = this.calculator.getParams();
    const tuning = { name: "", numberOfHoles: 0, fingering: [] };
    return new SimpleInstrumentTuner(
      instrument,
      tuning,
      this.calculator,
      params
    );
  }

  /**
   * Calculate frequency deviation in Hz for each fingering.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    this.tuner.setTuning({
      name: "Target",
      numberOfHoles: fingeringTargets[0]?.openHole.length ?? 0,
      fingering: fingeringTargets,
    });

    for (let i = 0; i < fingeringTargets.length; i++) {
      const target = fingeringTargets[i]!;
      let deviation = 0.0;

      if (target.note?.frequency !== undefined) {
        try {
          const predicted = this.tuner.predictedFrequency(target);
          if (predicted !== null) {
            deviation = predicted - target.note.frequency;
          } else {
            // Large default error
            deviation = target.note.frequency;
          }
        } catch {
          deviation = target.note.frequency;
        }
      }

      errorValues[i] = deviation;
    }

    return errorValues;
  }
}

/**
 * Evaluator based on impedance reactance at target frequencies.
 *
 * Used for evaluating how close the impedance is to zero reactance
 * at the target frequencies.
 */
export class ReactanceEvaluator implements IEvaluator {
  private calculator: IInstrumentCalculator;

  constructor(calculator: IInstrumentCalculator) {
    this.calculator = calculator;
  }

  /**
   * Calculate impedance reactance at each target frequency.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    for (let i = 0; i < fingeringTargets.length; i++) {
      const target = fingeringTargets[i]!;
      let reactance = 0.0;

      if (target.note?.frequency !== undefined) {
        try {
          const Z = this.calculator.calcZ(target.note.frequency, target);
          // Normalize by characteristic impedance for comparison
          reactance = Z.im;
        } catch {
          reactance = 1e6; // Large error
        }
      }

      errorValues[i] = reactance;
    }

    return errorValues;
  }
}

/**
 * Evaluator that calculates deviation from target fmin (minimum frequency) in cents.
 *
 * Uses the tuner's predictedNote() to get the predicted playing range.
 * For notes without frequencyMin, returns 0 deviation (excluded from optimization).
 *
 * Ported from com.wwidesigner.modelling.FminEvaluator
 */
export class FminEvaluator extends BaseEvaluator {
  /** Default error value when prediction fails */
  private static readonly DEFAULT_ERROR = 400.0;

  protected createDefaultTuner(): IInstrumentTuner {
    const instrument = this.calculator.getInstrument();
    const params = this.calculator.getParams();
    const tuning = { name: "", numberOfHoles: 0, fingering: [] };
    return new SimpleInstrumentTuner(
      instrument,
      tuning,
      this.calculator,
      params
    );
  }

  /**
   * Calculate fmin deviation in cents for each fingering target.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    this.tuner.setTuning({
      name: "Target",
      numberOfHoles: fingeringTargets[0]?.openHole.length ?? 0,
      fingering: fingeringTargets,
    });

    for (let i = 0; i < fingeringTargets.length; i++) {
      const actual = fingeringTargets[i]!;
      let centDeviation = FminEvaluator.DEFAULT_ERROR;

      if (actual.note?.frequencyMin !== undefined) {
        try {
          const predicted = this.tuner.predictedNote(actual);
          if (predicted.frequencyMin !== undefined) {
            centDeviation = calcCents(actual.note.frequencyMin, predicted.frequencyMin);
          }
        } catch {
          // Keep default error value
        }
      } else {
        // No target available - don't include in optimization
        centDeviation = 0.0;
      }

      errorValues[i] = centDeviation;
    }

    return errorValues;
  }
}

/**
 * Evaluator that calculates deviation from target fmax (maximum frequency) in cents.
 *
 * Uses the tuner's predictedNote() to get the predicted playing range.
 * For notes without frequencyMax, returns 0 deviation (excluded from optimization).
 *
 * Ported from com.wwidesigner.modelling.FmaxEvaluator
 */
export class FmaxEvaluator extends BaseEvaluator {
  /** Default error value when prediction fails */
  private static readonly DEFAULT_ERROR = 400.0;

  protected createDefaultTuner(): IInstrumentTuner {
    const instrument = this.calculator.getInstrument();
    const params = this.calculator.getParams();
    const tuning = { name: "", numberOfHoles: 0, fingering: [] };
    return new SimpleInstrumentTuner(
      instrument,
      tuning,
      this.calculator,
      params
    );
  }

  /**
   * Calculate fmax deviation in cents for each fingering target.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    this.tuner.setTuning({
      name: "Target",
      numberOfHoles: fingeringTargets[0]?.openHole.length ?? 0,
      fingering: fingeringTargets,
    });

    for (let i = 0; i < fingeringTargets.length; i++) {
      const actual = fingeringTargets[i]!;
      let centDeviation = FmaxEvaluator.DEFAULT_ERROR;

      if (actual.note?.frequencyMax !== undefined) {
        try {
          const predicted = this.tuner.predictedNote(actual);
          if (predicted.frequencyMax !== undefined) {
            centDeviation = calcCents(actual.note.frequencyMax, predicted.frequencyMax);
          }
        } catch {
          // Keep default error value
        }
      } else {
        // No target available - don't include in optimization
        centDeviation = 0.0;
      }

      errorValues[i] = centDeviation;
    }

    return errorValues;
  }
}

/**
 * Evaluator that combines fmin, fmax, and nominal frequency deviations.
 *
 * Uses weighted combination:
 * - FMAX_WEIGHT = 4.0 (prioritizes fmax accuracy)
 * - FMIN_WEIGHT = 1.0
 * - FPLAYING_WEIGHT = 1.0 (used only when min/max not available)
 *
 * For notes with both fmax and fmin, returns sqrt(fmax² + fmin²) weighted.
 *
 * Ported from com.wwidesigner.modelling.FminmaxEvaluator
 */
export class FminmaxEvaluator extends BaseEvaluator {
  /** Default error value when prediction fails */
  private static readonly DEFAULT_ERROR = 1200.0;

  /** Weight for fmax deviation */
  private static readonly FMAX_WEIGHT = 4.0;
  /** Weight for fmin deviation */
  private static readonly FMIN_WEIGHT = 1.0;
  /** Weight for nominal frequency deviation (when no min/max available) */
  private static readonly FPLAYING_WEIGHT = 1.0;

  protected createDefaultTuner(): IInstrumentTuner {
    const instrument = this.calculator.getInstrument();
    const params = this.calculator.getParams();
    const tuning = { name: "", numberOfHoles: 0, fingering: [] };
    return new SimpleInstrumentTuner(
      instrument,
      tuning,
      this.calculator,
      params
    );
  }

  /**
   * Calculate weighted combined deviation for each fingering target.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorValues: number[] = new Array(fingeringTargets.length);

    this.tuner.setTuning({
      name: "Target",
      numberOfHoles: fingeringTargets[0]?.openHole.length ?? 0,
      fingering: fingeringTargets,
    });

    for (let i = 0; i < fingeringTargets.length; i++) {
      const actual = fingeringTargets[i]!;
      let centDeviation = FminmaxEvaluator.DEFAULT_ERROR;

      if (actual.note) {
        try {
          const predicted = this.tuner.predictedNote(actual);

          if (actual.note.frequencyMax !== undefined && predicted.frequencyMax !== undefined) {
            // Have fmax - calculate weighted deviation
            const fmaxDeviation = FminmaxEvaluator.FMAX_WEIGHT *
              calcCents(actual.note.frequencyMax, predicted.frequencyMax);

            if (actual.note.frequencyMin !== undefined && predicted.frequencyMin !== undefined) {
              // Have both fmax and fmin - combine with sqrt(sum of squares)
              const fminDeviation = FminmaxEvaluator.FMIN_WEIGHT *
                calcCents(actual.note.frequencyMin, predicted.frequencyMin);
              centDeviation = Math.sqrt(
                fmaxDeviation * fmaxDeviation + fminDeviation * fminDeviation
              );
            } else {
              centDeviation = fmaxDeviation;
            }
          } else if (actual.note.frequencyMin !== undefined && predicted.frequencyMin !== undefined) {
            // Only have fmin
            centDeviation = FminmaxEvaluator.FMIN_WEIGHT *
              calcCents(actual.note.frequencyMin, predicted.frequencyMin);
          } else if (actual.note.frequency !== undefined && predicted.frequency !== undefined) {
            // Fall back to nominal frequency
            centDeviation = FminmaxEvaluator.FPLAYING_WEIGHT *
              calcCents(actual.note.frequency, predicted.frequency);
          } else {
            // No target available - don't include in optimization
            centDeviation = 0.0;
          }
        } catch {
          // Keep default error value
        }
      } else {
        // No target available - don't include in optimization
        centDeviation = 0.0;
      }

      errorValues[i] = centDeviation;
    }

    return errorValues;
  }
}

/**
 * Evaluator for the bell note (lowest note with all holes closed).
 *
 * Returns the signed reactance at the target fmax (FmaxRatio * fnom),
 * only for notes with all holes closed.
 *
 * Ported from com.wwidesigner.modelling.BellNoteEvaluator
 */
export class BellNoteEvaluator implements IEvaluator {
  private calculator: IInstrumentCalculator;

  /** Aim for fmax slightly greater than nominal frequency */
  private static readonly FMAX_RATIO = 1.001;

  constructor(calculator: IInstrumentCalculator) {
    this.calculator = calculator;
  }

  /**
   * Check if all holes are closed for a fingering.
   */
  private static allHolesClosed(fingering: Fingering): boolean {
    for (const isOpen of fingering.openHole) {
      if (isOpen) {
        return false;
      }
    }
    return true;
  }

  /**
   * Calculate reactance at FmaxRatio * fnom for all-holes-closed notes.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorVector: number[] = new Array(fingeringTargets.length);

    for (let i = 0; i < fingeringTargets.length; i++) {
      const target = fingeringTargets[i]!;

      if (
        !BellNoteEvaluator.allHolesClosed(target) ||
        target.note?.frequency === undefined
      ) {
        errorVector[i] = 0.0;
      } else {
        const fmax = BellNoteEvaluator.FMAX_RATIO * target.note.frequency;
        const Z = this.calculator.calcZ(fmax, target);
        errorVector[i] = Z.im;
      }
    }

    return errorVector;
  }
}

/**
 * Evaluator based on the phase of the reflection coefficient.
 *
 * Returns the signed phase angle of the complex reflection coefficient
 * at the instrument's target frequency. Multiplies by -1 so that
 * reflectance of -1 has phase angle of zero.
 *
 * Ported from com.wwidesigner.modelling.ReflectionEvaluator
 */
export class ReflectionEvaluator implements IEvaluator {
  private calculator: IInstrumentCalculator;

  constructor(calculator: IInstrumentCalculator) {
    this.calculator = calculator;
  }

  /**
   * Calculate phase angle of reflection coefficient at target frequencies.
   */
  calculateErrorVector(fingeringTargets: Fingering[]): number[] {
    const errorVector: number[] = new Array(fingeringTargets.length);

    for (let i = 0; i < fingeringTargets.length; i++) {
      const target = fingeringTargets[i]!;

      if (target.note?.frequency === undefined) {
        errorVector[i] = 0.0;
      } else {
        // Calculate reflection coefficient
        const reflectionCoeff = this.calculator.calcReflectionCoefficient(
          target.note.frequency,
          target
        );
        // Multiply by -1, so that reflectance of -1 has phase angle of zero
        const negRefl = reflectionCoeff.neg();
        errorVector[i] = negRefl.arg();
      }
    }

    return errorVector;
  }
}

/**
 * Supported evaluator types.
 */
export type EvaluatorType =
  | "cents"
  | "frequency"
  | "reactance"
  | "fmin"
  | "fmax"
  | "fminmax"
  | "bellnote"
  | "reflection";

/**
 * Factory function to create an evaluator of a given type.
 */
export function createEvaluator(
  type: EvaluatorType,
  calculator: IInstrumentCalculator,
  tuner?: IInstrumentTuner
): IEvaluator {
  switch (type) {
    case "cents":
      return new CentDeviationEvaluator(calculator, tuner);
    case "frequency":
      return new FrequencyDeviationEvaluator(calculator, tuner);
    case "reactance":
      return new ReactanceEvaluator(calculator);
    case "fmin":
      return new FminEvaluator(calculator, tuner);
    case "fmax":
      return new FmaxEvaluator(calculator, tuner);
    case "fminmax":
      return new FminmaxEvaluator(calculator, tuner);
    case "bellnote":
      return new BellNoteEvaluator(calculator);
    case "reflection":
      return new ReflectionEvaluator(calculator);
    default:
      return new CentDeviationEvaluator(calculator, tuner);
  }
}
