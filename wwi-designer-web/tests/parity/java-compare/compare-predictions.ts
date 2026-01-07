/**
 * Compare predictions between position-based and bore-section-based headspace.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { buildHeadspace } from "../../../src/models/instrument.ts";
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

  console.log("=== NAF Tuning Predictions ===\n");
  console.log("Note\t\tTarget\t\tPredicted\tDeviation");
  console.log("----\t\t------\t\t---------\t---------");

  let totalDeviation = 0;
  let count = 0;

  for (const fingering of tuning.fingering) {
    const note = fingering.note;
    if (!note?.name || !note?.frequency) continue;

    const target = note.frequency;
    const playingRange = new PlayingRange(calculator, fingering);
    const predicted = playingRange.findXZero(target);

    if (predicted) {
      const deviation = cents(target, predicted);
      totalDeviation += Math.abs(deviation);
      count++;
      console.log(`${note.name}\t\t${target.toFixed(2)}\t\t${predicted.toFixed(2)}\t\t${deviation.toFixed(2)} cents`);
    }
  }

  console.log(`\nTotal: ${count} notes`);
  console.log(`Average |deviation|: ${(totalDeviation / count).toFixed(2)} cents`);

  // Get calculator's internal instrument (converted to metres) and show headspace info
  const internalInst = calculator.getInstrument();
  console.log("\n=== Headspace Info (from calculator's instrument) ===");
  const headspace = internalInst.mouthpiece.headspace ?? [];
  console.log(`Number of headspace sections: ${headspace.length}`);
  let hsVolume = 0;
  for (const section of headspace) {
    const leftR = section.leftRadius;
    const rightR = section.rightRadius;
    const length = section.length;
    const vol = (Math.PI / 3) * length * (leftR * leftR + leftR * rightR + rightR * rightR);
    hsVolume += vol;
    console.log(`  Section: length=${length.toFixed(6)}m, vol=${vol.toExponential(6)} m³`);
  }
  console.log(`Total bore-section volume: ${hsVolume.toExponential(6)} m³`);
  console.log(`Bore-section * 2 (calcHeadspaceVolume return): ${(hsVolume * 2).toExponential(6)} m³`);

  // Position-based comparison
  const mpPos = internalInst.mouthpiece.position;
  const radius = (internalInst.mouthpiece.boreDiameter ?? 0.01) / 2;
  const posVolume = Math.PI * radius * radius * mpPos;
  console.log(`\nPosition-based volume: ${posVolume.toExponential(6)} m³`);
  console.log(`Position-based * 2: ${(posVolume * 2).toExponential(6)} m³`);
  console.log(`Ratio (bore-section/position): ${(hsVolume / posVolume).toFixed(4)}`);
}

main().catch(console.error);
