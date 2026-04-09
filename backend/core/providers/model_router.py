from backend.core.contracts.agent import ModelTier
from backend.core.providers.base import LLMProvider

PROVIDER_MODELS: dict[str, dict[str, str]] = {
    "anthropic": {
        "fast": "claude-haiku-4-5-20251001",
        "balanced": "claude-sonnet-4-6",
        "powerful": "claude-opus-4-6",
    },
    "openai": {
        "fast": "gpt-4o-mini",
        "balanced": "gpt-4o",
        "powerful": "o3",
    },
}

COST_PER_MILLION: dict[str, dict[str, tuple[float, float]]] = {
    "anthropic": {
        "fast": (0.80, 4.00),
        "balanced": (3.00, 15.00),
        "powerful": (15.00, 75.00),
    },
    "openai": {
        "fast": (0.15, 0.60),
        "balanced": (2.50, 10.00),
        "powerful": (10.00, 40.00),
    },
}


class ModelRouter:
    def __init__(self, provider_name: str = "anthropic") -> None:
        self.provider_name = provider_name

    def resolve(self, tier: ModelTier | str) -> str:
        key = tier.value if isinstance(tier, ModelTier) else tier
        models = PROVIDER_MODELS.get(self.provider_name, PROVIDER_MODELS["anthropic"])
        model = models.get(key)
        if not model:
            raise ValueError(f"Unknown model tier: {key}")
        return model

    def estimate_cost(
        self, tier: ModelTier | str, input_tokens: int, output_tokens: int
    ) -> float:
        key = tier.value if isinstance(tier, ModelTier) else tier
        costs_by_tier = COST_PER_MILLION.get(
            self.provider_name, COST_PER_MILLION["anthropic"]
        )
        costs = costs_by_tier.get(key)
        if not costs:
            raise ValueError(f"Unknown model tier: {key}")
        input_cost = (input_tokens / 1_000_000) * costs[0]
        output_cost = (output_tokens / 1_000_000) * costs[1]
        return round(input_cost + output_cost, 6)

    @staticmethod
    def get_provider(provider_name: str, api_key: str | None = None) -> LLMProvider:
        if provider_name == "openai":
            from backend.core.providers.openai import OpenAIProvider

            return OpenAIProvider(api_key=api_key)
        else:
            from backend.core.providers.anthropic import AnthropicProvider

            return AnthropicProvider(api_key=api_key)

    @staticmethod
    def list_providers() -> list[dict[str, str | dict]]:
        return [
            {
                "id": "anthropic",
                "name": "Anthropic",
                "models": PROVIDER_MODELS["anthropic"],
            },
            {
                "id": "openai",
                "name": "OpenAI",
                "models": PROVIDER_MODELS["openai"],
            },
        ]
