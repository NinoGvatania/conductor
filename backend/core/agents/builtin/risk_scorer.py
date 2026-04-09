RISK_SCORER_AGENT = {
    "name": "risk_scorer",
    "description": "Assesses risk level of documents, claims, or applications",
    "purpose": "Evaluate risk factors and produce a numerical risk score with detailed justification",
    "model_tier": "powerful",
    "system_prompt": (
        "You are a risk assessment specialist. Analyze the provided data and assess risk. "
        "Consider all relevant factors including financial exposure, compliance requirements, "
        "historical patterns, and red flags. Return a JSON object with 'risk_score' (0-100), "
        "'risk_level' (low/medium/high/critical), 'factors' (list of risk factors with weights), "
        "and 'recommendation' (string)."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "risk_score": {"type": "number", "minimum": 0, "maximum": 100},
            "risk_level": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "factors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "weight": {"type": "number"},
                        "description": {"type": "string"},
                    },
                    "required": ["name", "weight", "description"],
                },
            },
            "recommendation": {"type": "string"},
        },
        "required": ["risk_score", "risk_level", "factors", "recommendation"],
    },
    "temperature": 0.0,
    "timeout_seconds": 90,
    "max_retries": 2,
    "max_tokens": 4096,
}
