"""根据十项各 0～10 分（满分 100）生成综合结论，并保留关键否决/重点项规则。"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

DATA_INDICATOR_ID = 5
SECURITY_INDICATOR_ID = 7


def _si(scores: Dict[int, Optional[int]], i: int) -> int:
    v = scores.get(i)
    return int(v) if v is not None else 0


def compute_from_scores(
    scores: Dict[int, Optional[int]],
) -> Tuple[str, str, List[str], int]:
    """
    返回 (conclusion_code, conclusion_label, reasons, total_score)
    """
    reasons: List[str] = []
    si = {i: _si(scores, i) for i in range(1, 11)}
    total = sum(si.values())

    if si[DATA_INDICATOR_ID] < 5:
        reasons.append(
            "一级指标「数据体系合规与质量」得分低于 5 分（满分 10 分），按框架视为数据合规严重不达标，一票否决。"
        )
        return "reject", "审核不通过", reasons, total

    if si[SECURITY_INDICATOR_ID] < 5:
        reasons.append(
            "一级指标「安全管控体系」得分低于 5 分，重点考核项不达标，综合结论为不通过。"
        )
        return "reject", "审核不通过", reasons, total

    weak = sum(1 for i in range(1, 11) if si[i] < 5)
    if weak >= 3:
        reasons.append(
            f"共有 {weak} 项一级指标得分低于 5 分（达到或超过 3 项），审核不通过。"
        )
        return "reject", "审核不通过", reasons, total

    if total >= 85 and si[DATA_INDICATOR_ID] >= 6 and si[SECURITY_INDICATOR_ID] >= 6:
        reasons.append(
            f"总分 {total}/100，数据与安全项达标，十项一级指标整体达到通过线。"
        )
        return "pass", "审核通过", reasons, total

    if total >= 65:
        reasons.append(
            f"总分 {total}/100，未触发一票否决与重点项红线，但部分维度需完善，请提交整改方案并复核。"
        )
        return "rectify", "审核基本通过（需整改）", reasons, total

    reasons.append(f"总分 {total}/100，未达到最低通过要求。")
    return "reject", "审核不通过", reasons, total
