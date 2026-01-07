/**
 * Trace exactly how headspace is built in TypeScript.
 */

import { parseInstrumentXml } from "../../../src/utils/xml-converter.ts";
import { buildHeadspace } from "../../../src/models/instrument.ts";
import { convertInstrumentToMetres } from "../../../src/models/instrument.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";

async function loadInstrumentFromPath(path: string) {
  const file = Bun.file(path);
  const xml = await file.text();
  return parseInstrumentXml(xml);
}

async function main() {
  const instrumentRaw = await loadInstrumentFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
  );

  console.log("=== Raw Instrument (in original units - inches) ===\n");
  console.log(`Mouthpiece position: ${instrumentRaw.mouthpiece.position} in`);
  console.log(`Mouthpiece boreDiameter: ${instrumentRaw.mouthpiece.boreDiameter}`);

  console.log("\nBore points:");
  if (instrumentRaw.borePoint) {
    for (const bp of instrumentRaw.borePoint) {
      console.log(`  Position: ${bp.borePosition.toFixed(6)} in, Diameter: ${bp.boreDiameter.toFixed(6)} in`);
    }
  }

  // Convert to metres
  const instrument = convertInstrumentToMetres(instrumentRaw);

  console.log("\n=== Converted Instrument (metres) ===\n");
  console.log(`Mouthpiece position: ${instrument.mouthpiece.position.toFixed(10)} m (${(instrument.mouthpiece.position * 1000).toFixed(4)} mm)`);

  console.log("\nBore points:");
  if (instrument.borePoint) {
    for (const bp of instrument.borePoint) {
      console.log(`  Position: ${bp.borePosition.toFixed(10)} m (${(bp.borePosition * 1000).toFixed(4)} mm), Diameter: ${bp.boreDiameter.toFixed(10)} m`);
    }
  }

  // Build headspace
  const headspace = buildHeadspace(instrument);

  console.log("\n=== Built Headspace Sections ===\n");
  console.log(`Number of sections: ${headspace.length}`);

  let totalVolume = 0;
  for (let i = 0; i < headspace.length; i++) {
    const section = headspace[i];
    if (!section) continue;
    const leftR = section.leftRadius;
    const rightR = section.rightRadius;
    const length = section.length;
    // Frustum volume
    const volume = (Math.PI / 3) * length * (leftR * leftR + leftR * rightR + rightR * rightR);
    totalVolume += volume;
    console.log(`Section ${i}:`);
    console.log(`  Length: ${length.toFixed(10)} m (${(length * 1000).toFixed(4)} mm)`);
    console.log(`  Left radius: ${leftR.toFixed(10)} m`);
    console.log(`  Right radius: ${rightR.toFixed(10)} m`);
    console.log(`  Right bore position: ${section.rightBorePosition.toFixed(10)} m`);
    console.log(`  Volume: ${volume.toExponential(15)} m³`);
  }

  console.log(`\nTotal headspace volume: ${totalVolume.toExponential(15)} m³`);
  console.log(`Total * 2 (Java's calcHeadspaceVolume return): ${(totalVolume * 2).toExponential(15)} m³`);

  // Position-based volume for comparison
  const mpPos = instrument.mouthpiece.position;
  const radius = instrument.borePoint![0]!.boreDiameter / 2;  // First bore point diameter
  const posVolume = Math.PI * radius * radius * mpPos;

  console.log("\n=== Position-based Comparison ===");
  console.log(`Mouthpiece position: ${mpPos.toFixed(10)} m (${(mpPos * 1000).toFixed(4)} mm)`);
  console.log(`Radius (from first bore point): ${radius.toFixed(10)} m`);
  console.log(`Position-based volume: ${posVolume.toExponential(15)} m³`);
  console.log(`Position-based * 2: ${(posVolume * 2).toExponential(15)} m³`);
  console.log(`\nBore-section / Position-based ratio: ${((totalVolume * 2) / (posVolume * 2)).toFixed(6)}`);

  // Java-style headspace calculation
  // Java creates a section from first bore point to mouthpiece
  const firstBorePos = instrument.borePoint![0]!.borePosition;
  const javaLength = mpPos - firstBorePos;
  const javaVolume = Math.PI * radius * radius * javaLength;

  console.log("\n=== Java-style Headspace ===");
  console.log(`First bore position: ${firstBorePos.toFixed(10)} m (${(firstBorePos * 1000).toFixed(4)} mm)`);
  console.log(`Headspace length (mp - firstBore): ${javaLength.toFixed(10)} m (${(javaLength * 1000).toFixed(4)} mm)`);
  console.log(`Java-style volume: ${javaVolume.toExponential(15)} m³`);
  console.log(`Java-style * 2: ${(javaVolume * 2).toExponential(15)} m³`);
}

main().catch(console.error);
