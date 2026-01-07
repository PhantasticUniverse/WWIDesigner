/**
 * XML to JSON converters for WWIDesigner data files.
 *
 * Converts legacy XML instrument and tuning files to the new JSON format.
 *
 * Copyright (C) 2026, WWIDesigner Contributors.
 * License: GPL-3.0
 */

import type {
  Instrument,
  BorePoint,
  Hole,
  Mouthpiece,
  Termination,
  LengthType,
} from "../models/instrument.ts";
import type { Tuning, Fingering, Note } from "../models/tuning.ts";

// ============================================================================
// Simple XML Parser (using regex for basic structure)
// ============================================================================

interface XmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

/**
 * Very simple XML parser for the WWIDesigner XML format.
 * Not a full XML parser - just enough for our specific format.
 */
function parseXml(xml: string): XmlNode | null {
  // Remove XML declaration and namespace-related attributes
  xml = xml.replace(/<\?xml[^>]*\?>/g, "");
  xml = xml.replace(/xmlns:[^=]+="[^"]*"/g, "");
  xml = xml.replace(/xmlns="[^"]*"/g, "");
  xml = xml.replace(/xsi:schemaLocation="[^"]*"/g, "");
  // Remove any namespace prefixes (e.g., ns2:, wii:, etc.)
  xml = xml.replace(/<\/?[\w]+:/g, (match) => match.replace(/[\w]+:/, ""));

  const stack: XmlNode[] = [];
  let current: XmlNode | null = null;
  let root: XmlNode | null = null;

  // Match tags and text
  const regex = /<([\/\w]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) {
      // Tag
      const tagPart = match[1]!;
      const attrPart = match[2] || "";

      if (tagPart.startsWith("/")) {
        // Closing tag
        if (stack.length > 0) {
          current = stack.pop() || null;
        }
      } else {
        // Opening tag
        const newNode: XmlNode = {
          tag: tagPart,
          attributes: {},
          children: [],
          text: "",
        };

        // Parse attributes
        const attrRegex = /(\w+)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrPart)) !== null) {
          newNode.attributes[attrMatch[1]!] = attrMatch[2]!;
        }

        if (current) {
          current.children.push(newNode);
          if (!attrPart.endsWith("/")) {
            stack.push(current);
            current = newNode;
          }
        } else {
          root = newNode;
          current = newNode;
        }
      }
    } else if (match[3]) {
      // Text content
      const text = match[3]!.trim();
      if (text && current) {
        current.text = text;
      }
    }
  }

  return root;
}

/**
 * Find a child node by tag name
 */
function findChild(node: XmlNode, tagName: string): XmlNode | null {
  return node.children.find((c) => c.tag === tagName) || null;
}

/**
 * Find all children with a given tag name
 */
function findChildren(node: XmlNode, tagName: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tagName);
}

/**
 * Get text content from a child node
 */
function getChildText(node: XmlNode, tagName: string): string | undefined {
  const child = findChild(node, tagName);
  return child?.text || undefined;
}

/**
 * Get numeric value from a child node
 */
