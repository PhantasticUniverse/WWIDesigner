/**
 * Class for finding the playing frequencies of an instrument.
 *
 * Ported from com.wwidesigner.modelling.PlayingRange
 *
 * Depending on the calculator, some of the following conditions will
 * determine the playing frequency:
 *
 *   fnom satisfies Im(Z(fnom)) = 0.0 and d/df Im(Z(fnom)) > 0.0
 *   or fnom satisfies Im(Z(fnom)) = x0, for some x0.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Complex } from "../math/complex.ts";
import type { IInstrumentCalculator } from "./instrument-calculator.ts";
import type { Fingering } from "../../models/tuning.ts";

/** Find playing ranges within a ratio of SearchBoundRatio of a specified frequency */
const SEARCH_BOUND_RATIO = 2.0; // Within an octave

/** Acceptable solutions are within this ratio of specified frequency */
const PREFERRED_SOLUTION_RATIO = 1.12; // Within 200 cents

/**
 * Basic step size for bracket search, as a fraction of f.
 * Big assumption: within the range of interest, function(f).value
 * has no more than one root between f and f*(1+Granularity).
 */
const GRANULARITY = 0.012; // About 20 cents

/** Loop gain that defines fmin for a playing range */
const MINIMUM_GAIN = 1.0;

/** Maximum iterations for Brent solver */
const MAX_SOLVER_ITERATIONS = 50;

/** Tolerance for Brent solver */
const SOLVER_TOLERANCE = 1e-8;

/**
 * Exception thrown when no playing range is found near a target frequency.
 */
export class NoPlayingRange extends Error {
  public readonly freq: number;

  constructor(freq: number) {
    super(`No playing range near ${freq} Hz`);
    this.freq = freq;
    this.name = "NoPlayingRange";
  }
}

/**
 * Interface for univariate function that operates on frequency.
 */
interface UnivariateFunction {
  value(f: number): number;
}

/**
 * Interface for univariate function that can also operate on impedance.
 */
interface UnivariateZFunction extends UnivariateFunction {
  valueFromZ(z: Complex): number;
}

/**
 * Brent's method for finding roots of a univariate function.
 * This is a robust root-finding algorithm that combines bisection,
 * secant method, and inverse quadratic interpolation.
 */
function brentSolver(
  f: UnivariateFunction,
  a: number,
  b: number,
  tol: number = SOLVER_TOLERANCE,
  maxIter: number = MAX_SOLVER_ITERATIONS
): number {
  let fa = f.value(a);
  let fb = f.value(b);

  if (fa * fb > 0) {
    throw new Error("Function values at endpoints must have opposite signs");
  }

  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let mflag = true;
  let d = 0;
  let s = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.abs(b - a) < tol) {
      return b;
    }

    if (Math.abs(fb) < tol) {
      return b;
    }

    // Inverse quadratic interpolation
    if (fa !== fc && fb !== fc) {
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // Secant method
      s = b - (fb * (b - a)) / (fb - fa);
    }

    // Conditions for using bisection instead
    const condition1 =
      s < (3 * a + b) / 4 || s > b
        ? s < Math.min((3 * a + b) / 4, b) || s > Math.max((3 * a + b) / 4, b)
        : false;
    const condition2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const condition3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const condition4 = mflag && Math.abs(b - c) < tol;
    const condition5 = !mflag && Math.abs(c - d) < tol;

    if (condition1 || condition2 || condition3 || condition4 || condition5) {
      // Bisection
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f.value(s);
    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  return b;
}

/**
 * Class for finding playing frequencies of an instrument.
 */
export class PlayingRange {
  protected calculator: IInstrumentCalculator;
  protected fingering: Fingering;

  constructor(calculator: IInstrumentCalculator, fingering: Fingering) {
    this.calculator = calculator;
    this.fingering = fingering;
  }

  /**
   * Create a reactance function that returns Im(Z) - targetX.
   */
  protected createReactanceFunction(targetX: number = 0): UnivariateZFunction {
    return {
      value: (f: number) => {
        const z = this.calculator.calcZ(f, this.fingering);
        return z.im - targetX;
      },
      valueFromZ: (z: Complex) => z.im - targetX,
    };
  }

  /**
   * Create a gain function that returns gain(f) - targetGain.
   */
  protected createGainFunction(targetGain: number = MINIMUM_GAIN): UnivariateFunction {
    return {
      value: (f: number) => {
        const z = this.calculator.calcZ(f, this.fingering);
        return this.calculator.calcGain(f, z) - targetGain;
      },
    };
  }

  /**
   * Create a Z ratio function that returns Im(Z)/Re(Z) - targetRatio.
   */
  protected createZRatioFunction(targetRatio: number = 0): UnivariateZFunction {
    return {
      value: (f: number) => {
        const z = this.calculator.calcZ(f, this.fingering);
        return z.im / z.re - targetRatio;
      },
      valueFromZ: (z: Complex) => z.im / z.re - targetRatio,
    };
  }

