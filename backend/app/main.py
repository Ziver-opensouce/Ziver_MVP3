from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import Base, engine
from app.api.v1 import routes as v1_routes

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Ziver Backend API",
    description="API for Ziver: Gamifying Web3 Engagement & Empowering the TON Ecosystem",
    version="1.0.0",
)

# CORS configuration (adjust origins as needed for your frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development, refine in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(v1_routes.router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Welcome to Ziver Backend API!"}
