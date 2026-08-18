export class ProgressTracker {
  private readonly fingerprints: string[] = [];
  private invalidStreak = 0;
  private readonly invalidProposalLimit = 3;

  constructor(private readonly stuckThreshold: number) {}

  noteInvalidProposal(): boolean {
    this.invalidStreak += 1;
    return this.invalidStreak >= this.invalidProposalLimit;
  }

  noteValidProposal(): void {
    this.invalidStreak = 0;
  }

  /** Returns true when the same post-action fingerprint repeats threshold times. */
  notePostActionFingerprint(fingerprint: string): boolean {
    this.fingerprints.push(fingerprint);
    if (this.fingerprints.length > this.stuckThreshold) {
      this.fingerprints.shift();
    }
    return (
      this.fingerprints.length === this.stuckThreshold &&
      this.fingerprints.every((f) => f === this.fingerprints[0])
    );
  }
}
