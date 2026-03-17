const HIGH_RISK_PATTERNS = [
  /ignore (all |any |the )?(previous|prior) instructions/i,
  /reveal (your|the) system prompt/i,
  /print (your|the) hidden instructions/i,
  /exfiltrat(e|ion)/i,
  /send .*api key/i,
  /return .*secret/i,
  /browser\.cookies/i,
];

const MEDIUM_RISK_PATTERNS = [
  /system prompt/i,
  /developer message/i,
  /tool call/i,
  /override .*instructions/i,
  /disable .*safety/i,
  /jailbreak/i,
];

export type PromptInjectionRisk = 'low' | 'medium' | 'high';

export interface PromptInjectionAnalysis {
  risk: PromptInjectionRisk;
  signals: string[];
}

export function analyzePromptInjectionRisk(texts: Array<string | undefined | null>): PromptInjectionAnalysis {
  const content = texts.filter(Boolean).join('\n\n');
  const signals: string[] = [];

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(content)) {
      signals.push(pattern.source);
    }
  }

  if (signals.length > 0) {
    return { risk: 'high', signals };
  }

  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(content)) {
      signals.push(pattern.source);
    }
  }

  if (signals.length > 0) {
    return { risk: 'medium', signals };
  }

  return { risk: 'low', signals: [] };
}

export function sanitizeForAgentConsumption(value: string | undefined | null) {
  if (!value) return '';

  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\b(ignore|override|reveal)\b/gi, '[redacted-instruction]')
    .trim();
}
