from fastapi import APIRouter

router = APIRouter()

@router.get("/ping")
async def ping():
    return {"status": "Ziver backend is alive!"}
