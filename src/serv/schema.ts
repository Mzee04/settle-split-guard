/** JSON schema forwarded to SERV. Strict object, no extra keys. */
export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "confidencePercent", "summary", "fairness", "disputes", "destinationNotes", "reasonTrail"],
  properties: {
    verdict: { type: "string", enum: ["SETTLE", "WAIT", "REJECT"] },
    confidencePercent: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    fairness: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["person", "amountCents", "reason"],
        properties: {
          person: { type: "string" },
          amountCents: { type: "integer" },
          reason: { type: "string" },
        },
      },
    },
    disputes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "person", "unresolved", "reason"],
        properties: {
          quote: { type: "string" },
          person: { type: "string" },
          unresolved: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
    destinationNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["person", "concern"],
        properties: {
          person: { type: "string" },
          concern: { type: "string" },
        },
      },
    },
    reasonTrail: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "because"],
        properties: {
          step: { type: "string" },
          because: { type: "string" },
        },
      },
    },
  },
} as const;
