/**
 * Debug script to trace exact mouthpiece calculator values.
 * Adds instrumentation to see what the actual calculator computes.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { SimplePhysicalParameters } from "../../../src/core/physics/simple-physical-parameters.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";
import { Tube } from "../../../src/core/geometry/tube.ts";
import { Complex } from "../../../src/core/math/complex.ts";
import type { Instrument, Mouthpiece, BoreSection } from "../../../src/models/instrument.ts";

const NAF_HOLE_SIZE_MULT = 0.9605;
const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";
const AIR_GAMMA = 1.4018297351222222;

async function loadInstrumentFromPath(path: string) {
  const file = Bun.file(path);
  const xml = await file.text();
  return parseInstrumentXml(xml);
}

async function loadTuningFromPath(path: string) {
  const file = Bun.file(path);
  const xml = await file.text();
  return parseTuningXml(xml);
}

/**
 * Manual implementation matching Java's DefaultFippleMouthpieceCalculator
 * to trace values step by step.
 */
function traceJavaCalculation(
  mouthpiece: Mouthpiece,
  waveNumber: number,
  params: PhysicalParameters,
  headspace: BoreSection[]
) {
  const simpleParams = new SimplePhysicalParameters(params);

  const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
  const z0 = params.calcZ0(radius);
  const omega = waveNumber * params.getSpeedOfSound();
  const freq = omega / (2 * Math.PI);

  console.log("\n=== Java-style Calculation (bore-section headspace) ===");
  console.log(`waveNumber: ${waveNumber.toFixed(10)}`);
  console.log(`omega: ${omega.toFixed(6)}`);
  console.log(`freq: ${freq.toFixed(2)} Hz`);
  console.log(`radius: ${radius.toFixed(10)} m`);
  console.log(`z0 (PhysParams): ${z0.toFixed(4)}`);

  // JYE calculation
  const windowLength = mouthpiece.fipple?.windowLength ?? 0;
  const windowWidth = mouthpiece.fipple?.windowWidth ?? 0;
  const windwayHeight = mouthpiece.fipple?.windwayHeight ?? 0.00078740;
  const fippleFactor = mouthpiece.fipple?.fippleFactor ?? 1.0;

  const effectiveArea = windowLength * windowWidth;
  const ratio = Math.pow(0.00078740 / windwayHeight, 1.0 / 3.0);
  const scaledFippleFactor = fippleFactor * ratio;
  const charLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;
  const JYE = charLength / (AIR_GAMMA * omega);

  console.log(`\nJYE calculation:`);
  console.log(`  charLength: ${charLength.toFixed(10)} m`);
  console.log(`  JYE: ${JYE.toExponential(15)}`);

  // JYC calculation using bore-section headspace (Java-style)
  let hsVolume = 0;
  for (const section of headspace) {
    const leftR = section.leftRadius;
    const rightR = section.rightRadius;
    const frustumVol = (Math.PI / 3) * section.length *
      (leftR * leftR + leftR * rightR + rightR * rightR);
    hsVolume += frustumVol;
  }
  const hsVolumeTimesTwo = hsVolume * 2.0;
  const v = 2.0 * hsVolumeTimesTwo;
  const speedOfSound = simpleParams.getSpeedOfSound();
  const JYC = -(omega * v) / (AIR_GAMMA * speedOfSound * speedOfSound);

  console.log(`\nJYC calculation (bore-section):`);
  console.log(`  headspace sections: ${headspace.length}`);
  if (headspace.length > 0) {
    console.log(`  section[0]: length=${headspace[0].length.toFixed(10)}, r=${headspace[0].leftRadius.toFixed(10)}`);
  }
  console.log(`  raw volume: ${hsVolume.toExponential(15)} m³`);
  console.log(`  volume * 2: ${hsVolumeTimesTwo.toExponential(15)} m³`);
  console.log(`  v = 2 * (volume * 2): ${v.toExponential(15)} m³`);
  console.log(`  speedOfSound (SimpleParams): ${speedOfSound.toFixed(6)} m/s`);
  console.log(`  JYC: ${JYC.toExponential(15)}`);

  // k_delta_l
  const JYsum = JYE + JYC;
  const k_delta_l = Math.atan(1.0 / (z0 * JYsum));

  console.log(`\nk_delta_l calculation:`);
  console.log(`  JYE + JYC: ${JYsum.toExponential(15)}`);
  console.log(`  z0 * sum: ${(z0 * JYsum).toFixed(10)}`);
  console.log(`  k_delta_l: ${k_delta_l.toFixed(10)} rad (${(k_delta_l * 180 / Math.PI).toFixed(4)} deg)`);

  // Transfer matrix
  const r_rad = Tube.calcR(freq, radius, params);
  const cos_kl = Math.cos(k_delta_l);
  const sin_kl = Math.sin(k_delta_l);

  console.log(`\nTransfer matrix:`);
  console.log(`  r_rad: ${r_rad.toFixed(10)}`);
  console.log(`  cos(k_delta_l): ${cos_kl.toFixed(10)}`);
  console.log(`  sin(k_delta_l): ${sin_kl.toFixed(10)}`);
  console.log(`  A = (${cos_kl.toFixed(10)}, ${(r_rad * sin_kl / z0).toExponential(10)})`);
  console.log(`  B = (${(r_rad * cos_kl).toFixed(10)}, ${(sin_kl * z0).toFixed(4)})`);

  return { k_delta_l, JYE, JYC, z0, omega };
}

