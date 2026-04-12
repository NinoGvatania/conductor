EXTRACTOR_AGENT = {
    "name": "extractor",
    "description": "Extracts structured data from unstructured documents",
    "purpose": "Pull key fields, dates, amounts, and entities from documents into structured format",
    "model_tier": "balanced",
    "system_prompt": (
        "You are a data extraction specialist. Extract all relevant fields from the provided "
        "document into a structured JSON format. Be thorough and accurate. If a field is not "
        "present in the document, set it to null. Return a JSON object with all extracted fields.\n\n"
        "Important: Only extract values that are explicitly present in the document. "
        "Do not infer, assume, or fabricate values. If a value is inferred rather than literally "
        "present, prefix it with 'Inferred:'. Set missing fields to null."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "extracted_fields": {
                "type": "object",
                "additionalProperties": True,
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "missing_fields": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["extracted_fields", "confidence", "missing_fields"],
    },
    "temperature": 0.0,
    "timeout_seconds": 60,
    "max_retries": 3,
    "max_tokens": 32000,
    "grounding_check": True,
    "capabilities": {
        "task_keywords": ["extract", "parse", "pull", "identify fields", "find fields", "get fields",
                          "structure", "structured data", "entities", "unstructured"],
        "not_suitable_for": ["classify", "categorize", "validate", "score risk", "write", "draft", "decide"],
    },
}
