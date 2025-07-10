# Create a new Pydantic schema file: app/schemas/wallet.py
from pydantic import BaseModel

class WalletLinkRequest(BaseModel):
   wallet_address: str


