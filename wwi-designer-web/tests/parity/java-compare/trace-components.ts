/**
 * Trace component lists to compare with Java.
 * This dumps all bore sections and holes in order.
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

  // NAF calculator settings
  const nafHoleCalculator = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
  const calculator = new DefaultInstrumentCalculator(
    instrument,
    params,
    undefined,
    thickFlangedEndCalculator,
    nafHoleCalculator,
    undefined
  );

  console.log("=== Component List Trace (TypeScript) ===\n");

  // Access the internal components (need to expose this or extract from calculator)
  // For now, let's reconstruct by looking at the instrument structure
  const inst = calculator.getInstrument();

  console.log("=== Instrument Structure ===");
  console.log(`Mouthpiece position: ${inst.mouthpiece.position.toFixed(8)} m`);
  console.log(`Mouthpiece boreDiameter: ${inst.mouthpiece.boreDiameter?.toFixed(8) ?? "?"} m`);

  console.log(`\n=== Bore Points ===`);
  for (let i = 0; i < inst.borePoint.length; i++) {
    const bp = inst.borePoint[i]!;
    console.log(`BorePoint[${i}]: pos=${bp.borePosition.toFixed(8)} m, dia=${bp.boreDiameter.toFixed(8)} m`);
  }

  console.log(`\n=== Holes ===`);
  for (let i = 0; i < inst.hole.length; i++) {
    const h = inst.hole[i]!;
    console.log(`Hole[${i}] (${h.name}): pos=${h.position.toFixed(8)} m, dia=${h.diameter.toFixed(8)} m, height=${h.height.toFixed(8)} m, boreDia=${h.boreDiameter?.toFixed(8) ?? "?"} m`);
  }

  console.log(`\n=== Termination ===`);
  console.log(`Position: ${inst.termination.borePosition?.toFixed(8) ?? "?"} m`);
  console.log(`Bore diameter: ${inst.termination.boreDiameter?.toFixed(8) ?? "?"} m`);
  console.log(`Flange diameter: ${inst.termination.flangeDiameter.toFixed(8)} m`);

  console.log(`\n=== Headspace Sections ===`);
  if (inst.mouthpiece.headspace) {
    for (let i = 0; i < inst.mouthpiece.headspace.length; i++) {
      const hs = inst.mouthpiece.headspace[i]!;
      console.log(`Headspace[${i}]: length=${hs.length.toFixed(8)} m, leftR=${hs.leftRadius.toFixed(8)} m, rightR=${hs.rightRadius.toFixed(8)} m`);
    }
  } else {
    console.log("No headspace sections");
  }

  // Now test impedance at first note
  const fingering = tuning.fingering[0]!;
  const targetFreq = fingering.note?.frequency ?? 289.42;
  console.log(`\n=== Test Impedance Calculation ===`);
  console.log(`Note: ${fingering.note?.name}, Target freq: ${targetFreq} Hz`);
  console.log(`Open holes: ${fingering.openHole.map((h, i) => h ? i : "").filter(x => x !== "").join(", ") || "none"}`);

  const Z = calculator.calcZ(targetFreq, fingering);
  const boreRadius = (inst.mouthpiece.boreDiameter ?? 0.01) / 2;
  const Z0 = params.calcZ0(boreRadius);

  console.log(`\nZ = (${Z.re}, ${Z.im})`);
  console.log(`Z0 = ${Z0}`);
  console.log(`Z/Z0 = (${Z.re/Z0}, ${Z.im/Z0})`);
}

main().catch(console.error);
