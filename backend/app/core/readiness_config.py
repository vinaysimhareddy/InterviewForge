"""
Interview Readiness Estimation Configuration & Deterministic Calibration (§4.5, §2).

Provides transparent, deterministic math mapping interview performance rubric scores
to an estimated interview readiness probability range and band, without LLM guesswork.

Bands:
- Not ready (< 25%)
- Developing (25 to 45%)
- Borderline (45 to 60%)
- Competitive (60 to 80%)
- Strong (> 80%)
"""

from typing import Dict, List, Literal, NamedTuple, Optional, Tuple


MANDATORY_READINESS_DISCLAIMER = (
    "This is an estimate of how your mock-interview performance compares with the expected bar "
    "for this role and level. It is not a prediction of any real hiring decision."
)

# Minimum evidence gating thresholds (§2, §4.5)
MIN_ANSWERED_QUESTIONS = 4
MIN_DURATION_MINUTES = 5.0

# Factor weights for composite quality score (sum = 1.0)
WEIGHT_TECHNICAL = 0.55
WEIGHT_DEPTH = 0.20
WEIGHT_COMMUNICATION = 0.15
WEIGHT_COVERAGE = 0.10

# Confidence range half-widths in percentage points (§4.5)
CONFIDENCE_HALF_WIDTHS: Dict[str, float] = {
    "High": 6.0,
    "Medium": 10.0,
    "Low": 15.0,
}

# Integrity multiplier (§4.5)
INTEGRITY_MULTIPLIERS: Dict[str, float] = {
    "Verified": 1.00,
    "Verified with warnings": 0.95,
    "Not verified": 0.85,
}

# Seniority Calibration Curves: piecewise linear control points (quality -> base probability)
# Quality is normalized 0.0 .. 1.0. Base probability is 0.0 .. 100.0.
# Bars are strictly monotonic: higher quality yields higher or equal base probability.
# Seniority pass bars (Junior lower bar, Staff higher bar):
CALIBRATION_CURVES: Dict[str, List[Tuple[float, float]]] = {
    "junior": [
        (0.00, 5.0),
        (0.30, 25.0),
        (0.50, 45.0),
        (0.60, 65.0),  # Junior competitive bar at 0.60
        (0.80, 85.0),
        (1.00, 95.0),
    ],
    "mid": [
        (0.00, 5.0),
        (0.35, 20.0),
        (0.55, 40.0),
        (0.70, 65.0),  # Mid competitive bar at 0.70
        (0.85, 85.0),
        (1.00, 95.0),
    ],
    "senior": [
        (0.00, 5.0),
        (0.40, 18.0),
        (0.60, 38.0),
        (0.78, 65.0),  # Senior competitive bar at 0.78
        (0.90, 85.0),
        (1.00, 95.0),
    ],
    "staff": [
        (0.00, 5.0),
        (0.45, 15.0),
        (0.65, 35.0),
        (0.85, 65.0),  # Staff competitive bar at 0.85
        (0.95, 85.0),
        (1.00, 95.0),
    ],
}


def round_to_nearest_five(val: float) -> int:
    """Round a percentage value to the nearest multiple of 5."""
    return int(round(val / 5.0) * 5)


def get_calibration_curve(seniority: str) -> List[Tuple[float, float]]:
    """Retrieve calibration curve points for given seniority, defaulting to mid."""
    key = seniority.lower().strip() if seniority else "mid"
    return CALIBRATION_CURVES.get(key, CALIBRATION_CURVES["mid"])


def interpolate_piecewise(quality: float, curve: List[Tuple[float, float]]) -> float:
    """Monotonic piecewise linear interpolation mapping quality 0..1 to probability 0..100."""
    q_clamped = max(0.0, min(1.0, quality))
    if q_clamped <= curve[0][0]:
        return curve[0][1]
    if q_clamped >= curve[-1][0]:
        return curve[-1][1]

    for i in range(len(curve) - 1):
        x0, y0 = curve[i]
        x1, y1 = curve[i + 1]
        if x0 <= q_clamped <= x1:
            if x1 == x0:
                return y0
            t = (q_clamped - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return curve[-1][1]


def determine_readiness_band(base_probability: float) -> str:
    """
    Map estimated probability to qualitative readiness band (§2).
    - Not ready (< 25%)
    - Developing (25 to 45%)
    - Borderline (45 to 60%)
    - Competitive (60 to 80%)
    - Strong (> 80%)
    """
    if base_probability < 25.0:
        return "Not ready"
    elif base_probability < 45.0:
        return "Developing"
    elif base_probability < 60.0:
        return "Borderline"
    elif base_probability <= 80.0:
        return "Competitive"
    else:
        return "Strong"


def determine_advance_verdict(band: str) -> str:
    """Map readiness band to plain advance verdict (§3.7)."""
    if band in ("Strong", "Competitive"):
        return "likely to advance"
    elif band == "Borderline":
        return "borderline"
    else:
        return "unlikely to advance"


def determine_confidence_level(
    answered_count: int,
    actual_duration_minutes: float,
    avg_stt_confidence: float = 0.90,
) -> Literal["Low", "Medium", "High"]:
    """
    Determine estimate confidence level (§4.5):
    - High: answered >= 10 and duration >= 15 min and STT quality good (>= 0.80)
    - Medium: answered >= 6
    - Low: otherwise
    """
    if answered_count >= 10 and actual_duration_minutes >= 15.0 and avg_stt_confidence >= 0.80:
        return "High"
    elif answered_count >= 6:
        return "Medium"
    else:
        return "Low"

