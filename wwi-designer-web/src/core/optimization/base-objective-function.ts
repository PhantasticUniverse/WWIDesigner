/**
 * Base class for optimization objective functions.
 *
 * Each derived class supports optimization of specific aspects
 * of an instrument geometry.
 *
 * Ported from com.wwidesigner.optimization.BaseObjectiveFunction.java
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Fingering, Tuning } from "../../models/tuning.ts";
import type { Instrument } from "../../models/instrument.ts";
import type { IInstrumentCalculator } from "../modelling/instrument-calculator.ts";
import type { IEvaluator } from "./evaluator.ts";
import { Constraints, ConstraintType, createConstraint } from "./constraints.ts";
import type { AbstractRangeProcessor } from "./range-processor.ts";

/**
 * Optimizer types supported.
 */
export enum OptimizerType {
  BRENT = "BRENT",
  BOBYQA = "BOBYQA",
  CMAES = "CMAES",
  DIRECT = "DIRECT",
  SIMPLEX = "SIMPLEX",
  POWELL = "POWELL",
}

/**
 * Base class for objective functions to be optimized.
 */
export abstract class BaseObjectiveFunction {
  protected calculator: IInstrumentCalculator;
  protected fingeringTargets: Fingering[];
  protected evaluator: IEvaluator;
  protected firstStageEvaluator: IEvaluator | null = null;

  // Geometry description
  protected nrDimensions: number = 0;
  protected lowerBounds: number[] = [];
  protected upperBounds: number[] = [];
  protected constraints: Constraints;

  // Optimization settings
  protected optimizerType: OptimizerType = OptimizerType.BOBYQA;
  protected maxEvaluations: number = 10000;
  protected initialTrustRegionRadius: number | null = null;
  protected runTwoStageOptimization: boolean = false;
  protected cancelled: boolean = false;

  // Multi-start settings
  protected rangeProcessor: AbstractRangeProcessor | null = null;

  // Statistics
  protected tuningsDone: number = 0;
  protected evaluationsDone: number = 0;

  constructor(
    calculator: IInstrumentCalculator,
    tuning: Tuning,
    evaluator: IEvaluator
  ) {
    this.calculator = calculator;
    this.fingeringTargets = [...tuning.fingering];
    this.evaluator = evaluator;
    this.constraints = new Constraints(calculator.getInstrument().lengthType);
  }

  /**
   * The objective function value - sum of squared errors.
   */
  value(point: number[]): number {
    this.evaluationsDone++;
    const errorVector = this.getErrorVector(point);
    this.tuningsDone += errorVector.length;
    return this.calcNorm(errorVector);
  }

