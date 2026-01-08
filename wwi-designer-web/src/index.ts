/**
 * WWIDesigner Web - Woodwind Instrument Designer
 *
 * A web application for designing and optimizing woodwind instruments
 * using acoustic modeling and multi-variable optimization.
 *
 * Ported from the original Java application by Edward Kort, Antoine Lefebvre,
 * and Burton Patkau.
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// Core exports
export * from "./core/index.ts";

// Model exports (explicit to avoid naming conflicts with core/optimization/constraints)
export {
  type Instrument,
  type BorePoint,
  type Hole,
  type Mouthpiece,
  type Termination,
  validateInstrument,
  createInstrument,
  convertInstrumentToMetres,
  convertInstrumentFromMetres,
} from "./models/instrument.ts";

export {
  type Tuning,
  type Fingering,
  type Note,
  validateTuning,
  createTuning,
} from "./models/tuning.ts";

// Utility exports
export * from "./utils/index.ts";

// Version info
export const VERSION = "0.1.0";
export const ORIGINAL_VERSION = "2.6.0";

console.log(`WWIDesigner Web v${VERSION} (based on Java v${ORIGINAL_VERSION})`);
console.log("Woodwind Instrument Designer - TypeScript/Bun Edition");
