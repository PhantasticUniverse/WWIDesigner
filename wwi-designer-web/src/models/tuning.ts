/**
 * Data models for musical tuning and fingering patterns.
 *
 * Ported from Java: com.wwidesigner.note.*
 *
 * Copyright (C) 2014, Edward Kort, Antoine Lefebvre, Burton Patkau.
 * TypeScript port (C) 2026, WWIDesigner Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { MathConstants, MusicalConstants } from "../core/constants.ts";

// ============================================================================
// Note - a musical note with frequency information
// ============================================================================

export interface Note {
  /** Name of the note (e.g., "C4", "A#5") */
  name?: string;
  /** Target frequency in Hz */
  frequency?: number;
  /** Minimum acceptable frequency (for range-based tuning) */
  frequencyMin?: number;
  /** Maximum acceptable frequency (for range-based tuning) */
  frequencyMax?: number;
}

/**
 * Create a new Note
 */
export function createNote(
  name: string,
  frequency?: number,
  frequencyMin?: number,
  frequencyMax?: number
): Note {
  return {
    name,
    frequency,
    frequencyMin,
    frequencyMax,
  };
}

/**
 * Copy a Note
 */
export function copyNote(note: Note | null | undefined): Note {
  if (!note) {
    return {};
  }
  return {
    name: note.name,
    frequency: note.frequency,
    frequencyMin: note.frequencyMin,
    frequencyMax: note.frequencyMax,
  };
}

/**
 * Calculate the difference in cents between two frequencies
 * @param f1 First frequency (reference)
 * @param f2 Second frequency
 * @returns Difference in cents (positive if f2 > f1)
 */
export function cents(f1: number, f2: number): number {
  return (Math.log(f2 / f1) / MathConstants.LOG2) * MusicalConstants.CENTS_IN_OCTAVE;
}

/**
 * Get the effective target frequency for a note
 * Returns frequency if set, otherwise the midpoint of min/max range
 */
export function getTargetFrequency(note: Note): number | null {
  if (note.frequency !== undefined) {
    return note.frequency;
  }
  if (note.frequencyMin !== undefined && note.frequencyMax !== undefined) {
    return (note.frequencyMin + note.frequencyMax) / 2;
  }
  if (note.frequencyMin !== undefined) {
    return note.frequencyMin;
  }
  if (note.frequencyMax !== undefined) {
    return note.frequencyMax;
  }
  return null;
}

// ============================================================================
// Fingering - a fingering pattern for a note
// ============================================================================

export interface Fingering {
  /** The note associated with this fingering */
  note?: Note;
  /** Open/closed state of each hole (true = open, false = closed) */
  openHole: boolean[];
  /** Whether the end is open (true) or closed (false), null if not applicable */
  openEnd?: boolean;
  /** Optimization weight for this fingering (default 1, 0 to exclude) */
  optimizationWeight?: number;
}

/**
 * Create a new empty Fingering
 */
export function createFingering(numberOfHoles: number = 0): Fingering {
  const openHole: boolean[] = [];
  for (let i = 0; i < numberOfHoles; i++) {
    openHole.push(true);
  }
  return {
    openHole,
  };
}

/**
 * Copy a Fingering
 */
export function copyFingering(fingering: Fingering | null | undefined): Fingering {
  if (!fingering) {
    return { openHole: [] };
  }
  return {
    note: fingering.note ? copyNote(fingering.note) : undefined,
    openHole: [...fingering.openHole],
    openEnd: fingering.openEnd,
    optimizationWeight: fingering.optimizationWeight,
  };
}

/**
 * Get the effective optimization weight
 * Returns 1 if not set, 0 if negative
 */
export function getOptimizationWeight(fingering: Fingering): number {
  if (fingering.optimizationWeight === undefined || fingering.optimizationWeight === null) {
    return 1;
  }
  if (fingering.optimizationWeight < 0) {
    return 0;
  }
  return fingering.optimizationWeight;
}

/**
 * Convert a fingering to a string representation
 * O = open hole, X = closed hole
 * _ = open end, ] = closed end
 */