function getChildNumber(node: XmlNode, tagName: string): number | undefined {
  const text = getChildText(node, tagName);
  if (text === undefined) return undefined;
  const num = parseFloat(text);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Get boolean value from text
 */
function parseBoolean(text: string | undefined): boolean {
  return text?.toLowerCase() === "true";
}

// ============================================================================
// Instrument XML Converter
// ============================================================================

/**
 * Convert XML instrument string to Instrument object
 */
export function parseInstrumentXml(xml: string): Instrument {
  const root = parseXml(xml);
  if (!root || root.tag !== "instrument") {
    throw new Error("Invalid instrument XML: root element must be 'instrument'");
  }

  // Parse mouthpiece
  const mpNode = findChild(root, "mouthpiece");
  if (!mpNode) {
    throw new Error("Invalid instrument XML: missing mouthpiece");
  }

  const mouthpiece: Mouthpiece = {
    position: getChildNumber(mpNode, "position") ?? 0,
    beta: getChildNumber(mpNode, "beta"),
  };

  // Parse mouthpiece type
  const embouchureNode = findChild(mpNode, "embouchureHole");
  if (embouchureNode) {
    mouthpiece.embouchureHole = {
      length: getChildNumber(embouchureNode, "length") ?? 0,
      width: getChildNumber(embouchureNode, "width") ?? 0,
      height: getChildNumber(embouchureNode, "height") ?? 0,
      airstreamLength: getChildNumber(embouchureNode, "airstreamLength") ?? 0,
      airstreamHeight: getChildNumber(embouchureNode, "airstreamHeight") ?? 0,
    };
  }

  const fippleNode = findChild(mpNode, "fipple");
  if (fippleNode) {
    mouthpiece.fipple = {
      windowWidth: getChildNumber(fippleNode, "windowWidth") ?? 0,
      windowLength: getChildNumber(fippleNode, "windowLength") ?? 0,
      fippleFactor: getChildNumber(fippleNode, "fippleFactor"),
      windowHeight: getChildNumber(fippleNode, "windowHeight"),
      windwayLength: getChildNumber(fippleNode, "windwayLength"),
      windwayHeight: getChildNumber(fippleNode, "windwayHeight"),
    };
  }

  const singleReedNode = findChild(mpNode, "singleReed");
  if (singleReedNode) {
    mouthpiece.singleReed = {
      alpha: getChildNumber(singleReedNode, "alpha") ?? 0,
    };
  }

  const doubleReedNode = findChild(mpNode, "doubleReed");
  if (doubleReedNode) {
    mouthpiece.doubleReed = {
      alpha: getChildNumber(doubleReedNode, "alpha") ?? 0,
      crowFreq: getChildNumber(doubleReedNode, "crowFreq") ?? 0,
    };
  }

  const lipReedNode = findChild(mpNode, "lipReed");
  if (lipReedNode) {
    mouthpiece.lipReed = {
      alpha: getChildNumber(lipReedNode, "alpha") ?? 0,
    };
  }

  // Parse bore points
  const borePoints: BorePoint[] = [];
  for (const bpNode of findChildren(root, "borePoint")) {
    borePoints.push({
      name: getChildText(bpNode, "name"),
      borePosition: getChildNumber(bpNode, "borePosition") ?? 0,
      boreDiameter: getChildNumber(bpNode, "boreDiameter") ?? 0,
    });
  }

  if (borePoints.length < 2) {
    throw new Error("Invalid instrument XML: must have at least 2 bore points");
  }

  // Parse holes
  const holes: Hole[] = [];
  for (const holeNode of findChildren(root, "hole")) {
    const hole: Hole = {
      name: getChildText(holeNode, "name"),
      position: getChildNumber(holeNode, "borePosition") ?? 0,
      diameter: getChildNumber(holeNode, "diameter") ?? 0,
      height: getChildNumber(holeNode, "height") ?? 0,
      innerCurvatureRadius: getChildNumber(holeNode, "innerCurvatureRadius"),
    };

    // Parse key if present
    const keyNode = findChild(holeNode, "key");
    if (keyNode) {
      hole.key = {
        diameter: getChildNumber(keyNode, "diameter") ?? 0,
        holeDiameter: getChildNumber(keyNode, "holeDiameter") ?? 0,
        height: getChildNumber(keyNode, "height") ?? 0,
        thickness: getChildNumber(keyNode, "thickness") ?? 0,
        wallThickness: getChildNumber(keyNode, "wallThickness") ?? 0,
        chimneyHeight: getChildNumber(keyNode, "chimneyHeight") ?? 0,
      };
    }

    holes.push(hole);
  }

  // Parse termination
  const termNode = findChild(root, "termination");
  const termination: Termination = {
    flangeDiameter: termNode ? getChildNumber(termNode, "flangeDiameter") ?? 0 : 0,
  };

  // Parse length type
  const lengthTypeText = getChildText(root, "lengthType")?.toUpperCase() ?? "MM";
  let lengthType: LengthType;
  switch (lengthTypeText) {
    case "MM":
    case "CM":
    case "M":
    case "IN":
    case "FT":
      lengthType = lengthTypeText;
      break;
    default:
      lengthType = "MM";
  }

  return {
    name: getChildText(root, "name") ?? "Unnamed Instrument",
    description: getChildText(root, "description"),
    lengthType,
    mouthpiece,
    borePoint: borePoints,
    hole: holes,
    termination,
  };
}

// ============================================================================
// Tuning XML Converter
// ============================================================================

/**
 * Convert XML tuning string to Tuning object
 */
export function parseTuningXml(xml: string): Tuning {
  const root = parseXml(xml);
  if (!root || root.tag !== "tuning") {
    throw new Error("Invalid tuning XML: root element must be 'tuning'");
  }

  const name = getChildText(root, "name") ?? "Unnamed Tuning";
  const comment = getChildText(root, "comment");
  const numberOfHoles = getChildNumber(root, "numberOfHoles") ?? 0;

  const fingerings: Fingering[] = [];

  for (const fNode of findChildren(root, "fingering")) {
    // Parse note - always create a note object even if empty
    const noteNode = findChild(fNode, "note");
    const note: Note = noteNode
      ? {
          name: getChildText(noteNode, "name"),
          frequency: getChildNumber(noteNode, "frequency"),
          frequencyMin: getChildNumber(noteNode, "frequencyMin"),
          frequencyMax: getChildNumber(noteNode, "frequencyMax"),
        }
      : { name: "", frequency: undefined };

    // Parse open holes - they appear as multiple <openHole> elements
    const openHoleNodes = findChildren(fNode, "openHole");
    const openHole: boolean[] = openHoleNodes.map((n) => parseBoolean(n.text));

    // Parse open end
    const openEndText = getChildText(fNode, "openEnd");
    const openEnd = openEndText !== undefined ? parseBoolean(openEndText) : undefined;

    // Parse optimization weight
    const optimizationWeight = getChildNumber(fNode, "optimizationWeight");

    fingerings.push({
      note,
      openHole,
      openEnd,
      optimizationWeight,
    });
  }

  return {
    name,
    comment,
    numberOfHoles,
    fingering: fingerings,
  };
}

// ============================================================================
// JSON Export Functions
// ============================================================================

/**
 * Convert an Instrument to pretty-printed JSON
 */
export function instrumentToJson(instrument: Instrument): string {
  return JSON.stringify(instrument, null, 2);
}

/**
 * Convert a Tuning to pretty-printed JSON
 */
export function tuningToJson(tuning: Tuning): string {
  return JSON.stringify(tuning, null, 2);
}

/**
 * Parse JSON string to Instrument
 */
export function parseInstrumentJson(json: string): Instrument {
  return JSON.parse(json) as Instrument;
}

/**
 * Parse JSON string to Tuning
 */
export function parseTuningJson(json: string): Tuning {
  return JSON.parse(json) as Tuning;
}

// ============================================================================
// File Helpers
// ============================================================================

/**
 * Detect if content is XML or JSON based on content
 */
export function detectFormat(content: string): "xml" | "json" | "unknown" {
  const trimmed = content.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
    return "xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  return "unknown";
}

/**
 * Parse instrument from either XML or JSON
 */
export function parseInstrument(content: string): Instrument {
  const format = detectFormat(content);
  if (format === "xml") {
    return parseInstrumentXml(content);
  }
  if (format === "json") {
    return parseInstrumentJson(content);
  }
  throw new Error("Unknown file format");
}

/**
 * Parse tuning from either XML or JSON
 */
export function parseTuning(content: string): Tuning {
  const format = detectFormat(content);
  if (format === "xml") {
    return parseTuningXml(content);
  }
  if (format === "json") {
    return parseTuningJson(content);
  }
  throw new Error("Unknown file format");
}
