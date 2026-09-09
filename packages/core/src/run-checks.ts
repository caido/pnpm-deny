import { applyOverrides, statsFromFindings } from "./lint.js";
import type {
  CheckContext,
  CheckResult,
  Finding,
  LintOverrides,
  PolicyCheck,
} from "./types.js";

export async function runChecks(
  checks: PolicyCheck[],
  context: CheckContext,
): Promise<CheckResult[]> {
  const settled = await Promise.all(
    checks.map(async (check) => {
      const result = await check.run(context);
      return applyResultOverrides(result, context.overrides);
    }),
  );
  return settled;
}

function applyResultOverrides(
  result: CheckResult,
  overrides: LintOverrides,
): CheckResult {
  const findings: Finding[] = result.findings.map((finding) =>
    applyOverrides(finding, overrides),
  );
  return {
    ...result,
    findings,
    stats: statsFromFindings(result.check, findings),
  };
}
