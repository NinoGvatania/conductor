from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.workflow_generator import WorkflowGenerator

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


@router.post("")
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    generator = WorkflowGenerator()
    try:
        workflow = await generator.generate(request.message)
        return workflow.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