  /**
   * Find a bracket for a root of function above a specified frequency.
   * @returns [lowerFreq, upperFreq] or [-1, 0] if no bracket found
   */
  protected findBracketAbove(
    nearFreq: number,
    zNear: Complex,
    func: UnivariateZFunction,
    upperBound: number
  ): [number, number] {
    const stepSize = nearFreq * GRANULARITY;
    let lowerFreq = nearFreq;
    let zLower = zNear;

    // First, ensure that function(lowerFreq) < 0
    while (func.valueFromZ(zLower) >= 0) {
      lowerFreq += stepSize;
      if (lowerFreq >= upperBound) {
        return [-1, 0];
      }
      zLower = this.calculator.calcZ(lowerFreq, this.fingering);
    }

    // Search up until function(upperFreq) > 0
    let upperFreq = lowerFreq + stepSize;
    let zUpper = this.calculator.calcZ(upperFreq, this.fingering);

    while (func.valueFromZ(zUpper) <= 0) {
      if (func.valueFromZ(zUpper) < 0) {
        lowerFreq = upperFreq;
        zLower = zUpper;
      }
      upperFreq += stepSize;
      if (upperFreq > upperBound) {
        return [-1, 0];
      }
      zUpper = this.calculator.calcZ(upperFreq, this.fingering);
    }

    return [lowerFreq, upperFreq];
  }

  /**
   * Find a bracket for a root of function below a specified frequency.
   * @returns [lowerFreq, upperFreq] or [-1, 0] if no bracket found
   */
  protected findBracketBelow(
    nearFreq: number,
    zNear: Complex,
    func: UnivariateZFunction,
    lowerBound: number
  ): [number, number] {
    const stepSize = nearFreq * GRANULARITY;
    let upperFreq = nearFreq;
    let zUpper = zNear;

    // First, ensure that function(upperFreq) > 0
    while (func.valueFromZ(zUpper) <= 0) {
      upperFreq -= stepSize;
      if (upperFreq <= lowerBound) {
        return [-1, 0];
      }
      zUpper = this.calculator.calcZ(upperFreq, this.fingering);
    }

    // Search down until function(lowerFreq) < 0
    let lowerFreq = upperFreq - stepSize;
    let zLower = this.calculator.calcZ(lowerFreq, this.fingering);

    while (func.valueFromZ(zLower) >= 0) {
      if (func.valueFromZ(zLower) > 0) {
        upperFreq = lowerFreq;
        zUpper = zLower;
      }
      lowerFreq -= stepSize;
      if (lowerFreq < lowerBound) {
        return [-1, 0];
      }
      zLower = this.calculator.calcZ(lowerFreq, this.fingering);
    }

    return [lowerFreq, upperFreq];
  }

  /**
   * Find a bracket near a specified frequency for a specified impedance-valued function.
   * @throws NoPlayingRange if no bracket is found
   */
  public findBracket(nearFreq: number, func: UnivariateZFunction): [number, number] {
    let freq = nearFreq;
    let zNear = this.calculator.calcZ(freq, this.fingering);

    // For the unlikely case that we landed right on a zero, adjust slightly
    while (func.valueFromZ(zNear) === 0) {
      freq = freq * 0.999;
      zNear = this.calculator.calcZ(freq, this.fingering);
    }

    if (func.valueFromZ(zNear) < 0) {
      // Start searching upward
      const upwardBracket = this.findBracketAbove(
        freq,
        zNear,
        func,
        nearFreq * SEARCH_BOUND_RATIO
      );

      if (upwardBracket[0] <= 0 || upwardBracket[1] > nearFreq * PREFERRED_SOLUTION_RATIO) {
        // Search downward as well
        const limitFreq =
          upwardBracket[0] <= 0
            ? nearFreq / SEARCH_BOUND_RATIO
            : (nearFreq * nearFreq) / upwardBracket[1];

        const downwardBracket = this.findBracketBelow(freq, zNear, func, limitFreq);
        if (downwardBracket[0] > 0) {
          return downwardBracket;
        }
      }

      if (upwardBracket[0] <= 0) {
        throw new NoPlayingRange(nearFreq);
      }
      return upwardBracket;
    }

    // Start searching downward
    const downwardBracket = this.findBracketBelow(
      freq,
      zNear,
      func,
      nearFreq / SEARCH_BOUND_RATIO
    );

    if (
      downwardBracket[0] <= 0 ||
      downwardBracket[0] < nearFreq / PREFERRED_SOLUTION_RATIO
    ) {
      // Search upward as well
      const limitFreq =
        downwardBracket[0] <= 0
          ? nearFreq * SEARCH_BOUND_RATIO
          : (nearFreq * nearFreq) / downwardBracket[0];

      const upwardBracket = this.findBracketAbove(freq, zNear, func, limitFreq);
      if (upwardBracket[0] > 0) {
        return upwardBracket;
      }
    }

    if (downwardBracket[0] <= 0) {
      throw new NoPlayingRange(nearFreq);
    }
    return downwardBracket;
  }

