"use server";

import { requireSession } from "@/lib/auth/session";
import type { Tier } from "@/lib/calls";
import { getActiveCompany } from "@/lib/companies";
import { parseRange, rangeBounds, summarizeOverview, type OverviewCall } from "@/lib/overview";
import { prisma } from "@/lib/prisma";
import type { RubricData } from "@/lib/rubrics";

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;

/** Everything the Overview page shows for a date range. The range comes from the URL, so it's validated here. */
export async function getOverview(rangeParam: string | null) {
    await requireSession();
    const range = parseRange(rangeParam);
    const company = await getActiveCompany();
    const now = new Date();
    const bounds = rangeBounds(range, now);
    // Calls are dated by when they happened, falling back to upload time until a real call date exists.
    const since = bounds && { OR: [{ callDate: { gte: bounds.previousStart } }, { callDate: null, createdAt: { gte: bounds.previousStart } }] };

    const [rows, statusCounts, spokenNames, activeRubrics] = await Promise.all([
        prisma.call.findMany({
            where: { companyId: company.id, status: "DONE", ...since },
            select: {
                id: true,
                originalName: true,
                callDate: true,
                createdAt: true,
                category: true,
                outcome: true,
                outcomeReason: true,
                score: true,
                tier: true,
                scorecard: true,
                rubricSetId: true,
                repName: true,
                rep: { select: { name: true } },
                details: true,
                criteria: { select: { criterionId: true, result: true } },
                policyViolations: { select: { rule: true } },
            },
        }),
        prisma.call.groupBy({ by: ["status"], where: { companyId: company.id }, _count: true }),
        prisma.call.count({ where: { companyId: company.id, status: "DONE", repId: null, repName: { not: null } } }),
        prisma.rubricSet.count({ where: { status: "ACTIVE" } }),
    ]);

    // Labels come from the rubric each call was graded with; newer versions win when a criterion was renamed.
    const rubricSets = await prisma.rubricSet.findMany({
        where: { id: { in: [...new Set(rows.flatMap((r) => (r.rubricSetId ? [r.rubricSetId] : [])))] } },
        orderBy: { version: "asc" },
        select: { data: true },
    });
    const labels = new Map<string, string>();
    for (const set of rubricSets) {
        for (const scorecard of (set.data as RubricData).scorecards) {
            for (const c of scorecard.criteria) labels.set(`${scorecard.callType}::${c.id}`, c.label);
        }
    }

    const calls: OverviewCall[] = rows.map((r) => ({
        id: r.id,
        originalName: r.originalName,
        date: r.callDate ?? r.createdAt,
        category: r.category,
        outcome: r.outcome,
        outcomeReason: r.outcomeReason,
        score: r.score,
        tier: r.tier as Tier | null,
        scorecard: r.scorecard,
        rep: r.rep?.name ?? null,
        unmatchedRepName: r.rep ? null : r.repName,
        details: r.details as OverviewCall["details"],
        criteria: r.criteria,
        violations: r.policyViolations,
    }));

    const count = (...statuses: string[]) => statusCounts.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count, 0);
    return {
        overview: summarizeOverview(calls, range, now, (scorecard, id) => labels.get(`${scorecard}::${id}`) ?? id.replaceAll("_", " ")),
        pipeline: {
            total: count("UPLOADED", "TRANSCRIBING", "TRANSCRIBED", "ANALYZING", "DONE", "FAILED"),
            failed: count("FAILED"),
            // Transcribed calls only move on once there's an active rubric to score them against.
            processing: count("UPLOADED", "TRANSCRIBING", "ANALYZING", ...(activeRubrics > 0 ? ["TRANSCRIBED"] : [])),
            spokenNames,
            hasActiveRubric: activeRubrics > 0,
        },
    };
}
