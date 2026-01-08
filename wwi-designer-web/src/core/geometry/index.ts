/**
 * Geometry calculators for acoustic modeling.
 *
 * This module provides transfer matrix calculations for
 * the geometric components of woodwind instruments.
 */

export { Tube, MINIMUM_CONE_LENGTH } from "./tube.ts";
export {
  type IBoreSectionCalculator,
  SimpleBoreSectionCalculator,
  defaultBoreSectionCalculator,
  createBoreSectionsFromPoints,
  calcBoreTransferMatrix,
} from "./bore-section-calculator.ts";
export {
  type IHoleCalculator,
  DefaultHoleCalculator,
  defaultHoleCalculator,
  NO_FINGER_ADJ,
  CAP_VOLUME_FINGER_ADJ,
  CAP_HEIGHT_FINGER_ADJ,
  DEFAULT_FINGER_ADJ,
  DEFAULT_HOLE_SIZE_MULT,
} from "./hole-calculator.ts";
export {
  type IMouthpieceCalculator,
  MouthpieceCalculator,
  SimpleFippleMouthpieceCalculator,
  FluteMouthpieceCalculator,
  defaultMouthpieceCalculator,
  defaultFippleCalculator,
  defaultFluteCalculator,
  getMouthpieceCalculator,
} from "./mouthpiece-calculator.ts";
export {
  type ITerminationCalculator,
  TerminationCalculator,
  UnflangedEndCalculator,
  FlangedEndCalculator,
  unflangedEndCalculator,
  flangedEndCalculator,
  getTerminationCalculator,
} from "./termination-calculator.ts";
