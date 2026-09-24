export type AppError = {
  message: string;
  code?: string;
};

export const createError = (message: string, code?: string): AppError => ({
  message,
  code,
});

/**
 * Normalize any thrown value into { message, code? }.
 *
 * Supabase-js PostgrestError objects are thrown as plain objects `{ message,
 * details, hint, code }` — NOT `Error` instances — so without this explicit
 * handling every DB failure would collapse to the generic "Something went
 * wrong". We surface the real message (and friendly text for the well-known
 * codes) instead.
 */
export const normalizeError = (error: unknown): AppError => {
  if (error && typeof error === "object" && "message" in error) {
    const candidate = error as { message?: unknown; code?: unknown };

    const isPostgrest =
      typeof candidate.code === "string" && typeof candidate.message === "string";

    if (isPostgrest) {
      const code = candidate.code as string;
      const message = candidate.message as string;
      if (code === "PGRST205") {
        return {
          message:
            "Your Hibbullah database isn't set up yet. Apply the schema on the " +
            "Supabase project (see docs/ROADMAP.md → “Apply the database schema”), " +
            "then reload the app.",
          code,
        };
      }
      return { message, code };
    }

    // Error instances
    if (error instanceof Error) {
      return { message: error.message };
    }

    // Any other object with a usable message
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return { message: candidate.message };
    }
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: "Something went wrong. Please try again." };
};