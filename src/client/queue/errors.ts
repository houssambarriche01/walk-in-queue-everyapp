/** A server function's refusal as the sentence to show. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    // A validator's ZodError arrives as its JSON issues.
    try {
      const issues = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // Not JSON: the message is the sentence.
    }
    return error.message;
  }
  return "Something went wrong. Try again.";
}
