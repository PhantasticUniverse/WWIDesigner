/**
 * Step-by-step trace of impedance calculation for comparison with Java.
 */

import { parseInstrumentXml, parseTuningXml } from "../../../src/utils/xml-converter.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { DefaultHoleCalculator } from "../../../src/core/geometry/hole-calculator.ts";
import { SimpleBoreSectionCalculator } from "../../../src/core/geometry/bore-section-calculator.ts";
import { thickFlangedEndCalculator } from "../../../src/core/geometry/termination-calculator.ts";
import { DefaultFippleMouthpieceCalculator } from "../../../src/core/geometry/mouthpiece-calculator.ts";
import {
  convertInstrumentToMetres,
  getSortedBorePoints,
  getSortedHoles,
  getInterpolatedBoreDiameter,
  buildHeadspace,
  type BoreSection,
  type Hole,
} from "../../../src/models/instrument.ts";
import type { TransferMatrix } from "../../../src/core/math/transfer-matrix.ts";
import type { StateVector } from "../../../src/core/math/state-vector.ts";

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

type Component = { type: "bore"; section: BoreSection } | { type: "hole"; hole: Hole };

async function main() {
  const { instrument, tuning } = await loadFiles();

  console.log("=== Step-by-Step Impedance Trace (TypeScript) ===\n");

  // Convert to metres
  const inst = convertInstrumentToMetres(instrument);
  const sortedBorePoints = getSortedBorePoints(inst);
  const sortedHoles = getSortedHoles(inst);

  // Set bore diameters
  if (sortedBorePoints.length > 0) {
    const lastPoint = sortedBorePoints[sortedBorePoints.length - 1]!;
    inst.termination.boreDiameter = lastPoint.boreDiameter;
    inst.termination.borePosition = lastPoint.borePosition;

    inst.mouthpiece.boreDiameter = getInterpolatedBoreDiameter(
      sortedBorePoints,
      inst.mouthpiece.position
    );

    for (const hole of sortedHoles) {
      hole.boreDiameter = getInterpolatedBoreDiameter(sortedBorePoints, hole.position);
    }
  }

  // Build headspace
  inst.mouthpiece.headspace = buildHeadspace(inst);

  // Physical parameters
  const params = new PhysicalParameters(72, "F");

  // Get first fingering
  const fingering = tuning.fingering[0]!;
  const targetFreq = fingering.note?.frequency ?? 289.42;
  const waveNumber = params.calcWaveNumber(targetFreq);

  console.log(`Frequency: ${targetFreq} Hz`);
  console.log(`Wave number: ${waveNumber}`);
  console.log(`All holes closed: ${fingering.openHole.every(h => !h)}`);

  // Build components list (starting from mouthpiece position, matching Java behavior)
  const mouthpiecePosition = inst.mouthpiece.position;
  const mouthpieceDiameter = inst.mouthpiece.boreDiameter ?? sortedBorePoints[0]!.boreDiameter;
  const components: Component[] = buildComponentsInterleaved(
    sortedBorePoints,
    sortedHoles,
    mouthpiecePosition,
    mouthpieceDiameter
  );

  console.log(`\n=== Components: ${components.length} ===`);
  for (let i = 0; i < components.length; i++) {
    const c = components[i]!;
    if (c.type === "bore") {
      console.log(`Component[${i}] BoreSection: len=${c.section.length.toFixed(6)}, leftR=${c.section.leftRadius.toFixed(6)}, rightR=${c.section.rightRadius.toFixed(6)}`);
    } else {
      console.log(`Component[${i}] Hole (${c.hole.name}): pos=${c.hole.position.toFixed(6)}`);
    }
  }

  // Create calculators
  const holeCalc = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
  const boreCalc = new SimpleBoreSectionCalculator();
  const mpCalc = new DefaultFippleMouthpieceCalculator();

  // Start at termination
  const isOpenEnd = fingering.openEnd !== false;
  let sv = thickFlangedEndCalculator.calcStateVector(
    inst.termination,
    isOpenEnd,
    waveNumber,
    params
  );

  console.log("\n=== Starting at Termination ===");
  console.log(`Termination bore radius: ${(inst.termination.boreDiameter ?? 0) / 2}`);
  const termZ0 = params.calcZ0(inst.mouthpiece.boreDiameter! / 2);
  printStateVector(sv, "After termination", termZ0);

  // Walk through components from termination to mouthpiece
  let holeIndex = fingering.openHole.length - 1;

  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i]!;
    let tm: TransferMatrix;
    let compName: string;

    if (comp.type === "bore") {
      tm = boreCalc.calcTransferMatrix(comp.section, waveNumber, params);
      compName = `BoreSection[${i}] (len=${comp.section.length.toFixed(6)}, leftR=${comp.section.leftRadius.toFixed(6)}, rightR=${comp.section.rightRadius.toFixed(6)})`;
    } else {
      const isOpen = fingering.openHole[holeIndex] ?? true;
      tm = holeCalc.calcTransferMatrix(comp.hole, isOpen, waveNumber, params);
      compName = `Hole[${i}] ${comp.hole.name} (isOpen=${isOpen})`;
      holeIndex--;
    }

    sv = sv.applyTransferMatrix(tm);

    console.log(`\n--- ${compName} ---`);
    printTransferMatrix(tm);
    printStateVector(sv, "After component", termZ0);
  }

  // Apply mouthpiece
  sv = mpCalc.calcStateVector(sv, inst.mouthpiece, waveNumber, params);

  console.log("\n=== After Mouthpiece ===");
  printStateVector(sv, "Final", termZ0);

  // Final impedance
  const Z = sv.getImpedance();
  const boreRadius = (inst.mouthpiece.boreDiameter ?? 0.01) / 2;
  const Z0 = params.calcZ0(boreRadius);

  console.log("\n=== Final Result ===");
  console.log(`Z = (${Z.re}, ${Z.im})`);
  console.log(`Z0 = ${Z0}`);
  console.log(`Z/Z0 = (${Z.re/Z0}, ${Z.im/Z0})`);
}

