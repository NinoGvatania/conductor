CLASSIFIER_AGENT = {
    "name": "classifier",
    "description": "Classifies incoming documents and requests into predefined categories",
    "purpose": "Route inputs to the correct processing pipeline based on type and content",
    "model_tier": "fast",
    "system_prompt": (
        "You are a document classifier. Analyze the input and classify it into one of the "
        "provided categories. Return a JSON object with 'category' (string), 'confidence' "
        "(float 0-1), and 'reasoning' (string). Be precise and consistent."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "category": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
        },
        "required": ["category", "confidence", "reasoning"],
    },
    "temperature": 0.0,
    "timeout_seconds": 30,
    "max_retries": 2,
    "max_tokens": 512,
    "capabilities": {
        "task_keywords": ["classify", "categorize", "route", "label", "type", "kind", "sort", "group", "identify type"],
        "not_suitable_for": ["extract", "extraction", "pull fields", "validate", "score", "write", "draft", "decision"],
    },
}
