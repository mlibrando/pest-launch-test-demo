export const RUBRIC_BUCKET = "rubric-documents";

export type Criterion = {
    id: string;
    quadrant: string;
    label: string;
    qualityBar: string;
    appliesWhen?: string;
    ifNotApplicable?: "auto_pass" | "exclude";
    sourceRef: string;
};

export type Scorecard = {
    callType: string;
    thresholds: { gold?: number; green?: number };
    criteria: Criterion[];
};

export type PlaceholderValue = { value?: string; varies?: boolean };

export type RubricData = {
    scorecards: Scorecard[];
    policies: { rule?: string; sourceRef?: string }[];
    // answer/resolved and placeholderValues are filled in by the reviewer, not by extraction.
    conflicts: { description?: string; question?: string; answer?: string; resolved?: boolean }[];
    placeholders: string[];
    placeholderValues?: Record<string, PlaceholderValue>;
};

export const isPlaceholderResolved = (v?: PlaceholderValue) => Boolean(v?.varies || v?.value?.trim());

/** Labels of the placeholders and conflicts the reviewer hasn't dealt with yet. */
export function unresolvedItems(data: RubricData): string[] {
    return [
        ...data.placeholders.filter((p) => !isPlaceholderResolved(data.placeholderValues?.[p])),
        ...data.conflicts.filter((c) => !c.resolved).map((c) => c.question || c.description || "Conflict"),
    ];
}

/** Bakes filled-in placeholder values into the criteria and policies. "Varies" placeholders stay as tokens. */
export function applyPlaceholders(data: RubricData): RubricData {
    const fill = (text: string) =>
        Object.entries(data.placeholderValues ?? {}).reduce(
            (t, [token, v]) => (v.value?.trim() && !v.varies ? t.replaceAll(token, v.value.trim()) : t),
            text,
        );
    return {
        ...data,
        scorecards: data.scorecards.map((sc) => ({
            ...sc,
            criteria: sc.criteria.map((c) => ({
                ...c,
                label: fill(c.label),
                qualityBar: fill(c.qualityBar),
                appliesWhen: c.appliesWhen && fill(c.appliesWhen),
            })),
        })),
        policies: data.policies.map((p) => ({ ...p, rule: p.rule && fill(p.rule) })),
    };
}

/** Returns an error message, or null if the rubric is valid. */
export function validateRubric(data: RubricData): string | null {
    if (!Array.isArray(data?.scorecards)) return "Rubric has no scorecards.";
    for (const scorecard of data.scorecards) {
        const ids = scorecard.criteria.map((c) => c.id);
        const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
        if (duplicate) return `${scorecard.callType}: duplicate criterion id "${duplicate}".`;
        if (scorecard.thresholds?.gold !== ids.length) {
            return `${scorecard.callType}: thresholds.gold (${scorecard.thresholds?.gold}) must equal the criteria count (${ids.length}).`;
        }
    }
    return null;
}
