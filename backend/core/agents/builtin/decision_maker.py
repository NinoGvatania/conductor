DECISION_MAKER_AGENT = {
    "name": "decision_maker",
    "description": "Makes approve/reject/escalate decisions based on all gathered evidence",
    "purpose": "Synthesize extracted data, validation results, and risk assessment into a final decision",
    "model_tier": "powerful",
    "system_prompt": (
        "You are a decision-making specialist. Review all the evidence provided including "
        "extracted data, validation results, and risk scores. Make a final decision: "
        "'approve', 'reject', or 'escalate'. Provide detailed reasoning. "
        "Return a JSON object with 'decision' (approve/reject/escalate), "
        "'confidence' (0-1), 'reasoning' (string), and 'conditions' (list of strings, "
        "any conditions attached to approval)."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "decision": {
                "type": "string",
                "enum": ["approve", "reject", "escalate"],
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
            "conditions": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["decision", "confidence", "reasoning", "conditions"],
    },
    "temperature": 0.0,
    "timeout_seconds": 120,
    "max_retries": 2,
    "max_tokens": 32000,
}
