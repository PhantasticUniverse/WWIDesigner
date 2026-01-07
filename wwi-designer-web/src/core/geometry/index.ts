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
