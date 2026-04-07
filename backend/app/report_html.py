from __future__ import annotations

import html
from datetime import datetime, timezone

from .schemas import OverallReport


def build_report_html(report: OverallReport) -> str:
    rows_html = []
    for row in report.indicators:
        s = "—" if row.score is None else str(row.score)
        note = row.notes or "—"
        rows_html.append(
            "<tr>"
            f"<td>{row.indicator_id}</td>"
            f"<td>{html.escape(row.title)}</td>"
            f"<td class='num'>{html.escape(s)}</td>"
            f"<td class='num'>/ {row.max_score}</td>"
            f"<td>{html.escape(note)}</td>"
            "</tr>"
        )

    reasons_html = "".join(
        f"<li>{html.escape(r)}</li>" for r in report.reasons
    )
    hl = report.summary_highlights or "（未填写）"
    iss = report.summary_issues or "（未填写）"
    rs = (report.review_summary or "").strip()
    review_block = ""
    if rs:
        review_block = (
            "<h2>综合评审意见（智能体）</h2>"
            f"<div class='block'>{html.escape(rs)}</div>"
        )
    label_cls = {
        "pass": "pass",
        "rectify": "rectify",
        "reject": "reject",
    }.get(report.conclusion_code, "")

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{html.escape(report.task_name)} — 评审报告</title>
  <style>
    body {{
      font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
      line-height: 1.6;
      color: #18181b;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
      background: #fafafa;
    }}
    .sheet {{
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }}
    h1 {{ font-size: 1.5rem; margin: 0 0 0.5rem; }}
    .meta {{ color: #71717a; font-size: 0.875rem; margin-bottom: 1.5rem; }}
    h2 {{ font-size: 1.1rem; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.35rem; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.875rem; }}
    th, td {{ border: 1px solid #e4e4e7; padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }}
    th {{ background: #f4f4f5; font-weight: 600; }}
    td.num {{ text-align: center; white-space: nowrap; width: 4rem; }}
    .conclusion {{
      padding: 1rem 1.25rem;
      border-radius: 6px;
      margin: 1rem 0;
      font-weight: 600;
    }}
    .conclusion.pass {{ background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }}
    .conclusion.rectify {{ background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }}
    .conclusion.reject {{ background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }}
    ul {{ margin: 0.5rem 0; padding-left: 1.25rem; }}
    .block {{ white-space: pre-wrap; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.875rem; }}
    @media print {{
      body {{ background: #fff; }}
      .sheet {{ box-shadow: none; border: none; }}
    }}
  </style>
</head>
<body>
  <div class="sheet">
    <h1>{html.escape(report.task_name)}</h1>
    <p class="meta">方案评审报告 · 生成时间（UTC）：{html.escape(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"))}</p>

    <h2>评分汇总</h2>
    <p><strong>总分：</strong>{report.total_score} / {report.max_total}（十项一级指标，每项满分 10 分）</p>

    <h2>综合结论</h2>
    <div class="conclusion {label_cls}">{html.escape(report.conclusion_label)}</div>
    <ul>{reasons_html}</ul>
    {review_block}

    <h2>分项得分</h2>
    <table>
      <thead>
        <tr><th>#</th><th>一级指标</th><th>得分</th><th>满分</th><th>评审说明</th></tr>
      </thead>
      <tbody>
        {"".join(rows_html)}
      </tbody>
    </table>

    <h2>项目亮点</h2>
    <div class="block">{html.escape(hl)}</div>

    <h2>存在问题与整改建议</h2>
    <div class="block">{html.escape(iss)}</div>

    <h2>说明</h2>
    <p class="meta" style="margin:0">
      本报告依据系统内置《大模型与智能体信息化建设项目方案审核评测框架》生成；
      评分与结论规则见系统说明。可用浏览器「打印 → 另存为 PDF」导出 PDF。
    </p>
  </div>
</body>
</html>"""
