/**
 * Trace full impedance calculation to identify where TypeScript differs from Java.
 *
 * This traces the full calculation chain for a single frequency and fingering.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";

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

  console.log("=== Full Impedance Chain Trace ===\n");

  // Get internal instrument
  const inst = calculator.getInstrument();

  // Show instrument structure
  console.log("=== Instrument Structure (metres) ===");
  console.log(`Mouthpiece position: ${inst.mouthpiece.position}`);
  console.log(`Mouthpiece bore diameter: ${inst.mouthpiece.boreDiameter}`);
  console.log(`Headspace sections: ${inst.mouthpiece.headspace?.length ?? 0}`);
  if (inst.mouthpiece.headspace) {
    for (let i = 0; i < inst.mouthpiece.headspace.length; i++) {
      const hs = inst.mouthpiece.headspace[i]!;
      console.log(`  [${i}] length=${hs.length.toFixed(6)}, leftR=${hs.leftRadius.toFixed(6)}, rightR=${hs.rightRadius.toFixed(6)}`);
    }
  }

  console.log(`\nBore points: ${inst.borePoint.length}`);
  for (let i = 0; i < inst.borePoint.length; i++) {
    const bp = inst.borePoint[i]!;
    console.log(`  [${i}] pos=${bp.borePosition.toFixed(6)}, dia=${bp.boreDiameter.toFixed(6)}`);
  }

  console.log(`\nHoles: ${inst.hole.length}`);
  for (let i = 0; i < inst.hole.length; i++) {
    const h = inst.hole[i]!;
    console.log(`  [${i}] ${h.name}: pos=${h.position.toFixed(6)}, dia=${h.diameter.toFixed(6)}, height=${h.height.toFixed(6)}, boreDia=${h.boreDiameter?.toFixed(6) ?? "?"}`);
  }

  console.log(`\nTermination:`);
  console.log(`  bore dia: ${inst.termination.boreDiameter?.toFixed(6)}`);
  console.log(`  flange dia: ${inst.termination.flangeDiameter.toFixed(6)}`);

  // First fingering (D4 - all holes closed)
  const fingering = tuning.fingering[0]!;
  console.log(`\n=== Fingering: ${fingering.note?.name} ===`);
  console.log(`Open holes: ${fingering.openHole.map((h, i) => h ? `Hole ${i+1}` : "").filter(x => x).join(", ") || "none"}`);

  // Calculate Z at target frequency
  const targetFreq = fingering.note?.frequency ?? 289.42;
  console.log(`\n=== Impedance at ${targetFreq} Hz ===`);

  const Z = calculator.calcZ(targetFreq, fingering);
  const boreRadius = (inst.mouthpiece.boreDiameter ?? 0.01) / 2;
  const Z0 = params.calcZ0(boreRadius);

  console.log(`Z = (${Z.re}, ${Z.im})`);
  console.log(`Z0 = ${Z0}`);
  console.log(`Z/Z0 = (${Z.re/Z0}, ${Z.im/Z0})`);

  // Try a few frequencies to find the zero-crossing
  console.log(`\n=== Impedance scan ===`);
  for (let f = 280; f <= 295; f += 1) {
    const Zf = calculator.calcZ(f, fingering);
    console.log(`f=${f}: Im(Z)=${Zf.im.toFixed(2)}, Im(Z/Z0)=${(Zf.im/Z0).toFixed(6)}`);
  }

  // Also test with an open hole fingering (F4 - hole 6 open)
  const fingering2 = tuning.fingering[1]!;
  const targetFreq2 = fingering2.note?.frequency ?? 331.14;
  console.log(`\n=== Fingering: ${fingering2.note?.name} (hole 6 open) ===`);

  const Z2 = calculator.calcZ(targetFreq2, fingering2);
  console.log(`Z at ${targetFreq2} Hz = (${Z2.re}, ${Z2.im})`);
  console.log(`Z/Z0 = (${Z2.re/Z0}, ${Z2.im/Z0})`);

  console.log(`\n=== Impedance scan for F4 ===`);
  for (let f = 320; f <= 340; f += 2) {
    const Zf = calculator.calcZ(f, fingering2);
    console.log(`f=${f}: Im(Z)=${Zf.im.toFixed(2)}, Im(Z/Z0)=${(Zf.im/Z0).toFixed(6)}`);
  }
}

main().catch(console.error);