export function fingeringToString(fingering: Fingering): string {
  let result = "";

  for (let i = 0; i < fingering.openHole.length; i++) {
    // Add space in middle for better readability with 6+ holes
    if (fingering.openHole.length >= 6 && i === Math.floor(fingering.openHole.length / 2)) {
      result += " ";
    }
    result += fingering.openHole[i] ? "O" : "X";
  }

  if (fingering.openEnd !== undefined) {
    result += fingering.openEnd ? "_" : "]";
  }

  return result;
}

/**
 * Parse a string representation into a Fingering
 * Accepts: O/o for open, X/x for closed
 * Optional: _ for open end, ] for closed end
 */
export function fingeringFromString(s: string): Fingering {
  if (!/^[XOxo][XOxo ]*(_|]|)$/.test(s)) {
    throw new Error("String does not represent a fingering pattern");
  }

  const fingering: Fingering = { openHole: [] };

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === "O" || char === "o") {
      fingering.openHole.push(true);
    } else if (char === "X" || char === "x") {
      fingering.openHole.push(false);
    }
  }

  const lastChar = s[s.length - 1];
  if (lastChar === "_") {
    fingering.openEnd = true;
  } else if (lastChar === "]") {
    fingering.openEnd = false;
  }

  return fingering;
}

/**
 * Set the number of holes in a fingering
 * Adds open holes at bottom to increase, removes from bottom to decrease
 */
export function setFingeringHoleCount(fingering: Fingering, numberOfHoles: number): Fingering {
  const newOpenHole: boolean[] = [];

  for (let i = 0; i < numberOfHoles; i++) {
    if (i < fingering.openHole.length) {
      newOpenHole.push(fingering.openHole[i] ?? true);
    } else {
      newOpenHole.push(true); // New holes default to open
    }
  }

  return {
    ...fingering,
    openHole: newOpenHole,
  };
}

// ============================================================================
// FingeringPattern - a base class for fingering patterns
// ============================================================================

export interface FingeringPattern {
  /** Name of the fingering pattern */
  name?: string;
  /** Optional comment/description */
  comment?: string;
  /** Number of holes in this pattern */
  numberOfHoles: number;
  /** List of fingerings */
  fingering: Fingering[];
}

/**
 * Create a new empty FingeringPattern
 */
export function createFingeringPattern(name?: string, numberOfHoles: number = 0): FingeringPattern {
  return {
    name,
    numberOfHoles,
    fingering: [],
  };
}

/**
 * Copy a FingeringPattern
 */
export function copyFingeringPattern(
  pattern: FingeringPattern | null | undefined
): FingeringPattern {
  if (!pattern) {
    return { numberOfHoles: 0, fingering: [] };
  }
  return {
    name: pattern.name,
    comment: pattern.comment,
    numberOfHoles: pattern.numberOfHoles,
    fingering: pattern.fingering.map(copyFingering),
  };
}

/**
 * Add a fingering to the pattern
 */
export function addFingering(pattern: FingeringPattern, fingering: Fingering): FingeringPattern {
  return {
    ...pattern,
    fingering: [...pattern.fingering, fingering],
  };
}

/**
 * Check if any fingering has min/max frequency data
 */
