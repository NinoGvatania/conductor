VALIDATOR_AGENT = {
    "name": "validator",
    "description": "Validates extracted data for completeness and correctness",
    "purpose": "Check that all required fields are present, formats are correct, and values are plausible",
    "model_tier": "balanced",
    "system_prompt": (
        "You are a data validation specialist. Review the extracted data and check for: "
        "1) Missing required fields, 2) Invalid formats (dates, numbers, etc.), "
        "3) Implausible values, 4) Internal consistency. Return a JSON object with "
        "'is_valid' (bool), 'errors' (list of issues), and 'warnings' (list of concerns)."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "is_valid": {"type": "boolean"},
            "errors": {
                "type": "array",
                "items": {"type": "string"},
            },
            "warnings": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["is_valid", "errors", "warnings"],
    },
    "temperature": 0.0,
    "timeout_seconds": 45,
    "max_retries": 2,
    "max_tokens": 2048,
}
