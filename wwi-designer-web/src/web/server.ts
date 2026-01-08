/**
 * WWIDesigner Web Server
 *
 * Bun-based server providing the web UI and API endpoints
 * for woodwind instrument design and optimization.
 *
 * Security features:
 * - Request size limits (1MB max)
 * - Rate limiting per IP
 * - Session expiration and cleanup
 * - Input validation
 * - Sanitized error messages
 * - CORS headers
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
import { convertInstrumentFromMetres, validateInstrument } from "../models/instrument.ts";
import type { LengthType } from "../core/constants.ts";
import type { Tuning, Fingering } from "../models/tuning.ts";
import { validateTuning } from "../models/tuning.ts";

// ============================================================================
// Security Configuration
// ============================================================================

const SECURITY_CONFIG = {
  // Request limits
  MAX_REQUEST_SIZE: 1024 * 1024, // 1MB

  // Rate limiting (requests per window)
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
  RATE_LIMITS: {
    "/api/optimize": 5,           // CPU intensive - 5 per minute
    "/api/session": 10,           // Session creation - 10 per minute
    default: 60,                  // Other endpoints - 60 per minute
  } as Record<string, number>,

  // Session limits
  MAX_SESSIONS: 10000,
  SESSION_EXPIRY_MS: 60 * 60 * 1000, // 1 hour
  SESSION_CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  // Physical parameter bounds
  TEMPERATURE_MIN: -50,
  TEMPERATURE_MAX: 60,
  HUMIDITY_MIN: 0,
  HUMIDITY_MAX: 100,
  PRESSURE_MIN: 50,
  PRESSURE_MAX: 150,
  CO2_PPM_MIN: 0,
  CO2_PPM_MAX: 10000,

  // Optimization limits
  MAX_NUMBER_OF_STARTS: 100,
  OPTIMIZATION_TIMEOUT_MS: 120000, // 2 minutes

  // Array size limits
  MAX_BORE_POINTS: 100,
  MAX_HOLES: 50,
  MAX_FINGERINGS: 100,

  // CORS configuration
  ALLOWED_ORIGINS: ["*"], // Configure for production
};

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, Map<string, RateLimitEntry>>();

function getClientIP(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

function checkRateLimit(req: Request, endpoint: string): { allowed: boolean; retryAfter?: number } {
  const ip = getClientIP(req);
  const now = Date.now();
  const limit = SECURITY_CONFIG.RATE_LIMITS[endpoint] ?? SECURITY_CONFIG.RATE_LIMITS.default ?? 60;

  let ipLimits = rateLimitStore.get(ip);
  if (!ipLimits) {
    ipLimits = new Map();
    rateLimitStore.set(ip, ipLimits);
  }

  let entry = ipLimits.get(endpoint);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW_MS };
    ipLimits.set(endpoint, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

// ============================================================================
// Request Body Type Definitions
// ============================================================================

interface CalculateTuningRequest {
  instrument: Instrument;
  tuning: Tuning;
  temperature?: number;
  humidity?: number;
  calculatorType?: CalculatorType;
}

interface OptimizeRequest {
  instrument: Instrument;
  tuning: Tuning;
  objectiveFunction?: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  co2Ppm?: number;
  useDirectOptimizer?: boolean;
  numberOfStarts?: number;
  calculatorType?: CalculatorType;
}

interface SketchRequest {
  instrument: Instrument;
}

interface GetConstraintsRequest {
  instrument: Instrument;
  tuning: Tuning;
  objectiveFunction: string;
  intent?: string;
  temperature?: number;
  humidity?: number;
  calculatorType?: CalculatorType;
}

interface ParseConstraintsRequest {
  content: string;
  lengthType?: string;
}

interface ExportConstraintsRequest {
  constraints: unknown;
  format?: string;
}

function rateLimitedResponse(retryAfter: number): Response {
  return Response.json(
    { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) }
    }
  );
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, endpoints] of rateLimitStore) {
    for (const [endpoint, entry] of endpoints) {
      if (now > entry.resetTime) {
        endpoints.delete(endpoint);
      }
    }
    if (endpoints.size === 0) {
      rateLimitStore.delete(ip);
    }
  }
}, 60000);

// ============================================================================
// Session Management with Expiration
// ============================================================================

interface Session {
  instrument?: Instrument;
  tuning?: Tuning;
  params: PhysicalParameters;
  createdAt: number;
  lastAccess: number;
}

const sessions = new Map<string, Session>();

function createSession(): string {
  // Enforce session limit
  if (sessions.size >= SECURITY_CONFIG.MAX_SESSIONS) {
    // Remove oldest sessions
    const entries = [...sessions.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    const toRemove = entries.slice(0, Math.floor(SECURITY_CONFIG.MAX_SESSIONS * 0.1));
    for (const [id] of toRemove) {
      sessions.delete(id);
    }
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  sessions.set(id, {
    params: new PhysicalParameters(20, "C"),
    createdAt: now,
    lastAccess: now,
  });
  return id;
}

function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (session) {
    // Check expiration
    if (Date.now() - session.lastAccess > SECURITY_CONFIG.SESSION_EXPIRY_MS) {
      sessions.delete(id);
      return undefined;
    }
    session.lastAccess = Date.now();
  }
  return session;
}

// Session cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccess > SECURITY_CONFIG.SESSION_EXPIRY_MS) {
      sessions.delete(id);
    }
  }
}, SECURITY_CONFIG.SESSION_CLEANUP_INTERVAL_MS);

// ============================================================================
// Input Validation
// ============================================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validatePhysicalParams(
  temperature: number,
  humidity: number,
  pressure: number = 101.325,
  co2Ppm: number = 390
): ValidationResult {
  if (typeof temperature !== "number" || isNaN(temperature)) {
    return { valid: false, error: "Temperature must be a number" };
  }
  if (temperature < SECURITY_CONFIG.TEMPERATURE_MIN || temperature > SECURITY_CONFIG.TEMPERATURE_MAX) {
    return { valid: false, error: `Temperature must be between ${SECURITY_CONFIG.TEMPERATURE_MIN} and ${SECURITY_CONFIG.TEMPERATURE_MAX} C` };
  }

  if (typeof humidity !== "number" || isNaN(humidity)) {
    return { valid: false, error: "Humidity must be a number" };
  }
  if (humidity < SECURITY_CONFIG.HUMIDITY_MIN || humidity > SECURITY_CONFIG.HUMIDITY_MAX) {
    return { valid: false, error: `Humidity must be between ${SECURITY_CONFIG.HUMIDITY_MIN} and ${SECURITY_CONFIG.HUMIDITY_MAX}%` };
  }

  if (typeof pressure !== "number" || isNaN(pressure)) {
    return { valid: false, error: "Pressure must be a number" };
  }
  if (pressure < SECURITY_CONFIG.PRESSURE_MIN || pressure > SECURITY_CONFIG.PRESSURE_MAX) {
    return { valid: false, error: `Pressure must be between ${SECURITY_CONFIG.PRESSURE_MIN} and ${SECURITY_CONFIG.PRESSURE_MAX} kPa` };
  }

  if (typeof co2Ppm !== "number" || isNaN(co2Ppm)) {
    return { valid: false, error: "CO2 must be a number" };
  }
  if (co2Ppm < SECURITY_CONFIG.CO2_PPM_MIN || co2Ppm > SECURITY_CONFIG.CO2_PPM_MAX) {
    return { valid: false, error: `CO2 must be between ${SECURITY_CONFIG.CO2_PPM_MIN} and ${SECURITY_CONFIG.CO2_PPM_MAX} ppm` };
  }

  return { valid: true };
}

function validateInstrumentSize(instrument: Instrument): ValidationResult {
  if (!instrument) {
    return { valid: false, error: "Instrument is required" };
  }

  if (instrument.borePoint && instrument.borePoint.length > SECURITY_CONFIG.MAX_BORE_POINTS) {
    return { valid: false, error: `Too many bore points (max ${SECURITY_CONFIG.MAX_BORE_POINTS})` };
  }

  if (instrument.hole && instrument.hole.length > SECURITY_CONFIG.MAX_HOLES) {
    return { valid: false, error: `Too many holes (max ${SECURITY_CONFIG.MAX_HOLES})` };
  }

  // Run the existing validation
  const errors = validateInstrument(instrument);
  if (errors.length > 0) {
    return { valid: false, error: errors[0] };
  }

  return { valid: true };
}

function validateTuningSize(tuning: Tuning): ValidationResult {
  if (!tuning) {
    return { valid: false, error: "Tuning is required" };
  }

  if (tuning.fingering && tuning.fingering.length > SECURITY_CONFIG.MAX_FINGERINGS) {
    return { valid: false, error: `Too many fingerings (max ${SECURITY_CONFIG.MAX_FINGERINGS})` };
  }

  // Run the existing validation
  const errors = validateTuning(tuning);
  if (errors.length > 0) {
    return { valid: false, error: errors[0] };
  }

  return { valid: true };
}

// ============================================================================
// Error Handling
// ============================================================================

function sanitizeError(error: unknown): string {
  // Log full error for debugging
  console.error("Internal error:", error);

  // Return generic message to client
  return "An internal error occurred. Please try again.";
}

function createErrorResponse(message: string, status: number = 500, code?: string): Response {
  return Response.json(
    { error: message, ...(code && { code }) },
    { status }
  );
}

// ============================================================================
// CORS Headers
// ============================================================================

function addCorsHeaders(response: Response, origin?: string | null): Response {
  const headers = new Headers(response.headers);

  // Check if origin is allowed
  const allowedOrigin = SECURITY_CONFIG.ALLOWED_ORIGINS.includes("*")
    ? "*"
    : (origin && SECURITY_CONFIG.ALLOWED_ORIGINS.includes(origin) ? origin : null);

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// API handlers
async function handleCalculateTuning(req: Request): Promise<Response> {
  try {
    // Rate limiting
    const rateCheck = checkRateLimit(req, "/api/calculate-tuning");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as CalculateTuningRequest;
    const {
      instrument,
      tuning,
      temperature = 20,
      humidity = 45,
      calculatorType = "auto" as CalculatorType,
    } = body;

    // Validate inputs
    if (!instrument || !tuning) {
      return createErrorResponse("Missing instrument or tuning", 400, "MISSING_INPUT");
    }

    const instrumentValidation = validateInstrumentSize(instrument);
    if (!instrumentValidation.valid) {
      return createErrorResponse(instrumentValidation.error!, 400, "INVALID_INSTRUMENT");
    }

    const tuningValidation = validateTuningSize(tuning);
    if (!tuningValidation.valid) {
      return createErrorResponse(tuningValidation.error!, 400, "INVALID_TUNING");
    }

    if (!tuning.fingering || tuning.fingering.length === 0) {
      return createErrorResponse("Tuning has no fingerings", 400, "NO_FINGERINGS");
    }

    // Validate physical parameters
    const paramsValidation = validatePhysicalParams(temperature, humidity);
    if (!paramsValidation.valid) {
      return createErrorResponse(paramsValidation.error!, 400, "INVALID_PARAMS");
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
        if (predicted === null || predicted === undefined) {
          return {
            note: note.name || "Unknown",
            targetFrequency: targetFreq,
            error: "Could not predict frequency"
          };
        }
        const deviation = 1200 * Math.log2(predicted / targetFreq);

        return {
          note: note.name || "Unknown",
          targetFrequency: targetFreq,
          predictedFrequency: predicted,
          deviationCents: deviation,
        };
      } catch (calcError) {
        // Log internally but return generic message
        console.error("Calculation error for note:", note.name, calcError);
        return {
          note: note.name || "Unknown",
          targetFrequency: targetFreq,
          error: "Calculation failed for this note"
        };
      }
    });

    return Response.json({ results });
  } catch (error) {
    return createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
  }
}

async function handleOptimize(req: Request): Promise<Response> {
  try {
    // Rate limiting - more restrictive for CPU-intensive endpoint
    const rateCheck = checkRateLimit(req, "/api/optimize");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as OptimizeRequest;
    const {
      instrument,
      tuning,
      objectiveFunction = "HolePositionObjectiveFunction",
      temperature = 20,
      humidity = 45,
      pressure = 101.325,
      co2Ppm = 390,
      useDirectOptimizer = false,
      numberOfStarts = 0,
      calculatorType = "auto" as CalculatorType,
    } = body;

    // Validate inputs
    if (!instrument || !tuning) {
      return createErrorResponse("Missing instrument or tuning", 400, "MISSING_INPUT");
    }

    const instrumentValidation = validateInstrumentSize(instrument);
    if (!instrumentValidation.valid) {
      return createErrorResponse(instrumentValidation.error!, 400, "INVALID_INSTRUMENT");
    }

    const tuningValidation = validateTuningSize(tuning);
    if (!tuningValidation.valid) {
      return createErrorResponse(tuningValidation.error!, 400, "INVALID_TUNING");
    }

    // Validate objective function name
    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return createErrorResponse(`Unknown objective function: ${objectiveFunction}`, 400, "INVALID_OBJECTIVE");
    }

    // Validate physical parameters
    const paramsValidation = validatePhysicalParams(temperature, humidity, pressure, co2Ppm);
    if (!paramsValidation.valid) {
      return createErrorResponse(paramsValidation.error!, 400, "INVALID_PARAMS");
    }

    // Limit numberOfStarts to prevent DoS
    const limitedNumberOfStarts = Math.min(
      Math.max(0, numberOfStarts),
      SECURITY_CONFIG.MAX_NUMBER_OF_STARTS
    );

    // Store original length type for conversion after optimization
    const originalLengthType: LengthType = instrument.lengthType || "MM";

    // PhysicalParameters(temp, tempType, pressure, humidity, xCO2)
    // Convert CO2 from ppm to fraction (e.g., 390 ppm = 0.00039)
    const xCO2 = co2Ppm / 1000000;
    const params = new PhysicalParameters(temperature, "C", pressure, humidity, xCO2);

    // Log air properties (matching Java format)
    console.log(`Properties of air at ${temperature.toFixed(2)} C, ${pressure.toFixed(3)} kPa, ${humidity}% humidity, ${co2Ppm} ppm CO2:`);
    console.log(`Speed of sound is ${params.getSpeedOfSound().toFixed(3)} m/s.`);
    console.log(`Density is ${params.getRho().toFixed(4)} kg/m^3.`);
    console.log(`Epsilon factor is ${(params.getAlphaConstant() / Math.sqrt(params.getSpeedOfSound())).toExponential(3)}.`);

    // Use calculator factory with type detection or explicit type
    const calc = createCalculator(instrument, params, calculatorType);
    const evaluator = new CentDeviationEvaluator(calc);

    // Create objective function using factory
    const objective = createObjectiveFunction(objectiveFunction, calc, tuning, evaluator);

    const nrDimensions = objective.getNrDimensions();
    const nrTargetNotes = tuning.fingering?.length || 0;

    const startTime = performance.now();

    // Use objective function's default maxEvaluations
    // forceDirectOptimizer: uses DIRECT global optimizer (slow but thorough)
    // numberOfStarts: multi-start optimization with specified number of starting points
    const result = optimizeObjectiveFunction(objective, {
      onProgress: (message) => console.log(message),
      forceDirectOptimizer: useDirectOptimizer,
      numberOfStarts: limitedNumberOfStarts > 0 ? limitedNumberOfStarts : undefined,
    });

    const elapsedTime = (performance.now() - startTime) / 1000;
    const residualRatio = result.initialNorm > 0 ? result.finalNorm / result.initialNorm : 0;

    // Convert optimized instrument back to original length units
    // The calculator internally converts to meters, so we need to convert back
    let optimizedInstrument = objective.getInstrument();
    if (optimizedInstrument.lengthType === "M" && originalLengthType !== "M") {
      optimizedInstrument = convertInstrumentFromMetres(optimizedInstrument, originalLengthType);
    }

    return Response.json({
      optimizedInstrument,
      initialError: result.initialNorm,
      finalError: result.finalNorm,
      evaluations: result.evaluations,
      tunings: result.tunings,
      success: result.success,
      objectiveFunction: objectiveFunction,
      dimensions: nrDimensions,
      targetNotes: nrTargetNotes,
      residualRatio: residualRatio,
      elapsedTime: elapsedTime,
    });
  } catch (error) {
    return createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
  }
}

async function handleSketchData(req: Request): Promise<Response> {
  try {
    // Rate limiting
    const rateCheck = checkRateLimit(req, "/api/sketch");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as SketchRequest;
    const { instrument } = body;

    if (!instrument) {
      return createErrorResponse("Missing instrument", 400, "MISSING_INPUT");
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
  } catch (error) {
    return createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
  }
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
    // Rate limiting
    const rateCheck = checkRateLimit(req, "/api/constraints/get");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as GetConstraintsRequest;
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
      return createErrorResponse("Missing instrument, tuning, or objectiveFunction", 400, "MISSING_INPUT");
    }

    // Validate objective function name
    if (!OBJECTIVE_FUNCTION_INFO[objectiveFunction]) {
      return createErrorResponse(`Unknown objective function: ${objectiveFunction}`, 400, "INVALID_OBJECTIVE");
    }

    // Validate physical parameters
    const paramsValidation = validatePhysicalParams(temperature, humidity);
    if (!paramsValidation.valid) {
      return createErrorResponse(paramsValidation.error!, 400, "INVALID_PARAMS");
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
    return createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
  }
}

/**
 * Parse constraints from XML or JSON content.
 * POST /api/constraints/parse
 * Body: { content, lengthType? }
 */
