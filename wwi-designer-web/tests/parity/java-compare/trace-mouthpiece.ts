/**
 * Trace mouthpiece calculator values for comparison with Java.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { buildHeadspace } from "../../../src/models/instrument.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { SimplePhysicalParameters } from "../../../src/core/physics/simple-physical-parameters.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";

async function loadFiles() {
  const instFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`);
  const tuningFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`);
  return {
    instrument: parseInstrumentXml(await instFile.text()),
    tuning: parseTuningXml(await tuningFile.text()),
  };
}

const AIR_GAMMA = 1.4018297351222222;
const INCH_TO_METRE = 0.0254;

function getSectionVolume(length: number, leftRadius: number, rightRadius: number): number {
  return (Math.PI * length / 3) *
    (leftRadius * leftRadius + leftRadius * rightRadius + rightRadius * rightRadius);
}

async function main() {
  const { instrument, tuning } = await loadFiles();

  console.log("=== Mouthpiece Calculator Trace ===\n");

  // Use 72°F (22.22°C), matching Java test
  const params = new PhysicalParameters(72, "F");
  const simpleParams = new SimplePhysicalParameters(params.getTemperature());

  console.log("=== Physical Parameters ===");
  console.log(`Temperature: 72°F = ${params.getTemperature()}°C`);
  console.log(`PhysicalParameters.getSpeedOfSound(): ${params.getSpeedOfSound()}`);
  console.log(`SimplePhysicalParameters.getSpeedOfSound(): ${simpleParams.getSpeedOfSound()}`);
  console.log(`SimplePhysicalParameters.getRho(): ${simpleParams.getRho()}`);
  console.log(`SimplePhysicalParameters.getGamma(): ${simpleParams.getGamma()}`);
  console.log(`AIR_GAMMA (hardcoded): ${AIR_GAMMA}`);

  // Convert instrument to metres
  const mp = instrument.mouthpiece;
  const mpPosition = mp.position * INCH_TO_METRE;
  const boreDiameter = instrument.borePoint[0].boreDiameter * INCH_TO_METRE;
  const radius = boreDiameter / 2;

  // Build headspace
  const headspaceSections = buildHeadspace({
    ...instrument,
    mouthpiece: {
      ...mp,
      position: mpPosition,
      boreDiameter: boreDiameter,
    },
    borePoint: instrument.borePoint.map(bp => ({
      borePosition: bp.borePosition * INCH_TO_METRE,
      boreDiameter: bp.boreDiameter * INCH_TO_METRE,
    })),
  });

  console.log("\n=== Mouthpiece (in metres) ===");
  console.log(`Position: ${mpPosition} m`);
  console.log(`Bore diameter: ${boreDiameter} m`);
  console.log(`Bore radius: ${radius} m`);

  // Fipple parameters (converted to metres)
  const windowLength = mp.fipple!.windowLength * INCH_TO_METRE;
  const windowWidth = mp.fipple!.windowWidth * INCH_TO_METRE;
  const windwayHeight = mp.fipple!.windwayHeight! * INCH_TO_METRE;
  const fippleFactor = mp.fipple!.fippleFactor;

  console.log("\n=== Fipple (in metres) ===");
  console.log(`Window length: ${windowLength} m`);
  console.log(`Window width: ${windowWidth} m`);
  console.log(`Windway height: ${windwayHeight} m`);
  console.log(`Fipple factor: ${fippleFactor}`);

  // Calculate characteristic length
  const DEFAULT_WINDWAY_HEIGHT = 0.00078740;
  const ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1/3);
  const scaledFippleFactor = fippleFactor! * ratio;
  const effectiveArea = windowLength * windowWidth;
  const characteristicLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;

  console.log("\n=== Characteristic Length Calculation ===");
  console.log(`DEFAULT_WINDWAY_HEIGHT: ${DEFAULT_WINDWAY_HEIGHT} m`);
  console.log(`windwayHeight/DEFAULT ratio: ${windwayHeight / DEFAULT_WINDWAY_HEIGHT}`);
  console.log(`ratio (cube root): ${ratio}`);
  console.log(`scaledFippleFactor: ${scaledFippleFactor}`);
  console.log(`effectiveArea: ${effectiveArea} m²`);
  console.log(`characteristicLength: ${characteristicLength} m`);

  // Headspace volume calculation
  console.log("\n=== Headspace Volume ===");
  console.log(`Number of headspace sections: ${headspaceSections.length}`);
  let boreSectionVolume = 0;
  for (const section of headspaceSections) {
    const vol = getSectionVolume(section.length, section.leftRadius, section.rightRadius);
    boreSectionVolume += vol;
    console.log(`  Section: length=${section.length} m, leftR=${section.leftRadius}, rightR=${section.rightRadius}, vol=${vol}`);
  }
  console.log(`Total bore-section volume: ${boreSectionVolume} m³`);
  console.log(`calcHeadspaceVolume return (volume * 2.0): ${boreSectionVolume * 2.0} m³`);

  // For one target frequency (first note: D4)
  const targetFreq = 289.42;
  const omega = 2 * Math.PI * targetFreq;
  const speedOfSound = simpleParams.getSpeedOfSound();
  const z0 = simpleParams.calcZ0(radius);
  const v = 2.0 * (boreSectionVolume * 2.0); // v = 2 * calcHeadspaceVolume()

  console.log("\n=== JYE and JYC Calculation (for D4 = 289.42 Hz) ===");
  console.log(`omega = 2π * ${targetFreq} = ${omega}`);
  console.log(`z0 = ${z0}`);
  console.log(`v (2 * calcHeadspaceVolume) = ${v} m³`);

  const JYE = characteristicLength / (AIR_GAMMA * omega);
  const JYC = -(omega * v) / (AIR_GAMMA * speedOfSound * speedOfSound);

  console.log(`\nJYE = characteristicLength / (gamma * omega)`);
  console.log(`    = ${characteristicLength} / (${AIR_GAMMA} * ${omega})`);
  console.log(`    = ${JYE}`);

  console.log(`\nJYC = -(omega * v) / (gamma * c²)`);
  console.log(`    = -(${omega} * ${v}) / (${AIR_GAMMA} * ${speedOfSound}²)`);
  console.log(`    = ${JYC}`);

  console.log(`\nJYE + JYC = ${JYE + JYC}`);

  const k_delta_l = Math.atan(1.0 / (z0 * (JYE + JYC)));
  console.log(`\nk_delta_l = atan(1 / (z0 * (JYE + JYC)))`);
  console.log(`          = atan(1 / (${z0} * ${JYE + JYC}))`);
  console.log(`          = ${k_delta_l}`);

  // Calculate radiation resistance
  const freq = omega / (2 * Math.PI);
  const c = speedOfSound;
  const rho = simpleParams.getRho();
  const waveNumber = omega / c;
  const ka = waveNumber * radius;
  const r_rad = (rho * c / (Math.PI * radius * radius)) * ka * ka / 4;
  console.log(`\nr_rad calculation:`);
  console.log(`  ka = ${ka}`);
  console.log(`  r_rad = ${r_rad}`);

  // Transfer matrix elements
  const cos_kl = Math.cos(k_delta_l);
  const sin_kl = Math.sin(k_delta_l);

  console.log(`\n=== Transfer Matrix Elements ===`);
  console.log(`cos(k_delta_l) = ${cos_kl}`);
  console.log(`sin(k_delta_l) = ${sin_kl}`);
  console.log(`A = (${cos_kl}, ${r_rad * sin_kl / z0})`);
  console.log(`B = (${r_rad * cos_kl}, ${sin_kl * z0})`);
  console.log(`C = (0, ${sin_kl / z0})`);
  console.log(`D = (${cos_kl}, 0)`);
}

main().catch(console.error);
