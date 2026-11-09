// Optional Claude tutor for the chat tab. Uses your own Anthropic API key (pay-as-you-go),
// kept only on this device. Every question is sent with the matching passages from your
// library so answers stay grounded in your books and cite their pages.

export const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm';
export const TUTOR_MODEL = 'claude-opus-5-5';
const KEY = 'ccnaq.anthropicKey';

export const tutorKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setTutorKey = k => { try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* blocked */ } };

export const SYSTEM = `You are a CCNA 200-301 tutor for a student working through the Cisco Networking Academy CCNA 1 and 2 Companion Guide and Todd Lammle's CCNA Routing and Switching Complete Study Guide, with the exam in early 2027.

Each question comes with excerpts from the student's own reference books, tagged with the source and page. Ground your explanation in them and cite pages inline, like (Lammle p.445). Where the excerpts are thin or silent, you may use your own knowledge, but say so. Lammle's book targets the older 200-125 exam: if an excerpt covers something that changed or was dropped for 200-301 v1.1 (for example RIP, EIGRP depth, Frame Relay, PPP/PPPoE details), point that out.

Teach for understanding: start with the core idea in a sentence or two, then go deeper - the why, the step-by-step mechanism, a small worked example or an IOS snippet when it helps, and the classic exam traps. Use short paragraphs, lists and code blocks rather than walls of text. Finish with one short question the student can use to check themselves, without giving its answer.`;

/** Format library hits for the prompt. */
export const excerptsBlock = hits => hits.map(x => `[${x.name}${typeof x.p === 'number' ? ` p.${x.p}` : `: ${x.p}`}]\n${x.text}`).join('\n\n');

let sdk = null;

/**
 * Ask Claude. history: [{ role, content }] (earlier turns, sent unchanged so the conversation
 * stays append-only). Streams text into onText. Returns the full answer text.
 */
export async function askTutor({ history, question, hits, onText, signal }) {
  const apiKey = tutorKey();
  if (!apiKey) throw new Error('Add your Anthropic API key in Library & AI first.');
  if (!sdk) sdk = await import(SDK_URL);
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const content = hits.length ? `Excerpts from my books:\n\n${excerptsBlock(hits)}\n\nMy question: ${question}` : question;
  try {
    const stream = client.beta.messages.stream({
      model: TUTOR_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [...history, { role: 'user', content }],
    }, { signal });
    stream.on('text', t => onText(t));
    const msg = await stream.finalMessage();
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (msg.stop_reason === 'refusal') return { text: text || 'Claude declined to answer this one. Try rephrasing the question.', content, refused: true };
    return { text, content };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Your API key was rejected. Check it in Library & AI.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use this model.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited, or your account is out of credit. Try again in a minute.');
    if (e instanceof Anthropic.APIUserAbortError) throw e;
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API. Are you online?');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
    throw e;
  }
}
