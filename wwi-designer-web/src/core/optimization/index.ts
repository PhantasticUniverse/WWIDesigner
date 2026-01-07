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

// Hole optimization objective functions
export {
  HolePositionObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
  BoreLengthAdjustmentType,
} from "./hole-position-objective.ts";

// Optimization orchestrator
export {
  optimizeObjectiveFunction,
  quickOptimize,
  type OptimizationOutcome,
  type OptimizerOptions,
} from "./objective-function-optimizer.ts";
