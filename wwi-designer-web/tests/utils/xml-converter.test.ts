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
  parseConstraintsXml,
  constraintsToXml,
  constraintsToJson,
  parseConstraintsJson,
  parseConstraints,
} from "../../src/utils/xml-converter.ts";
import { Constraints, ConstraintType } from "../../src/core/optimization/constraints.ts";

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

// ============================================================================
// Constraints XML/JSON Tests
// ============================================================================

const SAMPLE_CONSTRAINTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<constraints constraintsName="Test Constraints">
  <objectiveDisplayName>Hole position optimizer</objectiveDisplayName>
  <objectiveFunctionName>HolePositionObjectiveFunction</objectiveFunctionName>
  <numberOfHoles>6</numberOfHoles>
  <constraint>
    <displayName>Bottom hole position</displayName>
    <category>Hole position</category>
    <type>DIMENSIONAL</type>
    <lowerBound>0.2</lowerBound>
    <upperBound>0.35</upperBound>
  </constraint>
  <constraint>
    <displayName>Hole spacing ratio</displayName>
    <category>Hole spacing</category>
    <type>DIMENSIONLESS</type>
    <lowerBound>0.5</lowerBound>
    <upperBound>1.5</upperBound>
  </constraint>
  <holeGroups>
    <holeGroup>
      <hole>1</hole>
      <hole>2</hole>
    </holeGroup>
    <holeGroup>
      <hole>3</hole>
      <hole>4</hole>
      <hole>5</hole>
    </holeGroup>
  </holeGroups>
