// Gemini 3 models attach a `thoughtSignature` to function calls and reject the next request with
// HTTP 400 unless each call is sent back with its signature. @ai-sdk/google 1.x (the version that
// pairs with AI SDK 4, which @paypal/agent-toolkit needs) drops it. This wraps the provider's fetch:
// it remembers the signatures in each response and puts them back on the same calls in the next
// request. Use one wrapper per agent run, so signatures never mix between runs.
//
// Calls are matched by position, not by arguments: the AI SDK re-sends a call's arguments after
// validating them (which can drop fields the model added), so the arguments may not match exactly.
// The k-th model turn with function calls in a request is the k-th response that had them, and the
// i-th call in it is that response's i-th call. A name check guards against any misalignment.

type FunctionCallPart = { functionCall?: { name: string }; thoughtSignature?: string };
type Content = { role?: string; parts?: FunctionCallPart[] };
type RecordedCall = { name: string; signature?: string };

export function withThoughtSignatures(fetchImpl: typeof fetch = fetch): typeof fetch {
  // One entry per response that contained function calls, in order.
  const turns: RecordedCall[][] = [];

  return async (input, init) => {
    if (typeof init?.body === 'string' && turns.length > 0) {
      const body = JSON.parse(init.body) as { contents?: Content[] };
      let turn = 0;
      for (const content of body.contents ?? []) {
        const calls = (content.parts ?? []).filter((p) => p.functionCall);
        if (content.role !== 'model' || calls.length === 0) continue;
        const recorded = turns[turn++];
        calls.forEach((part, i) => {
          const match = recorded?.[i];
          if (match?.signature && match.name === part.functionCall!.name && !part.thoughtSignature) {
            part.thoughtSignature = match.signature;
          }
        });
      }
      init = { ...init, body: JSON.stringify(body) };
    }

    const res = await fetchImpl(input, init);
    const text = await res.text();
    try {
      const data = JSON.parse(text) as { candidates?: { content?: Content }[] };
      const calls = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall!.name, signature: p.thoughtSignature }));
      if (calls.length > 0) turns.push(calls);
    } catch {
      // Not JSON (e.g. an HTML error page): nothing to remember; the provider reports the error.
    }
    // The body was already decoded, so drop the headers that described the encoded one.
    const headers = new Headers(res.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(text, { status: res.status, statusText: res.statusText, headers });
  };
}
