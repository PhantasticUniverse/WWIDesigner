/**
 * WWIDesigner Web Server
 *
 * Bun-based server providing the web UI and API endpoints
 * for woodwind instrument design and optimization.
 */

import index from "./index.html";
import { PhysicalParameters } from "../core/physics/physical-parameters.ts";
import {
  createCalculator,
  type CalculatorType,
} from "../core/modelling/calculator-factory.ts";
import { SimpleInstrumentTuner } from "../core/modelling/instrument-tuner.ts";
import { CentDeviationEvaluator } from "../core/optimization/evaluator.ts";
import {
  optimizeObjectiveFunction,
  createObjectiveFunction,
  getObjectiveFunctionsByCategory,
  OBJECTIVE_FUNCTION_INFO,
} from "../core/optimization/index.ts";
import { ConstraintIntent } from "../core/optimization/constraints.ts";
import {
  parseConstraints,
  constraintsToXml,
  constraintsToJson,
} from "../utils/xml-converter.ts";
import type { Instrument } from "../models/instrument.ts";
import type { Tuning, Fingering } from "../models/tuning.ts";

// Store for active sessions
const sessions = new Map<string, {
  instrument?: Instrument;
  tuning?: Tuning;
  params: PhysicalParameters;
}>();

function createSession(): string {
  const id = crypto.randomUUID();
  sessions.set(id, { params: new PhysicalParameters(20, "C") });
  return id;
}

function getSession(id: string) {
  return sessions.get(id);
}

// API handlers
async function handleCalculateTuning(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      instrument,
      tuning,
      temperature = 20,
      humidity = 45,
      calculatorType = "auto" as CalculatorType,
    } = body;

    if (!instrument || !tuning) {
      return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
    }

    if (!tuning.fingering || tuning.fingering.length === 0) {
      return Response.json({ error: "Tuning has no fingerings" }, { status: 400 });
    }

    // PhysicalParameters(temp, tempType, pressure, humidity, xCO2)
    // Use standard pressure (101.325 kPa) and standard CO2 (0.00039)
    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    // Use calculator factory with type detection or explicit type
    const calc = createCalculator(instrument, params, calculatorType);
    const tuner = new SimpleInstrumentTuner(instrument, tuning, calc, params);

    const results = tuning.fingering.map((fingering: Fingering) => {
      const note = fingering.note;
      if (!note) {
        return { note: "Unknown", error: "No note defined" };
      }

      const targetFreq = note.frequency;
      if (!targetFreq) {
        return { note: note.name || "Unknown", error: "No target frequency" };
      }

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
        return {
          note: note.name || "Unknown",
          targetFrequency: targetFreq,
          error: `Calculation error: ${calcError}`
        };
      }
    });

    return Response.json({ results });
  } catch (error) {
    console.error("Calculate tuning error:", error);
    return Response.json({ error: `Server error: ${error}` }, { status: 500 });
  }
}

async function handleOptimize(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      instrument,
      tuning,
      objectiveFunction = "HolePositionObjectiveFunction",
      temperature = 20,
      humidity = 45,
      calculatorType = "auto" as CalculatorType,
    } = body;

    if (!instrument || !tuning) {
      return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
    }

    // Validate objective function name
    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return Response.json(
        { error: `Unknown objective function: ${objectiveFunction}` },
        { status: 400 }
      );
    }

    // PhysicalParameters(temp, tempType, pressure, humidity, xCO2)
    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    // Use calculator factory with type detection or explicit type
    const calc = createCalculator(instrument, params, calculatorType);
    const evaluator = new CentDeviationEvaluator(calc);

    // Create objective function using factory
    const objective = createObjectiveFunction(objectiveFunction, calc, tuning, evaluator);

    console.log(`Optimizing with ${objectiveFunction}, ${objective.getNrDimensions()} variables`);

    const result = optimizeObjectiveFunction(objective, {
      maxIterations: 1000,
      tolerance: 1e-6,
    });

    return Response.json({
      optimizedInstrument: objective.getInstrument(),
      initialError: result.initialValue,
      finalError: result.finalValue,
      iterations: result.iterations,
      converged: result.converged,
      objectiveFunction: objectiveFunction,
      dimensions: objective.getNrDimensions(),
    });
  } catch (error) {
    console.error("Optimize error:", error);
    return Response.json({ error: `Server error: ${error}` }, { status: 500 });
  }
}

async function handleSketchData(req: Request): Promise<Response> {
  const body = await req.json();
  const { instrument } = body;

  if (!instrument) {
    return Response.json({ error: "Missing instrument" }, { status: 400 });
  }

  // Generate sketch data for visualization
  const borePoints = instrument.borePoint || [];
  const holes = instrument.hole || [];

  // Convert to visualization format
  const sketchData = {
    bore: borePoints.map((p: { borePosition: number; boreDiameter: number }) => ({
      position: p.borePosition,
      diameter: p.boreDiameter,
    })),
    holes: holes.map((h: { position: number; diameter: number; height?: number }) => ({
      position: h.position,
      diameter: h.diameter,
      height: h.height || 3,
    })),
    mouthpiece: instrument.mouthpiece,
    termination: instrument.termination,
  };

  return Response.json(sketchData);
}

