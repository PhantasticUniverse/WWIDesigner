/**
 * Calculator Factory - Instrument-Specific Calculator Configurations
 *
 * This module provides factory functions for creating correctly-configured
 * calculators for different instrument types. It matches the Java approach
 * of having separate calculator classes (NAFCalculator, WhistleCalculator,
 * FluteCalculator, etc.) but implemented as factory functions.
 *
 * ## Why This Matters
 *
 * Different instrument types require different combinations of sub-calculators:
 * - NAF (Native American Flute): ThickFlangedOpenEnd, DefaultFipple, holeSizeMult=0.9605
 * - Whistle: UnflangedEnd, SimpleFipple, holeSizeMult=1.0
 * - Transverse Flute: UnflangedEnd, FluteMouthpiece, holeSizeMult=1.0
 *
 * The auto-detection in DefaultInstrumentCalculator can't distinguish between
 * instrument types that share the same mouthpiece type (e.g., NAF vs Whistle
 * both have fipple mouthpieces).
 *
 * ## Usage
 *
 * ```typescript
 * // Use a specific calculator type
 * const nafCalc = createNAFCalculator(instrument, params);
 * const whistleCalc = createWhistleCalculator(instrument, params);
 *
 * // Auto-detect (best effort)
 * const calc = createCalculatorForInstrument(instrument, params);
 *
 * // Or specify calculator type explicitly
 * const calc = createCalculator(instrument, params, "naf");
 * ```
 *
 * ## Java Equivalents
 *
 * | TypeScript Factory | Java Class |
 * |-------------------|------------|
 * | createNAFCalculator | NAFCalculator |
 * | createWhistleCalculator | WhistleCalculator |
 * | createFluteCalculator | FluteCalculator |
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 */

import type { Instrument } from "../../models/instrument.ts";
import { PhysicalParameters } from "../physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "./instrument-calculator.ts";
import {
  DefaultHoleCalculator,
} from "../geometry/hole-calculator.ts";
import {
  thickFlangedEndCalculator,
  unflangedEndCalculator,
  flangedEndCalculator,
} from "../geometry/termination-calculator.ts";
import {
  defaultFippleCalculator,
  simpleFippleCalculator,
  defaultFluteCalculator,
  defaultMouthpieceCalculator,
} from "../geometry/mouthpiece-calculator.ts";
import {
  SimpleBoreSectionCalculator,
} from "../geometry/bore-section-calculator.ts";

/**
 * Supported calculator types.
 *
 * These correspond to Java calculator classes:
 * - "naf": NAFCalculator - Native American Flute
 * - "whistle": WhistleCalculator - Tin whistle, penny whistle, etc.
 * - "flute": FluteCalculator - Transverse flutes with embouchure hole
 * - "auto": Auto-detect based on instrument characteristics
 */
export type CalculatorType = "naf" | "whistle" | "flute" | "auto";

/**
 * NAF Calculator constants from Java NAFCalculator.java
 */
const NAF_HOLE_SIZE_MULT = 0.9605; // Based on 6/11/2019 validation runs

/**
 * Create a calculator for Native American Flutes.
 *
 * Uses:
 * - DefaultFippleMouthpieceCalculator
 * - ThickFlangedOpenEndCalculator (for thick-walled wooden tubes)
 * - DefaultHoleCalculator with holeSizeMult = 0.9605
 * - SimpleBoreSectionCalculator
 *
 * Java equivalent: NAFCalculator
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @returns Configured calculator for NAF instruments
 */
export function createNAFCalculator(
  instrument: Instrument,
  params: PhysicalParameters
): DefaultInstrumentCalculator {
  return new DefaultInstrumentCalculator(
    instrument,
    params,
    defaultFippleCalculator,
    thickFlangedEndCalculator,
    new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT),
    new SimpleBoreSectionCalculator()
  );
}

/**
 * Create a calculator for Whistles (tin whistle, penny whistle, etc.).
 *
 * Uses:
 * - SimpleFippleMouthpieceCalculator (simpler model than DefaultFipple)
 * - UnflangedEndCalculator (thin-walled tubes)
 * - DefaultHoleCalculator with holeSizeMult = 1.0
 * - SimpleBoreSectionCalculator
 *
 * Java equivalent: WhistleCalculator
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @returns Configured calculator for whistle instruments
 */
export function createWhistleCalculator(
  instrument: Instrument,
  params: PhysicalParameters
): DefaultInstrumentCalculator {
  return new DefaultInstrumentCalculator(
    instrument,
    params,
    simpleFippleCalculator,
    unflangedEndCalculator,
    new DefaultHoleCalculator(),
    new SimpleBoreSectionCalculator()
  );
}

/**
 * Create a calculator for Transverse Flutes.
 *
 * Uses:
 * - FluteMouthpieceCalculator (models embouchure hole)
 * - UnflangedEndCalculator
 * - DefaultHoleCalculator with holeSizeMult = 1.0
 * - SimpleBoreSectionCalculator
 *
 * Java equivalent: FluteCalculator
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @returns Configured calculator for flute instruments
 */
