/**
 * Diagnostic script to output detailed deviation information.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { DefaultInstrumentCalculator } from "../../../src/core/modelling/instrument-calculator.ts";
import { SimpleInstrumentTuner } from "../../../src/core/modelling/instrument-tuner.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { cents } from "../../../src/core/constants.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";

const NAF_HOLE_SIZE_MULT = 0.9605;
const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";

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
  const instrument = await loadInstrumentFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`
  );
  const tuning = await loadTuningFromPath(
    `${MODELLING_PATH}/NAF_D_minor_cherry_actual_tuning.xml`
  );

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
  const tuner = new SimpleInstrumentTuner(instrument, tuning, calculator, params);

  const predicted = tuner.getPredictedTuning();

  console.log("=== NAF D Minor Cherry Tuning Predictions ===\n");
  console.log("Note\t\tTarget (Hz)\tPredicted (Hz)\tDeviation (cents)");
  console.log("----\t\t----------\t--------------\t-----------------");

  let totalDeviation = 0;
  let count = 0;

  for (let i = 0; i < tuning.fingering.length; i++) {
    const fingering = tuning.fingering[i];
    const predictedFingering = predicted.fingering[i];
    const noteName = fingering.note?.name || `Note ${i}`;
    const targetFreq = fingering.note?.frequency || 0;
    const predictedFreq = predictedFingering?.note?.frequency || 0;

    if (targetFreq > 0 && predictedFreq > 0) {
      const deviation = cents(targetFreq, predictedFreq);
      totalDeviation += Math.abs(deviation);
      count++;
      console.log(`${noteName.padEnd(12)}\t${targetFreq.toFixed(2)}\t\t${predictedFreq.toFixed(2)}\t\t${deviation.toFixed(2)}`);
    }
  }

  console.log(`\nTotal notes: ${count}`);
  console.log(`Average |deviation|: ${(totalDeviation / count).toFixed(2)} cents`);
  console.log(`\nNote: Java NAFTuningTest expects predictions within 15 cents of target.`);
}

main().catch(console.error);
