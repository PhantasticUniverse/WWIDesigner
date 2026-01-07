/**
 * WWIDesigner Web Server
 *
 * Bun-based server providing the web UI and API endpoints
 * for woodwind instrument design and optimization.
 */

import index from "./index.html";
import { PhysicalParameters } from "../core/physics/physical-parameters.ts";
import { DefaultInstrumentCalculator } from "../core/modelling/instrument-calculator.ts";
import { InstrumentTuner } from "../core/modelling/instrument-tuner.ts";
import { CentDeviationEvaluator } from "../core/optimization/evaluator.ts";
import {
  HolePositionObjectiveFunction,
  HoleSizeObjectiveFunction,
  HoleObjectiveFunction,
} from "../core/optimization/hole-position-objective.ts";
import { optimizeObjectiveFunction } from "../core/optimization/objective-function-optimizer.ts";
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
  const body = await req.json();
  const { instrument, tuning, temperature = 20, humidity = 45 } = body;

  if (!instrument || !tuning) {
    return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
  }

  const params = new PhysicalParameters(temperature, "C", humidity);
  const calc = new DefaultInstrumentCalculator(instrument, params);
  const tuner = new InstrumentTuner(calc);

  const results = tuning.fingering.map((fingering: Fingering) => {
    const targetFreq = fingering.note.frequency;
    if (!targetFreq) {
      return { note: fingering.note.name, error: "No target frequency" };
    }

    const predicted = tuner.predictedFrequency(fingering);
    const deviation = 1200 * Math.log2(predicted / targetFreq);

    return {
      note: fingering.note.name,
      targetFrequency: targetFreq,
      predictedFrequency: predicted,
      deviationCents: deviation,
    };
  });

  return Response.json({ results });
}

async function handleOptimize(req: Request): Promise<Response> {
  const body = await req.json();
  const { instrument, tuning, optimizationType = "positions", temperature = 20, humidity = 45 } = body;

  if (!instrument || !tuning) {
    return Response.json({ error: "Missing instrument or tuning" }, { status: 400 });
  }

  const params = new PhysicalParameters(temperature, "C", humidity);
  const calc = new DefaultInstrumentCalculator(instrument, params);
  const evaluator = new CentDeviationEvaluator(calc);

  let objective;
  switch (optimizationType) {
    case "sizes":
      objective = new HoleSizeObjectiveFunction(calc, tuning, evaluator);
      break;
    case "both":
      objective = new HoleObjectiveFunction(calc, tuning, evaluator);
      break;
    case "positions":
    default:
      objective = new HolePositionObjectiveFunction(calc, tuning, evaluator);
      break;
  }

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
  });
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
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`WWIDesigner Web running at http://localhost:${server.port}`);
