/**
 * Detailed trace of calculation for one fingering.
 * Outputs all intermediate values for comparison with Java.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { SimplePhysicalParameters } from "../../../src/core/physics/simple-physical-parameters.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";
import { Tube } from "../../../src/core/geometry/tube.ts";
import { convertInstrumentToMetres, type Instrument } from "../../../src/models/instrument.ts";
import { PlayingRange } from "../../../src/core/modelling/playing-range.ts";

const NAF_HOLE_SIZE_MULT = 0.9605;
const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";

// AIR_GAMMA from DefaultFippleMouthpieceCalculator
const AIR_GAMMA = 1.4018297351222222;
const DEFAULT_WINDWAY_HEIGHT = 0.0007874;

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

async function main() {
  const instrumentRaw = await loadInstrumentFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
  );
  const tuning = await loadTuningFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`
  );

  // Create calculator first - it sets up bore diameter on mouthpiece
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

  // Get the converted instrument from the calculator (with boreDiameter set)
  const instrument = (calculator as unknown as { instrument: Instrument }).instrument;
  const simpleParams = new SimplePhysicalParameters(params);

  console.log("=== Detailed Calculation Trace ===\n");

  // Physical parameters
  console.log("=== Physical Parameters ===");
  console.log(`Temperature: 72°F = 22.222222°C`);
  console.log(`PhysParams.speedOfSound: ${params.getSpeedOfSound().toFixed(6)} m/s`);
  console.log(`PhysParams.rho: ${params.getRho().toFixed(6)} kg/m³`);
  console.log(`SimpleParams.speedOfSound: ${simpleParams.getSpeedOfSound().toFixed(6)} m/s`);
  console.log(`SimpleParams.rho: ${simpleParams.getRho().toFixed(6)} kg/m³`);
  console.log(`SimpleParams.gamma: ${simpleParams.getGamma().toFixed(6)}`);

  // Mouthpiece parameters
  const mp = instrument.mouthpiece;
  console.log("\n=== Mouthpiece (in metres) ===");
  console.log(`position: ${mp.position.toFixed(10)} m`);
  console.log(`boreDiameter: ${mp.boreDiameter?.toFixed(10)} m`);
  console.log(`fipple.windowLength: ${mp.fipple?.windowLength.toFixed(10)} m`);
  console.log(`fipple.windowWidth: ${mp.fipple?.windowWidth.toFixed(10)} m`);
  console.log(`fipple.fippleFactor: ${mp.fipple?.fippleFactor?.toFixed(10)}`);
  console.log(`fipple.windwayHeight: ${mp.fipple?.windwayHeight?.toFixed(10)} m`);

  // Test at first note frequency (D4 at 289.42 Hz)
  const targetFreq = tuning.fingering[0]?.note?.frequency || 289.42;
  console.log(`\n=== Calculation at ${targetFreq} Hz ===`);

  const omega = 2 * Math.PI * targetFreq;
  const waveNumber = params.calcWaveNumber(targetFreq);
  const radius = 0.5 * (mp.boreDiameter ?? 0.01);

  // z0 from PhysicalParameters (like Java)
  const z0 = params.calcZ0(radius);

  console.log(`omega: ${omega.toFixed(6)} rad/s`);
  console.log(`waveNumber: ${waveNumber.toFixed(9)} rad/m`);
  console.log(`radius: ${radius.toFixed(10)} m`);
  console.log(`z0 (PhysParams): ${z0.toFixed(4)}`);

  // Fipple calculations (using SimplePhysicalParameters like Java)
  const windowLength = mp.fipple?.windowLength ?? 0;
  const windowWidth = mp.fipple?.windowWidth ?? 0;
  const windwayHeight = mp.fipple?.windwayHeight ?? DEFAULT_WINDWAY_HEIGHT;
  const fippleFactor = mp.fipple?.fippleFactor ?? 1.0;

  const effectiveArea = windowLength * windowWidth;
  const ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1.0 / 3.0);
  const scaledFippleFactor = fippleFactor * ratio;
  const charLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;

  console.log(`\n=== Fipple Calculations ===`);
  console.log(`effectiveArea: ${effectiveArea.toExponential(10)}`);
  console.log(`windwayRatio: ${ratio.toFixed(10)}`);
  console.log(`scaledFippleFactor: ${scaledFippleFactor.toFixed(10)}`);
  console.log(`charLength (equivDiameter): ${charLength.toFixed(10)} m`);

  // JYE calculation
  const JYE = charLength / (AIR_GAMMA * omega);
  console.log(`JYE: ${JYE.toExponential(15)}`);

  // JYC calculation - headspace volume
  // Position-based volume (what we use)
  const posLength = mp.position;
  const posVolume = Math.PI * radius * radius * posLength;
  const posVolumeDoubled = posVolume * 2.0;

  console.log(`\n=== Headspace Volume ===`);
  console.log(`position-based length: ${posLength.toFixed(10)} m`);
  console.log(`position-based volume: ${posVolume.toExponential(15)} m³`);
  console.log(`position-based * 2: ${posVolumeDoubled.toExponential(15)} m³`);

  // JYC with position-based volume
  const speedOfSound = simpleParams.getSpeedOfSound();
  const v = 2.0 * posVolumeDoubled; // From calcJYC: v = 2 * calcHeadspaceVolume()
  const JYC = -(omega * v) / (AIR_GAMMA * speedOfSound * speedOfSound);

  console.log(`\n=== JYC Calculation ===`);
  console.log(`v (2 * headspaceVolume * 2): ${v.toExponential(15)}`);
  console.log(`speedOfSound (SimpleParams): ${speedOfSound.toFixed(6)}`);
  console.log(`JYC: ${JYC.toExponential(15)}`);

  // k_delta_l
  const JYsum = JYE + JYC;
  const k_delta_l = Math.atan(1.0 / (z0 * JYsum));

  console.log(`\n=== k_delta_l ===`);
  console.log(`JYE + JYC: ${JYsum.toExponential(15)}`);
  console.log(`z0 * (JYE + JYC): ${(z0 * JYsum).toExponential(15)}`);
  console.log(`1 / (z0 * (JYE + JYC)): ${(1.0 / (z0 * JYsum)).toFixed(10)}`);
  console.log(`k_delta_l: ${k_delta_l.toFixed(10)} rad (${(k_delta_l * 180 / Math.PI).toFixed(4)} deg)`);

  // r_rad using Tube.calcR with PhysicalParameters
  const r_rad = Tube.calcR(targetFreq, radius, params);
  console.log(`\n=== Radiation Resistance ===`);
  console.log(`r_rad (Tube.calcR): ${r_rad.toFixed(10)}`);

  // Transfer matrix elements
  const cos_kl = Math.cos(k_delta_l);
  const sin_kl = Math.sin(k_delta_l);

  console.log(`\n=== Transfer Matrix Elements ===`);
  console.log(`cos(k_delta_l): ${cos_kl.toFixed(10)}`);
  console.log(`sin(k_delta_l): ${sin_kl.toFixed(10)}`);
  console.log(`A.re: ${cos_kl.toFixed(10)}`);
  console.log(`A.im: ${(r_rad * sin_kl / z0).toExponential(10)}`);
  console.log(`B.re: ${(r_rad * cos_kl).toFixed(10)}`);
  console.log(`B.im: ${(sin_kl * z0).toFixed(4)}`);

  // Now run the actual calculation to find the predicted frequency
  console.log("\n=== Predicted Frequency ===");
  // Calculator already created at start

  const fingering = tuning.fingering[0];
  if (fingering) {
    try {
      const playingRange = new PlayingRange(calculator, fingering);
      const predicted = playingRange.findXZero(targetFreq);
      console.log(`Target frequency: ${targetFreq.toFixed(2)} Hz`);
      console.log(`Predicted frequency: ${predicted?.toFixed(2)} Hz`);
      if (predicted) {
        const deviation = 1200 * Math.log2(predicted / targetFreq);
        console.log(`Deviation: ${deviation.toFixed(2)} cents`);
      }
    } catch (e) {
      console.log(`Error finding predicted frequency: ${e}`);
    }
  }
}

main().catch(console.error);
