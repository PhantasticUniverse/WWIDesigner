/**
 * Server API Tests
 *
 * Tests for the WWIDesigner web server API endpoints.
 * These tests verify the API contracts and response structures.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { convertInstrumentFromMetres } from "../../src/models/instrument.ts";
import type { LengthType } from "../../src/core/constants.ts";

// Sample test data
const SAMPLE_INSTRUMENT = {
  name: "Test Whistle",
  lengthType: "MM",
  mouthpiece: {
    position: 0,
    beta: 0.38,
    windowLength: 10,
    windowWidth: 8,
  },
  borePoint: [
    { borePosition: 0, boreDiameter: 12 },
    { borePosition: 300, boreDiameter: 12 },
  ],
  hole: [
    { position: 250, diameter: 6, height: 3 },
    { position: 220, diameter: 6, height: 3 },
    { position: 190, diameter: 6, height: 3 },
    { position: 150, diameter: 6, height: 3 },
    { position: 120, diameter: 6, height: 3 },
    { position: 90, diameter: 6, height: 3 },
  ],
  termination: {
    flange: 0,
  },
};

const SAMPLE_TUNING = {
  name: "Test Tuning",
  fingering: [
    {
      note: { name: "D5", frequency: 587.33 },
      openHole: [false, false, false, false, false, false],
    },
    {
      note: { name: "E5", frequency: 659.26 },
      openHole: [true, false, false, false, false, false],
    },
    {
      note: { name: "F#5", frequency: 739.99 },
      openHole: [true, true, false, false, false, false],
    },
    {
      note: { name: "G5", frequency: 783.99 },
      openHole: [true, true, true, false, false, false],
    },
    {
      note: { name: "A5", frequency: 880.0 },
      openHole: [true, true, true, true, false, false],
    },
    {
      note: { name: "B5", frequency: 987.77 },
      openHole: [true, true, true, true, true, false],
    },
  ],
};

// Server instance for testing
let server: Server | null = null;
let baseUrl: string;

beforeAll(async () => {
  // Start a test server instance on a random port
  const { default: index } = await import("../../src/web/index.html");
  const { PhysicalParameters } = await import("../../src/core/physics/physical-parameters.ts");
  const { createCalculator } = await import("../../src/core/modelling/calculator-factory.ts");
  const { SimpleInstrumentTuner } = await import("../../src/core/modelling/instrument-tuner.ts");
  const { CentDeviationEvaluator } = await import("../../src/core/optimization/evaluator.ts");
  const {
    optimizeObjectiveFunction,
    createObjectiveFunction,
    getObjectiveFunctionsByCategory,
    OBJECTIVE_FUNCTION_INFO,
  } = await import("../../src/core/optimization/index.ts");
  const { ConstraintIntent } = await import("../../src/core/optimization/constraints.ts");
  const { parseConstraints, constraintsToXml, constraintsToJson } = await import("../../src/utils/xml-converter.ts");

  // Inline handlers for testing (same logic as server.ts)
  async function handleCalculateTuning(req: Request): Promise<Response> {
    const body = await req.json();
    const { instrument, tuning, temperature = 20, humidity = 45, calculatorType = "auto" } = body;

    if (!instrument || !tuning) {
      return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
    }

    if (!tuning.fingering || tuning.fingering.length === 0) {
      return Response.json({ error: "Tuning has no fingerings" }, { status: 400 });
    }

    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    const calc = createCalculator(instrument, params, calculatorType);
    const tuner = new SimpleInstrumentTuner(instrument, tuning, calc, params);

    const results = tuning.fingering.map((fingering: any) => {
      const note = fingering.note;
      if (!note) return { note: "Unknown", error: "No note defined" };
      const targetFreq = note.frequency;
      if (!targetFreq) return { note: note.name || "Unknown", error: "No target frequency" };

      try {
        const predicted = tuner.predictedFrequency(fingering);
        const deviation = 1200 * Math.log2(predicted / targetFreq);
        return {
          note: note.name || "Unknown",
          targetFrequency: targetFreq,
          predictedFrequency: predicted,
          deviationCents: deviation,
        };
      } catch (calcError) {
        return { note: note.name || "Unknown", targetFrequency: targetFreq, error: `Calculation error: ${calcError}` };
      }
    });

    return Response.json({ results });
  }

  async function handleOptimize(req: Request): Promise<Response> {
    const body = await req.json();
    const {
      instrument,
      tuning,
      objectiveFunction = "HolePositionObjectiveFunction",
      temperature = 20,
      humidity = 45,
      calculatorType = "auto",
    } = body;

    if (!instrument || !tuning) {
      return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
    }

    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return Response.json({ error: `Unknown objective function: ${objectiveFunction}` }, { status: 400 });
    }

    // Store original length type for conversion after optimization
    const originalLengthType: LengthType = instrument.lengthType || "MM";

    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    const calc = createCalculator(instrument, params, calculatorType);
    const evaluator = new CentDeviationEvaluator(calc);
    const objective = createObjectiveFunction(objectiveFunction, calc, tuning, evaluator);

    const nrDimensions = objective.getNrDimensions();
    const nrTargetNotes = tuning.fingering?.length || 0;
    const startTime = performance.now();

    const result = optimizeObjectiveFunction(objective, {
      maxIterations: 100, // Reduced for tests
      tolerance: 1e-4,
    });

    const elapsedTime = (performance.now() - startTime) / 1000;
    const residualRatio = result.initialNorm > 0 ? result.finalNorm / result.initialNorm : 0;

    // Convert optimized instrument back to original length units
    let optimizedInstrument = objective.getInstrument();
    if (optimizedInstrument.lengthType === "M" && originalLengthType !== "M") {
      optimizedInstrument = convertInstrumentFromMetres(optimizedInstrument, originalLengthType);
    }

    return Response.json({
      optimizedInstrument,
      initialError: result.initialNorm,
      finalError: result.finalNorm,
      evaluations: result.evaluations,
      success: result.success,
      objectiveFunction: objectiveFunction,
      dimensions: nrDimensions,
      targetNotes: nrTargetNotes,
      residualRatio: residualRatio,
      elapsedTime: elapsedTime,
    });
  }

  async function handleGetConstraints(req: Request): Promise<Response> {
    const body = await req.json();
    const {
      instrument,
      tuning,
      objectiveFunction,
      intent = "default",
      temperature = 20,
      humidity = 45,
      calculatorType = "auto",
    } = body;

    if (!instrument || !tuning || !objectiveFunction) {
      return Response.json({ error: "Missing instrument, tuning, or objectiveFunction" }, { status: 400 });
    }

    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return Response.json({ error: `Unknown objective function: ${objectiveFunction}` }, { status: 400 });
    }

    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    const calc = createCalculator(instrument, params, calculatorType);
    const evaluator = new CentDeviationEvaluator(calc);
    const objective = createObjectiveFunction(objectiveFunction, calc, tuning, evaluator);

    let constraintIntent: ConstraintIntent;
    switch (intent.toLowerCase()) {
      case "blank":
        constraintIntent = ConstraintIntent.BLANK;
        break;
      case "optimization":
        constraintIntent = ConstraintIntent.OPTIMIZATION;
        break;
      default:
        constraintIntent = ConstraintIntent.DEFAULT;
    }

    const constraints = objective.getConstraintsWithIntent(constraintIntent);

    return Response.json({
      constraintsName: constraints.getConstraintsName(),
      objectiveDisplayName: constraints.getObjectiveDisplayName(),
      objectiveFunctionName: constraints.getObjectiveFunctionName(),
      numberOfHoles: constraints.getNumberOfHoles(),
      lengthType: constraints.getLengthType(),
      constraints: constraints.getConstraints(),
      lowerBounds: constraints.getLowerBounds(),
      upperBounds: constraints.getUpperBounds(),
      holeGroups: constraints.getHoleGroups(),
      dimensions: objective.getNrDimensions(),
    });
  }

  async function handleParseConstraints(req: Request): Promise<Response> {
    const body = await req.json();
    const { content, lengthType = "MM" } = body;

    if (!content) {
      return Response.json({ error: "Missing content" }, { status: 400 });
    }

    try {
      const constraints = parseConstraints(content, lengthType);
      return Response.json({
        constraintsName: constraints.getConstraintsName(),
        objectiveDisplayName: constraints.getObjectiveDisplayName(),
        objectiveFunctionName: constraints.getObjectiveFunctionName(),
        numberOfHoles: constraints.getNumberOfHoles(),
        lengthType: constraints.getLengthType(),
        constraints: constraints.getConstraints(),
        lowerBounds: constraints.getLowerBounds(),
        upperBounds: constraints.getUpperBounds(),
        holeGroups: constraints.getHoleGroups(),
      });
    } catch (error) {
      return Response.json({ error: `Parse error: ${error}` }, { status: 400 });
    }
  }

  function handleListObjectiveFunctions(): Response {
    const categorized = getObjectiveFunctionsByCategory();
    return Response.json({
      functions: OBJECTIVE_FUNCTION_INFO,
      byCategory: categorized,
    });
  }

  server = Bun.serve({
    port: 0, // Random available port
    routes: {
      "/": index,
      "/api/calculate-tuning": { POST: handleCalculateTuning },
      "/api/optimize": { POST: handleOptimize },
      "/api/constraints/get": { POST: handleGetConstraints },
      "/api/constraints/parse": { POST: handleParseConstraints },
      "/api/constraints/objective-functions": { GET: handleListObjectiveFunctions },
    },
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop();
});

describe("Calculate Tuning API", () => {
  test("returns tuning results for valid instrument and tuning", async () => {
    const response = await fetch(`${baseUrl}/api/calculate-tuning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBe(SAMPLE_TUNING.fingering.length);

    // Check first result structure
    const first = data.results[0];
    expect(first.note).toBe("D5");
    expect(typeof first.targetFrequency).toBe("number");
    expect(typeof first.predictedFrequency).toBe("number");
    expect(typeof first.deviationCents).toBe("number");
  });

  test("returns error for missing instrument", async () => {
    const response = await fetch(`${baseUrl}/api/calculate-tuning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tuning: SAMPLE_TUNING }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing instrument or tuning");
  });

  test("returns error for empty fingerings", async () => {
    const response = await fetch(`${baseUrl}/api/calculate-tuning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: { name: "Empty", fingering: [] },
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("no fingerings");
  });
});

describe("Optimize API", () => {
  test("returns optimization results with correct structure", async () => {
    const response = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
        objectiveFunction: "HolePositionObjectiveFunction",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify response structure - this was the bug we fixed
    expect(data.optimizedInstrument).toBeDefined();
    expect(typeof data.initialError).toBe("number");
    expect(typeof data.finalError).toBe("number");
    expect(typeof data.evaluations).toBe("number");
    expect(typeof data.success).toBe("boolean");
    expect(data.objectiveFunction).toBe("HolePositionObjectiveFunction");
    expect(typeof data.dimensions).toBe("number");

    // Verify new fields for detailed console output
    expect(typeof data.targetNotes).toBe("number");
    expect(typeof data.residualRatio).toBe("number");
    expect(typeof data.elapsedTime).toBe("number");

    // Verify values are sensible
    expect(data.initialError).toBeGreaterThanOrEqual(0);
    expect(data.finalError).toBeGreaterThanOrEqual(0);
    expect(data.evaluations).toBeGreaterThan(0);
    expect(data.dimensions).toBeGreaterThan(0);
    expect(data.targetNotes).toBeGreaterThan(0);
    expect(data.residualRatio).toBeGreaterThanOrEqual(0);
    expect(data.residualRatio).toBeLessThanOrEqual(1); // Final should be <= initial
    expect(data.elapsedTime).toBeGreaterThanOrEqual(0);
  });

  test("preserves original length units after optimization", async () => {
    const response = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT, // lengthType: "MM"
        tuning: SAMPLE_TUNING,
        objectiveFunction: "HolePositionObjectiveFunction",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // The optimized instrument should preserve the original length type
    expect(data.optimizedInstrument.lengthType).toBe("MM");

    // Bore positions should be in reasonable MM range (not meters)
    const borePoints = data.optimizedInstrument.borePoint;
    expect(borePoints.length).toBeGreaterThan(0);
    for (const bp of borePoints) {
      // MM values should be > 1 (meters would be < 1 for typical instruments)
      expect(bp.borePosition).toBeGreaterThanOrEqual(0);
      expect(bp.boreDiameter).toBeGreaterThan(1); // > 1mm
    }

    // Hole positions should also be in MM range
    const holes = data.optimizedInstrument.hole;
    for (const hole of holes) {
      expect(hole.position).toBeGreaterThan(1); // > 1mm
      expect(hole.diameter).toBeGreaterThan(1); // > 1mm
    }
  });

  test("returns error for unknown objective function", async () => {
    const response = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
        objectiveFunction: "NonExistentFunction",
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Unknown objective function");
  });

  test("returns error for missing data", async () => {
    const response = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: SAMPLE_INSTRUMENT }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing instrument or tuning");
  });
});

describe("Constraints API", () => {
  test("get constraints returns correct structure", async () => {
    const response = await fetch(`${baseUrl}/api/constraints/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
        objectiveFunction: "HolePositionObjectiveFunction",
        intent: "default",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.constraintsName).toBeDefined();
    expect(data.objectiveDisplayName).toBeDefined();
    expect(data.objectiveFunctionName).toBe("HolePositionObjectiveFunction");
    expect(data.numberOfHoles).toBe(6);
    // lengthType might be "M" (meters) internally or "MM" from instrument
    expect(["M", "MM"]).toContain(data.lengthType);
    expect(Array.isArray(data.constraints)).toBe(true);
    expect(Array.isArray(data.lowerBounds)).toBe(true);
    expect(Array.isArray(data.upperBounds)).toBe(true);
    expect(typeof data.dimensions).toBe("number");

    // Bounds arrays should match constraints length
    expect(data.lowerBounds.length).toBe(data.constraints.length);
    expect(data.upperBounds.length).toBe(data.constraints.length);
  });

  test("get constraints with blank intent returns unlimited bounds", async () => {
    const response = await fetch(`${baseUrl}/api/constraints/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
        objectiveFunction: "HolePositionObjectiveFunction",
        intent: "blank",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Blank constraints should have very large upper bounds
    expect(data.upperBounds.every((b: number) => b >= 1e9)).toBe(true);
  });

  test("parse constraints accepts valid XML", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <constraints constraintsName="Test">
      <objectiveDisplayName>Test optimizer</objectiveDisplayName>
      <objectiveFunctionName>TestFunc</objectiveFunctionName>
      <numberOfHoles>4</numberOfHoles>
      <constraint>
        <displayName>Test constraint</displayName>
        <category>Test</category>
        <type>DIMENSIONAL</type>
        <lowerBound>0.1</lowerBound>
        <upperBound>0.5</upperBound>
      </constraint>
    </constraints>`;

    const response = await fetch(`${baseUrl}/api/constraints/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: xml }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.constraintsName).toBe("Test");
    expect(data.objectiveFunctionName).toBe("TestFunc");
    expect(data.numberOfHoles).toBe(4);
    expect(data.constraints.length).toBe(1);
  });

  test("parse constraints accepts valid JSON", async () => {
    const json = JSON.stringify({
      constraintsName: "JSON Test",
      objectiveDisplayName: "Display",
      objectiveFunctionName: "FuncName",
      numberOfHoles: 3,
      constraints: [{ name: "C1", category: "Cat", type: "DIMENSIONAL", lowerBound: 0.1, upperBound: 0.2 }],
      lowerBounds: [0.1],
      upperBounds: [0.2],
    });

    const response = await fetch(`${baseUrl}/api/constraints/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: json }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.constraintsName).toBe("JSON Test");
  });

  test("parse constraints returns error for invalid content", async () => {
    const response = await fetch(`${baseUrl}/api/constraints/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "not valid xml or json" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Parse error");
  });

  test("list objective functions returns categorized list", async () => {
    const response = await fetch(`${baseUrl}/api/constraints/objective-functions`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.functions).toBeDefined();
    expect(data.byCategory).toBeDefined();

    // Should have HolePositionObjectiveFunction
    expect(data.functions["HolePositionObjectiveFunction"]).toBeDefined();

    // byCategory should group functions
    expect(typeof data.byCategory).toBe("object");
  });
});

describe("Response Structure Validation", () => {
  test("optimization response has all required fields with correct types", async () => {
    const response = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
        objectiveFunction: "HoleSizeObjectiveFunction",
      }),
    });

    const data = await response.json();

    // These assertions would have caught the bug where we used
    // result.initialValue instead of result.initialNorm
    expect(data.initialError).not.toBeUndefined();
    expect(data.finalError).not.toBeUndefined();
    expect(Number.isFinite(data.initialError)).toBe(true);
    expect(Number.isFinite(data.finalError)).toBe(true);
  });

  test("tuning response has all required fields", async () => {
    const response = await fetch(`${baseUrl}/api/calculate-tuning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: SAMPLE_INSTRUMENT,
        tuning: SAMPLE_TUNING,
      }),
    });

    const data = await response.json();

    for (const result of data.results) {
      expect(result.note).toBeDefined();
      if (!result.error) {
        expect(Number.isFinite(result.targetFrequency)).toBe(true);
        expect(Number.isFinite(result.predictedFrequency)).toBe(true);
        expect(Number.isFinite(result.deviationCents)).toBe(true);
      }
    }
  });
});