async function handleParseConstraints(req: Request): Promise<Response> {
  try {
    // Rate limiting
    const rateCheck = checkRateLimit(req, "/api/constraints/parse");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as ParseConstraintsRequest;
    const { content, lengthType = "MM" } = body;

    if (!content) {
      return createErrorResponse("Missing content", 400, "MISSING_INPUT");
    }

    // Validate lengthType
    const validLengthTypes: LengthType[] = ["MM", "CM", "M", "IN", "FT"];
    const normalizedLengthType = (lengthType?.toUpperCase() || "MM") as LengthType;
    if (!validLengthTypes.includes(normalizedLengthType)) {
      return createErrorResponse(`Invalid lengthType: ${lengthType}. Must be one of: ${validLengthTypes.join(", ")}`, 400, "INVALID_PARAMS");
    }

    const constraints = parseConstraints(content, normalizedLengthType);

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
    // Parse errors are user-facing, but sanitize the message
    console.error("Parse constraints error:", error);
    return createErrorResponse("Failed to parse constraints. Check format.", 400, "PARSE_ERROR");
  }
}

/**
 * Export constraints to XML or JSON format.
 * POST /api/constraints/export
 * Body: { constraints, format: "xml" | "json" }
 */
async function handleExportConstraints(req: Request): Promise<Response> {
  try {
    // Rate limiting
    const rateCheck = checkRateLimit(req, "/api/constraints/export");
    if (!rateCheck.allowed) {
      return rateLimitedResponse(rateCheck.retryAfter!);
    }

    const body = await req.json() as ExportConstraintsRequest;
    const { constraints: constraintsData, format = "json" } = body;

    if (!constraintsData) {
      return createErrorResponse("Missing constraints", 400, "MISSING_INPUT");
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
    return createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
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

// ============================================================================
// Session Handlers with Rate Limiting
// ============================================================================

function handleSessionCreate(req: Request): Response {
  const rateCheck = checkRateLimit(req, "/api/session");
  if (!rateCheck.allowed) {
    return rateLimitedResponse(rateCheck.retryAfter!);
  }
  return Response.json({ sessionId: createSession() });
}

function handleSessionGet(req: Request): Response {
  const rateCheck = checkRateLimit(req, "/api/session");
  if (!rateCheck.allowed) {
    return rateLimitedResponse(rateCheck.retryAfter!);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return createErrorResponse("Missing session id", 400, "MISSING_INPUT");
  }
  const session = getSession(id);
  if (!session) {
    return createErrorResponse("Session not found", 404, "NOT_FOUND");
  }
  // Don't expose internal timestamps
  return Response.json({
    instrument: session.instrument,
    tuning: session.tuning,
  });
}

// ============================================================================
// Request Size Checking Middleware
// ============================================================================

function checkRequestSize(req: Request): Response | null {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > SECURITY_CONFIG.MAX_REQUEST_SIZE) {
      return createErrorResponse(
        `Request too large. Maximum size is ${SECURITY_CONFIG.MAX_REQUEST_SIZE / 1024}KB`,
        413,
        "PAYLOAD_TOO_LARGE"
      );
    }
  }
  return null;
}

// ============================================================================
// Start Server
// ============================================================================

const server = Bun.serve({
  port: 3000,

  // Use routes for static files - Bun auto-bundles HTML and transpiles TypeScript
  routes: {
    "/": index,  // HTMLBundle with auto-bundling
  },

  // Custom fetch handler for API routes with security middleware
  async fetch(req, server) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return addCorsHeaders(new Response(null, { status: 204 }), origin);
    }

    // Check request size for POST requests
    if (req.method === "POST") {
      const sizeError = checkRequestSize(req);
      if (sizeError) {
        return addCorsHeaders(sizeError, origin);
      }
    }

    // Route to handlers
    let response: Response;

    try {
      // API routes
      if (url.pathname === "/api/calculate-tuning" && req.method === "POST") {
        response = await handleCalculateTuning(req);
      }
      else if (url.pathname === "/api/optimize" && req.method === "POST") {
        response = await handleOptimize(req);
      }
      else if (url.pathname === "/api/sketch" && req.method === "POST") {
        response = await handleSketchData(req);
      }
      else if (url.pathname === "/api/session") {
        if (req.method === "POST") {
          response = handleSessionCreate(req);
        } else if (req.method === "GET") {
          response = handleSessionGet(req);
        } else {
          response = createErrorResponse("Method not allowed", 405, "METHOD_NOT_ALLOWED");
        }
      }
      else if (url.pathname === "/api/constraints/get" && req.method === "POST") {
        response = await handleGetConstraints(req);
      }
      else if (url.pathname === "/api/constraints/parse" && req.method === "POST") {
        response = await handleParseConstraints(req);
      }
      else if (url.pathname === "/api/constraints/export" && req.method === "POST") {
        response = await handleExportConstraints(req);
      }
      else if (url.pathname === "/api/constraints/objective-functions" && req.method === "GET") {
        response = handleListObjectiveFunctions();
      }
      else {
        response = createErrorResponse("Not found", 404, "NOT_FOUND");
      }
    } catch (error) {
      response = createErrorResponse(sanitizeError(error), 500, "INTERNAL_ERROR");
    }

    // Add CORS headers to all responses
    return addCorsHeaders(response, origin);
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`WWIDesigner Web running at http://localhost:${server.port}`);
console.log(`Security features enabled: rate limiting, request size limits, session expiration`);
