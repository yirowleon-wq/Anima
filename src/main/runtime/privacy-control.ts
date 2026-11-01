import * as z from 'zod';
import type { ChatCompletionsClient, ToolSpec } from '../provider';
import { HarnessError } from '../../shared/harness';

const schema = z.object({ approved: z.boolean(), quote: z.string().max(3000), reason: z.string().max(600) }).strict();
export async function verifyPrivacyControl(original: string, operation: unknown, complete: ChatCompletionsClient['complete'], signal: AbortSignal, hostState?: unknown) {
  const { $schema: _, ...parameters } = z.toJSONSchema(schema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_privacy_control', description: "Give the host your interpretation of the current original words: whether the person explicitly requests retiring, forgetting, or revoking access for this object at this particular time.", parameters } };
  const result = await complete([
    { role: 'system', content: `Help interpret the person's statement and the proposed target. Do they actually want retirement, forgetting, or revocation, or are they discussing, quoting, hypothesizing, or sharing a concern? Preserve these meanings. Forgetting removes specified local originals and derivatives; temporary nonuse has its own retirement operation. Scope follows the particular object named.

The target text in operation describes existing content or interpretation to process. “Please forget...” states today's choice, but the named old material has its own source. Deleting the current request itself has not processed that material. If only the control request is located, not the named old content, approved is false; reason may identify the interpretation or source still needed. Preserve an unsupported judgment when evidence is insufficient.

Retirement, forgetting, and revocation have different targets. “Stop using this interpretation” may retire it while preserving original words. “Forget these words and what you derived from them” requests content cleanup. “Do not read my grades in future” changes reading permission. Revocation alone does not prove deletion; retirement does not rewrite what the original said. Examples clarify distinctions; actual choice follows original's full context, target, and exact support. Quoted or discussed control phrases retain their own identity.

When approved is true, quote contains the exact current user passage supporting this operation. Return interpretation through verify_privacy_control; the original operation workflow performs actual processing.` },
    { role: 'system', content: `Also check timing: an approved proposal executes now. Identify the object and whether the agreed time arrived. A request to process after a future condition remains waiting until that condition occurs, so the current proposal has approved=false.

When hostState.conversationRetention already registers end-of-conversation cleanup, the host handles it at that lifecycle point. Current original words may remain safely until then. A separately explicit immediate request for an independent object has its own current scope and timing.` },
    { role: 'user', content: JSON.stringify({ original, operation, executionTiming: 'immediate_current_turn', hostState }) },
  ], [tool], signal, undefined, { thinking: 'enabled', maxOutputTokens: 4096 });
  const call = result.tool_calls.find(c => c.function.name === tool.function.name);
  if (!call) throw new HarnessError('privacy_control_unknown', "A complete processing judgment was not obtained. The proposed retirement, forgetting, or revocation did not occur.");
  const verdict = schema.parse(JSON.parse(call.function.arguments));
  if (verdict.approved && (!verdict.quote || !original.includes(verdict.quote))) throw new HarnessError('privacy_control_unknown', "The judgment's quotation does not match this round's original user words. The proposed retirement, forgetting, or revocation did not occur.");
  return verdict;
}
