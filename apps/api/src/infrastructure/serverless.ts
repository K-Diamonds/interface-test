/**
 * Keep serverless work alive after 202 without one long client HTTP request.
 * Local mode just fires-and-forgets.
 */
export function continueAfterResponse(work: Promise<unknown>): void {
  if (process.env.VERCEL) {
    void import("@vercel/functions")
      .then(({ waitUntil }) => {
        waitUntil(work);
      })
      .catch(() => {
        void work;
      });
    return;
  }
  void work;
}
