"""Pre-built workflow templates for common business processes."""

WORKFLOW_TEMPLATES = [
    {
        "id": "tpl_claims_processing",
        "name": "Insurance Claims Processing",
        "description": "Classify claims, extract data, assess risk, human review for high-risk, auto-decide for low-risk",
        "tags": ["insurance", "finance", "document processing"],
        "definition": {
            "name": "Insurance Claims Processing",
            "version": "1.0.0",
            "entry_node": "intake",
            "nodes": [
                {"id": "intake", "type": "deterministic", "next_nodes": ["classify"], "config": {"function": "passthrough"}},
                {"id": "classify", "type": "agent", "agent_name": "classifier", "next_nodes": ["extract"]},
                {"id": "extract", "type": "agent", "agent_name": "extractor", "next_nodes": ["validate"]},
                {"id": "validate", "type": "agent", "agent_name": "validator", "next_nodes": ["risk_assess"]},
                {"id": "risk_assess", "type": "agent", "agent_name": "risk_scorer", "next_nodes": ["decide"]},
                {"id": "decide", "type": "agent", "agent_name": "decision_maker", "next_nodes": []},
            ],
        },
    },
    {
        "id": "tpl_customer_support",
        "name": "Customer Support Triage",
        "description": "Classify tickets by urgency, extract key details, route to appropriate team, draft response",
        "tags": ["support", "customer service", "triage"],
        "definition": {
            "name": "Customer Support Triage",
            "version": "1.0.0",
            "entry_node": "intake",
            "nodes": [
                {"id": "intake", "type": "deterministic", "next_nodes": ["classify"], "config": {"function": "passthrough"}},
                {"id": "classify", "type": "agent", "agent_name": "classifier", "next_nodes": ["extract"]},
                {"id": "extract", "type": "agent", "agent_name": "extractor", "next_nodes": ["draft"]},
                {"id": "draft", "type": "agent", "agent_name": "draft_writer", "next_nodes": []},
            ],
        },
    },
    {
        "id": "tpl_document_review",
        "name": "Document Review & Approval",
        "description": "Extract data from documents, validate completeness, human review, generate approval letter",
        "tags": ["legal", "compliance", "document processing"],
        "definition": {
            "name": "Document Review & Approval",
            "version": "1.0.0",
            "entry_node": "intake",
            "nodes": [
                {"id": "intake", "type": "deterministic", "next_nodes": ["extract"], "config": {"function": "passthrough"}},
                {"id": "extract", "type": "agent", "agent_name": "extractor", "next_nodes": ["validate"]},
                {"id": "validate", "type": "agent", "agent_name": "validator", "next_nodes": ["review"]},
                {"id": "review", "type": "human", "next_nodes": ["draft"]},
                {"id": "draft", "type": "agent", "agent_name": "draft_writer", "next_nodes": []},
            ],
        },
    },
    {
        "id": "tpl_lead_qualification",
        "name": "Lead Qualification Pipeline",
        "description": "Classify leads, extract contact info, score quality, decide on follow-up strategy",
        "tags": ["sales", "CRM", "lead generation"],
        "definition": {
            "name": "Lead Qualification Pipeline",
            "version": "1.0.0",
            "entry_node": "intake",
            "nodes": [
                {"id": "intake", "type": "deterministic", "next_nodes": ["classify"], "config": {"function": "passthrough"}},
                {"id": "classify", "type": "agent", "agent_name": "classifier", "next_nodes": ["extract"]},
                {"id": "extract", "type": "agent", "agent_name": "extractor", "next_nodes": ["score"]},
                {"id": "score", "type": "agent", "agent_name": "risk_scorer", "next_nodes": ["decide"]},
                {"id": "decide", "type": "agent", "agent_name": "decision_maker", "next_nodes": ["draft"]},
                {"id": "draft", "type": "agent", "agent_name": "draft_writer", "next_nodes": []},
            ],
        },
    },
    {
        "id": "tpl_content_moderation",
        "name": "Content Moderation",
        "description": "Classify content type, check for policy violations, risk score, auto-approve or escalate",
        "tags": ["moderation", "safety", "content"],
        "definition": {
            "name": "Content Moderation",
            "version": "1.0.0",
            "entry_node": "classify",
            "nodes": [
                {"id": "classify", "type": "agent", "agent_name": "classifier", "next_nodes": ["validate"]},
                {"id": "validate", "type": "agent", "agent_name": "validator", "next_nodes": ["risk"]},
                {"id": "risk", "type": "agent", "agent_name": "risk_scorer", "next_nodes": ["decide"]},
                {"id": "decide", "type": "agent", "agent_name": "decision_maker", "next_nodes": []},
            ],
        },
    },
    {
        "id": "tpl_invoice_processing",
        "name": "Invoice Processing",
        "description": "Extract invoice data, validate amounts, check for duplicates, approve or flag for review",
        "tags": ["finance", "accounting", "invoices"],
        "definition": {
            "name": "Invoice Processing",
            "version": "1.0.0",
            "entry_node": "extract",
            "nodes": [
                {"id": "extract", "type": "agent", "agent_name": "extractor", "next_nodes": ["validate"]},
                {"id": "validate", "type": "agent", "agent_name": "validator", "next_nodes": ["decide"]},
                {"id": "decide", "type": "agent", "agent_name": "decision_maker", "next_nodes": []},
            ],
        },
    },
]