function printStateVector(sv: StateVector, label: string, Z0: number): void {
  const Z = sv.getImpedance();
  console.log(`${label}:`);
  console.log(`  Z = (${Z.re}, ${Z.im})`);
  console.log(`  Z/Z0 = (${Z.re/Z0}, ${Z.im/Z0})`);
}

function printTransferMatrix(tm: TransferMatrix): void {
  console.log(`  TM: PP=(${tm.getPP().re}, ${tm.getPP().im})`);
  console.log(`      PU=(${tm.getPU().re}, ${tm.getPU().im})`);
  console.log(`      UP=(${tm.getUP().re}, ${tm.getUP().im})`);
  console.log(`      UU=(${tm.getUU().re}, ${tm.getUU().im})`);
}

/**
 * Build component list starting from mouthpiece position (matching Java behavior).
 * Bore sections before the mouthpiece are handled as headspace in the mouthpiece calculator.
 */
function buildComponentsInterleaved(
  sortedBorePoints: { borePosition: number; boreDiameter: number }[],
  sortedHoles: Hole[],
  mouthpiecePosition: number,
  mouthpieceDiameter: number
): Component[] {
  const components: Component[] = [];

  interface PositionItem {
    position: number;
    type: "borePoint" | "hole";
    index: number;
  }

  const positions: PositionItem[] = [];

  for (let i = 0; i < sortedBorePoints.length; i++) {
    positions.push({
      position: sortedBorePoints[i]!.borePosition,
      type: "borePoint",
      index: i,
    });
  }

  for (let i = 0; i < sortedHoles.length; i++) {
    positions.push({
      position: sortedHoles[i]!.position,
      type: "hole",
      index: i,
    });
  }

  positions.sort((a, b) => a.position - b.position);

  // Start from mouthpiece position, not first bore point
  let currentPosition = mouthpiecePosition;
  let currentDiameter = mouthpieceDiameter;

  for (const item of positions) {
    // Skip positions at or before mouthpiece (those are handled in headspace)
    if (item.position <= mouthpiecePosition) {
      continue;
    }

    if (item.type === "hole") {
      const hole = sortedHoles[item.index]!;
      const nextDiameter = hole.boreDiameter ?? currentDiameter;

      if (item.position > currentPosition) {
        const section: BoreSection = {
          length: item.position - currentPosition,
          leftRadius: currentDiameter / 2,
          rightRadius: nextDiameter / 2,
          rightBorePosition: item.position,
        };
        components.push({ type: "bore", section });
      }

      components.push({ type: "hole", hole });
      currentPosition = item.position;
      currentDiameter = nextDiameter;
    } else {
      const borePoint = sortedBorePoints[item.index]!;

      if (item.position > currentPosition) {
        const section: BoreSection = {
          length: item.position - currentPosition,
          leftRadius: currentDiameter / 2,
          rightRadius: borePoint.boreDiameter / 2,
          rightBorePosition: item.position,
        };
        components.push({ type: "bore", section });
      }

      currentPosition = item.position;
      currentDiameter = borePoint.boreDiameter;
    }
  }

  return components;
}

main().catch(console.error);