function tracePositionBasedCalculation(
  mouthpiece: Mouthpiece,
  waveNumber: number,
  params: PhysicalParameters
) {
  const simpleParams = new SimplePhysicalParameters(params);

  const radius = 0.5 * (mouthpiece.boreDiameter ?? 0.01);
  const z0 = params.calcZ0(radius);
  const omega = waveNumber * params.getSpeedOfSound();
  const freq = omega / (2 * Math.PI);

  console.log("\n=== TypeScript Current (position-based headspace) ===");

  // JYE calculation (same)
  const windowLength = mouthpiece.fipple?.windowLength ?? 0;
  const windowWidth = mouthpiece.fipple?.windowWidth ?? 0;
  const windwayHeight = mouthpiece.fipple?.windwayHeight ?? 0.00078740;
  const fippleFactor = mouthpiece.fipple?.fippleFactor ?? 1.0;

  const effectiveArea = windowLength * windowWidth;
  const ratio = Math.pow(0.00078740 / windwayHeight, 1.0 / 3.0);
  const scaledFippleFactor = fippleFactor * ratio;
  const charLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;
  const JYE = charLength / (AIR_GAMMA * omega);

  console.log(`  JYE: ${JYE.toExponential(15)}`);

  // JYC calculation using position-based headspace (current TypeScript)
  const posLength = mouthpiece.position;
  const posVolume = Math.PI * radius * radius * posLength;
  const posVolumeTimesTwo = posVolume * 2.0;
  const v = 2.0 * posVolumeTimesTwo;
  const speedOfSound = simpleParams.getSpeedOfSound();
  const JYC = -(omega * v) / (AIR_GAMMA * speedOfSound * speedOfSound);

  console.log(`\nJYC calculation (position-based):`);
  console.log(`  position: ${posLength.toFixed(10)} m`);
  console.log(`  radius: ${radius.toFixed(10)} m`);
  console.log(`  raw volume: ${posVolume.toExponential(15)} m³`);
  console.log(`  volume * 2: ${posVolumeTimesTwo.toExponential(15)} m³`);
  console.log(`  v = 2 * (volume * 2): ${v.toExponential(15)} m³`);
  console.log(`  JYC: ${JYC.toExponential(15)}`);

  // k_delta_l
  const JYsum = JYE + JYC;
  const k_delta_l = Math.atan(1.0 / (z0 * JYsum));

  console.log(`\nk_delta_l calculation:`);
  console.log(`  JYE + JYC: ${JYsum.toExponential(15)}`);
  console.log(`  z0 * sum: ${(z0 * JYsum).toFixed(10)}`);
  console.log(`  k_delta_l: ${k_delta_l.toFixed(10)} rad (${(k_delta_l * 180 / Math.PI).toFixed(4)} deg)`);

  // Transfer matrix
  const r_rad = Tube.calcR(freq, radius, params);
  const cos_kl = Math.cos(k_delta_l);
  const sin_kl = Math.sin(k_delta_l);

  console.log(`\nTransfer matrix:`);
  console.log(`  cos(k_delta_l): ${cos_kl.toFixed(10)}`);
  console.log(`  sin(k_delta_l): ${sin_kl.toFixed(10)}`);
  console.log(`  A = (${cos_kl.toFixed(10)}, ${(r_rad * sin_kl / z0).toExponential(10)})`);
  console.log(`  B = (${(r_rad * cos_kl).toFixed(10)}, ${(sin_kl * z0).toFixed(4)})`);

  return { k_delta_l, JYE, JYC, z0, omega };
}

async function main() {
  const instrumentRaw = await loadInstrumentFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
  );
  const tuning = await loadTuningFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`
  );

  const params = new PhysicalParameters(72, "F");
  const nafHoleCalculator = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
  const calculator = new DefaultInstrumentCalculator(
    instrumentRaw,
    params,
    undefined,
    thickFlangedEndCalculator,
    nafHoleCalculator,
    undefined
  );

  const instrument = (calculator as unknown as { instrument: Instrument }).instrument;
  const mouthpiece = instrument.mouthpiece;
  const headspace = mouthpiece.headspace ?? [];

  const targetFreq = tuning.fingering[0]?.note?.frequency || 289.42;
  const waveNumber = params.calcWaveNumber(targetFreq);

  console.log("=== Mouthpiece Configuration ===");
  console.log(`position: ${mouthpiece.position.toFixed(10)} m`);
  console.log(`boreDiameter: ${mouthpiece.boreDiameter?.toFixed(10)} m`);
  console.log(`headspace sections: ${headspace.length}`);
  if (headspace.length > 0) {
    const hs = headspace[0];
    console.log(`  [0] length: ${hs.length.toFixed(10)} m, leftR: ${hs.leftRadius.toFixed(10)}, rightR: ${hs.rightRadius.toFixed(10)}`);
  }

  // Trace both calculation methods
  const javaResult = traceJavaCalculation(mouthpiece, waveNumber, params, headspace);
  const tsResult = tracePositionBasedCalculation(mouthpiece, waveNumber, params);

  console.log("\n=== COMPARISON ===");
  console.log(`k_delta_l difference: ${(javaResult.k_delta_l - tsResult.k_delta_l).toFixed(10)} rad`);
  console.log(`                    = ${((javaResult.k_delta_l - tsResult.k_delta_l) * 180 / Math.PI).toFixed(4)} degrees`);
  console.log(`JYC difference: ${(javaResult.JYC - tsResult.JYC).toExponential(10)}`);

  // Calculate what frequency difference this causes
  // The k_delta_l affects the phase, which affects where the zero crossing is
  const dkdl = javaResult.k_delta_l - tsResult.k_delta_l;
  // Rough approximation: delta_f / f ≈ delta_k_delta_l / (k * L)
  // where k * L is the total phase through the instrument
  console.log(`\nThis k_delta_l difference would cause approximately:`);
  console.log(`  ${(dkdl * 1200 / Math.PI).toFixed(1)} cents frequency shift (rough estimate)`);
}

main().catch(console.error);
