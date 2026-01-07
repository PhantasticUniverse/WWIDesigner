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
 * Factory function to create an evaluator of a given type.
 */
export function createEvaluator(
  type: "cents" | "frequency" | "reactance",
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
    default:
      return new CentDeviationEvaluator(calculator, tuner);
  }
}
