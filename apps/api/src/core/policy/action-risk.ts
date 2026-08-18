import {
  ActionEffect,
  ActionRiskLevel,
  ActionType,
  DeclaredRisk,
} from "@cu/contracts";

/**
 * Effect taxonomy — fail closed on unknown state mutation.
 * Declared step.effect is authoritative; runtime inference is a secondary safeguard.
 */

const EXTERNAL_SIDE_EFFECT_PATTERNS = [
  /checkout/i,
  /purchase/i,
  /buy now/i,
  /pay\b/i,
  /transfer/i,
  /delete/i,
  /destroy/i,
  /submit/i,
  /confirm (order|purchase|payment)/i,
  /approve/i,
  /send money/i,
];

const REVERSIBLE_MUTATION_PATTERNS = [
  /login/i,
  /\bsort\b/i,
  /\bfilter\b/i,
  /open menu/i,
  /close menu/i,
];

export function classifyActionEffect(input: {
  actionType: ActionType;
  description?: string;
  targetName?: string;
  declaredEffect?: ActionEffect;
}): ActionEffect {
  if (input.declaredEffect) return input.declaredEffect;

  const text = `${input.description ?? ""} ${input.targetName ?? ""}`;

  if (
    input.actionType === ActionType.Read ||
    input.actionType === ActionType.Wait ||
    input.actionType === ActionType.Extract ||
    input.actionType === ActionType.Checkpoint ||
    input.actionType === ActionType.Complete
  ) {
    return ActionEffect.Read;
  }

  if (input.actionType === ActionType.Navigate) return ActionEffect.Navigation;
  if (input.actionType === ActionType.Type || input.actionType === ActionType.Select) {
    return ActionEffect.DataEntry;
  }

  if (EXTERNAL_SIDE_EFFECT_PATTERNS.some((p) => p.test(text))) {
    return ActionEffect.ExternalSideEffect;
  }
  if (REVERSIBLE_MUTATION_PATTERNS.some((p) => p.test(text))) {
    return ActionEffect.ReversibleMutation;
  }

  if (input.actionType === ActionType.Click) return ActionEffect.Unknown;

  return ActionEffect.Unknown;
}

export function effectToRisk(effect: ActionEffect): ActionRiskLevel {
  switch (effect) {
    case ActionEffect.Read:
    case ActionEffect.Navigation:
      return ActionRiskLevel.Low;
    case ActionEffect.DataEntry:
    case ActionEffect.ReversibleMutation:
      return ActionRiskLevel.Medium;
    case ActionEffect.ExternalSideEffect:
    case ActionEffect.Irreversible:
    case ActionEffect.Unknown:
      return ActionRiskLevel.High;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

export function classifyActionRisk(input: {
  actionType: ActionType;
  description?: string;
  targetName?: string;
  declaredRisk?: DeclaredRisk;
  declaredEffect?: ActionEffect;
}): { effect: ActionEffect; risk: ActionRiskLevel; requireHuman: boolean } {
  const effect = classifyActionEffect(input);
  let risk = effectToRisk(effect);

  if (
    input.declaredRisk === DeclaredRisk.Risky ||
    input.declaredRisk === DeclaredRisk.High
  ) {
    risk = ActionRiskLevel.High;
  }
  if (
    input.declaredRisk === DeclaredRisk.Safe ||
    input.declaredRisk === DeclaredRisk.Low
  ) {
    risk = ActionRiskLevel.Low;
  }
  if (input.declaredRisk === DeclaredRisk.Medium) {
    risk = ActionRiskLevel.Medium;
  }

  const requireHuman =
    effect === ActionEffect.Unknown ||
    effect === ActionEffect.ExternalSideEffect ||
    effect === ActionEffect.Irreversible ||
    risk === ActionRiskLevel.High;

  return { effect, risk, requireHuman };
}