  /**
   * Find the zero of reactance nearest to nearFreq.
   * @param nearFreq Target frequency
   * @returns Frequency at which Im(Z) = 0
   * @throws NoPlayingRange if there is no zero within the search range
   */
  public findXZero(nearFreq: number): number {
    const reactance = this.createReactanceFunction(0);
    const bracket = this.findBracket(nearFreq, reactance);

    try {
      return brentSolver(reactance, bracket[0], bracket[1]);
    } catch {
      throw new NoPlayingRange(nearFreq);
    }
  }

  /**
   * Find the frequency with a specified reactance nearest to nearFreq.
   * @param nearFreq Target frequency
   * @param targetX Target reactance value
   * @returns Frequency at which Im(Z) = targetX
   * @throws NoPlayingRange if there is no solution within the search range
   */
  public findX(nearFreq: number, targetX: number): number {
    const reactance = this.createReactanceFunction(targetX);
    const bracket = this.findBracket(nearFreq, reactance);

    try {
      return brentSolver(reactance, bracket[0], bracket[1]);
    } catch {
      throw new NoPlayingRange(nearFreq);
    }
  }

  /**
   * Find the frequency with a specified Z ratio (Im(Z)/Re(Z)) nearest to nearFreq.
   * @param nearFreq Target frequency
   * @param targetRatio Target ratio Im(Z)/Re(Z)
   * @returns Frequency at which Im(Z)/Re(Z) = targetRatio
   * @throws NoPlayingRange if there is no solution within the search range
   */
  public findZRatio(nearFreq: number, targetRatio: number): number {
    const ratio = this.createZRatioFunction(targetRatio);
    const bracket = this.findBracket(nearFreq, ratio);

    try {
      return brentSolver(ratio, bracket[0], bracket[1]);
    } catch {
      throw new NoPlayingRange(nearFreq);
    }
  }

  /**
   * Find fmin for a playing range, given fmax.
   * fmin is the highest frequency <= fmax that satisfies
   * either gain(fmin) == MinimumGain
   * or fmin is a local minimum of Im(Z)/Re(Z).
   * @param fmax Maximum frequency, as returned by findXZero()
   * @returns Minimum frequency of the playing range
   */
  public findFmin(fmax: number): number {
    const stepSize = fmax * GRANULARITY;

    let lowerFreq = fmax;
    let z_lo = this.calculator.calcZ(fmax, this.fingering);
    let g_lo = this.calculator.calcGain(lowerFreq, z_lo);
    let ratio = z_lo.im / z_lo.re;
    let minRatio = ratio + 1.0;

    if (g_lo < MINIMUM_GAIN) {
      throw new NoPlayingRange(fmax);
    }

    // Search for lower bound
    while (g_lo >= MINIMUM_GAIN && ratio < minRatio) {
      minRatio = ratio;
      lowerFreq -= stepSize;
      if (lowerFreq < fmax / SEARCH_BOUND_RATIO) {
        throw new NoPlayingRange(fmax);
      }
      z_lo = this.calculator.calcZ(lowerFreq, this.fingering);
      g_lo = this.calculator.calcGain(lowerFreq, z_lo);
      ratio = z_lo.im / z_lo.re;
    }

    let freqGain: number;
    if (g_lo < MINIMUM_GAIN) {
      // Find the point at which gain == MinimumGain
      const gainFunc = this.createGainFunction(MINIMUM_GAIN);
      try {
        freqGain = brentSolver(gainFunc, lowerFreq, fmax);
      } catch {
        throw new NoPlayingRange(fmax);
      }
    } else {
      freqGain = lowerFreq;
    }

    // Find the local minimum of Im(Z)/Re(Z) using golden section search
    const freqRatio = this.findMinimum(
      (f) => {
        const z = this.calculator.calcZ(f, this.fingering);
        return z.im / z.re;
      },
      lowerFreq,
      fmax
    );

    return Math.max(freqRatio, freqGain);
  }

  /**
   * Simple golden section search for minimum of a function.
   */
  protected findMinimum(func: (x: number) => number, a: number, b: number): number {
    const phi = (1 + Math.sqrt(5)) / 2;
    const resphi = 2 - phi;
    const tol = 1e-6;

    let x1 = a + resphi * (b - a);
    let x2 = b - resphi * (b - a);
    let f1 = func(x1);
    let f2 = func(x2);

    while (Math.abs(b - a) > tol * (Math.abs(x1) + Math.abs(x2))) {
      if (f1 < f2) {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = a + resphi * (b - a);
        f1 = func(x1);
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = b - resphi * (b - a);
        f2 = func(x2);
      }
    }

    return (a + b) / 2;
  }

  getFingering(): Fingering {
    return this.fingering;
  }

  setFingering(fingering: Fingering): void {
    this.fingering = fingering;
  }
}
