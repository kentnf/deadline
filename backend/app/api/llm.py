from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.llm_factory import LLMProviderFactory
from app.services.llm_config_service import GlobalLLMConfigService

router = APIRouter()


class LLMConfigRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    base_url: str = ""


@router.get("/config")
def get_llm_config(db: Session = Depends(get_db)):
    config = GlobalLLMConfigService.get_config(db)
    if config is None:
        return {"configured": False, "provider": "", "model": "", "api_key": "", "base_url": ""}
    return {
        "configured": True,
        "provider": config["provider"],
        "model": config["model"],
        "api_key": GlobalLLMConfigService.mask_api_key(config["api_key"]),
        "base_url": config["base_url"],
    }


@router.put("/config")
def save_llm_config(request: LLMConfigRequest, db: Session = Depends(get_db)):
    GlobalLLMConfigService.save_config(db, {
        "provider": request.provider,
        "model": request.model,
        "api_key": request.api_key,
        "base_url": request.base_url,
    })
    return {
        "saved": True,
        "provider": request.provider,
        "model": request.model,
        "api_key": GlobalLLMConfigService.mask_api_key(request.api_key),
        "base_url": request.base_url,
    }


@router.post("/test")
async def test_llm_connection(db: Session = Depends(get_db)):
    try:
        provider = LLMProviderFactory.from_global_config(db)
        result = await provider.complete([{"role": "user", "content": "Reply with just 'ok'."}])
        return {"success": True, "response": result[:100]}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}
