/**
 * Factory for creating objective functions by name.
 * Maps sidebar selections to actual objective function instances.
 */

import type { IInstrumentCalculator } from "../modelling/instrument-calculator.ts";
import type { Tuning } from "../../models/tuning.ts";
import type { IEvaluator } from "./evaluator.ts";
import { BaseObjectiveFunction } from "./base-objective-function.ts";
import {
  LengthObjectiveFunction,
  HolePositionObjectiveFunction,
  HolePositionFromTopObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
  HoleFromTopObjectiveFunction,
  HoleGroupPositionObjectiveFunction,
  HoleGroupPositionFromTopObjectiveFunction,
  HoleGroupFromTopObjectiveFunction,
  HoleGroupObjectiveFunction,
  BoreDiameterFromBottomObjectiveFunction,
  BoreDiameterFromTopObjectiveFunction,
  BasicTaperObjectiveFunction,
  SingleTaperRatioObjectiveFunction,
  SingleTaperSimpleRatioObjectiveFunction,
  FippleFactorObjectiveFunction,
  WindowHeightObjectiveFunction,
  HoleAndTaperObjectiveFunction,
  HoleAndBoreDiameterFromTopObjectiveFunction,
  HoleAndBoreDiameterFromBottomObjectiveFunction,
  BetaObjectiveFunction,
  AirstreamLengthObjectiveFunction,
  NafHoleSizeObjectiveFunction,
  ReedCalibratorObjectiveFunction,
  StopperPositionObjectiveFunction,
  ConicalBoreObjectiveFunction,
  GlobalHolePositionObjectiveFunction,
  GlobalHoleObjectiveFunction,
  GlobalHoleAndTaperObjectiveFunction,
  GlobalHoleAndBoreDiameterFromBottomObjectiveFunction,
  GlobalHoleAndBoreDiameterFromTopObjectiveFunction,
  SingleTaperNoHoleGroupingObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopObjectiveFunction,
  SingleTaperHoleGroupObjectiveFunction,
  SingleTaperHoleGroupFromTopObjectiveFunction,
  HoleAndConicalBoreObjectiveFunction,
  HeadjointObjectiveFunction,
  HoleAndHeadjointObjectiveFunction,
  BorePositionObjectiveFunction,
  BoreSpacingFromTopObjectiveFunction,
  BoreFromBottomObjectiveFunction,
  HoleAndBoreFromBottomObjectiveFunction,
  HoleAndBorePositionObjectiveFunction,
  HoleAndBoreSpacingFromTopObjectiveFunction,
  GlobalBoreFromBottomObjectiveFunction,
  GlobalHoleAndBoreFromBottomObjectiveFunction,
  SingleTaperSimpleRatioHemiHeadObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction,
  SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction,
  FluteCalibrationObjectiveFunction,
  WhistleCalibrationObjectiveFunction,
} from "./hole-position-objective.ts";

/**
 * Mapping of objective function names to their display names and categories.
 */
export const OBJECTIVE_FUNCTION_INFO: Record<
  string,
  { displayName: string; category: string; description: string }
