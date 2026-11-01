import { ChatCompletionsClient } from './provider';
import { AppServerLunaClient } from './luna-provider';
import { withModelRequestWait } from './runtime/model-wait';

export type ModelClient = Pick<ChatCompletionsClient, 'complete' | 'assistantMessage' | 'invalidateBoundary' | 'providerMetadata'>;
/** Luna is the app's selected live model transport. */
export const usingLunaTransport = () => true;
/** Selection is available without a bundled key. Actual CLI authentication is
 * checked by the existing transport when a request or connection check starts. */
export const modelTransportReady = (_key: string) => true;
export function createModelClient(_key: string, _model: string): ModelClient {
  const client = new AppServerLunaClient();
  return {
    complete: (...args) => withModelRequestWait(() => client.complete(...args)),
    assistantMessage: result => client.assistantMessage(result),
    invalidateBoundary: () => client.invalidateBoundary(),
    providerMetadata: options => client.providerMetadata(options),
  };
}
