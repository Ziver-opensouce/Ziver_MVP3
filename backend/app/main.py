from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import Base, engine
from app.api.v1 import routes as v1_routes

# Create database tables (if they don't exist) when the application starts
# This is suitable for development; for production, use Alembic migrations.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Ziver Backend API",
    description="API for Ziver: Gamifying Web3 Engagement & Empowering the TON Ecosystem (Phase 1 MVP)",
    version="1.0.0",
    docs_url="/api/docs", # Custom docs URL
    redoc_url="/api/redoc", # Custom redoc URL
    openapi_url="/api/openapi.json" # Custom openapi.json URL
)

# CORS configuration
# Adjust `allow_origins` to your frontend's URL(s) in production.
# For development, "*" allows all origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Example: ["http://localhost:3000", "https://your-frontend-domain.com"]
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Allow all headers
)

# Include the API router
app.include_router(v1_routes.router, prefix="/api/v1")

@app.get("/")
async def root():
    """
    Root endpoint for a basic health check.
    """
    return {"message": "Welcome to Ziver Backend API! Visit /api/v1/docs for interactive API documentation."}
