/**
 * Tests for XML converter
 */

import { describe, test, expect } from "bun:test";
import {
  parseInstrumentXml,
  parseTuningXml,
  detectFormat,
  instrumentToJson,
  tuningToJson,
} from "../../src/utils/xml-converter.ts";

const SAMPLE_INSTRUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:instrument xmlns:ns2="http://www.wwidesigner.com/Instrument">
    <name>Test NAF</name>
    <description>A test instrument</description>
    <lengthType>mm</lengthType>
    <mouthpiece>
        <position>5.0</position>
        <fipple>
            <windowLength>5.0</windowLength>
            <windowWidth>10.0</windowWidth>
            <fippleFactor>0.75</fippleFactor>
            <windwayHeight>1.0</windwayHeight>
        </fipple>
    </mouthpiece>
    <borePoint>
        <borePosition>0.0</borePosition>
        <boreDiameter>20.0</boreDiameter>
    </borePoint>
    <borePoint>
        <borePosition>300.0</borePosition>
        <boreDiameter>20.0</boreDiameter>
    </borePoint>
    <hole>
        <name>Hole 1</name>
        <borePosition>100.0</borePosition>
        <diameter>8.0</diameter>
        <height>5.0</height>
    </hole>
    <hole>
        <name>Hole 2</name>
        <borePosition>150.0</borePosition>
        <diameter>8.0</diameter>
        <height>5.0</height>
    </hole>
    <termination>
        <flangeDiameter>30.0</flangeDiameter>
    </termination>
</ns2:instrument>`;

const SAMPLE_TUNING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:tuning xmlns:ns2="http://www.wwidesigner.com/Tuning">
    <name>Test Tuning</name>
    <comment>A test tuning</comment>
    <numberOfHoles>2</numberOfHoles>
    <fingering>
        <note>
            <name>A4</name>
            <frequency>440.0</frequency>
        </note>
        <openHole>false</openHole>
        <openHole>false</openHole>
        <optimizationWeight>1</optimizationWeight>
    </fingering>
    <fingering>
        <note>
            <name>B4</name>
            <frequency>493.88</frequency>
        </note>
        <openHole>false</openHole>
        <openHole>true</openHole>
        <optimizationWeight>1</optimizationWeight>
    </fingering>
</ns2:tuning>`;

describe("detectFormat", () => {
  test("detects XML format", () => {
    expect(detectFormat('<?xml version="1.0"?><root></root>')).toBe("xml");
    expect(detectFormat("<root></root>")).toBe("xml");
  });

  test("detects JSON format", () => {
    expect(detectFormat('{"name": "test"}')).toBe("json");
    expect(detectFormat("[1, 2, 3]")).toBe("json");
  });

  test("returns unknown for other formats", () => {
    expect(detectFormat("hello world")).toBe("unknown");
    expect(detectFormat("")).toBe("unknown");
  });
});

describe("parseInstrumentXml", () => {
  test("parses instrument name", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.name).toBe("Test NAF");
  });

  test("parses instrument description", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.description).toBe("A test instrument");
  });

  test("parses length type", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.lengthType).toBe("MM");
  });

  test("parses mouthpiece position", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.mouthpiece.position).toBe(5.0);
  });

  test("parses fipple mouthpiece", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.mouthpiece.fipple).toBeDefined();
    expect(inst.mouthpiece.fipple!.windowLength).toBe(5.0);
    expect(inst.mouthpiece.fipple!.windowWidth).toBe(10.0);
    expect(inst.mouthpiece.fipple!.fippleFactor).toBe(0.75);
    expect(inst.mouthpiece.fipple!.windwayHeight).toBe(1.0);
  });

  test("parses bore points", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.borePoint.length).toBe(2);
    expect(inst.borePoint[0]!.borePosition).toBe(0);
    expect(inst.borePoint[0]!.boreDiameter).toBe(20);
    expect(inst.borePoint[1]!.borePosition).toBe(300);
  });

  test("parses holes", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.hole.length).toBe(2);
    expect(inst.hole[0]!.name).toBe("Hole 1");
    expect(inst.hole[0]!.position).toBe(100);
    expect(inst.hole[0]!.diameter).toBe(8);
    expect(inst.hole[0]!.height).toBe(5);
  });

  test("parses termination", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    expect(inst.termination.flangeDiameter).toBe(30);
  });

  test("throws on invalid XML", () => {
    expect(() => parseInstrumentXml("<invalid></invalid>")).toThrow();
  });
});

describe("parseTuningXml", () => {
  test("parses tuning name", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.name).toBe("Test Tuning");
  });

  test("parses comment", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.comment).toBe("A test tuning");
  });

  test("parses number of holes", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.numberOfHoles).toBe(2);
  });

  test("parses fingerings", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.fingering.length).toBe(2);
  });

  test("parses note in fingering", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.fingering[0]!.note!.name).toBe("A4");
    expect(tuning.fingering[0]!.note!.frequency).toBe(440.0);
  });

  test("parses open holes", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.fingering[0]!.openHole).toEqual([false, false]);
    expect(tuning.fingering[1]!.openHole).toEqual([false, true]);
  });

  test("parses optimization weight", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    expect(tuning.fingering[0]!.optimizationWeight).toBe(1);
  });
});

describe("JSON conversion", () => {
  test("instrumentToJson produces valid JSON", () => {
    const inst = parseInstrumentXml(SAMPLE_INSTRUMENT_XML);
    const json = instrumentToJson(inst);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Test NAF");
  });

  test("tuningToJson produces valid JSON", () => {
    const tuning = parseTuningXml(SAMPLE_TUNING_XML);
    const json = tuningToJson(tuning);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Test Tuning");
  });
});
