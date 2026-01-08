/**
 * Optimization module for instrument design.
 *
 * This module provides the DIRECT optimizer and objective functions
 * for adjusting instrument geometry to match target tunings.
 */

// DIRECT global optimizer
export {
  DIRECTOptimizer,
  type OptimizationResult,
  type ObjectiveFunction,
  type DIRECTOptions,
} from "./direct-optimizer.ts";

// Evaluators
export {
  type IEvaluator,
  BaseEvaluator,
  CentDeviationEvaluator,
  FrequencyDeviationEvaluator,
  ReactanceEvaluator,
  FminEvaluator,
  FmaxEvaluator,
  FminmaxEvaluator,
  BellNoteEvaluator,
  ReflectionEvaluator,
  type EvaluatorType,
  createEvaluator,
} from "./evaluator.ts";

// Constraints
export {
  Constraints,
  ConstraintType,
  type Constraint,
  createConstraint,
  getHoleName,
} from "./constraints.ts";

// Base objective function
export {
  BaseObjectiveFunction,
  OptimizerType,
} from "./base-objective-function.ts";

// Hole and bore optimization objective functions
export {
  LengthObjectiveFunction,
  HolePositionObjectiveFunction,
  HolePositionFromTopObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
  HoleFromTopObjectiveFunction,
  MergedObjectiveFunction,
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
  BoreLengthAdjustmentType,
  // Global optimizer variants
  GlobalHolePositionObjectiveFunction,
  GlobalHoleObjectiveFunction,
  GlobalHoleAndTaperObjectiveFunction,
  GlobalHoleAndBoreDiameterFromBottomObjectiveFunction,
  GlobalHoleAndBoreDiameterFromTopObjectiveFunction,
  // Single taper merged objectives
  SingleTaperNoHoleGroupingObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopObjectiveFunction,
  SingleTaperHoleGroupObjectiveFunction,
  SingleTaperHoleGroupFromTopObjectiveFunction,
  // Combined bore objectives
  HoleAndConicalBoreObjectiveFunction,
  HeadjointObjectiveFunction,
  HoleAndHeadjointObjectiveFunction,
  // Bore position and spacing objectives
  BorePositionObjectiveFunction,
  BoreSpacingFromTopObjectiveFunction,
  BoreFromBottomObjectiveFunction,
  HoleAndBoreFromBottomObjectiveFunction,
  HoleAndBorePositionObjectiveFunction,
  HoleAndBoreSpacingFromTopObjectiveFunction,
  GlobalBoreFromBottomObjectiveFunction,
  GlobalHoleAndBoreFromBottomObjectiveFunction,
  // Hemispherical bore head
  HemisphericalBoreHead,
  SingleTaperSimpleRatioHemiHeadObjectiveFunction,
  SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction,
  SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction,
  // Calibration objectives
  FluteCalibrationObjectiveFunction,
  WhistleCalibrationObjectiveFunction,
} from "./hole-position-objective.ts";

// Optimization orchestrator
export {
  optimizeObjectiveFunction,
  quickOptimize,
  type OptimizationOutcome,
  type OptimizerOptions,
} from "./objective-function-optimizer.ts";

// Objective function factory
export {
  createObjectiveFunction,
  getObjectiveFunctionsByCategory,
  getObjectiveFunctionNames,
  OBJECTIVE_FUNCTION_INFO,
} from "./objective-function-factory.ts";
