/**
 * Compare TypeScript predictions with Java predictions.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";
import { PlayingRange } from "../../../src/core/modelling/playing-range.ts";
import { cents } from "../../../src/core/constants.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";
const NAF_HOLE_SIZE_MULT = 0.9605;

async function loadFiles() {
  const instFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`);
  const tuningFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`);
  return {
    instrument: parseInstrumentXml(await instFile.text()),
    tuning: parseTuningXml(await tuningFile.text()),
  };
}

async function main() {
  const { instrument, tuning } = await loadFiles();

  const params = new PhysicalParameters(72, "F");
  const nafHoleCalculator = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
  const calculator = new DefaultInstrumentCalculator(
    instrument,
    params,
    undefined,
    thickFlangedEndCalculator,
    nafHoleCalculator,
    undefined
  );

  console.log("=== TypeScript Predictions ===\n");
  console.log("Note\t\t\tTarget (Hz)\tPredicted (Hz)\tDeviation (cents)");
  console.log("----\t\t\t----------\t--------------\t-----------------");

  let totalCents = 0;
  let count = 0;

  for (const fingering of tuning.fingering) {
    if (!fingering.note?.frequency) continue;

    const targetFreq = fingering.note.frequency;
    const playingRange = new PlayingRange(calculator, fingering);
    const predicted = playingRange.findXZero(targetFreq);

    if (predicted !== null) {
      const deviation = cents(targetFreq, predicted);
      const name = fingering.note.name ?? "Note " + count;
      console.log(name.padEnd(16) + "\t" + targetFreq.toFixed(2) + "\t\t" + predicted.toFixed(2) + "\t\t" + deviation.toFixed(2));
      totalCents += Math.abs(deviation);
      count++;
    }
  }

  console.log("\nTotal notes: " + count);
  console.log("Average |deviation|: " + (totalCents / count).toFixed(2) + " cents");
}

main().catch(console.error);