export function hasMinMax(pattern: FingeringPattern): boolean {
  for (const f of pattern.fingering) {
    if (f.note) {
      if (f.note.frequencyMin !== undefined || f.note.frequencyMax !== undefined) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if any fingering has open/closed end data
 */
export function hasClosableEnd(pattern: FingeringPattern): boolean {
  for (const f of pattern.fingering) {
    if (f.openEnd !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Check if any fingering has non-trivial optimization weights
 */
export function hasWeights(pattern: FingeringPattern): boolean {
  for (const f of pattern.fingering) {
    if (f.optimizationWeight !== undefined && f.optimizationWeight !== 1) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Tuning - a complete tuning specification extending FingeringPattern
// ============================================================================

export interface Tuning extends FingeringPattern {
  /** Name is required for Tuning */
  name: string;
}

/**
 * Create a new empty Tuning
 */
export function createTuning(name: string, numberOfHoles: number = 0): Tuning {
  return {
    name,
    numberOfHoles,
    fingering: [],
  };
}

/**
 * Copy a Tuning
 */
export function copyTuning(tuning: Tuning | null | undefined): Tuning {
  if (!tuning) {
    return { name: "", numberOfHoles: 0, fingering: [] };
  }
  return {
    name: tuning.name,
    comment: tuning.comment,
    numberOfHoles: tuning.numberOfHoles,
    fingering: tuning.fingering.map(copyFingering),
  };
}

/**
 * Validate a tuning and return any errors
 */
export function validateTuning(tuning: Tuning): string[] {
  const errors: string[] = [];

  if (!tuning.name || tuning.name.trim() === "") {
    errors.push("Enter a name for the tuning.");
  }

  if (tuning.fingering.length === 0) {
    errors.push("Enter one or more notes for the tuning.");
  }

  for (let i = 0; i < tuning.fingering.length; i++) {
    const f = tuning.fingering[i]!;
    const note = f.note;
    const rowNum = i + 1;

    if (!note) {
      errors.push(`Missing note in row ${rowNum}.`);
      continue;
    }

    const noteName = note.name || "note";

    if (!note.name || note.name.trim() === "") {
      errors.push(`Enter a note name for row ${rowNum}.`);
    }

    if (!f.openHole || f.openHole.length === 0) {
      errors.push(`Missing fingering for ${noteName} in row ${rowNum}.`);
    } else if (f.openHole.length !== tuning.numberOfHoles) {
      errors.push(`Fingering for ${noteName} in row ${rowNum} has wrong number of holes.`);
    }

    if (
      note.frequency === undefined &&
      note.frequencyMax === undefined &&
      note.frequencyMin === undefined
    ) {
      errors.push(`Enter at least one frequency for ${noteName} in row ${rowNum}.`);
    }

    if (
      (note.frequency !== undefined && note.frequency <= 0) ||
      (note.frequencyMax !== undefined && note.frequencyMax <= 0) ||
      (note.frequencyMin !== undefined && note.frequencyMin <= 0)
    ) {
      errors.push(`Frequency for ${noteName} in row ${rowNum} must be positive.`);
    }
  }

  return errors;
}

/**
 * Get all unique note names in a tuning
 */
export function getNoteNames(tuning: Tuning): string[] {
  const names: string[] = [];
  for (const f of tuning.fingering) {
    if (f.note?.name && !names.includes(f.note.name)) {
      names.push(f.note.name);
    }
  }
  return names;
}

/**
 * Get all target frequencies in a tuning
 */
export function getTargetFrequencies(tuning: Tuning): (number | null)[] {
  return tuning.fingering.map((f) => (f.note ? getTargetFrequency(f.note) : null));
}

/**
 * Get fingerings with non-zero optimization weight
 */
export function getActiveFingeringsCount(tuning: Tuning): number {
  return tuning.fingering.filter((f) => getOptimizationWeight(f) > 0).length;
}

// ============================================================================
// Helper functions for creating common tunings
// ============================================================================

/**
 * Create a simple chromatic tuning
 */
export function createChromaticTuning(
  name: string,
  numberOfHoles: number,
  baseFrequency: number = 440,
  baseNote: string = "A4"
): Tuning {
  const tuning = createTuning(name, numberOfHoles);
  const semitoneRatio = Math.pow(2, 1 / 12);

  // Create 12 notes starting from base
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const baseNoteIndex = noteNames.indexOf(baseNote.replace(/\d+/, ""));
  const baseOctave = parseInt(baseNote.replace(/\D+/, ""), 10);

  for (let i = 0; i < 12; i++) {
    const semitones = i - (9 - baseNoteIndex); // A4 is 9 semitones above C4
    const frequency = baseFrequency * Math.pow(semitoneRatio, semitones);
    const noteIndex = (baseNoteIndex + i) % 12;
    const octave = baseOctave + Math.floor((baseNoteIndex + i) / 12);
    const noteName = noteNames[noteIndex] + octave;

    const fingering = createFingering(numberOfHoles);
    fingering.note = createNote(noteName, frequency);

    tuning.fingering.push(fingering);
  }

  return tuning;
}
