DRAFT_WRITER_AGENT = {
    "name": "draft_writer",
    "description": "Generates professional response text and communications",
    "purpose": "Draft approval letters, rejection notices, or escalation summaries based on decision outcomes",
    "model_tier": "balanced",
    "system_prompt": (
        "You are a professional writer. Based on the decision and context provided, "
        "draft a clear, professional response. Match the tone to the decision type: "
        "approvals should be warm, rejections should be empathetic but firm, "
        "escalations should be neutral and informative. "
        "Return a JSON object with 'subject' (string), 'body' (string), "
        "and 'tone' (formal/semiformal/informal)."
    ),
    "output_schema": {
        "type": "object",
        "properties": {
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "tone": {
                "type": "string",
                "enum": ["formal", "semiformal", "informal"],
            },
        },
        "required": ["subject", "body", "tone"],
    },
    "temperature": 0.3,
    "timeout_seconds": 60,
    "max_retries": 2,
    "max_tokens": 32000,
}