</constraints>`;

describe("parseConstraintsXml", () => {
  test("parses constraints name from attribute", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getConstraintsName()).toBe("Test Constraints");
  });

  test("parses objective display name", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getObjectiveDisplayName()).toBe("Hole position optimizer");
  });

  test("parses objective function name", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getObjectiveFunctionName()).toBe("HolePositionObjectiveFunction");
  });

  test("parses number of holes", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getNumberOfHoles()).toBe(6);
  });

  test("parses individual constraints", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getNumberOfConstraints()).toBe(2);

    const firstConstraint = constraints.getConstraint(0);
    expect(firstConstraint?.name).toBe("Bottom hole position");
    expect(firstConstraint?.category).toBe("Hole position");
    expect(firstConstraint?.type).toBe(ConstraintType.DIMENSIONAL);
    expect(firstConstraint?.lowerBound).toBe(0.2);
    expect(firstConstraint?.upperBound).toBe(0.35);

    const secondConstraint = constraints.getConstraint(1);
    expect(secondConstraint?.name).toBe("Hole spacing ratio");
    expect(secondConstraint?.type).toBe(ConstraintType.DIMENSIONLESS);
  });

  test("parses hole groups", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    const groups = constraints.getHoleGroups();
    expect(groups).toBeDefined();
    expect(groups?.length).toBe(2);
    expect(groups?.[0]).toEqual([1, 2]);
    expect(groups?.[1]).toEqual([3, 4, 5]);
  });

  test("parses bounds arrays", () => {
    const constraints = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getLowerBounds()).toEqual([0.2, 0.5]);
    expect(constraints.getUpperBounds()).toEqual([0.35, 1.5]);
  });
});

describe("constraintsToXml", () => {
  test("generates valid XML structure", () => {
    const constraints = new Constraints("MM");
    constraints.setConstraintsName("My Constraints");
    constraints.setObjectiveDisplayName("Test optimizer");
    constraints.setObjectiveFunctionName("TestObjectiveFunction");
    constraints.setNumberOfHoles(4);
    constraints.addConstraint({
      name: "Test constraint",
      category: "Test",
      type: ConstraintType.DIMENSIONAL,
      lowerBound: 0.1,
      upperBound: 0.5,
    });
    constraints.setLowerBounds([0.1]);
    constraints.setUpperBounds([0.5]);

    const xml = constraintsToXml(constraints);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<constraints constraintsName="My Constraints">');
    expect(xml).toContain("<objectiveDisplayName>Test optimizer</objectiveDisplayName>");
    expect(xml).toContain("<objectiveFunctionName>TestObjectiveFunction</objectiveFunctionName>");
    expect(xml).toContain("<numberOfHoles>4</numberOfHoles>");
    expect(xml).toContain("<displayName>Test constraint</displayName>");
    expect(xml).toContain("<category>Test</category>");
    expect(xml).toContain("<type>DIMENSIONAL</type>");
    expect(xml).toContain("<lowerBound>0.1</lowerBound>");
    expect(xml).toContain("<upperBound>0.5</upperBound>");
  });

  test("includes hole groups when present", () => {
    const constraints = new Constraints("MM");
    constraints.setConstraintsName("Test");
    constraints.setHoleGroups([[1, 2], [3]]);

    const xml = constraintsToXml(constraints);
    expect(xml).toContain("<holeGroups>");
    expect(xml).toContain("<holeGroup>");
    expect(xml).toContain("<hole>1</hole>");
    expect(xml).toContain("<hole>2</hole>");
    expect(xml).toContain("<hole>3</hole>");
  });

  test("round-trips XML correctly", () => {
    const original = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    const xml = constraintsToXml(original);
    const parsed = parseConstraintsXml(xml);

    expect(parsed.getConstraintsName()).toBe(original.getConstraintsName());
    expect(parsed.getObjectiveDisplayName()).toBe(original.getObjectiveDisplayName());
    expect(parsed.getObjectiveFunctionName()).toBe(original.getObjectiveFunctionName());
    expect(parsed.getNumberOfHoles()).toBe(original.getNumberOfHoles());
    expect(parsed.getNumberOfConstraints()).toBe(original.getNumberOfConstraints());
    expect(parsed.getLowerBounds()).toEqual(original.getLowerBounds());
    expect(parsed.getUpperBounds()).toEqual(original.getUpperBounds());
    expect(parsed.getHoleGroups()).toEqual(original.getHoleGroups());
  });
});

describe("constraintsToJson", () => {
  test("produces valid JSON", () => {
    const constraints = new Constraints("MM");
    constraints.setConstraintsName("JSON Test");
    constraints.setObjectiveDisplayName("Test");
    constraints.setObjectiveFunctionName("TestFunc");
    constraints.setNumberOfHoles(3);
    constraints.addConstraint({
      name: "Constraint 1",
      category: "Cat",
      type: ConstraintType.DIMENSIONAL,
      lowerBound: 0.1,
      upperBound: 0.2,
    });
    constraints.setLowerBounds([0.1]);
    constraints.setUpperBounds([0.2]);

    const json = constraintsToJson(constraints);
    const parsed = JSON.parse(json);

    expect(parsed.constraintsName).toBe("JSON Test");
    expect(parsed.objectiveDisplayName).toBe("Test");
    expect(parsed.objectiveFunctionName).toBe("TestFunc");
    expect(parsed.numberOfHoles).toBe(3);
    expect(parsed.lengthType).toBe("MM");
    expect(parsed.constraints.length).toBe(1);
    expect(parsed.lowerBounds).toEqual([0.1]);
    expect(parsed.upperBounds).toEqual([0.2]);
  });
});

describe("parseConstraintsJson", () => {
  test("parses JSON constraints", () => {
    const json = JSON.stringify({
      constraintsName: "FromJSON",
      objectiveDisplayName: "Display",
      objectiveFunctionName: "FuncName",
      numberOfHoles: 5,
      lengthType: "IN",
      constraints: [{
        name: "Test",
        category: "Category",
        type: "DIMENSIONAL",
        lowerBound: 1.0,
        upperBound: 2.0,
      }],
      lowerBounds: [1.0],
      upperBounds: [2.0],
      holeGroups: [[1, 2, 3]],
    });

    const constraints = parseConstraintsJson(json);
    expect(constraints.getConstraintsName()).toBe("FromJSON");
    expect(constraints.getLengthType()).toBe("IN");
    expect(constraints.getNumberOfHoles()).toBe(5);
    expect(constraints.getNumberOfConstraints()).toBe(1);
    expect(constraints.getHoleGroups()).toEqual([[1, 2, 3]]);
  });

  test("round-trips JSON correctly", () => {
    const original = parseConstraintsXml(SAMPLE_CONSTRAINTS_XML);
    const json = constraintsToJson(original);
    const parsed = parseConstraintsJson(json);

    expect(parsed.getConstraintsName()).toBe(original.getConstraintsName());
    expect(parsed.getObjectiveDisplayName()).toBe(original.getObjectiveDisplayName());
    expect(parsed.getNumberOfConstraints()).toBe(original.getNumberOfConstraints());
  });
});

describe("parseConstraints (auto-detect)", () => {
  test("detects and parses XML", () => {
    const constraints = parseConstraints(SAMPLE_CONSTRAINTS_XML);
    expect(constraints.getConstraintsName()).toBe("Test Constraints");
  });

  test("detects and parses JSON", () => {
    const json = JSON.stringify({
      constraintsName: "Auto JSON",
      constraints: [],
      lowerBounds: [],
      upperBounds: [],
    });
    const constraints = parseConstraints(json);
    expect(constraints.getConstraintsName()).toBe("Auto JSON");
  });

  test("throws on unknown format", () => {
    expect(() => parseConstraints("not valid")).toThrow("Unknown file format");
  });
});
