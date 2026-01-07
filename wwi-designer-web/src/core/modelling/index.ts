/**
 * Modelling module for instrument calculations.
 *
 * This module provides calculators for determining the acoustic
 * properties of woodwind instruments.
 */

export {
  type IInstrumentCalculator,
  DefaultInstrumentCalculator,
  createInstrumentCalculator,
} from "./instrument-calculator.ts";

export {
  PlayingRange,
  NoPlayingRange,
} from "./playing-range.ts";

export {
  type IInstrumentTuner,
  InstrumentTuner,
  SimpleInstrumentTuner,
  type TuningResult,
  type TuningStats,
  calcCents,
  compareTunings,
  calcTuningStats,
  createInstrumentTuner,
} from "./instrument-tuner.ts";
