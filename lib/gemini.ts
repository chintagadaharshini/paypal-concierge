// The Gemini model for the shopping agent, through the Vercel AI SDK (v4) Google provider.
// Server-side only: it reads GOOGLE_GENERATIVE_AI_API_KEY and never logs it.

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_MODEL } from './config';
import { withThoughtSignatures } from './thought-signatures';

export const geminiConfigured = () => !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/** A fresh Gemini model for one agent run (its own thought-signature memory; see thought-signatures.ts). */
export function geminiModel(modelId: string = GEMINI_MODEL) {
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, fetch: withThoughtSignatures() })(modelId);
}
