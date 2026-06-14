"""Shared internal development prediction metric utilities.

The Phase 10F QA pass standardizes ranking metrics across baseline and
zoning-enhanced experiments. Top-k metrics are tie-aware so equal model scores
at the cutoff do not depend on database row order.
"""

from __future__ import annotations

import math
from typing import Any, Iterable

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    roc_auc_score,
)


def _as_int_array(y_true: Iterable[object]) -> np.ndarray:
    return np.asarray(y_true, dtype=int)


def precision_recall_lift_at_fraction(
    y_true: Iterable[object],
    y_probability: np.ndarray,
    fraction: float,
) -> dict[str, Any]:
    """Return tie-aware precision/recall/lift for the top score fraction.

    Lift is defined as:

    `lift@top_k = precision@top_k / overall_positive_rate`

    If the cutoff score has ties, the tied bucket is included proportionally so
    the metric represents the expected top-k result without arbitrary row-order
    tie breaking.
    """

    y_array = _as_int_array(y_true)
    probabilities = np.asarray(y_probability, dtype=float)
    n = len(y_array)
    if n == 0:
        return {
            "fraction": fraction,
            "k": 0,
            "precision": 0.0,
            "recall": 0.0,
            "lift": 0.0,
            "cutoff_score": None,
            "tie_count_at_cutoff": 0,
            "tie_adjusted": False,
        }

    k = max(1, math.ceil(n * fraction))
    order = np.argsort(-probabilities, kind="mergesort")
    sorted_probabilities = probabilities[order]
    cutoff_score = float(sorted_probabilities[k - 1])

    above_mask = probabilities > cutoff_score
    tied_mask = probabilities == cutoff_score
    above_count = int(above_mask.sum())
    tied_count = int(tied_mask.sum())
    remaining_slots = max(0, k - above_count)

    positives = int(y_array.sum())
    above_positive = float(y_array[above_mask].sum())
    tied_positive = float(y_array[tied_mask].sum())
    tied_positive_rate = tied_positive / tied_count if tied_count else 0.0
    expected_top_positive = above_positive + remaining_slots * tied_positive_rate

    precision = expected_top_positive / k if k else 0.0
    recall = expected_top_positive / positives if positives else 0.0
    base_rate = float(y_array.mean()) if n else 0.0
    lift = precision / base_rate if base_rate else 0.0

    return {
        "fraction": fraction,
        "k": int(k),
        "precision": round(float(precision), 6),
        "recall": round(float(recall), 6),
        "lift": round(float(lift), 6),
        "cutoff_score": round(cutoff_score, 10),
        "above_cutoff_count": above_count,
        "tie_count_at_cutoff": tied_count,
        "remaining_slots_from_tie_bucket": remaining_slots,
        "tie_positive_count": int(tied_positive),
        "tie_positive_rate": round(float(tied_positive_rate), 6),
        "tie_adjusted": tied_count > remaining_slots,
    }


def metrics_for_predictions(
    y_true: Iterable[object],
    y_probability: np.ndarray,
    thresholds: tuple[float, ...] = (0.5,),
) -> dict[str, Any]:
    y_array = _as_int_array(y_true)
    probabilities = np.asarray(y_probability, dtype=float)
    has_both_classes = len(set(y_array.tolist())) == 2
    top_1 = precision_recall_lift_at_fraction(y_array, probabilities, 0.01)
    top_5 = precision_recall_lift_at_fraction(y_array, probabilities, 0.05)
    threshold = thresholds[0]
    threshold_predictions = (probabilities >= threshold).astype(int)
    confusion = confusion_matrix(y_array, threshold_predictions, labels=[0, 1])
    return {
        "row_count": int(len(y_array)),
        "positive_count": int(y_array.sum()),
        "positive_rate": round(float(y_array.mean()), 6) if len(y_array) else 0.0,
        "roc_auc": round(float(roc_auc_score(y_array, probabilities)), 6)
        if has_both_classes
        else None,
        "average_precision_pr_auc": round(
            float(average_precision_score(y_array, probabilities)),
            6,
        )
        if has_both_classes
        else None,
        "precision_at_top_1_pct": top_1["precision"],
        "precision_at_top_5_pct": top_5["precision"],
        "recall_at_top_5_pct": top_5["recall"],
        "lift_at_top_1_pct": top_1["lift"],
        "lift_at_top_5_pct": top_5["lift"],
        "top_1_pct_details": top_1,
        "top_5_pct_details": top_5,
        "brier_score": round(float(brier_score_loss(y_array, probabilities)), 6)
        if has_both_classes
        else None,
        "confusion_matrix_threshold_0_5": {
            "true_negative": int(confusion[0, 0]),
            "false_positive": int(confusion[0, 1]),
            "false_negative": int(confusion[1, 0]),
            "true_positive": int(confusion[1, 1]),
        },
    }


def calibration_bins(
    y_true: Iterable[object],
    y_probability: np.ndarray,
    n_bins: int = 10,
) -> list[dict[str, Any]]:
    y_array = _as_int_array(y_true)
    probabilities = np.asarray(y_probability, dtype=float)
    if len(y_array) == 0:
        return []

    frame = pd.DataFrame(
        {
            "actual": y_array,
            "probability": probabilities,
        },
    ).sort_values("probability", ascending=False, kind="mergesort")
    frame["rank"] = np.arange(1, len(frame) + 1)
    frame["decile"] = np.ceil(frame["rank"] / len(frame) * n_bins).astype(int)
    frame["decile"] = frame["decile"].clip(1, n_bins)

    rows: list[dict[str, Any]] = []
    for decile, group in frame.groupby("decile", sort=True):
        rows.append(
            {
                "decile": int(decile),
                "rank_band": f"{int((decile - 1) * 100 / n_bins)}-{int(decile * 100 / n_bins)}%",
                "row_count": int(len(group)),
                "positive_count": int(group["actual"].sum()),
                "observed_event_rate": round(float(group["actual"].mean()), 6),
                "average_predicted_probability": round(
                    float(group["probability"].mean()),
                    6,
                ),
                "min_predicted_probability": round(float(group["probability"].min()), 6),
                "max_predicted_probability": round(float(group["probability"].max()), 6),
            },
        )
    return rows


def topk_summary_rows(
    y_true: Iterable[object],
    y_probability: np.ndarray,
    fractions: tuple[float, ...] = (0.01, 0.05),
) -> list[dict[str, Any]]:
    return [
        {
            "top_fraction": fraction,
            "top_label": f"top_{int(fraction * 100)}pct",
            **precision_recall_lift_at_fraction(y_true, y_probability, fraction),
        }
        for fraction in fractions
    ]