export function createFluteCalculator(
  instrument: Instrument,
  params: PhysicalParameters
): DefaultInstrumentCalculator {
  return new DefaultInstrumentCalculator(
    instrument,
    params,
    defaultFluteCalculator,
    unflangedEndCalculator,
    new DefaultHoleCalculator(),
    new SimpleBoreSectionCalculator()
  );
}

/**
 * Create a generic calculator with auto-detected components.
 *
 * This uses the original auto-detection logic which may not be optimal
 * for specific instrument types. Prefer using the specific factory functions
 * (createNAFCalculator, createWhistleCalculator, etc.) when the instrument
 * type is known.
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @returns Calculator with auto-detected components
 */
export function createGenericCalculator(
  instrument: Instrument,
  params: PhysicalParameters
): DefaultInstrumentCalculator {
  return new DefaultInstrumentCalculator(instrument, params);
}

/**
 * Check if an instrument is compatible with a specific calculator type.
 *
 * @param instrument - Instrument to check
 * @param calculatorType - Calculator type to check compatibility with
 * @returns True if the instrument is compatible
 */
export function isCompatible(
  instrument: Instrument,
  calculatorType: CalculatorType
): boolean {
  const mouthpiece = instrument.mouthpiece;

  switch (calculatorType) {
    case "naf":
      // NAF requires fipple mouthpiece
      return mouthpiece?.fipple !== undefined;

    case "whistle":
      // Whistle requires fipple mouthpiece
      return mouthpiece?.fipple !== undefined;

    case "flute":
      // Flute requires embouchure hole
      return mouthpiece?.embouchureHole !== undefined;

    case "auto":
      // Auto is always compatible
      return true;

    default:
      return false;
  }
}

/**
 * Auto-detect the best calculator type for an instrument.
 *
 * Detection logic:
 * 1. If instrument has embouchure hole → Flute
 * 2. If instrument has fipple mouthpiece:
 *    - If name contains "NAF" or "Native American" → NAF
 *    - If name contains "whistle" (case insensitive) → Whistle
 *    - Otherwise → NAF (safer default for wooden fipple instruments)
 * 3. Otherwise → Generic (auto-detect)
 *
 * Note: This heuristic may not always be correct. For best results,
 * explicitly specify the calculator type when known.
 *
 * @param instrument - Instrument to analyze
 * @returns Detected calculator type
 */
export function detectCalculatorType(instrument: Instrument): CalculatorType {
  const mouthpiece = instrument.mouthpiece;

  // Check for transverse flute (embouchure hole)
  if (mouthpiece?.embouchureHole) {
    return "flute";
  }

  // Check for fipple instruments (NAF or whistle)
  if (mouthpiece?.fipple) {
    // Try to detect from instrument name
    const name = (instrument.name ?? "").toLowerCase();

    if (name.includes("whistle")) {
      return "whistle";
    }

    if (name.includes("naf") || name.includes("native american")) {
      return "naf";
    }

    // Default fipple instruments to NAF (more common case, safer defaults)
    // NAF calculator handles thick-walled tubes better
    return "naf";
  }

  // Unknown type - use auto-detection
  return "auto";
}

/**
 * Create a calculator with explicit or auto-detected type.
 *
 * This is the main entry point for creating calculators. It can either:
 * 1. Use an explicitly specified calculator type
 * 2. Auto-detect the best type based on instrument characteristics
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @param calculatorType - Calculator type ("naf", "whistle", "flute", "auto")
 * @returns Configured instrument calculator
 *
 * @example
 * // Explicit type
 * const calc = createCalculator(instrument, params, "naf");
 *
 * @example
 * // Auto-detect
 * const calc = createCalculator(instrument, params, "auto");
 * // or just:
 * const calc = createCalculator(instrument, params);
 */
export function createCalculator(
  instrument: Instrument,
  params: PhysicalParameters,
  calculatorType: CalculatorType = "auto"
): DefaultInstrumentCalculator {
  // Auto-detect if requested
  const effectiveType = calculatorType === "auto"
    ? detectCalculatorType(instrument)
    : calculatorType;

  switch (effectiveType) {
    case "naf":
      return createNAFCalculator(instrument, params);

    case "whistle":
      return createWhistleCalculator(instrument, params);

    case "flute":
      return createFluteCalculator(instrument, params);

    case "auto":
    default:
      return createGenericCalculator(instrument, params);
  }
}

/**
 * Create a calculator for an instrument, auto-detecting the type.
 *
 * Convenience function equivalent to `createCalculator(instrument, params, "auto")`.
 *
 * @param instrument - Instrument geometry
 * @param params - Physical parameters (temperature, humidity, etc.)
 * @returns Configured instrument calculator with auto-detected type
 */
export function createCalculatorForInstrument(
  instrument: Instrument,
  params: PhysicalParameters
): DefaultInstrumentCalculator {
  return createCalculator(instrument, params, "auto");
}
