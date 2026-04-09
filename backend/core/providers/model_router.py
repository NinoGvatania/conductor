from backend.core.contracts.agent import ModelTier

MODEL_MAP: dict[str, str] = {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-6",
    "powerful": "claude-opus-4-6",
}

# Approximate pricing per 1M tokens (input, output) in USD
COST_PER_MILLION: dict[str, tuple[float, float]] = {
    "fast": (0.80, 4.00),
    "balanced": (3.00, 15.00),
    "powerful": (15.00, 75.00),
}


class ModelRouter:
    def resolve(self, tier: ModelTier | str) -> str:
        key = tier.value if isinstance(tier, ModelTier) else tier
        model = MODEL_MAP.get(key)
        if not model:
            raise ValueError(f"Unknown model tier: {key}")
        return model

    def estimate_cost(
        self, tier: ModelTier | str, input_tokens: int, output_tokens: int
    ) -> float:
        key = tier.value if isinstance(tier, ModelTier) else tier
        costs = COST_PER_MILLION.get(key)
        if not costs:
            raise ValueError(f"Unknown model tier: {key}")
        input_cost = (input_tokens / 1_000_000) * costs[0]
        output_cost = (output_tokens / 1_000_000) * costs[1]
        return round(input_cost + output_cost, 6)
