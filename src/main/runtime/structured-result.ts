import type { z } from 'zod';
import type { ChatCompletionsClient, ModelWireMessage, ToolSpec, CompletionOptions } from '../provider';
import { ProviderError } from '../provider';
import { HarnessError } from '../../shared/harness';

/** A malformed proposal gets one fresh bounded attempt; never relax its schema. */
export async function structuredResult<T>(input: {
  schema: z.ZodType<T>; tool: ToolSpec; messages: ModelWireMessage[];
  complete: ChatCompletionsClient['complete']; signal: AbortSignal; options: CompletionOptions;
  failureCode: string; failureMessage: string;
}): Promise<T> {
  let formatIssue = "A complete judgment was not received.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt ? [...input.messages, { role: 'system' as const, content: "The judgment could not be read completely. The specific issue is: " + formatIssue + " The original material remains. Please organize it again and return your judgment through the same tool. Field descriptions explain their meaning; preserve actually missing information. Original words, facts, and the person's choices remain the task." }] : input.messages;
    let result: Awaited<ReturnType<ChatCompletionsClient['complete']>>;
    try { result = await input.complete(messages, [input.tool], input.signal, undefined, input.options); }
    catch (error) {
      if (attempt !== 0 || !(error instanceof ProviderError) || !['output_length', 'empty_response'].includes(error.code)) throw error;
      formatIssue = error.code === 'empty_response' ? "No content was received, so no decision was made from it." : "Content reached the output limit before completion. The complete judgment was not received.";
      input.signal.throwIfAborted();
      continue;
    }
    const calls = result.tool_calls.filter(call => call.function.name === input.tool.function.name);
    if (calls.length !== 1) continue;
    try {
      const parsed = input.schema.safeParse(JSON.parse(calls[0].function.arguments));
      if (parsed.success) return parsed.data;
      formatIssue = JSON.stringify(parsed.error.issues.slice(0, 8).map(issue => ({ field: issue.path.join('.'), code: issue.code, message: issue.message })));
    } catch { formatIssue = "These tool arguments cannot currently be read as a JSON object."; }
  }
  throw new HarnessError(input.failureCode, input.failureMessage);
}
