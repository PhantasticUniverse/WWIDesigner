/**
 * Trace full impedance calculation to compare with Java.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";
import { PlayingRange } from "../../../src/core/modelling/playing-range.ts";
import { cents } from "../../../src/core/constants.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";

async function loadFiles() {
  const instFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`);
  const tuningFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`);
  return {
    instrument: parseInstrumentXml(await instFile.text()),
    tuning: parseTuningXml(await tuningFile.text()),
  };
}

const NAF_HOLE_SIZE_MULT = 0.9605;

async function main() {
  const { instrument, tuning } = await loadFiles();

  // Use 72°F (22.22°C), matching Java test
  const params = new PhysicalParameters(72, "F");

  // NAF calculator settings (matching Java's NAFCalculator)
  const nafHoleCalculator = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
  const calculator = new DefaultInstrumentCalculator(
    instrument,
    params,
    undefined, // use auto-detected mouthpiece calculator
    thickFlangedEndCalculator,
    nafHoleCalculator,
    undefined // use default bore section calculator
  );

  console.log("=== Full Calculation Trace ===\n");

  // Check what the calculator's instrument looks like
  const internalInst = calculator.getInstrument();
  console.log("=== Internal Instrument (metres) ===");
  console.log(`Mouthpiece position: ${internalInst.mouthpiece.position} m`);
  console.log(`Mouthpiece boreDiameter: ${internalInst.mouthpiece.boreDiameter} m`);
  console.log(`Headspace sections: ${internalInst.mouthpiece.headspace?.length ?? 0}`);
  if (internalInst.mouthpiece.headspace) {
    for (const hs of internalInst.mouthpiece.headspace) {
      console.log(`  length=${hs.length}, leftR=${hs.leftRadius}, rightR=${hs.rightRadius}`);
    }
  }

  // Get hole calculator info
  console.log(`\nHole calculator fingerAdjustment: ${nafHoleCalculator.getFingerAdjustment()}`);
  console.log(`Hole calculator holeSizeMult: ${nafHoleCalculator.getHoleSizeMult()}`);

  // First note: D4
  const firstFingering = tuning.fingering[0];
  const targetFreq = firstFingering?.note?.frequency ?? 289.42;

  console.log(`\n=== Calculation for ${firstFingering?.note?.name} (target: ${targetFreq} Hz) ===`);

  // Calculate Z at target frequency
  const Z = calculator.calcZ(targetFreq, firstFingering!);
  const boreRadius = (internalInst.mouthpiece.boreDiameter ?? 0.01) / 2;
  const Z0 = params.calcZ0(boreRadius);
  const normalizedZ = Z.divide(Z0);

  console.log(`\nAt ${targetFreq} Hz:`);
  console.log(`  Z = (${Z.re}, ${Z.im})`);
  console.log(`  Z0 = ${Z0}`);
  console.log(`  Z/Z0 = (${normalizedZ.re}, ${normalizedZ.im})`);

  // Find the playing frequency
  const playingRange = new PlayingRange(calculator, firstFingering!);
  const predicted = playingRange.findXZero(targetFreq);

  console.log(`\nPredicted frequency: ${predicted?.toFixed(2) ?? "not found"} Hz`);
  if (predicted) {
    console.log(`Deviation: ${cents(targetFreq, predicted).toFixed(2)} cents`);

    // Calculate Z at predicted frequency
    const Zpred = calculator.calcZ(predicted, firstFingering!);
    const normalizedZpred = Zpred.divide(Z0);
    console.log(`\nAt predicted frequency ${predicted.toFixed(2)} Hz:`);
    console.log(`  Z/Z0 = (${normalizedZpred.re}, ${normalizedZpred.im})`);
  }

  // Also check the impedance around the predicted frequency
  console.log("\n=== Impedance scan around target ===");
  for (let f = targetFreq - 10; f <= targetFreq + 10; f += 2) {
    const Zscan = calculator.calcZ(f, firstFingering!);
    const normZ = Zscan.divide(Z0);
    console.log(`  f=${f.toFixed(1)} Hz: Im(Z/Z0)=${normZ.im.toFixed(6)}`);
  }
}

main().catch(console.error);