> = {
  // Fipple/Mouthpiece
  FippleFactorObjectiveFunction: {
    displayName: "Fipple factor",
    category: "Mouthpiece",
    description: "Optimize fipple factor for NAF instruments",
  },
  WindowHeightObjectiveFunction: {
    displayName: "Window height",
    category: "Mouthpiece",
    description: "Optimize fipple window height",
  },
  BetaObjectiveFunction: {
    displayName: "Beta (embouchure)",
    category: "Mouthpiece",
    description: "Optimize embouchure beta parameter",
  },
  AirstreamLengthObjectiveFunction: {
    displayName: "Airstream length",
    category: "Mouthpiece",
    description: "Optimize embouchure airstream length",
  },

  // Hole position & size
  HolePositionObjectiveFunction: {
    displayName: "Hole size & position",
    category: "Holes",
    description: "Optimize hole positions (bore length + spacings)",
  },
  HoleSizeObjectiveFunction: {
    displayName: "Hole size only",
    category: "Holes",
    description: "Optimize hole diameters only",
  },
  HoleObjectiveFunction: {
    displayName: "Hole position & size",
    category: "Holes",
    description: "Optimize both hole positions and sizes",
  },
  HolePositionFromTopObjectiveFunction: {
    displayName: "Hole position from top",
    category: "Holes",
    description: "Optimize hole positions measured from top",
  },
  HoleFromTopObjectiveFunction: {
    displayName: "Hole from top (position & size)",
    category: "Holes",
    description: "Optimize holes from top (position and size)",
  },
  NafHoleSizeObjectiveFunction: {
    displayName: "NAF hole size",
    category: "Holes",
    description: "Optimize hole sizes for NAF instruments",
  },

  // Grouped holes
  HoleGroupPositionObjectiveFunction: {
    displayName: "Grouped-hole position & size",
    category: "Grouped Holes",
    description: "Optimize hole groups with equal spacing",
  },
  HoleGroupPositionFromTopObjectiveFunction: {
    displayName: "Grouped-hole position from top",
    category: "Grouped Holes",
    description: "Optimize hole groups from top",
  },
  HoleGroupObjectiveFunction: {
    displayName: "Grouped-hole (position & size)",
    category: "Grouped Holes",
    description: "Optimize hole groups (position and size)",
  },
  HoleGroupFromTopObjectiveFunction: {
    displayName: "Grouped-hole from top",
    category: "Grouped Holes",
    description: "Optimize hole groups from top",
  },

  // Single taper
  SingleTaperNoHoleGroupingObjectiveFunction: {
    displayName: "Single taper, no hole grouping",
    category: "Single Taper",
    description: "Single taper bore with no hole grouping",
  },
  SingleTaperNoHoleGroupingFromTopObjectiveFunction: {
    displayName: "Single taper from top, no grouping",
    category: "Single Taper",
    description: "Single taper from top with no hole grouping",
  },
  SingleTaperHoleGroupObjectiveFunction: {
    displayName: "Single taper, grouped hole",
    category: "Single Taper",
    description: "Single taper bore with grouped holes",
  },
  SingleTaperHoleGroupFromTopObjectiveFunction: {
    displayName: "Single taper from top, grouped hole",
    category: "Single Taper",
    description: "Single taper from top with grouped holes",
  },
  SingleTaperRatioObjectiveFunction: {
    displayName: "Single taper ratio",
    category: "Single Taper",
    description: "Optimize taper ratio for single taper bore",
  },
  SingleTaperSimpleRatioObjectiveFunction: {
    displayName: "Single taper simple ratio",
    category: "Single Taper",
    description: "Simple taper ratio optimization",
  },

  // Hemi-head variants
  SingleTaperSimpleRatioHemiHeadObjectiveFunction: {
    displayName: "Single taper, hemi-head",
    category: "Hemi-Head",
    description: "Single taper with hemispherical bore head",
  },
  SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction: {
    displayName: "Single taper, hemi-head, no hole grouping",
    category: "Hemi-Head",
    description: "Hemi-head with no hole grouping",
  },
  SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction: {
    displayName: "Single taper, hemi-head, grouped hole",
    category: "Hemi-Head",
    description: "Hemi-head with grouped holes",
  },

  // Bore optimization
  LengthObjectiveFunction: {
    displayName: "Bore length only",
    category: "Bore",
    description: "Optimize bore length only",
  },
  BoreDiameterFromBottomObjectiveFunction: {
    displayName: "Bore diameter from bottom",
    category: "Bore",
    description: "Optimize bore diameters from bottom",
  },
  BoreDiameterFromTopObjectiveFunction: {
    displayName: "Bore diameter from top",
    category: "Bore",
    description: "Optimize bore diameters from top",
  },
  BasicTaperObjectiveFunction: {
    displayName: "Basic taper",
    category: "Bore",
    description: "Basic bore taper optimization",
  },
  ConicalBoreObjectiveFunction: {
    displayName: "Conical bore",
    category: "Bore",
    description: "Optimize conical bore profile",
  },
  BorePositionObjectiveFunction: {
    displayName: "Bore position",
    category: "Bore",
    description: "Optimize bore point positions",
  },
  BoreSpacingFromTopObjectiveFunction: {
    displayName: "Bore spacing from top",
    category: "Bore",
    description: "Optimize bore point spacing from top",
  },
  BoreFromBottomObjectiveFunction: {
    displayName: "Bore from bottom",
    category: "Bore",
    description: "Optimize bore profile from bottom",
  },

  // Combined hole + taper
  HoleAndTaperObjectiveFunction: {
    displayName: "Hole & taper",
    category: "Combined",
    description: "Optimize holes and bore taper together",
  },
  HoleAndBoreDiameterFromTopObjectiveFunction: {
    displayName: "Hole & bore diameter from top",
    category: "Combined",
    description: "Optimize holes and bore diameters from top",
  },
  HoleAndBoreDiameterFromBottomObjectiveFunction: {
    displayName: "Hole & bore diameter from bottom",
    category: "Combined",
    description: "Optimize holes and bore diameters from bottom",
  },
  HoleAndConicalBoreObjectiveFunction: {
    displayName: "Hole & conical bore",
    category: "Combined",
    description: "Optimize holes with conical bore",
  },
  HoleAndBoreFromBottomObjectiveFunction: {
    displayName: "Hole & bore from bottom",
    category: "Combined",
    description: "Optimize holes and bore from bottom",
  },
  HoleAndBorePositionObjectiveFunction: {
    displayName: "Hole & bore position",
    category: "Combined",
    description: "Optimize holes and bore positions",
  },
  HoleAndBoreSpacingFromTopObjectiveFunction: {
    displayName: "Hole & bore spacing from top",
    category: "Combined",
    description: "Optimize holes and bore spacing",
  },
  HeadjointObjectiveFunction: {
    displayName: "Headjoint",
    category: "Combined",
    description: "Optimize headjoint parameters",
  },
  HoleAndHeadjointObjectiveFunction: {
    displayName: "Hole & headjoint",
    category: "Combined",
    description: "Optimize holes and headjoint together",
  },

  // Global optimizers
  GlobalHolePositionObjectiveFunction: {
    displayName: "Global hole position",
    category: "Global",
    description: "Global optimization of hole positions",
  },
  GlobalHoleObjectiveFunction: {
    displayName: "Global hole (position & size)",
    category: "Global",
    description: "Global optimization of holes",
  },
  GlobalHoleAndTaperObjectiveFunction: {
    displayName: "Global hole & taper",
    category: "Global",
    description: "Global optimization of holes and taper",
  },
  GlobalHoleAndBoreDiameterFromBottomObjectiveFunction: {
    displayName: "Global hole & bore from bottom",
    category: "Global",
    description: "Global hole and bore optimization from bottom",
  },
  GlobalHoleAndBoreDiameterFromTopObjectiveFunction: {
    displayName: "Global hole & bore from top",
    category: "Global",
    description: "Global hole and bore optimization from top",
  },
  GlobalBoreFromBottomObjectiveFunction: {
    displayName: "Global bore from bottom",
    category: "Global",
    description: "Global bore optimization from bottom",
  },
  GlobalHoleAndBoreFromBottomObjectiveFunction: {
    displayName: "Global hole & bore from bottom",
    category: "Global",
    description: "Global hole and bore from bottom",
  },

  // Calibration
  ReedCalibratorObjectiveFunction: {
    displayName: "Reed calibrator",
    category: "Calibration",
    description: "Calibrate reed parameters",
  },
  StopperPositionObjectiveFunction: {
    displayName: "Stopper position",
    category: "Calibration",
    description: "Optimize stopper position",
  },
  FluteCalibrationObjectiveFunction: {
    displayName: "Flute calibration",
    category: "Calibration",
    description: "Calibrate flute parameters",
  },
  WhistleCalibrationObjectiveFunction: {
    displayName: "Whistle calibration",
    category: "Calibration",
    description: "Calibrate whistle parameters",
  },
};

