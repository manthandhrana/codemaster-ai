import mongoose from 'mongoose';

const { Schema } = mongoose;
const Mixed = Schema.Types.Mixed;

// ------------------------------------------------------------------ auto-increment ids
// Questions, submissions, prompts and schedules use readable numeric ids (#1, #2, ...).
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', lean: true });
  return c.seq;
}

// ------------------------------------------------------------------ questions
const progressSchema = new Schema(
  {
    status: { type: String, enum: ['todo', 'attempted', 'solved'], default: 'todo' },
    attempts: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    aiHints: { type: Number, default: 0 },
    aiReviews: { type: Number, default: 0 },
    solutionViewed: { type: Boolean, default: false },
    solvedIndependently: { type: Boolean, default: false },
    timeSpentSec: { type: Number, default: 0 },
    bestRuntimeMs: { type: Number, default: null },
    solvedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    // "Reattempt from scratch" resets the fields above; submission history is always kept.
    resets: { type: Number, default: 0 },
    resetAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    _id: Number,
    type: { type: String, enum: ['coding', 'mcq'], required: true },
    title: { type: String, required: true },
    titleKey: { type: String, index: true },
    difficulty: { type: String, required: true },
    language: { type: String, required: true },
    topic: { type: String, default: '' },
    tags: { type: [String], default: [] },
    // coding: statement, examples, hidden tests, hints, starter/solution code...  mcq: question, options, answer...
    data: { type: Mixed, required: true },
    provider: String,
    model: String,
    promptId: Number,
    source: { type: String, default: 'manual' }, // manual | daily | sample
    scheduleId: Number,
    jobId: String,
    batchDate: { type: String, index: true }, // YYYY-MM-DD of the daily set
    verified: { type: Boolean, default: false },
    starred: { type: Boolean, default: false },
    progress: { type: progressSchema, default: () => ({}) },
    // Version of prompts/schemas/<type>-question.schema.json that `data` was validated against.
    schemaVersion: { type: Number, default: 1 },
    // How it was produced: { provider, model, promptKey, promptVersion, requestId, attempts, latencyMs, inputTokens, outputTokens }
    generation: { type: Mixed, default: null },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
questionSchema.index({ type: 1, difficulty: 1, language: 1 });
questionSchema.index({ 'progress.status': 1 });
questionSchema.index({ createdAt: -1 });
export const Question = mongoose.model('Question', questionSchema);

// ------------------------------------------------------------------ submissions (every attempt is kept)
const submissionSchema = new Schema(
  {
    _id: Number,
    questionId: { type: Number, required: true, index: true },
    kind: { type: String, enum: ['coding', 'mcq'], required: true },
    language: String,
    code: String,
    answer: Number,
    verdict: { type: String, required: true },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    runtimeMs: { type: Number, default: null },
    executor: String,
    approximate: { type: Boolean, default: false },
    details: Mixed,
    timeSpentSec: { type: Number, default: 0 },
    review: Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false },
);
submissionSchema.index({ createdAt: -1 });
export const Submission = mongoose.model('Submission', submissionSchema);

// ------------------------------------------------------------------ prompt templates
const promptSchema = new Schema(
  {
    _id: Number,
    name: { type: String, required: true },
    type: { type: String, enum: ['coding', 'mcq'], required: true },
    difficulty: { type: String, required: true }, // easy | medium | hard | very_hard | any
    description: { type: String, default: '' },
    systemPrompt: { type: String, default: '' },
    template: { type: String, required: true },
    // Built-in templates come from backend/prompts/templates/**.md (key in the file's front matter).
    builtinKey: { type: String, unique: true, sparse: true },
    source: { type: String, default: 'custom' }, // file | custom
    file: { type: String, default: null },
    fileHash: { type: String, default: null },
    version: { type: Number, default: 1 },
    edited: { type: Boolean, default: false }, // admin changed a file template in the panel
  },
  { timestamps: true, versionKey: false },
);
export const Prompt = mongoose.model('Prompt', promptSchema);

// ------------------------------------------------------------------ automation schedules
const scheduleSchema = new Schema(
  {
    _id: Number,
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    time: { type: String, default: '09:00' },
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    cron: { type: String, default: '' },
    config: { type: Mixed, required: true },
    catchUp: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    lastStatus: { type: String, default: null },
    lastMessage: { type: String, default: null },
    lastJobId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
export const Schedule = mongoose.model('Schedule', scheduleSchema);

// ------------------------------------------------------------------ generation jobs
const jobSchema = new Schema(
  {
    _id: String,
    source: { type: String, required: true }, // manual | schedule
    scheduleId: Number,
    status: { type: String, required: true }, // queued | running | completed | partial | failed | cancelled
    params: Mixed,
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    logs: { type: [{ _id: false, t: Date, level: String, msg: String }], default: [] },
    questionIds: { type: [Number], default: [] },
    error: String,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false },
);
jobSchema.index({ createdAt: -1 });
export const Job = mongoose.model('Job', jobSchema);

// ------------------------------------------------------------------ AI usage logs (one row per provider attempt)
const aiLogSchema = new Schema(
  {
    requestId: { type: String, index: true },
    attempt: { type: Number, default: 1 },
    provider: { type: String, required: true },
    model: String,
    purpose: String,
    success: { type: Boolean, required: true },
    statusCode: Number,
    error: String,
    latencyMs: Number,
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    jobId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
aiLogSchema.index({ createdAt: -1 });
aiLogSchema.index({ provider: 1, createdAt: -1 });
export const AiLog = mongoose.model('AiLog', aiLogSchema);

// ------------------------------------------------------------------ raw AI responses (audit / re-processing)
const aiResponseSchema = new Schema(
  {
    requestId: { type: String, index: true },
    attempt: Number,
    provider: String,
    model: String,
    purpose: String,
    promptKey: String,
    promptVersion: Number,
    accepted: Boolean,
    error: String,
    finishReason: String,
    raw: String,
    questionIds: { type: [Number], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
aiResponseSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
export const AiResponse = mongoose.model('AiResponse', aiResponseSchema);

// ------------------------------------------------------------------ key/value settings
const settingSchema = new Schema({ _id: String, value: Mixed }, { versionKey: false, minimize: false });
export const Setting = mongoose.model('Setting', settingSchema);

/** Converts a lean document to the API shape ({ id, ... } instead of { _id, ... }). */
export function toClient(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}