  /**
   * Calculate errors at each fingering target.
   */
  getErrorVector(point: number[]): number[] {
    if (this.cancelled) {
      this.cancelled = false;
      throw new Error("Operation cancelled");
    }
    if (point.length !== this.nrDimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.nrDimensions}, got ${point.length}`
      );
    }
    this.setGeometryPoint(point);
    return this.evaluator.calculateErrorVector(this.fingeringTargets);
  }

  /**
   * Calculate error norm as weighted sum of squares.
   */
  calcNorm(errorVector: number[]): number {
    let norm = 0.0;
    for (let i = 0; i < errorVector.length; i++) {
      const err = errorVector[i]!;
      const weight = this.fingeringTargets[i]?.optimizationWeight ?? 1;
      if (weight > 0) {
        norm += err * err * weight;
      }
    }
    return norm;
  }

  /**
   * Retrieve geometry values from the instrument.
   * Specific values depend on the derived class.
   */
  abstract getGeometryPoint(): number[];

  /**
   * Set geometry values on the instrument.
   * Specific values depend on the derived class.
   */
  abstract setGeometryPoint(point: number[]): void;

  /**
   * Set up constraints for this objective function.
   */
  protected abstract setConstraints(): void;

  /**
   * Get initial point, ensuring values lie within bounds.
   */
  getInitialPoint(): number[] {
    const unnormalized = this.getGeometryPoint();
    const normalized = new Array(unnormalized.length);

    for (let i = 0; i < unnormalized.length; i++) {
      if (unnormalized[i]! <= this.lowerBounds[i]!) {
        normalized[i] = this.lowerBounds[i];
      } else if (unnormalized[i]! >= this.upperBounds[i]!) {
        normalized[i] = this.upperBounds[i];
      } else {
        normalized[i] = unnormalized[i];
      }
    }
    return normalized;
  }

  /**
   * Get recommended number of interpolations for optimizer.
   */
  getNrInterpolations(): number {
    if (this.optimizerType === OptimizerType.CMAES) {
      return 5 + Math.floor(5 * Math.log(this.nrDimensions));
    }
    if (
      this.optimizerType === OptimizerType.BOBYQA ||
      this.optimizerType === OptimizerType.DIRECT
    ) {
      return 2 * this.nrDimensions + 1;
    }
    return 1;
  }

  /**
   * Get standard deviation for each dimension (for CMAES).
   */
  getStdDev(): number[] {
    const sigma = new Array(this.nrDimensions);
    for (let i = 0; i < this.nrDimensions; i++) {
      if (this.upperBounds[i]! <= this.lowerBounds[i]!) {
        sigma[i] = 0.0;
      } else {
        sigma[i] = 0.2 * (this.upperBounds[i]! - this.lowerBounds[i]!);
      }
    }
    return sigma;
  }

  /**
   * Get initial trust region radius for BOBYQA.
   */
  getInitialTrustRegionRadius(initial?: number[]): number {
    if (this.initialTrustRegionRadius !== null && initial === undefined) {
      return this.initialTrustRegionRadius;
    }

    const point = initial ?? this.getInitialPoint();
    let maxExpectedChange = 0.0;
    let minRadius = 1.0e-6;

    for (let i = 0; i < this.nrDimensions; i++) {
      const boundDiff = this.upperBounds[i]! - this.lowerBounds[i]!;
      if (boundDiff > 1.0e-7 && 0.5 * boundDiff < minRadius) {
        minRadius = 0.5 * boundDiff;
      }
      if (boundDiff > maxExpectedChange) {
        maxExpectedChange = boundDiff;
      }
    }

    if (minRadius > 0.1 * maxExpectedChange) {
      this.initialTrustRegionRadius = minRadius;
    } else {
      this.initialTrustRegionRadius = 0.1 * maxExpectedChange;
    }

    return this.initialTrustRegionRadius;
  }

  /**
   * Get stopping trust region radius.
   */
  getStoppingTrustRegionRadius(): number {
    return 1.0e-8 * this.getInitialTrustRegionRadius();
  }

  /**
   * Get simplex step sizes.
   */
  getSimplexStepSize(): number[] {
    const stepSize = new Array(this.nrDimensions);
    const initial = this.getInitialPoint();

    for (let i = 0; i < this.nrDimensions; i++) {
      stepSize[i] = this.upperBounds[i]! - initial[i]!;
      if (stepSize[i]! < initial[i]! - this.lowerBounds[i]!) {
        stepSize[i] = this.lowerBounds[i]! - initial[i]!;
      }
      stepSize[i] = 0.25 * stepSize[i]!;
      if (stepSize[i] === 0.0) {
        stepSize[i] = 0.1 * initial[i]!;
      }
    }
    return stepSize;
  }

  // Getters and setters
  getInstrument(): Instrument {
    return this.calculator.getInstrument();
  }

  getCalculator(): IInstrumentCalculator {
    return this.calculator;
  }

  getLowerBounds(): number[] {
    return [...this.lowerBounds];
  }

  setLowerBounds(bounds: number[]): void {
    if (bounds.length !== this.nrDimensions) {
      throw new Error(`Dimension mismatch: expected ${this.nrDimensions}`);
    }
    this.lowerBounds = [...bounds];
    this.validateBounds();
    this.initialTrustRegionRadius = null;
  }

  getUpperBounds(): number[] {
    return [...this.upperBounds];
  }

  setUpperBounds(bounds: number[]): void {
    if (bounds.length !== this.nrDimensions) {
      throw new Error(`Dimension mismatch: expected ${this.nrDimensions}`);
    }
    this.upperBounds = [...bounds];
    this.validateBounds();
    this.initialTrustRegionRadius = null;
  }

  /**
   * Validate and fix bounds (handle reversed or equal bounds).
   */
  protected validateBounds(): void {
    for (let i = 0; i < this.nrDimensions; i++) {
      const lb = this.lowerBounds[i]!;
      const ub = this.upperBounds[i]!;
      if (lb > ub) {
        this.lowerBounds[i] = ub;
        this.upperBounds[i] = lb;
      } else if (lb === ub) {
        // Subtract small amount so optimizer sees non-zero range
        this.lowerBounds[i] = lb - 1.0e-7;
      }
    }
    this.constraints.setLowerBounds(this.lowerBounds);
    this.constraints.setUpperBounds(this.upperBounds);
  }

  getNrDimensions(): number {
    return this.nrDimensions;
  }

  /**
   * Get number of fingerings with positive optimization weight.
   */
  getNrNotes(): number {
    let weightedNotes = 0;
    for (const fingering of this.fingeringTargets) {
      if ((fingering.optimizationWeight ?? 1) > 0) {
        weightedNotes++;
      }
    }
    return weightedNotes;
  }

  getOptimizerType(): OptimizerType {
    return this.optimizerType;
  }

  setOptimizerType(type: OptimizerType): void {
    this.optimizerType = type;
  }

  getMaxEvaluations(): number {
    return this.maxEvaluations;
  }

  setMaxEvaluations(max: number): void {
    this.maxEvaluations = max;
  }

  getEvaluator(): IEvaluator {
    return this.evaluator;
  }

  setEvaluator(evaluator: IEvaluator): void {
    this.evaluator = evaluator;
  }

  getFirstStageEvaluator(): IEvaluator | null {
    return this.firstStageEvaluator;
  }

  setFirstStageEvaluator(evaluator: IEvaluator | null): void {
    this.firstStageEvaluator = evaluator;
  }

  isRunTwoStageOptimization(): boolean {
    return this.runTwoStageOptimization && this.firstStageEvaluator !== null;
  }

  setRunTwoStageOptimization(run: boolean): void {
    this.runTwoStageOptimization = run;
  }

  getConstraints(): Constraints {
    return this.constraints;
  }

  setConstraintsBounds(constraints: Constraints): void {
    this.lowerBounds = constraints.getLowerBounds();
    this.upperBounds = constraints.getUpperBounds();
    this.constraints = constraints;
    this.validateBounds();
  }

  getNumberOfEvaluations(): number {
    return this.evaluationsDone;
  }

  getNumberOfTunings(): number {
    return this.tuningsDone;
  }

  setCancel(cancel: boolean): void {
    this.cancelled = cancel;
  }

  /**
   * Reset statistics counters.
   */
  resetStatistics(): void {
    this.evaluationsDone = 0;
    this.tuningsDone = 0;
  }

  // Multi-start support

  /**
   * Check if multi-start optimization is enabled.
   */
  isMultiStart(): boolean {
    return this.rangeProcessor !== null;
  }

  /**
   * Get the range processor for multi-start optimization.
   */
  getRangeProcessor(): AbstractRangeProcessor | null {
    return this.rangeProcessor;
  }

  /**
   * Set the range processor for multi-start optimization.
   *
   * Setting a range processor enables multi-start optimization.
   * Set to null to disable multi-start.
   */
  setRangeProcessor(processor: AbstractRangeProcessor | null): void {
    this.rangeProcessor = processor;
  }
}