// ============================================================================
// Constraints API Handlers
// ============================================================================

/**
 * Get constraints for an objective function with specified intent.
 * POST /api/constraints/get
 * Body: { instrument, tuning, objectiveFunction, intent: "default" | "blank" | "optimization", calculatorType? }
 */
async function handleGetConstraints(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      instrument,
      tuning,
      objectiveFunction,
      intent = "default",
      temperature = 20,
      humidity = 45,
      calculatorType = "auto" as CalculatorType,
    } = body;

    if (!instrument || !tuning || !objectiveFunction) {
      return Response.json(
        { error: "Missing instrument, tuning, or objectiveFunction" },
        { status: 400 }
      );
    }

    // Validate objective function name
    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return Response.json(
        { error: `Unknown objective function: ${objectiveFunction}` },
        { status: 400 }
      );
    }

    // Create calculator and evaluator
    const params = new PhysicalParameters(temperature, "C", 101.325, humidity, 0.00039);
    const calc = createCalculator(instrument, params, calculatorType);
    const evaluator = new CentDeviationEvaluator(calc);

    // Create objective function
    const objective = createObjectiveFunction(objectiveFunction, calc, tuning, evaluator);

    // Get constraints based on intent
    let constraintIntent: ConstraintIntent;
    switch (intent.toLowerCase()) {
      case "blank":
        constraintIntent = ConstraintIntent.BLANK;
        break;
      case "optimization":
        constraintIntent = ConstraintIntent.OPTIMIZATION;
        break;
      case "default":
      default:
        constraintIntent = ConstraintIntent.DEFAULT;
        break;
    }

    const constraints = objective.getConstraintsWithIntent(constraintIntent);

    // Return as JSON
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
  } catch (error) {
    console.error("Get constraints error:", error);
    return Response.json({ error: `Server error: ${error}` }, { status: 500 });
  }
}

/**
 * Parse constraints from XML or JSON content.
 * POST /api/constraints/parse
 * Body: { content, lengthType? }
 */
async function handleParseConstraints(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { content, lengthType = "MM" } = body;

    if (!content) {
      return Response.json({ error: "Missing content" }, { status: 400 });
    }

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
    console.error("Parse constraints error:", error);
    return Response.json({ error: `Parse error: ${error}` }, { status: 400 });
  }
}

/**
 * Export constraints to XML or JSON format.
 * POST /api/constraints/export
 * Body: { constraints, format: "xml" | "json" }
 */
async function handleExportConstraints(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { constraints: constraintsData, format = "json" } = body;

    if (!constraintsData) {
      return Response.json({ error: "Missing constraints" }, { status: 400 });
    }

    // Reconstruct Constraints object from JSON data
    const constraintsJson = JSON.stringify(constraintsData);
    const constraints = parseConstraints(constraintsJson);

    if (format.toLowerCase() === "xml") {
      const xml = constraintsToXml(constraints);
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml",
          "Content-Disposition": `attachment; filename="${constraints.getConstraintsName()}.xml"`,
        },
      });
    } else {
      const json = constraintsToJson(constraints);
      return new Response(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${constraints.getConstraintsName()}.json"`,
        },
      });
    }
  } catch (error) {
    console.error("Export constraints error:", error);
    return Response.json({ error: `Export error: ${error}` }, { status: 500 });
  }
}

/**
 * List all available objective functions with their info.
 * GET /api/constraints/objective-functions
 */
function handleListObjectiveFunctions(): Response {
  const categorized = getObjectiveFunctionsByCategory();
  return Response.json({
    functions: OBJECTIVE_FUNCTION_INFO,
    byCategory: categorized,
  });
}

// Start server
const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/api/calculate-tuning": {
      POST: handleCalculateTuning,
    },
    "/api/optimize": {
      POST: handleOptimize,
    },
    "/api/sketch": {
      POST: handleSketchData,
    },
    "/api/session": {
      POST: () => Response.json({ sessionId: createSession() }),
      GET: (req) => {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "Missing session id" }, { status: 400 });
        const session = getSession(id);
        if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
        return Response.json(session);
      },
    },
    // Constraints API endpoints
    "/api/constraints/get": {
      POST: handleGetConstraints,
    },
    "/api/constraints/parse": {
      POST: handleParseConstraints,
    },
    "/api/constraints/export": {
      POST: handleExportConstraints,
    },
    "/api/constraints/objective-functions": {
      GET: handleListObjectiveFunctions,
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`WWIDesigner Web running at http://localhost:${server.port}`);
