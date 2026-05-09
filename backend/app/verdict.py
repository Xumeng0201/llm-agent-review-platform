"""根据当前评测框架的分数生成综合结论。"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple


def compute_from_scores(
    scores: Dict[int, Optional[int]],
) -> Tuple[str, str, List[str], int]:
    """返回 (conclusion_code, conclusion_label, reasons, total_score)。"""
    reasons: List[str] = []
    vals = [int(v) if v is not None else 0 for _, v in sorted(scores.items())]
    total = sum(vals)
    max_total = len(vals) * 10 if vals else 0
    ratio = (total / max_total) if max_total else 0
    weak = sum(1 for v in vals if v < 5)

    if ratio >= 0.85 and weak == 0:
        reasons.append(f"总分 {total}/{max_total}，5 个一级指标整体表现良好，未出现明显短板。")
        return "pass", "建议通过", reasons, total

    if ratio >= 0.65:
        reasons.append(f"总分 {total}/{max_total}，总体具备实施基础，但仍存在需整改项。")
        if weak:
            reasons.append(f"共有 {weak} 个一级指标得分低于 5 分，建议补充方案后再复核。")
        return "rectify", "建议整改后通过", reasons, total

    reasons.append(f"总分 {total}/{max_total}，当前方案整体成熟度不足，暂不建议通过。")
    return "reject", "审核不通过", reasons, total