/**
 * Create default hole groups - each hole in its own group.
 * This provides no grouping, treating each hole independently.
 */
function getDefaultHoleGroups(tuning: Tuning): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < tuning.numberOfHoles; i++) {
    groups.push([i]);
  }
  return groups;
}

/**
 * Create an objective function instance by name.
 *
 * @param name - Objective function class name
 * @param calculator - Instrument calculator
 * @param tuning - Target tuning
 * @param evaluator - Evaluation function
 * @param holeGroups - Optional hole groups for grouped-hole functions (defaults to one hole per group)
 */
export function createObjectiveFunction(
  name: string,
  calculator: IInstrumentCalculator,
  tuning: Tuning,
  evaluator: IEvaluator,
  holeGroups?: number[][]
): BaseObjectiveFunction {
  // Get default hole groups if not provided
  const groups = holeGroups ?? getDefaultHoleGroups(tuning);

  switch (name) {
    // Mouthpiece
    case "FippleFactorObjectiveFunction":
      return new FippleFactorObjectiveFunction(calculator, tuning, evaluator);
    case "WindowHeightObjectiveFunction":
      return new WindowHeightObjectiveFunction(calculator, tuning, evaluator);
    case "BetaObjectiveFunction":
      return new BetaObjectiveFunction(calculator, tuning, evaluator);
    case "AirstreamLengthObjectiveFunction":
      return new AirstreamLengthObjectiveFunction(calculator, tuning, evaluator);

    // Hole position & size
    case "HolePositionObjectiveFunction":
      return new HolePositionObjectiveFunction(calculator, tuning, evaluator);
    case "HoleSizeObjectiveFunction":
      return new HoleSizeObjectiveFunction(calculator, tuning, evaluator);
    case "HoleObjectiveFunction":
      return new HoleObjectiveFunction(calculator, tuning, evaluator);
    case "HolePositionFromTopObjectiveFunction":
      return new HolePositionFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "HoleFromTopObjectiveFunction":
      return new HoleFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "NafHoleSizeObjectiveFunction":
      return new NafHoleSizeObjectiveFunction(calculator, tuning, evaluator);

    // Grouped holes
    case "HoleGroupPositionObjectiveFunction":
      return new HoleGroupPositionObjectiveFunction(calculator, tuning, evaluator, groups);
    case "HoleGroupPositionFromTopObjectiveFunction":
      return new HoleGroupPositionFromTopObjectiveFunction(calculator, tuning, evaluator, groups);
    case "HoleGroupObjectiveFunction":
      return new HoleGroupObjectiveFunction(calculator, tuning, evaluator, groups);
    case "HoleGroupFromTopObjectiveFunction":
      return new HoleGroupFromTopObjectiveFunction(calculator, tuning, evaluator, groups);

    // Single taper
    case "SingleTaperNoHoleGroupingObjectiveFunction":
      return new SingleTaperNoHoleGroupingObjectiveFunction(calculator, tuning, evaluator);
    case "SingleTaperNoHoleGroupingFromTopObjectiveFunction":
      return new SingleTaperNoHoleGroupingFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "SingleTaperHoleGroupObjectiveFunction":
      return new SingleTaperHoleGroupObjectiveFunction(calculator, tuning, evaluator, groups);
    case "SingleTaperHoleGroupFromTopObjectiveFunction":
      return new SingleTaperHoleGroupFromTopObjectiveFunction(calculator, tuning, evaluator, groups);
    case "SingleTaperRatioObjectiveFunction":
      return new SingleTaperRatioObjectiveFunction(calculator, tuning, evaluator);
    case "SingleTaperSimpleRatioObjectiveFunction":
      return new SingleTaperSimpleRatioObjectiveFunction(calculator, tuning, evaluator);

    // Hemi-head
    case "SingleTaperSimpleRatioHemiHeadObjectiveFunction":
      return new SingleTaperSimpleRatioHemiHeadObjectiveFunction(calculator, tuning, evaluator);
    case "SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction":
      return new SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction(
        calculator,
        tuning,
        evaluator
      );
    case "SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction":
      return new SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction(
        calculator,
        tuning,
        evaluator,
        groups
      );

    // Bore
    case "LengthObjectiveFunction":
      return new LengthObjectiveFunction(calculator, tuning, evaluator);
    case "BoreDiameterFromBottomObjectiveFunction":
      return new BoreDiameterFromBottomObjectiveFunction(calculator, tuning, evaluator);
    case "BoreDiameterFromTopObjectiveFunction":
      return new BoreDiameterFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "BasicTaperObjectiveFunction":
      return new BasicTaperObjectiveFunction(calculator, tuning, evaluator);
    case "ConicalBoreObjectiveFunction":
      return new ConicalBoreObjectiveFunction(calculator, tuning, evaluator);
    case "BorePositionObjectiveFunction":
      return new BorePositionObjectiveFunction(calculator, tuning, evaluator);
    case "BoreSpacingFromTopObjectiveFunction":
      return new BoreSpacingFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "BoreFromBottomObjectiveFunction":
      return new BoreFromBottomObjectiveFunction(calculator, tuning, evaluator);

    // Combined
    case "HoleAndTaperObjectiveFunction":
      return new HoleAndTaperObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndBoreDiameterFromTopObjectiveFunction":
      return new HoleAndBoreDiameterFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndBoreDiameterFromBottomObjectiveFunction":
      return new HoleAndBoreDiameterFromBottomObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndConicalBoreObjectiveFunction":
      return new HoleAndConicalBoreObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndBoreFromBottomObjectiveFunction":
      return new HoleAndBoreFromBottomObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndBorePositionObjectiveFunction":
      return new HoleAndBorePositionObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndBoreSpacingFromTopObjectiveFunction":
      return new HoleAndBoreSpacingFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "HeadjointObjectiveFunction":
      return new HeadjointObjectiveFunction(calculator, tuning, evaluator);
    case "HoleAndHeadjointObjectiveFunction":
      return new HoleAndHeadjointObjectiveFunction(calculator, tuning, evaluator);

    // Global
    case "GlobalHolePositionObjectiveFunction":
      return new GlobalHolePositionObjectiveFunction(calculator, tuning, evaluator);
    case "GlobalHoleObjectiveFunction":
      return new GlobalHoleObjectiveFunction(calculator, tuning, evaluator);
    case "GlobalHoleAndTaperObjectiveFunction":
      return new GlobalHoleAndTaperObjectiveFunction(calculator, tuning, evaluator);
    case "GlobalHoleAndBoreDiameterFromBottomObjectiveFunction":
      return new GlobalHoleAndBoreDiameterFromBottomObjectiveFunction(
        calculator,
        tuning,
        evaluator
      );
    case "GlobalHoleAndBoreDiameterFromTopObjectiveFunction":
      return new GlobalHoleAndBoreDiameterFromTopObjectiveFunction(calculator, tuning, evaluator);
    case "GlobalBoreFromBottomObjectiveFunction":
      return new GlobalBoreFromBottomObjectiveFunction(calculator, tuning, evaluator);
    case "GlobalHoleAndBoreFromBottomObjectiveFunction":
      return new GlobalHoleAndBoreFromBottomObjectiveFunction(calculator, tuning, evaluator);

    // Calibration
    case "ReedCalibratorObjectiveFunction":
      return new ReedCalibratorObjectiveFunction(calculator, tuning, evaluator);
    case "StopperPositionObjectiveFunction":
      return new StopperPositionObjectiveFunction(calculator, tuning, evaluator);
    case "FluteCalibrationObjectiveFunction":
      return new FluteCalibrationObjectiveFunction(calculator, tuning, evaluator);
    case "WhistleCalibrationObjectiveFunction":
      return new WhistleCalibrationObjectiveFunction(calculator, tuning, evaluator);

    default:
      throw new Error(`Unknown objective function: ${name}`);
  }
}

/**
 * Get list of available objective functions grouped by category.
 */
export function getObjectiveFunctionsByCategory(): Record<
  string,
  Array<{ name: string; displayName: string; description: string }>
> {
  const byCategory: Record<
    string,
    Array<{ name: string; displayName: string; description: string }>
  > = {};

  for (const [name, info] of Object.entries(OBJECTIVE_FUNCTION_INFO)) {
    const category = info.category;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category]!.push({
      name,
      displayName: info.displayName,
      description: info.description,
    });
  }

  return byCategory;
}

/**
 * Get all objective function names.
 */
export function getObjectiveFunctionNames(): string[] {
  return Object.keys(OBJECTIVE_FUNCTION_INFO);
}
